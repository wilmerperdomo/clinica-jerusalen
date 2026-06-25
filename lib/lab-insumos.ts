import type { SupabaseClient } from '@supabase/supabase-js'
import {
  costoMaquilaAplicable,
  debeDescontarInsumos,
  type PruebaCostoInfo,
  upsertCostoOrden,
} from '@/lib/lab-costos'

export interface LabInsumo {
  id: number
  prueba_id: number
  producto_id: number
  cantidad: number
  producto?: { id: number; nombre: string; codigo?: string; costo?: number }
}

export interface LabOrdenConsumo {
  ordenId: number
  pruebaId: number
  ingreso?: number
}

export interface LabConsumoDetalle {
  ordenId: number
  pruebaId: number
  productoId: number
  cantidad: number
  costoUnitario: number
  costoTotal: number
  inventarioId?: number
}

export interface DescontarInsumosResult {
  ok: boolean
  errores: string[]
  consumos: LabConsumoDetalle[]
  costoPorOrden: Record<number, number>
}

export async function cargarInsumosPorPrueba(
  supabase: SupabaseClient,
  pruebaIds: number[],
): Promise<Record<number, LabInsumo[]>> {
  if (!pruebaIds.length) return {}
  const { data } = await supabase
    .from('laboratorio_insumo')
    .select('id, prueba_id, producto_id, cantidad, producto:productos(id, nombre, codigo, costo)')
    .in('prueba_id', pruebaIds)

  const map: Record<number, LabInsumo[]> = {}
  for (const row of data ?? []) {
    const pid = row.prueba_id as number
    if (!map[pid]) map[pid] = []
    map[pid].push(row as unknown as LabInsumo)
  }
  return map
}

async function registrarKardexConsumo(
  supabase: SupabaseClient,
  params: {
    productoId: number
    sucursalId: number
    cantidad: number
    cantidadAntes: number
    cantidadDespues: number
    ordenId: number
    motivo: string
    usuarioId?: string | null
    inventarioId?: number
    lote?: string | null
    fechaVencimiento?: string | null
  },
) {
  const { error } = await supabase.from('inventario_movimientos').insert({
    producto_id: params.productoId,
    sucursal_id: params.sucursalId,
    tipo: 'CONSUMO',
    cantidad: -Math.abs(params.cantidad),
    cantidad_antes: params.cantidadAntes,
    cantidad_despues: params.cantidadDespues,
    lote: params.lote ?? null,
    fecha_vencimiento: params.fechaVencimiento ?? null,
    motivo: params.motivo,
    referencia_tipo: 'lab',
    referencia_id: params.ordenId,
    usuario_id: params.usuarioId ?? null,
  })
  if (error) console.warn('Kardex lab:', error.message)
}

