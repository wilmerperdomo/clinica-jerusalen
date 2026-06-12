import { MAX_CANTIDAD_VENTA } from '@/lib/caja-seguridad'
import { LIMITE_RESULTADOS_CATALOGO } from '@/lib/venta-rapida/constants'
import type {
  PruebaLabCatalogo,
  ProductoCatalogo,
  ServicioCatalogo,
  TabCatalogoVenta,
  VentaRapidaItem,
} from '@/lib/venta-rapida/types'

type ItemNuevo = Omit<VentaRapidaItem, 'key' | 'cantidad'> & { cantidad?: number }

export function filtrarCatalogoVenta(
  tab: TabCatalogoVenta,
  query: string,
  servicios: ServicioCatalogo[],
  productos: ProductoCatalogo[],
  pruebasLab: PruebaLabCatalogo[],
): Array<ServicioCatalogo | ProductoCatalogo | PruebaLabCatalogo> {
  const q = query.toLowerCase().trim()

  if (tab === 'medicamentos') {
    return productos
      .filter(p => !q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, LIMITE_RESULTADOS_CATALOGO)
  }

  if (tab === 'laboratorio') {
    return pruebasLab
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .slice(0, LIMITE_RESULTADOS_CATALOGO)
  }

  return servicios
    .filter(s => !q || s.nombre.toLowerCase().includes(q) || s.tipo.toLowerCase().includes(q))
    .slice(0, LIMITE_RESULTADOS_CATALOGO)
}

export function agregarAlCarrito(items: VentaRapidaItem[], item: ItemNuevo): VentaRapidaItem[] {
  const key = `${item.tipo}-${item.refId}`
  const existente = items.find(i => i.key === key)

  if (existente) {
    return items.map(i =>
      i.key === key
        ? { ...i, cantidad: i.cantidad + (item.cantidad ?? 1) }
        : i,
    )
  }

  return [...items, { ...item, key, cantidad: item.cantidad ?? 1 }]
}

export function quitarDelCarrito(items: VentaRapidaItem[], key: string): VentaRapidaItem[] {
  return items.filter(i => i.key !== key)
}

export function ajustarCantidadCarrito(
  items: VentaRapidaItem[],
  key: string,
  delta: number,
): VentaRapidaItem[] {
  return items.map(i => {
    if (i.key !== key) return i
    const cantidad = Math.min(MAX_CANTIDAD_VENTA, Math.max(1, i.cantidad + delta))
    return { ...i, cantidad }
  })
}

export function subtotalCarrito(items: VentaRapidaItem[]): number {
  return items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
}
