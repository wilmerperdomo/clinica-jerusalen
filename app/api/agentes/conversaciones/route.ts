import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { puedeVerAgentesIa } from '@/lib/agentes/dashboard-auth'

export const dynamic = 'force-dynamic'

/** GET — listado de conversaciones para el panel */
export async function GET(req: NextRequest) {
  const auth = await puedeVerAgentesIa()
  if (!auth.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const canal = searchParams.get('canal')
  const q = searchParams.get('q')?.trim()

  let query = sb
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
    .limit(300)

  if (estado && estado !== 'todas') query = query.eq('estado', estado)
  if (canal && canal !== 'todas') {
    const { data: ch } = await sb.from('agente_canales').select('id').eq('clave', canal).maybeSingle()
    if (ch) query = query.eq('canal_id', ch.id)
  }
  if (q) {
    query = query.or(`contacto_externo.ilike.%${q}%,contacto_nombre.ilike.%${q}%`)
  }

  const [{ data: conversaciones, error }, { data: escalamientos }] = await Promise.all([
    query,
    sb
      .from('agente_escalamientos')
      .select('id, conversacion_id, motivo, prioridad, created_at')
      .is('resuelto_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    conversaciones: conversaciones ?? [],
    escalamientosPendientes: escalamientos ?? [],
  })
}
