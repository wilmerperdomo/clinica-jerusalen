import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { procesarMensajeEntrante } from '@/lib/agentes/orchestrator'
import {
  parseWhatsAppMetaWebhook,
  parseWhatsAppEvolutionWebhook,
  validarCanalParam,
  verificarWebhookToken,
  resolverCanalMetaWebhook,
} from '@/lib/agentes/channels/normalizer'
import { enviarRespuestaCanal } from '@/lib/agentes/channels/outbound'
import {
  esWebhookWhatsAppMeta,
  verificarFirmaMeta,
} from '@/lib/agentes/channels/meta-webhook-auth'
import type { CanalClave } from '@/lib/agentes/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ canal: string }> }

function secretWebhook(): string | undefined {
  return process.env.AGENTES_WEBHOOK_SECRET?.trim()
}

function metaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim()
    ?? process.env.FACEBOOK_APP_SECRET?.trim()
}

/** Meta POST: Bearer de prueba, firma HMAC o payload whatsapp_business_account */
function webhookPostAutorizado(
  req: NextRequest,
  rawBody: string,
  body: unknown,
): boolean {
  const secret = secretWebhook()
  const auth = req.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true

  const sig = req.headers.get('x-hub-signature-256')
  const appSecret = metaAppSecret()
  if (sig && appSecret && verificarFirmaMeta(rawBody, sig, appSecret)) return true

  // Meta envía firma; si no hay App Secret en Vercel, aceptar payload WhatsApp válido
  if (process.env.NODE_ENV !== 'production') return true
  if (sig && esWebhookWhatsAppMeta(body)) return true
  if (esWebhookWhatsAppMeta(body)) return true

  return false
}

/** GET — verificación Meta (WhatsApp / Messenger) */
export async function GET(req: NextRequest, { params }: Params) {
  const { canal } = await params
  const clave = validarCanalParam(canal)
  if (!clave) return NextResponse.json({ error: 'Canal inválido' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (verificarWebhookToken(mode, token, secretWebhook())) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
}

/** POST — mensajes entrantes por canal WhatsApp */
export async function POST(req: NextRequest, { params }: Params) {
  const { canal } = await params
  const clave = validarCanalParam(canal) as CanalClave | null
  if (!clave) return NextResponse.json({ error: 'Canal inválido' }, { status: 400 })

  const rawBody = await req.text()
  let body: unknown = null
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!webhookPostAutorizado(req, rawBody, body)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Supabase admin no disponible' }, { status: 500 })

  const proveedor = req.headers.get('x-agentes-proveedor') ?? 'meta'
  const claveEfectiva =
    proveedor === 'evolution' ? clave : resolverCanalMetaWebhook(body, clave)
  const entradas =
    proveedor === 'evolution'
      ? parseWhatsAppEvolutionWebhook(body, claveEfectiva)
      : parseWhatsAppMetaWebhook(body, claveEfectiva)

  const resultados = []
  const errores: { etapa: string; error: string }[] = []

  for (const entrada of entradas) {
    try {
      const res = await procesarMensajeEntrante(sb, entrada)
      for (const r of res.respuestas) {
        try {
          await enviarRespuestaCanal({
            canal: claveEfectiva,
            contacto: entrada.contactoExterno,
            texto: r.texto,
            proveedor: entrada.proveedor,
          })
        } catch (e) {
          errores.push({
            etapa: 'envio',
            error: e instanceof Error ? e.message : 'Error al enviar respuesta',
          })
        }
      }
      resultados.push({
        conversacionId: res.conversacionId,
        agente: res.agente,
        intencion: res.intencion,
        escalado: res.escalado,
      })
    } catch (e) {
      errores.push({
        etapa: 'procesamiento',
        error: e instanceof Error ? e.message : 'Error al procesar mensaje',
      })
    }
  }

  // Meta requiere 200 rápido; siempre OK aunque falle envío (queda en errores)
  return NextResponse.json({
    ok: true,
    procesados: resultados.length,
    resultados,
    errores: errores.length ? errores : undefined,
  })
}
