import { createClient } from '@/lib/supabase/server'
import ProductosClient from './productos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de Productos' }

export default async function ProductosPage() {
  const supabase = await createClient()

  const { data: productos } = await supabase
    .from('productos')
    .select('*')
    .order('nombre')

  return <ProductosClient productos={productos || []} />
}
