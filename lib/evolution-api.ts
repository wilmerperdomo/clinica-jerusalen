import { limpiarCelular } from '@/lib/mensajes-paciente'

export interface EvolutionConfig {
  baseUrl: string
  apiKey: string
  instance: string
  batchSize: number
  delayMs: number
}

export interface EvolutionConnectionState {
  configured: boolean
  connected: boolean
  state?: string
  instance?: string
  error?: string
}

export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const instance = process.env.EVOLUTION_INSTANCE_NAME?.trim()
  if (!baseUrl || !apiKey || !instance) return null

  const batchSize = Number(process.env.EVOLUTION_BATCH_SIZE) || 25
  const delayMs = Number(process.env.EVOLUTION_DELAY_MS) || 4000

  return {
    baseUrl,
    apiKey,
    instance,
    batchSize: batchSize > 0 && batchSize <= 50 ? batchSize : 25,
    delayMs: delayMs >= 2000 ? delayMs : 4000,
  }
}

export function isEvolutionConfigured(): boolean {
  return getEvolutionConfig() !== null
}

export function evolutionLimits() {
  const cfg = getEvolutionConfig()
  return {
    batchSize: cfg?.batchSize ?? 25,
    delayMs: cfg?.delayMs ?? 4000,
  }
}

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const cfg = getEvolutionConfig()
  if (!cfg) throw new Error('Evolution API no configurada')

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: cfg.apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

export async function evolutionConnectionState(): Promise<EvolutionConnectionState> {
  const cfg = getEvolutionConfig()
  if (!cfg) {
    return { configured: false, connected: false }
  }

  try {
    const { res, data } = await evolutionFetch(`/instance/connectionState/${cfg.instance}`)
    const state = data?.instance?.state ?? data?.state ?? 'unknown'
    return {
      configured: true,
      connected: state === 'open',
      state: String(state),
      instance: cfg.instance,
      error: res.ok ? undefined : (data?.message || data?.error || `HTTP ${res.status}`),
    }
  } catch (e) {
    return {
      configured: true,
      connected: false,
      instance: cfg.instance,
      error: e instanceof Error ? e.message : 'No se pudo conectar al servidor Evolution',
    }
  }
}

export async function evolutionSendText(
  celular?: string | null,
  telefono?: string | null,
  text?: string,
): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  const cfg = getEvolutionConfig()
  if (!cfg) {
    return { ok: false, error: 'Evolution API no configurada. Agregue EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE_NAME.' }
  }

  const number = limpiarCelular(celular, telefono)
  if (!number) return { ok: false, error: 'Destinatario sin WhatsApp válido' }
  if (!text?.trim()) return { ok: false, error: 'Mensaje vacío' }

  try {
    const { res, data } = await evolutionFetch(`/message/sendText/${cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })
    if (!res.ok) {
      return { ok: false, error: data?.message || data?.error || `Evolution HTTP ${res.status}` }
    }
    return { ok: true, id: data?.key?.id ?? data?.messageId ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al enviar por Evolution' }
  }
}

export async function evolutionSendMedia(
  celular: string | null | undefined,
  telefono: string | null | undefined,
  mediaUrl: string,
  caption?: string,
): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  const cfg = getEvolutionConfig()
  if (!cfg) {
    return { ok: false, error: 'Evolution API no configurada' }
  }

  const number = limpiarCelular(celular, telefono)
  if (!number) return { ok: false, error: 'Destinatario sin WhatsApp válido' }

  try {
    const { res, data } = await evolutionFetch(`/message/sendMedia/${cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        mediatype: 'image',
        media: mediaUrl,
        caption: caption ?? '',
      }),
    })
    if (!res.ok) {
      return { ok: false, error: data?.message || data?.error || `Evolution HTTP ${res.status}` }
    }
    return { ok: true, id: data?.key?.id ?? data?.messageId ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al enviar imagen por Evolution' }
  }
}

export const MENSAJE_EVOLUTION_NO_CONFIG =
  'Evolution API no configurada. Instale Evolution en su servidor (DigitalOcean ~$5/mes) y configure EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE_NAME en Vercel.'

export const MENSAJE_EVOLUTION_DESCONECTADO =
  'WhatsApp Web no está conectado en Evolution API. Escanee el código QR en su servidor Evolution antes de enviar campañas.'
