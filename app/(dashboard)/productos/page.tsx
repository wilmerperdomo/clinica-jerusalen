import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import ProductosClient from './productos-client'
import type { StockProducto } from '@/lib/productos-utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de Productos' }

export default async function ProductosPage() {
  const supabase = await createClient()
  if (!supabase) return null

  const { esSuperAdmin } = await getPerfilSucursal()

  const [
    { data: productos },
    { data: proveedores },
    { data: categorias },
    { data: sucursales },
    { data: inventario },
  ] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('producto_categorias').select('id, nombre, tabla, activo').order('nombre'),
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('inventario').select('producto_id, sucursal_id, cantidad'),
  ])

  // Consolidar stock por producto / sucursal
  const sucMap = new Map<number, string>((sucursales ?? []).map(s => [s.id, s.nombre]))
  const stockMap = new Map<number, StockProducto>()
  for (const row of inventario ?? []) {
    const pid = row.producto_id as number
    const cant = Number(row.cantidad) || 0
    if (!stockMap.has(pid)) stockMap.set(pid, { producto_id: pid, total: 0, sucursales: [] })
    const entry = stockMap.get(pid)!
    entry.total += cant
    const sucId = row.sucursal_id as number
    const existing = entry.sucursales.find(s => s.sucursal_id === sucId)
    if (existing) existing.cantidad += cant
    else entry.sucursales.push({ sucursal_id: sucId, nombre: sucMap.get(sucId) ?? `Suc ${sucId}`, cantidad: cant })
  }

  return (
    <ProductosClient
      productos={productos || []}
      proveedores={proveedores || []}
      categorias={categorias || []}
      stock={Array.from(stockMap.values())}
      esSuperAdmin={esSuperAdmin}
    />
  )
}
