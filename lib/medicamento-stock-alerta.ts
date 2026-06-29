import type { SupabaseClient } from '@supabase/supabase-js'

export interface ItemStockCheck {
  productoId: number
  cantidad: number
  nombre?: string
}

export interface EquivalenteSugerido {
  id: number
  nombre: string
  stock: number
  principio_activo: string
}

export interface LineaAlertaStock {
  productoId: number
  nombre: string
  stock: number
  cantidad: number
  mensaje: string
  equivalentes: EquivalenteSugerido[]
}

export interface ResultadoAlertaStock {
  lineas: LineaAlertaStock[]
  /** Texto listo para confirmDialog / alert */
  mensajes: string[]
}

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Suma stock por producto en una sucursal (o todas si sucursalId null) */
export async function stockPorProductos(
  supabase: SupabaseClient,
  productoIds: number[],
  sucursalId?: number | null,
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>()
  if (!productoIds.length) return mapa

  let q = supabase
    .from('inventario')
    .select('producto_id, cantidad')
    .in('producto_id', productoIds)

  if (sucursalId) q = q.eq('sucursal_id', sucursalId)

  const { data } = await q
  for (const row of data ?? []) {
    const pid = Number(row.producto_id)
    mapa.set(pid, (mapa.get(pid) || 0) + Number(row.cantidad || 0))
  }
  return mapa
}

/** Busca medicamentos con el mismo principio activo (y concentración si existe) */
export async function buscarEquivalentesMedicamento(
  supabase: SupabaseClient,
  productoId: number,
  sucursalId: number | null | undefined,
  cantidadNecesaria: number,
  limite = 3,
): Promise<EquivalenteSugerido[]> {
  const { data: prod } = await supabase
    .from('productos')
    .select('id, nombre, principio_activo, concentracion, categoria, tipo')
    .eq('id', productoId)
    .maybeSingle()

  if (!prod?.principio_activo?.trim()) return []

  const pa = normalizarTexto(prod.principio_activo)
  const conc = prod.concentracion?.trim() ? normalizarTexto(prod.concentracion) : null

  const { data: candidatos } = await supabase
    .from('productos')
    .select('id, nombre, principio_activo, concentracion, categoria, tipo')
    .neq('id', productoId)
    .ilike('principio_activo', prod.principio_activo.trim())
    .limit(40)

  const filtrados = (candidatos ?? []).filter(p => {
    if (!p.principio_activo) return false
    if (normalizarTexto(p.principio_activo) !== pa) return false
    if (conc && p.concentracion?.trim()) {
      return normalizarTexto(p.concentracion) === conc
    }
    return true
  })

  if (!filtrados.length) return []

  const ids = filtrados.map(p => p.id as number)
  const stocks = await stockPorProductos(supabase, ids, sucursalId)

  return filtrados
    .map(p => ({
      id: p.id as number,
      nombre: p.nombre as string,
      stock: stocks.get(p.id as number) || 0,
      principio_activo: p.principio_activo as string,
    }))
    .filter(e => e.stock >= cantidadNecesaria)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, limite)
}

/**
 * Evalúa stock antes de cobrar. No bloquea — solo informa.
 * Sugiere equivalentes por principio activo cuando hay faltante o stock bajo.
 */
export async function evaluarStockMedicamentos(
  supabase: SupabaseClient,
  items: ItemStockCheck[],
  sucursalId?: number | null,
): Promise<ResultadoAlertaStock> {
  const agrupado = new Map<number, { cantidad: number; nombre?: string }>()
  for (const it of items) {
    const pid = Number(it.productoId)
    const cant = Math.max(0, Math.floor(Number(it.cantidad) || 0))
    if (!pid || cant <= 0) continue
    const prev = agrupado.get(pid)
    if (prev) {
      prev.cantidad += cant
      if (it.nombre) prev.nombre = it.nombre
    } else {
      agrupado.set(pid, { cantidad: cant, nombre: it.nombre })
    }
  }

  if (agrupado.size === 0) return { lineas: [], mensajes: [] }

  const ids = [...agrupado.keys()]
  const stocks = await stockPorProductos(supabase, ids, sucursalId)

  const { data: prods } = await supabase
    .from('productos')
    .select('id, nombre, stock_minimo')
    .in('id', ids)
  const minMap = new Map<number, number>()
  for (const p of prods ?? []) {
    minMap.set(p.id as number, Number(p.stock_minimo) || 5)
  }

  const lineas: LineaAlertaStock[] = []
  const mensajes: string[] = []

  for (const [productoId, { cantidad, nombre }] of agrupado) {
    const stock = stocks.get(productoId) || 0
    const nombreProd = nombre || prods?.find(p => p.id === productoId)?.nombre || `Producto #${productoId}`
    const minimo = minMap.get(productoId) ?? 5
    const equivalentes = await buscarEquivalentesMedicamento(
      supabase, productoId, sucursalId, cantidad,
    )

    let mensaje = ''
    if (stock < cantidad) {
      mensaje = `⚠️ ${nombreProd}: solo hay ${stock} en stock (se necesitan ${cantidad}).`
    } else if (stock <= minimo) {
      mensaje = `⚠️ ${nombreProd}: stock bajo (${stock} unidades; mínimo ${minimo}).`
    } else {
      continue
    }

    if (equivalentes.length > 0) {
      const sugerencias = equivalentes
        .map(e => `• ${e.nombre} (${e.stock} disp.)`)
        .join('\n')
      mensaje += `\n💡 Mismo principio activo — puede ofrecer:\n${sugerencias}`
    } else if (stock < cantidad) {
      mensaje += '\n💡 No hay equivalente con stock suficiente en catálogo.'
    }

    lineas.push({ productoId, nombre: nombreProd, stock, cantidad, mensaje, equivalentes })
    mensajes.push(mensaje)
  }

  return { lineas, mensajes }
}
