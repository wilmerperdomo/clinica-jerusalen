import type { SupabaseClient } from '@supabase/supabase-js'
import { limpiarCelular } from '@/lib/mensajes-paciente'
import {
  evolutionConnectionState,
  evolutionLimits,
  evolutionSendMedia,
  evolutionSendText,
  getEvolutionConfig,
  isEvolutionConfigured,
  MENSAJE_EVOLUTION_DESCONECTADO,
  MENSAJE_EVOLUTION_NO_CONFIG,
  sleep,
} from '@/lib/evolution-api'
import { urlTrackingApertura } from '@/lib/promociones-plantillas'
import {
  asuntoPromocion,
  mensajePromocion,
  type Campana,
  type EnvioRegistro,
  type Promocion,
  type ProveedorEnvio,
} from '@/lib/promociones-utils'
type DestinatarioEnvio = {
  id: number
  nombre: string
  apellido1?: string | null
  celular?: string | null
  telefono?: string | null
  correo?: string | null
}

type EnvioPendiente = EnvioRegistro & {
  paciente?: DestinatarioEnvio | null
  contacto?: DestinatarioEnvio | null
}

type CampanaAutomatica = Campana & {
  promocion?: Promocion | null
}

interface EnvioResultado {
  ok: boolean
  proveedor: 'whatsapp' | 'evolution' | 'resend' | 'sendgrid'
  proveedor_id?: string | null
  error?: string | null
}
export interface ProcesarPromocionesResultado {
  ok: boolean
  campanasProcesadas: number
  enviados: number
  fallidos: number
  errores: string[]
  config: PromocionesEnvioConfig
}

export interface PromocionesEnvioConfig {
  whatsapp: boolean
  evolution: boolean
  evolutionConnected: boolean
  evolutionState?: string
  evolutionInstance?: string
  resend: boolean
  sendgrid: boolean
  evolutionBatchSize: number
  evolutionDelayMs: number
}

export function getPromocionesEnvioConfig(): Omit<PromocionesEnvioConfig, 'evolutionConnected' | 'evolutionState' | 'evolutionInstance'> {
  const evo = getEvolutionConfig()
  return {
    whatsapp: Boolean(whatsappConfig().token && whatsappConfig().phoneNumberId),
    evolution: isEvolutionConfigured(),
    resend: Boolean(resendConfig().apiKey),
    sendgrid: Boolean(sendgridConfig().apiKey),
    evolutionBatchSize: evo?.batchSize ?? 25,
    evolutionDelayMs: evo?.delayMs ?? 4000,
  }
}

export async function getPromocionesEnvioConfigAsync(): Promise<PromocionesEnvioConfig> {
  const base = getPromocionesEnvioConfig()
  const evo = base.evolution ? await evolutionConnectionState() : { configured: false, connected: false }
  return {
    ...base,
    evolutionConnected: evo.connected,
    evolutionState: evo.state,
    evolutionInstance: evo.instance,
  }
}

export function proveedorAutomaticoPorDefecto(): ProveedorEnvio {
  const cfg = getPromocionesEnvioConfig()
  if (cfg.evolution) return 'evolution'
  if (cfg.whatsapp) return 'meta'
  return 'asistido'
}
function mensajeConfigFaltante(canal: 'whatsapp' | 'email'): string {
  if (canal === 'whatsapp') {
    return 'WhatsApp no está configurado. Agregue WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Vercel (Settings → Environment Variables).'
  }
  return 'Correo no está configurado. Agregue RESEND_API_KEY o SENDGRID_API_KEY en Vercel.'
}

function whatsappConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v20.0'
  const templateName = process.env.WHATSAPP_PROMO_TEMPLATE_NAME?.trim()
  const templateLang = process.env.WHATSAPP_PROMO_TEMPLATE_LANG?.trim() || 'es'
  return { token, phoneNumberId, apiVersion, templateName, templateLang }
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.PROMOCIONES_EMAIL_FROM?.trim()
    || process.env.RESEND_FROM_EMAIL?.trim()
    || 'Promociones Clínica Jerusalén <promociones@clinicamedicajerusalen.com>'
  return { apiKey, from }
}

function sendgridConfig() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const from = process.env.PROMOCIONES_EMAIL_FROM?.trim()
    || process.env.SENDGRID_FROM_EMAIL?.trim()
    || 'promociones@clinicamedicajerusalen.com'
  return { apiKey, from }
}

