/**
 * Recetas (consulta_detalle): esquema legacy migrado desde MySQL usa id_consulta (TEXT),
 * no consulta_id (INTEGER) de la migración 014 en instalaciones nuevas.
 */

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
