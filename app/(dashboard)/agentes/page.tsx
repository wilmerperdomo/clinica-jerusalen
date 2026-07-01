import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { puedeVerAgentesIa } from '@/lib/agentes/dashboard-auth'
import AgentesClient from './agentes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Agentes IA — WhatsApp' }

export default async function AgentesPage() {
  const auth = await puedeVerAgentesIa()
  if (!auth.ok) redirect('/')

  const sb = createAdminClient()
  if (!sb) redirect('/')

  const [{ data: conversaciones }, { data: escalamientos }, { data: canales }] = await Promise.all([
    sb
      .from('agente_conversaciones')
      .select(`
        id,
        contacto_externo,
        contacto_nombre,
        estado,
        ultimo_agente,
        ultimo_mensaje_at,
        created_at,
        paciente_id,
        canal:agente_canales(id, clave, nombre)
      `)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .limit(300),
    sb
      .from('agente_escalamientos')
      .select('id, conversacion_id, motivo, prioridad, created_at')
      .is('resuelto_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    sb.from('agente_canales').select('id, clave, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <AgentesClient
      conversacionesIniciales={conversaciones ?? []}
      escalamientosIniciales={escalamientos ?? []}
      canales={canales ?? []}
    />
  )
}
