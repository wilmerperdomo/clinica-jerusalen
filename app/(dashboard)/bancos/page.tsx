import { createClient } from '@/lib/supabase/server'
import BancosClient from './bancos-client'
import type { BancoRow } from '@/lib/caja-bancos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de Bancos' }

export default async function BancosPage() {
  const supabase = await createClient()

  const { data: bancos } = await supabase
    .from('bancos')
    .select('id, nombre, activo, orden, created_at')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })

  return <BancosClient bancos={(bancos ?? []) as BancoRow[]} />
}
