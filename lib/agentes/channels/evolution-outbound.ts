import { getEvolutionConfig } from '@/lib/evolution-api'
import { limpiarCelular } from '@/lib/mensajes-paciente'

/** Envío por Evolution API (número secundario / sucursal) */
export async function sendEvolutionText(opts: {
  destino: string
  texto: string
  instance?: string
}): Promise<void> {
  const cfg = getEvolutionConfig()
  if (!cfg) throw new Error('Evolution API no configurada')

  const instance = opts.instance ?? cfg.instance
  const number = limpiarCelular(opts.destino)

  const res = await fetch(`${cfg.baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      apikey: cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number,
      text: opts.texto,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution send: ${err}`)
  }
}
