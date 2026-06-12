import { createClient } from '@/lib/supabase/server'
import ColoniasClient from './colonias-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de Colonias' }

export default async function ColoniasPage() {
  const supabase = await createClient()

  const [{ data: colonias }, { data: uso }] = await Promise.all([
    supabase
      .from('colonias')
      .select('id, nombre, activo, created_at')
      .order('nombre'),

    supabase
      .from('pacientes')
      .select('colonia_id')
      .not('colonia_id', 'is', null),
  ])

  const usoMap: Record<number, number> = {}
  for (const p of (uso ?? []) as { colonia_id?: number | null }[]) {
    if (p.colonia_id) usoMap[p.colonia_id] = (usoMap[p.colonia_id] ?? 0) + 1
  }

  return <ColoniasClient colonias={(colonias ?? []) as { id: number; nombre: string; activo: boolean; created_at?: string }[]} usoMap={usoMap} />
}
