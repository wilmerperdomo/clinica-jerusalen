import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import InventarioClient from './inventario-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventario' }

export default async function InventarioPage() {
  const supabase = await createClient()
  const { userId, sucursalId, esSuperAdmin } = await getPerfilSucursal()

  const invQuery = supabase
    .from('inventario')
    .select('*, producto:productos(id,nombre,codigo,tipo,stock_minimo,unidad,costo,precio_venta,precio_minimo,proveedor_preferido_id,dias_reposicion), sucursal:sucursales(id,nombre)')
    .order('fecha_vencimiento', { ascending: true })

  const movQuery = supabase
    .from('inventario_movimientos')
    .select('*, producto:productos(nombre,codigo), sucursal:sucursales(nombre)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!esSuperAdmin && sucursalId) {
    invQuery.eq('sucursal_id', sucursalId)
    movQuery.eq('sucursal_id', sucursalId)
  }

  const [
    { data: productos },
    { data: inventario },
    { data: movimientos },
    { data: sucursales },
    { data: proveedores },
    { data: categorias },
  ] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    invQuery,
    movQuery,
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('proveedores').select('*').order('nombre'),
    supabase.from('producto_categorias').select('*').order('tabla').order('nombre'),
  ])

  return (
    <InventarioClient
      productos={productos || []}
      inventario={inventario || []}
      movimientos={movimientos || []}
      sucursales={sucursales || []}
      proveedores={proveedores || []}
      categorias={categorias || []}
      userId={userId}
      sucursalUsuario={sucursalId}
    />
  )
}
