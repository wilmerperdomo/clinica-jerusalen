import type { CanalClave } from '@/lib/agentes/types'
import { isEvolutionConfigured } from '@/lib/evolution-api'

const GRAPH = 'https://graph.facebook.com/v21.0'

export type ProveedorEnvio = 'whatsapp_meta' | 'whatsapp_evolution' | 'messenger'

export function proveedorEnvioDisponible(): Record<ProveedorEnvio, boolean> {
  return {
    whatsapp_meta: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    whatsapp_evolution: isEvolutionConfigured(),
    messenger: Boolean(process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim()),
  }
}

/** Elige Meta, Evolution o Messenger según canal y variables de entorno */
export function inferirProveedorCanal(
  canal: CanalClave,
  preferido?: ProveedorEnvio | 'auto',
): ProveedorEnvio {
  if (canal === 'messenger_pagina') return 'messenger'
  if (preferido && preferido !== 'auto') return preferido

  const disp = proveedorEnvioDisponible()
  if (disp.whatsapp_evolution && !disp.whatsapp_meta) return 'whatsapp_evolution'
  if (disp.whatsapp_meta) return 'whatsapp_meta'
  if (disp.whatsapp_evolution) return 'whatsapp_evolution'
  return 'whatsapp_meta'
}

function tokenMeta(): string {
  const t = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  if (!t) throw new Error('WHATSAPP_ACCESS_TOKEN no configurado')
  return t
}

function phoneIdParaCanal(canal: CanalClave): string {
  const map: Record<string, string | undefined> = {
    whatsapp_principal: process.env.WHATSAPP_PHONE_ID_PRINCIPAL,
    whatsapp_sucursal: process.env.WHATSAPP_PHONE_ID_SUCURSAL,
    whatsapp_corporativo: process.env.WHATSAPP_PHONE_ID_CORPORATIVO,
  }
  const id = map[canal]?.trim() ?? process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  if (!id) throw new Error(`Phone ID no configurado para ${canal}`)
  return id
}

/** Envío saliente vía Meta Cloud API */
export async function enviarWhatsAppMeta(opts: {
  canal: CanalClave
  destino: string
  texto: string
}): Promise<void> {
  const phoneId = phoneIdParaCanal(opts.canal)
  const to = opts.destino.replace(/\D/g, '')

  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenMeta()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: opts.texto.slice(0, 4096) },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp Meta send: ${err}`)
  }
}

/** Envío saliente vía Messenger Send API */
export async function enviarMessenger(opts: {
  psid: string
  texto: string
}): Promise<void> {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('MESSENGER_PAGE_ACCESS_TOKEN no configurado')

  const res = await fetch(`${GRAPH}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: opts.psid },
      message: { text: opts.texto.slice(0, 2000) },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Messenger send: ${err}`)
  }
}

export async function enviarRespuestaCanal(opts: {
  canal: CanalClave
  contacto: string
  texto: string
  proveedor?: 'whatsapp_meta' | 'whatsapp_evolution' | 'messenger'
}): Promise<void> {
  const prov = opts.proveedor ?? (opts.canal === 'messenger_pagina' ? 'messenger' : 'whatsapp_meta')

  if (prov === 'messenger') {
    await enviarMessenger({ psid: opts.contacto, texto: opts.texto })
    return
  }

  if (prov === 'whatsapp_evolution') {
    const { sendEvolutionText } = await import('@/lib/agentes/channels/evolution-outbound')
    await sendEvolutionText({ destino: opts.contacto, texto: opts.texto })
    return
  }

  await enviarWhatsAppMeta({ canal: opts.canal, destino: opts.contacto, texto: opts.texto })
}
