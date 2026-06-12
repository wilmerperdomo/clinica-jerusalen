import type { SupabaseClient } from '@supabase/supabase-js'

export interface LabInsumo {
  id: number
  prueba_id: number
  producto_id: number
  cantidad: number
  producto?: { id: number; nombre: string; codigo?: string }
}

export async function cargarInsumosPorPrueba(
  supabase: SupabaseClient,
  pruebaIds: number[],
): Promise<Record<number, LabInsumo[]>> {
  if (!pruebaIds.length) return {}
  const { data } = await supabase
    .from('laboratorio_insumo')
    .select('id, prueba_id, producto_id, cantidad, producto:productos(id, nombre, codigo)')
    .in('prueba_id', pruebaIds)

  const map: Record<number, LabInsumo[]> = {}
  for (const row of data ?? []) {
    const pid = row.prueba_id as number
    if (!map[pid]) map[pid] = []
    map[pid].push(row as LabInsumo)
  }
  return map
}

export async function descontarInsumosLab(
  supabase: SupabaseClient,
  pruebaIds: number[],
  sucursalId?: number | null,
): Promise<{ ok: boolean; errores: string[] }> {
  const errores: string[] = []
  if (!pruebaIds.length) return { ok: true, errores }

  const { data: insumos } = await supabase
    .from('laboratorio_insumo')
    .select('prueba_id, producto_id, cantidad, producto:productos(nombre)')
    .in('prueba_id', pruebaIds)

  if (!insumos?.length) return { ok: true, errores }

  for (const ins of insumos) {
    const productoId = ins.producto_id as number
    const cantidad = Number(ins.cantidad) || 1
    const nombreProd = (ins.producto as { nombre?: string } | null)?.nombre ?? `Producto #${productoId}`

    let invQ = supabase
      .from('inventario')
      .select('id, cantidad')
      .eq('producto_id', productoId)
      .gt('cantidad', 0)
      .order('cantidad', { ascending: false })
      .limit(1)

    if (sucursalId) invQ = invQ.eq('sucursal_id', sucursalId)

    const { data: invRows } = await invQ
    const inv = invRows?.[0] as { id: number; cantidad: number } | undefined

    if (!inv) {
      errores.push(`Sin stock de ${nombreProd} para descontar insumo de laboratorio.`)
      continue
    }

    const nueva = Math.max(0, Number(inv.cantidad) - cantidad)
    const { error } = await supabase.from('inventario').update({ cantidad: nueva }).eq('id', inv.id)
    if (error) errores.push(`Error al descontar ${nombreProd}: ${error.message}`)
  }

  return { ok: errores.length === 0, errores }
}
