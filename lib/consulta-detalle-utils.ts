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
  id: number
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

/** Normaliza texto para comparar nombres de medicamento (sin acentos, minúsculas). */
function normNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ProductoResuelto {
  id: number
  precio_venta: number
  nombre: string
}

/**
 * Resuelve el producto del catálogo a partir del nombre escrito a mano en la receta.
 * Empareja contra productos.nombre y productos.nombre_generico de forma tolerante.
 * Solo acepta coincidencias fuertes (igualdad o prefijo) para no descontar de un
 * producto equivocado. Devuelve un mapa nombreOriginal → producto.
 */
export async function resolverProductosPorNombre(
  sb: SupabaseClient,
  nombres: string[],
): Promise<Map<string, ProductoResuelto>> {
  const out = new Map<string, ProductoResuelto>()
  const unicos = [...new Set(nombres.map(n => (n || '').trim()).filter(Boolean))]

  for (const original of unicos) {
    // Parte significativa: antes de coma o paréntesis (ej. "Nobiliax 75mg, Tabletas").
    const base = normNombre(original).split(/[,(]/)[0].trim()
    if (base.length < 3) continue

    // Término de búsqueda: primeras 2 palabras, solo alfanumérico (filtro ilike seguro).
    const term = base
      .split(' ')
      .slice(0, 2)
      .join(' ')
      .replace(/[^a-z0-9 ]/gi, ' ')
      .trim()
    if (term.length < 3) continue

    const { data } = await sb
      .from('productos')
      .select('id, nombre, nombre_generico, precio_venta')
      .or(`nombre.ilike.%${term}%,nombre_generico.ilike.%${term}%`)
      .limit(15)

    if (!data?.length) continue

    let best: ProductoResuelto | null = null
    let bestScore = 0
    for (const c of data) {
      const nc = normNombre(String(c.nombre ?? ''))
      const ng = normNombre(String(c.nombre_generico ?? ''))
      let score = 0
      if (base === nc || (ng && base === ng)) score = 3
      else if (
        nc.startsWith(base) || base.startsWith(nc) ||
        (ng && (ng.startsWith(base) || base.startsWith(ng)))
      ) score = 2
      if (score > bestScore) {
        bestScore = score
        best = { id: Number(c.id), precio_venta: Number(c.precio_venta) || 0, nombre: String(c.nombre ?? '') }
      }
    }

    // Solo coincidencias fuertes (igualdad o prefijo). Evita descuentos erróneos.
    if (best && bestScore >= 2) out.set(original, best)
  }

  return out
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

  // Medicamentos escritos a mano (sin producto_id) → emparejar por nombre con el
  // catálogo para que tomen precio y se descuenten del inventario.
  const nombresSinPid = filas
    .filter(d => !leerNum(d, 'producto_id', 'id_producto'))
    .map(d => String(d.no_producto ?? ''))
    .filter(Boolean)
  const matchPorNombre = nombresSinPid.length
    ? await resolverProductosPorNombre(sb, nombresSinPid)
    : new Map<string, ProductoResuelto>()

  return filas.map(d => {
    let pid = leerNum(d, 'producto_id', 'id_producto') || undefined
    let precioResuelto = 0
    if (!pid) {
      const m = matchPorNombre.get(String(d.no_producto ?? ''))
      if (m) {
        pid = m.id
        precioResuelto = m.precio_venta
      }
    }
    // Algunos esquemas guardan el precio en la fila; si no, se toma del catálogo.
    const precioFila = leerNum(d, 'precio_venta', 'precio', 'precio_unitario')
    const precioCat = pid ? (precioMap.get(pid) ?? precioResuelto) : 0
    return {
      id: d.id != null ? Number(d.id) : 0,
      no_producto: String(d.no_producto ?? ''),
      cant: leerNum(d, 'cant', 'cantidad') || 1,
      producto_id: pid,
      precio_venta: precioFila > 0 ? precioFila : (precioCat || precioResuelto),
    }
  })
}
