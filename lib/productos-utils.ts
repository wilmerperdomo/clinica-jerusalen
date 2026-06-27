/** Utilidades del módulo de Productos */

export interface Producto {
  id: number
  codigo: string
  nombre: string
  nombre_generico?: string | null
  laboratorio?: string | null
  categoria?: string | null
  unidad?: string | null
  tipo: string
  es_antibiotico: boolean
  costo: number
  precio_venta: number
  stock_minimo: number
  activo: boolean
  codigo_barra?: string | null
  principio_activo?: string | null
  concentracion?: string | null
  presentacion?: string | null
  marca?: string | null
  requiere_receta?: boolean
  es_controlado?: boolean
  gravado?: boolean
  facturable?: boolean
  precio_minimo?: number
  dias_reposicion?: number
  isv_porcentaje?: number
  proveedor_preferido_id?: number | null
  imagen_url?: string | null
}

export interface ProveedorMin {
  id: number
  nombre: string
}

export interface StockProducto {
  producto_id: number
  total: number
  sucursales: { sucursal_id: number; nombre: string; cantidad: number }[]
}

export interface PrecioHistorialRow {
  id: number
  producto_id: number
  precio_anterior?: number | null
  precio_nuevo: number
  costo_anterior?: number | null
  costo_nuevo?: number | null
  motivo?: string | null
  created_at: string
}

export const TIPOS_PRODUCTO = ['Medicamento', 'Producto', 'Insumo'] as const
export const ISV_OPCIONES = [
  { value: 0, label: 'Exento (0%)' },
  { value: 15, label: 'ISV 15%' },
  { value: 18, label: 'ISV 18%' },
]

/** Margen sobre el precio de venta (%) */
export function margenVenta(costo: number, precio: number): number | null {
  if (!precio || precio <= 0) return null
  return ((precio - costo) / precio) * 100
}

/** Markup sobre el costo (%) */
export function markupCosto(costo: number, precio: number): number | null {
  if (!costo || costo <= 0) return null
  return ((precio - costo) / costo) * 100
}

export interface ValidacionProducto {
  ok: boolean
  errores: string[]
  advertencias: string[]
}

export function validarProducto(
  form: {
    codigo: string
    nombre: string
    codigo_barra?: string
    costo: string | number
    precio_venta: string | number
    precio_minimo?: string | number
  },
  productos: Producto[],
  editandoId: number | null,
): ValidacionProducto {
  const errores: string[] = []
  const advertencias: string[] = []

  const codigo = String(form.codigo).trim().toUpperCase()
  const barra = String(form.codigo_barra ?? '').trim()
  const costo = Number(form.costo) || 0
  const precio = Number(form.precio_venta) || 0
  const precioMin = Number(form.precio_minimo) || 0

  if (!codigo) errores.push('El código es obligatorio')
  if (!String(form.nombre).trim()) errores.push('El nombre es obligatorio')
  if (!precio || precio <= 0) errores.push('El precio de venta debe ser mayor a cero')

  const dupCodigo = productos.find(
    p => p.codigo.trim().toUpperCase() === codigo && p.id !== editandoId,
  )
  if (codigo && dupCodigo) errores.push(`El código "${codigo}" ya existe en "${dupCodigo.nombre}"`)

  if (barra) {
    const dupBarra = productos.find(
      p => (p.codigo_barra ?? '').trim() === barra && p.id !== editandoId,
    )
    if (dupBarra) errores.push(`El código de barra ya está asignado a "${dupBarra.nombre}"`)
  }

  if (precio > 0 && costo > 0 && precio < costo) {
    advertencias.push('El precio de venta es menor que el costo (margen negativo)')
  }
  if (precioMin > 0 && precio > 0 && precio < precioMin) {
    advertencias.push(`El precio de venta es menor que el precio mínimo autorizado (L ${precioMin.toFixed(2)})`)
  }

  return { ok: errores.length === 0, errores, advertencias }
}

export function productosACsv(productos: Producto[]): string {
  const header = [
    'codigo', 'codigo_barra', 'nombre', 'nombre_generico', 'tipo', 'categoria',
    'laboratorio', 'marca', 'principio_activo', 'concentracion', 'presentacion',
    'unidad', 'costo', 'precio_venta', 'precio_minimo', 'stock_minimo',
    'isv_porcentaje', 'es_antibiotico', 'requiere_receta', 'es_controlado',
    'gravado', 'facturable', 'activo',
  ]
  const fmt = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = productos.map(p => [
    p.codigo, p.codigo_barra, p.nombre, p.nombre_generico, p.tipo, p.categoria,
    p.laboratorio, p.marca, p.principio_activo, p.concentracion, p.presentacion,
    p.unidad, p.costo, p.precio_venta, p.precio_minimo, p.stock_minimo,
    p.isv_porcentaje, p.es_antibiotico, p.requiere_receta, p.es_controlado,
    p.gravado, p.facturable, p.activo,
  ].map(fmt).join(','))
  return [header.join(','), ...lines].join('\n')
}

export function fmtFechaProd(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}
