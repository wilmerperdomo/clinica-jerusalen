import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Descuento de inventario al vender / facturar.
 *
 * Reglas (inventario perfecto, sin errores):
 *  - Descuenta por lote usando FEFO (primero el que vence antes).
 *  - NUNCA deja stock negativo: si se vende más de lo que hay, baja a 0
 *    y genera una alerta de discrepancia para que se corrija el ingreso.
 *  - NO bloquea la facturación si el stock es 0 (la clínica debe poder facturar);
 *    en su lugar registra el faltante y avisa.
 *  - Cada movimiento queda en el kardex (inventario_movimientos, tipo VENTA).
 */

export interface ItemDescuentoStock {
  productoId: number
  cantidad: number
  nombre?: string
}

export interface DetalleDescuentoStock {
  productoId: number
  nombre: string
  pedido: number
  descontado: number
  restante: number
}

export interface ResultadoDescuentoStock {
  /** true si no hubo errores técnicos (alertas de stock NO cuentan como error) */
  ok: boolean
  /** Mensajes de stock 0 / faltante para mostrar al cajero (no bloquean) */
  alertas: string[]
  /** Errores técnicos (fallos de BD) */
  errores: string[]
  detalles: DetalleDescuentoStock[]
}

interface FilaInventario {
  id: number
  cantidad: number
  sucursal_id: number
  lote?: string | null
  fecha_vencimiento?: string | null
}

/** Agrupa items por producto sumando cantidades (un producto puede venir repetido) */
function agruparPorProducto(items: ItemDescuentoStock[]): Map<number, { cantidad: number; nombre?: string }> {
  const map = new Map<number, { cantidad: number; nombre?: string }>()
  for (const it of items) {
    const pid = Number(it.productoId)
    const cant = Math.max(0, Math.floor(Number(it.cantidad) || 0))
    if (!pid || cant <= 0) continue
    const prev = map.get(pid)
    if (prev) prev.cantidad += cant
    else map.set(pid, { cantidad: cant, nombre: it.nombre })
  }
  return map
}

async function nombresDeProductos(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Record<number, string>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('productos').select('id, nombre').in('id', ids)
  const map: Record<number, string> = {}
  for (const p of data ?? []) map[p.id as number] = (p.nombre as string) ?? `Producto #${p.id}`
  return map
}

/**
 * Descuenta stock para una venta/factura. Resiliente: nunca lanza, nunca bloquea
 * el cobro. Devuelve alertas (stock 0 / faltante) y errores técnicos.
 */
export async function descontarStockVenta(
  supabase: SupabaseClient,
  items: ItemDescuentoStock[],
  sucursalId: number | null | undefined,
  referencia: { tipo: string; id?: number | null; motivo: string },
  usuarioId?: string | null,
): Promise<ResultadoDescuentoStock> {
  const alertas: string[] = []
  const errores: string[] = []
  const detalles: DetalleDescuentoStock[] = []

  const agrupados = agruparPorProducto(items)
  if (agrupados.size === 0) return { ok: true, alertas, errores, detalles }

  const ids = [...agrupados.keys()]
  const sinNombre = ids.filter(id => !agrupados.get(id)?.nombre)
  const nombresExtra = await nombresDeProductos(supabase, sinNombre)

  for (const [productoId, info] of agrupados) {
    const pedido = info.cantidad
    const nombre = info.nombre || nombresExtra[productoId] || `Producto #${productoId}`

    // Lotes con stock disponible — FEFO: primero los que vencen antes.
    let q = supabase
      .from('inventario')
      .select('id, cantidad, sucursal_id, lote, fecha_vencimiento')
      .eq('producto_id', productoId)
      .gt('cantidad', 0)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)

    const { data: filas, error: errSel } = await q
    if (errSel) {
      errores.push(`No se pudo leer inventario de ${nombre}: ${errSel.message}`)
      continue
    }

    const lotes = (filas ?? []) as FilaInventario[]
    const disponibleTotal = lotes.reduce((s, l) => s + Number(l.cantidad || 0), 0)

    let restante = pedido
    for (const lote of lotes) {
      if (restante <= 0) break
      const enLote = Number(lote.cantidad || 0)
      const take = Math.min(enLote, restante)
      const cantDespues = Math.max(0, enLote - take)

      const { data: upd, error: errUpd } = await supabase
        .from('inventario')
        .update({ cantidad: cantDespues })
        .eq('id', lote.id)
        .eq('cantidad', enLote) // optimista: solo si no cambió en paralelo
        .select('id')
      if (errUpd) {
        errores.push(`Error al descontar ${nombre}: ${errUpd.message}`)
        continue
      }
      // El lote cambió en paralelo (otra caja); no contar ni registrar kardex.
      if (!upd || upd.length === 0) continue

      await supabase.from('inventario_movimientos').insert({
        producto_id: productoId,
        sucursal_id: lote.sucursal_id,
        tipo: 'VENTA',
        cantidad: -Math.abs(take),
        cantidad_antes: enLote,
        cantidad_despues: cantDespues,
        lote: lote.lote ?? null,
        fecha_vencimiento: lote.fecha_vencimiento ?? null,
        motivo: referencia.motivo,
        referencia_tipo: referencia.tipo,
        referencia_id: referencia.id ?? null,
        usuario_id: usuarioId ?? null,
      })

      restante -= take
    }

    const descontado = pedido - restante
    const stockFinal = Math.max(0, disponibleTotal - descontado)
    detalles.push({ productoId, nombre, pedido, descontado, restante: stockFinal })

    if (restante > 0) {
      // Se facturó más de lo disponible: nunca negativo, pero se avisa.
      alertas.push(
        `⚠ ${nombre}: se facturaron ${pedido} pero solo había ${descontado} en stock. ` +
        `El inventario quedó en 0. Verifique el ingreso de este medicamento.`,
      )
    } else if (stockFinal === 0) {
      alertas.push(`⚠ ${nombre}: el inventario quedó en 0. Reabastezca pronto.`)
    }
  }

  return { ok: errores.length === 0, alertas, errores, detalles }
}
