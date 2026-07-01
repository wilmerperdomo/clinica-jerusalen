import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { puedeVerAgentesIa } from '@/lib/agentes/dashboard-auth'
import ConversacionClient from './conversacion-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Conversación ${id.slice(0, 8)}… — Agentes IA` }
}

export default async function ConversacionPage({ params }: Props) {
  const auth = await puedeVerAgentesIa()
  if (!auth.ok) redirect('/')

  const { id } = await params
  const sb = createAdminClient()
  if (!sb) redirect('/')

  const [
    { data: conv },
    { data: mensajes },
    { data: auditoria },
    { data: escalamientos },
  ] = await Promise.all([
    sb.from('agente_conversaciones').select('*').eq('id', id).maybeSingle(),
    sb
      .from('agente_mensajes')
      .select('id, rol, contenido, agente, intencion, confianza, created_at')
      .eq('conversacion_id', id)
      .order('created_at'),
    sb
      .from('agente_auditoria')
      .select('id, accion, agente, detalle, created_at')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    sb
      .from('agente_escalamientos')
      .select('id, motivo, prioridad, resuelto_at, notas, created_at')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!conv) notFound()

  const { data: canal } = await sb
    .from('agente_canales')
    .select('id, clave, nombre')
    .eq('id', conv.canal_id)
    .maybeSingle()

  return (
    <ConversacionClient
      conversacion={conv}
      canal={canal}
      mensajes={mensajes ?? []}
      auditoria={auditoria ?? []}
      escalamientos={escalamientos ?? []}
    />
  )
}
