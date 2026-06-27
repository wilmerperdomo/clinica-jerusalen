'use server'

import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import type { PrecioHistorialRow } from '@/lib/productos-utils'

export async function fetchHistorialPrecios(productoId: number) {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión', rows: [] as PrecioHistorialRow[] }

  const { data, error } = await supabase
    .from('producto_precio_historial')
    .select('id, producto_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, motivo, created_at')
    .eq('producto_id', productoId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { ok: false as const, error: error.message, rows: [] as PrecioHistorialRow[] }
  return { ok: true as const, rows: (data ?? []) as PrecioHistorialRow[] }
}

export async function siguienteCodigoProducto(prefijo = 'PRD') {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión', codigo: '' }

  const { data, error } = await supabase.rpc('fn_siguiente_codigo_producto', { p_prefijo: prefijo })
  if (error) return { ok: false as const, error: error.message, codigo: '' }
  return { ok: true as const, codigo: data as string }
}

export interface ImportProductoRow {
  codigo: string
  nombre: string
  tipo?: string
  categoria?: string
  unidad?: string
  costo?: number
  precio_venta?: number
  precio_minimo?: number
  stock_minimo?: number
  codigo_barra?: string
  laboratorio?: string
  isv_porcentaje?: number
}

export async function importarProductos(filas: ImportProductoRow[]) {
  const { esSuperAdmin, esAdmin } = await getPerfilSucursal()
  if (!esSuperAdmin && !esAdmin) return { ok: false as const, error: 'No autorizado' }

  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión' }

  let creados = 0
  let actualizados = 0
  const errores: string[] = []

  for (const fila of filas) {
    const codigo = String(fila.codigo ?? '').trim().toUpperCase()
    const nombre = String(fila.nombre ?? '').trim()
    if (!codigo || !nombre) { errores.push(`Fila sin código o nombre: ${codigo || nombre || '?'}`); continue }

    const payload = {
      codigo,
      nombre,
      tipo: fila.tipo || 'Producto',
      categoria: fila.categoria || 'Otros',
      unidad: fila.unidad || 'Unidad',
      costo: Number(fila.costo) || 0,
      precio_venta: Number(fila.precio_venta) || 0,
      precio_minimo: Number(fila.precio_minimo) || 0,
      stock_minimo: Number(fila.stock_minimo) || 5,
      codigo_barra: fila.codigo_barra?.toString().trim() || null,
      laboratorio: fila.laboratorio?.toString().trim() || null,
      isv_porcentaje: fila.isv_porcentaje != null ? Number(fila.isv_porcentaje) : 15,
      activo: true,
    }

    const { data: existente } = await supabase.from('productos').select('id').eq('codigo', codigo).maybeSingle()
    if (existente) {
      const { error } = await supabase.from('productos').update(payload).eq('id', existente.id)
      if (error) errores.push(`${codigo}: ${error.message}`)
      else actualizados += 1
    } else {
      const { error } = await supabase.from('productos').insert(payload)
      if (error) errores.push(`${codigo}: ${error.message}`)
      else creados += 1
    }
  }

  return { ok: true as const, creados, actualizados, errores }
}
