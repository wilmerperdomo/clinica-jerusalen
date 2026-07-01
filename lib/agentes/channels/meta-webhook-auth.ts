import { createHmac, timingSafeEqual } from 'node:crypto'

/** Valida firma X-Hub-Signature-256 de Meta (App Secret) */
export function verificarFirmaMeta(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

/** Payload típico de webhook WhatsApp Cloud API */
export function esWebhookWhatsAppMeta(body: unknown): boolean {
  const o = body as { object?: string }
  return o?.object === 'whatsapp_business_account'
}
