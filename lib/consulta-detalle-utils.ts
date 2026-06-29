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

/** Carga medicamentos de la consulta con precio de catálogo (soporta esquema legacy). */
export async function cargarConsultaDetalleConPrecios(
  sb: SupabaseClient,
  consultaId: number,
): Promise<ConsultaDetalleCobro[]> {
  const col = columnaConsultaDetalle()
  const val = valorConsultaDetalle(consultaId)

  let { data: dets } = await sb
    .from('consulta_detalle')
    .select('id, no_producto, cant, id_producto, producto_id, precio, precio_venta')
    .eq(col, val)

  if (!dets?.length && col !== 'consulta_id') {
    const alt = await sb
      .from('consulta_detalle')
      .select('id, no_producto, cant, id_producto, producto_id, precio, precio_venta')
      .eq('consulta_id', consultaId)
    dets = alt.data ?? []
  }

  const prodIds = [
    ...new Set(
      (dets ?? [])
        .map(d => Number(d.producto_id ?? d.id_producto))
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

  return (dets ?? []).map(d => {
    const pid = Number(d.producto_id ?? d.id_producto) || undefined
    const precioFila = Number(d.precio_venta ?? d.precio) || 0
    const precioCat = pid ? (precioMap.get(pid) ?? 0) : 0
    return {
      id: d.id as number | undefined,
      no_producto: String(d.no_producto ?? ''),
      cant: Number(d.cant) || 1,
      producto_id: pid,
      precio_venta: precioFila > 0 ? precioFila : precioCat,
    }
  })
}