async function enviarWhatsApp(
  destinatario: DestinatarioEnvio,
  promo: Promocion,
  mensajePersonalizado?: string | null,
): Promise<EnvioResultado> {
  const cfg = whatsappConfig()
  if (!cfg.token || !cfg.phoneNumberId) {
    return { ok: false, proveedor: 'whatsapp', error: mensajeConfigFaltante('whatsapp') }
  }

  const to = limpiarCelular(destinatario.celular, destinatario.telefono)
  if (!to) return { ok: false, proveedor: 'whatsapp', error: 'Destinatario sin WhatsApp válido' }

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`
  const mensaje = mensajePromocion(promo, destinatario, mensajePersonalizado)
  const body = cfg.templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: cfg.templateName,
          language: { code: cfg.templateLang },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: `${destinatario.nombre} ${destinatario.apellido1 ?? ''}`.trim() },
                { type: 'text', text: promo.titulo },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: true, body: mensaje },
      }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      proveedor: 'whatsapp',
      error: data?.error?.message || `WhatsApp HTTP ${res.status}`,
    }
  }
  return {
    ok: true,
    proveedor: 'whatsapp',
    proveedor_id: data?.messages?.[0]?.id ?? null,
  }
}

async function enviarWhatsAppEvolution(
  destinatario: DestinatarioEnvio,
  promo: Promocion,
  mensajePersonalizado?: string | null,
): Promise<EnvioResultado> {
  if (!isEvolutionConfigured()) {
    return { ok: false, proveedor: 'evolution', error: MENSAJE_EVOLUTION_NO_CONFIG }
  }

  const conn = await evolutionConnectionState()
  if (!conn.connected) {
    return { ok: false, proveedor: 'evolution', error: MENSAJE_EVOLUTION_DESCONECTADO }
  }

  const mensaje = mensajePromocion(promo, destinatario, mensajePersonalizado)

  if (promo.imagen_url) {
    const media = await evolutionSendMedia(
      destinatario.celular,
      destinatario.telefono,
      promo.imagen_url,
      mensaje,
    )
    if (media.ok) {
      return { ok: true, proveedor: 'evolution', proveedor_id: media.id ?? null }
    }
    const texto = await evolutionSendText(destinatario.celular, destinatario.telefono, mensaje)
    return {
      ok: texto.ok,
      proveedor: 'evolution',
      proveedor_id: texto.id ?? null,
      error: texto.ok ? null : (texto.error || media.error),
    }
  }

  const texto = await evolutionSendText(destinatario.celular, destinatario.telefono, mensaje)
  return {
    ok: texto.ok,
    proveedor: 'evolution',
    proveedor_id: texto.id ?? null,
    error: texto.error ?? null,
  }
}

async function enviarWhatsAppPorProveedor(
  proveedor: ProveedorEnvio | undefined,
  destinatario: DestinatarioEnvio,
  promo: Promocion,
  mensajePersonalizado?: string | null,
): Promise<EnvioResultado> {
  if (proveedor === 'evolution') {
    return enviarWhatsAppEvolution(destinatario, promo, mensajePersonalizado)
  }
  return enviarWhatsApp(destinatario, promo, mensajePersonalizado)
}
async function enviarEmail(
  destinatario: DestinatarioEnvio,
  promo: Promocion,
  mensajePersonalizado?: string | null,
  trackingToken?: string | null,
): Promise<EnvioResultado> {
  const cfg = resendConfig()
  if (!destinatario.correo?.trim()) return { ok: false, proveedor: 'resend', error: 'Destinatario sin correo válido' }

  const mensaje = mensajePromocion(promo, destinatario, mensajePersonalizado)
  const pixel = trackingToken
    ? `<img src="${urlTrackingApertura(trackingToken)}" width="1" height="1" alt="" style="display:none" />`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
      <p>${mensaje.replace(/\n/g, '<br>')}</p>
      ${promo.imagen_url ? `<p><img src="${promo.imagen_url}" alt="${promo.titulo}" style="max-width:640px;width:100%;border-radius:12px" /></p>` : ''}
      ${pixel}
    </div>
  `
  if (!cfg.apiKey) {
    const sg = sendgridConfig()
    if (!sg.apiKey) return { ok: false, proveedor: 'resend', error: mensajeConfigFaltante('email') }
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: destinatario.correo }] }],
        from: { email: sg.from.includes('<') ? sg.from.match(/<([^>]+)>/)?.[1] ?? sg.from : sg.from },
        subject: asuntoPromocion(promo),
        content: [
          { type: 'text/plain', value: mensaje },
          { type: 'text/html', value: html },
        ],
      }),
    })
    const sgText = await sgRes.text().catch(() => '')
    if (!sgRes.ok) return { ok: false, proveedor: 'sendgrid', error: sgText || `SendGrid HTTP ${sgRes.status}` }
    return { ok: true, proveedor: 'sendgrid', proveedor_id: null }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [destinatario.correo],
      subject: asuntoPromocion(promo),
      text: mensaje,
      html,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, proveedor: 'resend', error: data?.message || `Resend HTTP ${res.status}` }
  }
  return { ok: true, proveedor: 'resend', proveedor_id: data?.id ?? null }
}

async function recalcularCampana(supabase: SupabaseClient, campanaId: number) {
  const { data } = await supabase
    .from('promocion_envios')
    .select('estado')
    .eq('campana_id', campanaId)

  const filas = data ?? []
  const totalEnviados = filas.filter(e => e.estado === 'enviado').length
  const totalFallidos = filas.filter(e => e.estado === 'fallido').length
  const totalOmitidos = filas.filter(e => ['omitido', 'sin_contacto'].includes(e.estado)).length
  const pendientes = filas.filter(e => e.estado === 'pendiente').length

  await supabase.from('promocion_campanas').update({
    total_enviados: totalEnviados,
    total_fallidos: totalFallidos,
    total_omitidos: totalOmitidos,
    estado: pendientes === 0 ? 'completada' : 'en_proceso',
    completada_at: pendientes === 0 ? new Date().toISOString() : null,
  }).eq('id', campanaId)
}

