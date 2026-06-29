/**
 * Recetas (consulta_detalle): esquema legacy migrado desde MySQL usa id_consulta (TEXT),
 * no consulta_id (INTEGER) de la migración 014 en instalaciones nuevas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RecetaDetalleNormalizado {
  id?: number
  producto_id?: number
  no_producto: string
  indicacion: string
  cant: number
  via: string
}

export interface RecetaDetalleInsert {
  id_consulta: string
  id_producto: string | null
  no_producto: string
  indicacion: string
  cant: string
  via: string
  usuario?: string
}

/** Columna de enlace consulta ↔ detalle en producción (legacy). */
export function columnaConsultaDetalle(): 'id_consulta' {
  return 'id_consulta'
}

export function valorConsultaDetalle(consultaId: number): string {
  return String(consultaId)
}

export function normalizarConsultaDetalle(row: Record<string, unknown>): RecetaDetalleNormalizado {
  const idProducto = row.producto_id ?? row.id_producto
  return {
    id: row.id != null ? Number(row.id) : undefined,
    producto_id: idProducto != null && idProducto !== '' ? Number(idProducto) : undefined,
    no_producto: String(row.no_producto ?? ''),
    indicacion: String(row.indicacion ?? ''),
    cant: Number(row.cant) || 1,
    via: String(row.via ?? 'Oral'),
  }
}

export function filasInsertConsultaDetalle(
  consultaId: number,
  items: Array<{
    producto_id?: number
    no_producto: string
    indicacion: string
    cant: number
    via: string
  }>,
  userId?: string | null,
): RecetaDetalleInsert[] {
  return items.map(it => ({
    id_consulta: valorConsultaDetalle(consultaId),
    id_producto: it.producto_id != null ? String(it.producto_id) : null,
    no_producto: it.no_producto,
    indicacion: it.indicacion,
    cant: String(it.cant),
    via: it.via,
    ...(userId ? { usuario: userId } : {}),
  }))
}

export interface ConsultaDetalleCobro {
  id?: number
  no_producto: string
  cant: number
  producto_id?: number
  precio_venta: number
}

/** Lee un campo numérico de forma tolerante (acepta nombres alternativos). */
function leerNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k]
    if (v != null && v !== '') {
      const n = Number(v)
      if (!Number.isNaN(n)) return n
    }
  }
  return 0
}

/**
 * Carga medicamentos de la consulta con precio de catálogo.
 * Usa select('*') para tolerar ambos esquemas (consulta_id/producto_id y
 * legacy id_consulta/id_producto) sin fallar por columnas inexistentes.
 */
export async function cargarConsultaDetalleConPrecios(
  sb: SupabaseClient,
  consultaId: number,
): Promise<ConsultaDetalleCobro[]> {
  const col = columnaConsultaDetalle()
  const val = valorConsultaDetalle(consultaId)

  let { data: dets } = await sb
    .from('consulta_detalle')
    .select('*')
    .eq(col, val)

  // Fallback al esquema nuevo (consulta_id INTEGER) si el legacy no devolvió filas.
  if (!dets?.length && col !== 'consulta_id') {
    const alt = await sb
      .from('consulta_detalle')
      .select('*')
      .eq('consulta_id', consultaId)
    dets = alt.data ?? []
  }

  const filas = (dets ?? []) as Record<string, unknown>[]

  const prodIds = [
    ...new Set(
      filas
        .map(d => leerNum(d, 'producto_id', 'id_producto'))
        .filter(id => id > 0),
    ),
  ]

  const precioMap = new Map<number, number>()
  if (prodIds.length) {
    const { data: prods } = await sb
      .from('productos')
      .select('id, precio_venta')
      .in('id', prodIds)
    for (const p of prods ?? []) {
      precioMap.set(p.id as number, Number(p.precio_venta) || 0)
    }
  }

  return filas.map(d => {
    const pid = leerNum(d, 'producto_id', 'id_producto') || undefined
    // Algunos esquemas guardan el precio en la fila; si no, se toma del catálogo.
    const precioFila = leerNum(d, 'precio_venta', 'precio', 'precio_unitario')
    const precioCat = pid ? (precioMap.get(pid) ?? 0) : 0
    return {
      id: d.id != null ? Number(d.id) : undefined,
      no_producto: String(d.no_producto ?? ''),
      cant: leerNum(d, 'cant', 'cantidad') || 1,
      producto_id: pid,
      precio_venta: precioFila > 0 ? precioFila : precioCat,
    }
  })
}
