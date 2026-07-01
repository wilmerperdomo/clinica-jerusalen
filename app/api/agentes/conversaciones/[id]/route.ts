import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** GET historial de conversación (admin autenticado) */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [{ data: conv }, { data: mensajes }, { data: auditoria }] = await Promise.all([
    supabase.from('agente_conversaciones').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('agente_mensajes')
      .select('id, rol, contenido, agente, intencion, confianza, created_at')
      .eq('conversacion_id', id)
      .order('created_at'),
    supabase
      .from('agente_auditoria')
      .select('id, accion, agente, detalle, created_at')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  return NextResponse.json({ conversacion: conv, mensajes: mensajes ?? [], auditoria: auditoria ?? [] })
}
