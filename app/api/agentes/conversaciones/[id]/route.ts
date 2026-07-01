import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { puedeVerAgentesIa } from '@/lib/agentes/dashboard-auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** GET historial de conversación (panel dashboard) */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await puedeVerAgentesIa()
  if (!auth.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 })

  const [
    { data: conv },
    { data: mensajes },
    { data: auditoria },
    { data: escalamientos },
    { data: canal },
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
      .limit(50),
    sb
      .from('agente_escalamientos')
      .select('id, motivo, prioridad, resuelto_at, notas, created_at')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: false }),
    sb.from('agente_canales').select('id, clave, nombre'),
  ])

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const canalInfo = canal?.find(c => c.id === conv.canal_id) ?? null

  return NextResponse.json({
    conversacion: conv,
    canal: canalInfo,
    mensajes: mensajes ?? [],
    auditoria: auditoria ?? [],
    escalamientos: escalamientos ?? [],
  })
}

/** PATCH — resolver escalamiento o cerrar conversación */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await puedeVerAgentesIa()
  if (!auth.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 })

  const body = await req.json().catch(() => null) as {
    accion?: 'resolver_escalamiento' | 'cerrar' | 'reactivar'
    escalamientoId?: number
    notas?: string
  } | null

  if (!body?.accion) {
    return NextResponse.json({ error: 'Requerido: accion' }, { status: 400 })
  }

  const ahora = new Date().toISOString()

  if (body.accion === 'resolver_escalamiento') {
    const q = sb
      .from('agente_escalamientos')
      .update({
        resuelto_at: ahora,
        notas: body.notas?.trim() || null,
        asignado_a: auth.userId,
      })
      .eq('conversacion_id', id)
      .is('resuelto_at', null)

    if (body.escalamientoId) q.eq('id', body.escalamientoId)

    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { count } = await sb
      .from('agente_escalamientos')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', id)
      .is('resuelto_at', null)

    if (!count) {
      await sb
        .from('agente_conversaciones')
        .update({ estado: 'activa', updated_at: ahora })
        .eq('id', id)
    }

    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'cerrar') {
    const { error } = await sb
      .from('agente_conversaciones')
      .update({ estado: 'cerrada', updated_at: ahora })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'reactivar') {
    const { error } = await sb
      .from('agente_conversaciones')
      .update({ estado: 'activa', updated_at: ahora })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