export async function procesarPromocionesAutomaticas(
  supabase: SupabaseClient,
  opts: { limiteCampanas?: number; limiteEnvios?: number } = {},
): Promise<ProcesarPromocionesResultado> {
  const limiteCampanas = opts.limiteCampanas ?? 5
  const evoLimits = evolutionLimits()
  let limiteEnvios = opts.limiteEnvios ?? 60
  const errores: string[] = []
  let enviados = 0
  let fallidos = 0

  const ahora = new Date().toISOString()

  await supabase
    .from('promocion_campanas')
    .update({ estado: 'en_proceso', iniciada_at: ahora })
    .eq('estado', 'programada')
    .eq('modo_envio', 'automatico')
    .lte('programado_para', ahora)

  const { data: campanas, error: errCampanas } = await supabase
    .from('promocion_campanas')
    .select('*, promocion:promociones(*)')
    .eq('modo_envio', 'automatico')
    .eq('estado', 'en_proceso')
    .order('programado_para', { ascending: true, nullsFirst: false })
    .limit(limiteCampanas)

  const config = await getPromocionesEnvioConfigAsync()

  if (errCampanas) {
    return {
      ok: false,
      campanasProcesadas: 0,
      enviados: 0,
      fallidos: 0,
      errores: [errCampanas.message],
      config,
    }
  }

  const listaCampanas = (campanas ?? []) as CampanaAutomatica[]

  for (const campana of listaCampanas) {
    if (!campana.promocion) {
      errores.push(`Campaña ${campana.id} sin promoción asociada`)
      continue
    }

    const proveedor = campana.proveedor_envio ?? 'meta'
    const limiteEstaCampana = proveedor === 'evolution'
      ? Math.min(limiteEnvios, evoLimits.batchSize)
      : limiteEnvios

    if (proveedor === 'evolution' && !config.evolution) {
      errores.push(`Campaña ${campana.id}: ${MENSAJE_EVOLUTION_NO_CONFIG}`)
      continue
    }
    if (proveedor === 'evolution' && !config.evolutionConnected) {
      errores.push(`Campaña ${campana.id}: ${MENSAJE_EVOLUTION_DESCONECTADO}`)
      continue
    }
    if (proveedor === 'meta' && campana.canal !== 'email') {
      const { data: pendWa } = await supabase
        .from('promocion_envios')
        .select('id')
        .eq('campana_id', campana.id)
        .eq('estado', 'pendiente')
        .eq('canal', 'whatsapp')
        .limit(1)
      if ((pendWa ?? []).length > 0 && !config.whatsapp) {
        errores.push(`Campaña ${campana.id}: ${mensajeConfigFaltante('whatsapp')}`)
        continue
      }
    }

    const { data: pendientes, error: errPend } = await supabase
      .from('promocion_envios')
      .select('*, paciente:pacientes(id,nombre,apellido1,celular,telefono,correo), contacto:promocion_contactos(id,nombre,celular,correo)')
      .eq('campana_id', campana.id)
      .eq('estado', 'pendiente')
      .order('id')
      .limit(limiteEstaCampana)

    if (errPend) {
      errores.push(errPend.message)
      continue
    }

    let idx = 0
    for (const envio of (pendientes ?? []) as EnvioPendiente[]) {
      const destinatario = envio.paciente ?? envio.contacto
      if (!destinatario) {
        await supabase.from('promocion_envios').update({
          estado: 'fallido',
          error: 'Destinatario no encontrado',
        }).eq('id', envio.id)
        fallidos++
        continue
      }

      const resultado = envio.canal === 'whatsapp'
        ? await enviarWhatsAppPorProveedor(proveedor, destinatario, campana.promocion, campana.mensaje_personalizado)
        : await enviarEmail(destinatario, campana.promocion, campana.mensaje_personalizado, envio.tracking_token)

      await supabase.from('promocion_envios').update({
        estado: resultado.ok ? 'enviado' : 'fallido',
        enviado_at: resultado.ok ? new Date().toISOString() : null,
        proveedor: resultado.proveedor,
        proveedor_id: resultado.proveedor_id ?? null,
        error: resultado.error ?? null,
      }).eq('id', envio.id)

      if (resultado.ok) enviados++
      else {
        fallidos++
        if (resultado.error) errores.push(`Campaña ${campana.id} / envío ${envio.id}: ${resultado.error}`)
      }

      if (proveedor === 'evolution' && envio.canal === 'whatsapp' && idx < (pendientes?.length ?? 0) - 1) {
        await sleep(evoLimits.delayMs)
      }
      idx++
    }

    await recalcularCampana(supabase, campana.id)
  }

  return {
    ok: errores.length === 0,
    campanasProcesadas: listaCampanas.length,
    enviados,
    fallidos,
    errores,
    config,
  }
}