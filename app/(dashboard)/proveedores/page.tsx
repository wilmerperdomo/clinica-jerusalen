import { createClient } from '@/lib/supabase/server'
import ProveedoresClient from './proveedores-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Proveedores' }

export default async function ProveedoresPage() {
  const supabase = await createClient()

  const [
    { data: proveedores },
    { data: compras },
  ] = await Promise.all([
    supabase
      .from('proveedores')
      .select('*')
      .order('nombre'),

    // últimas compras por proveedor (para mostrar última compra y total comprado)
    supabase
      .from('compras')
      .select('proveedor_id, fecha, total, estado')
      .order('fecha', { ascending: false })
      .limit(500),
  ])

  return (
    <ProveedoresClient
      proveedores={proveedores || []}
      compras={compras || []}
    />
  )
}
