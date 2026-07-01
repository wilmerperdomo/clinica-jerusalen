import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { procesarMensajeEntrante } from '@/lib/agentes/orchestrator'
import { esCanalClave } from '@/lib/agentes/config/canales'
import {
  enviarRespuestaCanal,
  inferirProveedorCanal,
  proveedorEnvioDisponible,
} from '@/lib/agentes/channels/outbound'
import type { CanalClave, MensajeEntrante } from '@/lib/agentes/types'

export const dynamic = 'force-dynamic'

function apiKeyValida(req: NextRequest): boolean {
  const key = process.env.AGENTES_API_KEY?.trim()
  if (!key) {
    // Sin API key: permitir en dev y en la página pública /agentes/prueba en Vercel
    if (process.env.NODE_ENV !== 'production') return true
    const ref = req.headers.get('referer') ?? ''
    return ref.includes('/agentes/prueba')
  }
  return req.headers.get('x-agentes-api-key') === key
}

/**
 * REST interno — simular o reenviar mensaje entrante (pruebas / integraciones).
 * POST { canalClave, contactoExterno, texto, contactoNombre? }
 */
export async function POST(req: NextRequest) {
  if (!apiKeyValida(req)) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
  }

  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Supabase admin no disponible' }, { status: 500 })

  const body = await req.json().catch(() => null) as {
    canalClave?: string
    canal?: string
    contactoExterno?: string
    telefono?: string
    texto?: string
    contactoNombre?: string
    nombre?: string
    enviar?: boolean
    proveedor?: 'whatsapp_meta' | 'whatsapp_evolution' | 'messenger' | 'auto'
  } | null

  const canalClave = body?.canalClave ?? body?.canal
  const contactoExterno = body?.contactoExterno ?? body?.telefono
  const contactoNombre = body?.contactoNombre ?? body?.nombre
  const texto = body?.texto?.trim()
  const enviarReal = body?.enviar === true
  const proveedorPreferido = body?.proveedor as
    | 'whatsapp_meta'
    | 'whatsapp_evolution'
    | 'messenger'
    | 'auto'
    | undefined

  if (!canalClave || !contactoExterno || !texto) {
    return NextResponse.json(
      { error: 'Requerido: canalClave (o canal), contactoExterno (o telefono), texto' },
      { status: 400 },
    )
  }

  if (!esCanalClave(canalClave)) {
    return NextResponse.json({ error: 'canalClave inválido' }, { status: 400 })
  }

  const proveedor = inferirProveedorCanal(canalClave as CanalClave, proveedorPreferido)

  const entrada: MensajeEntrante = {
    proveedor: proveedor === 'messenger' ? 'messenger' : proveedor,
    canalClave: canalClave as CanalClave,
    mensajeExternoId: `api-${Date.now()}`,
    contactoExterno,
    contactoNombre,
    texto,
    timestamp: String(Date.now()),
  }

  try {
    const resultado = await procesarMensajeEntrante(sb, entrada)

    const envios: { ok: boolean; error?: string }[] = []
    if (enviarReal) {
      for (const r of resultado.respuestas) {
        try {
          await enviarRespuestaCanal({
            canal: canalClave as CanalClave,
            contacto: contactoExterno,
            texto: r.texto,
            proveedor,
          })
          envios.push({ ok: true })
        } catch (e) {
          envios.push({ ok: false, error: e instanceof Error ? e.message : 'Error al enviar' })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...resultado,
      enviado: enviarReal,
      proveedor,
      envios: enviarReal ? envios : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    const status = msg.includes('Canal no registrado') ? 503 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

/** GET — healthcheck del módulo */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const authed = supabase ? (await supabase.auth.getUser()).data.user : null
  if (!authed && !apiKeyValida(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    modulo: 'agentes_ia',
    openai: Boolean(process.env.OPENAI_API_KEY),
    canales: ['whatsapp_principal', 'whatsapp_sucursal', 'whatsapp_corporativo', 'messenger_pagina'],
    envio: proveedorEnvioDisponible(),
    webhook_whatsapp: '/api/agentes/webhook/whatsapp/whatsapp_principal',
    webhook_messenger: '/api/agentes/webhook/messenger',
  })
}