export async function descontarInsumosLab(
  supabase: SupabaseClient,
  ordenes: LabOrdenConsumo[],
  sucursalId?: number | null,
  usuarioId?: string | null,
  pruebasMap?: Record<number, PruebaCostoInfo>,
  ingresosMap?: Record<number, number>,
): Promise<DescontarInsumosResult> {
  const errores: string[] = []
  const consumos: LabConsumoDetalle[] = []
  const costoPorOrden: Record<number, number> = {}

  if (!ordenes.length) return { ok: true, errores, consumos, costoPorOrden }

  const pruebaIds = [...new Set(ordenes.map(o => o.pruebaId))]
  const { data: insumos } = await supabase
    .from('laboratorio_insumo')
    .select('prueba_id, producto_id, cantidad, producto:productos(id, nombre, costo)')
    .in('prueba_id', pruebaIds)

  const insumosPorPrueba = new Map<number, typeof insumos>()
  for (const ins of insumos ?? []) {
    const pid = ins.prueba_id as number
    if (!insumosPorPrueba.has(pid)) insumosPorPrueba.set(pid, [])
    insumosPorPrueba.get(pid)!.push(ins)
  }

  for (const orden of ordenes) {
    const prueba = pruebasMap?.[orden.pruebaId]
    const ingreso = orden.ingreso ?? ingresosMap?.[orden.ordenId] ?? 0
    let costoInsumosOrden = 0

    const { count: consumosPrevios } = await supabase
      .from('lab_consumos_orden')
      .select('*', { count: 'exact', head: true })
      .eq('orden_id', orden.ordenId)

    if (consumosPrevios && consumosPrevios > 0) {
      const { data: prev } = await supabase
        .from('lab_consumos_orden')
        .select('costo_total')
        .eq('orden_id', orden.ordenId)
      costoInsumosOrden = (prev ?? []).reduce((s, r) => s + Number(r.costo_total || 0), 0)
      if (prueba) {
        await upsertCostoOrden(supabase, {
          ordenId: orden.ordenId,
          prueba,
          ingreso,
          costoInsumos: costoInsumosOrden,
          costoMaquila: costoMaquilaAplicable(prueba),
        })
      }
      costoPorOrden[orden.ordenId] = costoInsumosOrden
      continue
    }

    if (prueba && !debeDescontarInsumos(prueba)) {
      const costoMaquila = costoMaquilaAplicable(prueba)
      await upsertCostoOrden(supabase, {
        ordenId: orden.ordenId,
        prueba,
        ingreso,
        costoInsumos: 0,
        costoMaquila,
      })
      costoPorOrden[orden.ordenId] = costoMaquila
      continue
    }

    const listaInsumos = insumosPorPrueba.get(orden.pruebaId) ?? []
    if (!listaInsumos.length) {
      if (prueba) {
        const costoMaquila = costoMaquilaAplicable(prueba)
        await upsertCostoOrden(supabase, {
          ordenId: orden.ordenId,
          prueba,
          ingreso,
          costoInsumos: 0,
          costoMaquila,
        })
        costoPorOrden[orden.ordenId] = costoMaquila
      }
      continue
    }

    for (const ins of listaInsumos) {
      const productoId = ins.producto_id as number
      const cantidad = Number(ins.cantidad) || 1
      const prod = ins.producto as { nombre?: string; costo?: number } | null
      const nombreProd = prod?.nombre ?? `Producto #${productoId}`
      const costoUnitario = Number(prod?.costo) || 0

      let invQ = supabase
        .from('inventario')
        .select('id, cantidad, sucursal_id, lote, fecha_vencimiento')
        .eq('producto_id', productoId)
        .gt('cantidad', 0)
        .order('cantidad', { ascending: false })
        .limit(1)

      if (sucursalId) invQ = invQ.eq('sucursal_id', sucursalId)

      const { data: invRows } = await invQ
      const inv = invRows?.[0] as {
        id: number
        cantidad: number
        sucursal_id: number
        lote?: string | null
        fecha_vencimiento?: string | null
      } | undefined

      if (!inv) {
        errores.push(`Sin stock de ${nombreProd} para ${nombreProd} (orden #${orden.ordenId}).`)
        continue
      }

      if (Number(inv.cantidad) < cantidad) {
        errores.push(`Stock insuficiente de ${nombreProd}: hay ${inv.cantidad}, se necesitan ${cantidad}.`)
        continue
      }

      const cantidadAntes = Number(inv.cantidad)
      const cantidadDespues = Math.max(0, cantidadAntes - cantidad)
      const costoTotal = costoUnitario * cantidad

      const { error } = await supabase
        .from('inventario')
        .update({ cantidad: cantidadDespues })
        .eq('id', inv.id)

      if (error) {
        errores.push(`Error al descontar ${nombreProd}: ${error.message}`)
        continue
      }

      await registrarKardexConsumo(supabase, {
        productoId,
        sucursalId: inv.sucursal_id,
        cantidad,
        cantidadAntes,
        cantidadDespues,
        ordenId: orden.ordenId,
        motivo: `Consumo laboratorio orden #${orden.ordenId}`,
        usuarioId,
        inventarioId: inv.id,
        lote: inv.lote,
        fechaVencimiento: inv.fecha_vencimiento,
      })

      await supabase.from('lab_consumos_orden').insert({
        orden_id: orden.ordenId,
        prueba_id: orden.pruebaId,
        producto_id: productoId,
        cantidad,
        costo_unitario: costoUnitario,
        costo_total: costoTotal,
        inventario_id: inv.id,
      })

      consumos.push({
        ordenId: orden.ordenId,
        pruebaId: orden.pruebaId,
        productoId,
        cantidad,
        costoUnitario,
        costoTotal,
        inventarioId: inv.id,
      })

      costoInsumosOrden += costoTotal
    }

    costoPorOrden[orden.ordenId] = costoInsumosOrden

    if (prueba) {
      const costoMaquila = costoMaquilaAplicable(prueba)
      await upsertCostoOrden(supabase, {
        ordenId: orden.ordenId,
        prueba,
        ingreso,
        costoInsumos: costoInsumosOrden,
        costoMaquila,
      })
    }
  }

  return { ok: errores.length === 0, errores, consumos, costoPorOrden }
}
