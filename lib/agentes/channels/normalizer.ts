import type { CanalClave, MensajeEntrante, ProveedorCanal } from '@/lib/agentes/types'
import { esCanalClave } from '@/lib/agentes/config/canales'

/** Mapea Phone number ID de Meta → canal del sistema */
export function canalClaveDesdePhoneNumberId(phoneNumberId: string): CanalClave | null {
  const id = phoneNumberId.trim()
  const map: [string | undefined, CanalClave][] = [
    [process.env.WHATSAPP_PHONE_ID_PRINCIPAL, 'whatsapp_principal'],
    [process.env.WHATSAPP_PHONE_ID_SUCURSAL, 'whatsapp_sucursal'],
    [process.env.WHATSAPP_PHONE_ID_CORPORATIVO, 'whatsapp_corporativo'],
  ]
  for (const [envId, clave] of map) {
    if (envId?.trim() === id) return clave
  }
  if (process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() === id) return 'whatsapp_principal'
  return null
}

function extraerPhoneNumberId(body: unknown): string | null {
  const root = body as {
    entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[]
  }
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id
      if (id) return id
    }
  }
  return null
}

/** Meta WhatsApp Cloud API — webhook payload simplificado */
export function parseWhatsAppMetaWebhook(
  body: unknown,
  canalClave: CanalClave,
): MensajeEntrante[] {
  const mensajes: MensajeEntrante[] = []
  const phoneNumberId = extraerPhoneNumberId(body)
  const canal = (phoneNumberId && canalClaveDesdePhoneNumberId(phoneNumberId)) || canalClave

  const root = body as {
    entry?: {
      changes?: {
        value?: {
          metadata?: { phone_number_id?: string }
          messages?: {
            id: string
            from: string
            timestamp: string
            type: string
            text?: { body: string }
          }[]
          contacts?: { profile?: { name?: string }; wa_id?: string }[]
        }
      }[]
    }[]
  }

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const contactName = value?.contacts?.[0]?.profile?.name
      for (const msg of value?.messages ?? []) {
        if (msg.type !== 'text' || !msg.text?.body) continue
        mensajes.push({
          proveedor: 'whatsapp_meta',
          canalClave: canal,
          mensajeExternoId: msg.id,
          contactoExterno: msg.from,
          contactoNombre: contactName,
          texto: msg.text.body.trim(),
          timestamp: msg.timestamp,
          raw: msg,
        })
      }
    }
  }
  return mensajes
}

/** Resuelve canal desde webhook Meta (coexistencia multi-número) */
export function resolverCanalMetaWebhook(body: unknown, fallback: CanalClave): CanalClave {
  const phoneNumberId = extraerPhoneNumberId(body)
  if (phoneNumberId) {
    const clave = canalClaveDesdePhoneNumberId(phoneNumberId)
    if (clave) return clave
  }
  return fallback
}
/** Evolution API — evento messages.upsert */
export function parseWhatsAppEvolutionWebhook(
  body: unknown,
  canalClave: CanalClave,
): MensajeEntrante[] {
  const mensajes: MensajeEntrante[] = []
  const root = body as {
    data?: {
      key?: { id?: string; remoteJid?: string; fromMe?: boolean }
      message?: { conversation?: string; extendedTextMessage?: { text?: string } }
      messageTimestamp?: number
      pushName?: string
    }
    event?: string
  }

  if (root.event && root.event !== 'messages.upsert') return mensajes
  const data = root.data ?? (body as typeof root.data)
  if (!data?.key || data.key.fromMe) return mensajes

  const jid = data.key.remoteJid ?? ''
  const telefono = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const texto =
    data.message?.conversation ??
    data.message?.extendedTextMessage?.text ??
    ''

  if (!texto.trim()) return mensajes

  mensajes.push({
    proveedor: 'whatsapp_evolution',
    canalClave,
    mensajeExternoId: data.key.id ?? `${telefono}-${Date.now()}`,
    contactoExterno: telefono,
    contactoNombre: data.pushName,
    texto: texto.trim(),
    timestamp: String(data.messageTimestamp ?? Date.now()),
    raw: body,
  })

  return mensajes
}

/** Facebook Messenger — messaging webhook */
export function parseMessengerWebhook(body: unknown): MensajeEntrante[] {
  const mensajes: MensajeEntrante[] = []
  const root = body as {
    entry?: {
      messaging?: {
        sender: { id: string }
        message?: { mid: string; text?: string }
        timestamp: number
      }[]
    }[]
  }

  for (const entry of root.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const texto = ev.message?.text?.trim()
      if (!texto || !ev.message?.mid) continue
      mensajes.push({
        proveedor: 'messenger',
        canalClave: 'messenger_pagina',
        mensajeExternoId: ev.message.mid,
        contactoExterno: ev.sender.id,
        texto,
        timestamp: String(ev.timestamp),
        raw: ev,
      })
    }
  }
  return mensajes
}

export function validarCanalParam(canal: string): CanalClave | null {
  return esCanalClave(canal) ? canal : null
}

export function verificarWebhookToken(
  mode: string | null,
  token: string | null,
  secret: string | undefined,
): boolean {
  return mode === 'subscribe' && !!secret && token === secret
}

export function proveedorDesdeCanal(clave: CanalClave): ProveedorCanal {
  if (clave === 'messenger_pagina') return 'messenger'
  return 'whatsapp_meta'
}
