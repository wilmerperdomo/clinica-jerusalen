import type { IntencionUsuario, ResultadoEnrutamiento } from '@/lib/agentes/types'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export function openAiConfigurado(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Llamada mínima a OpenAI — sin SDK para mantener dependencias livianas */
export async function chatCompletion(opts: {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  json?: boolean
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada')

  const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.2,
      messages: opts.messages,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText
    throw new Error(`OpenAI: ${msg}`)
  }

  const content = (data as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI devolvió respuesta vacía')
  return content
}

const INTENCIONES: IntencionUsuario[] = [
  'agendar_cita', 'consultar_cita', 'cancelar_cita',
  'estado_laboratorio', 'resultados_lab',
  'promociones', 'planes_medicos', 'factura',
  'horarios_ubicacion', 'precios_generales',
  'hablar_humano', 'saludo', 'otro',
]

const MAPA_AGENTE: Record<IntencionUsuario, ResultadoEnrutamiento['agente']> = {
  agendar_cita: 'citas',
  consultar_cita: 'citas',
  cancelar_cita: 'citas',
  estado_laboratorio: 'laboratorio',
  resultados_lab: 'laboratorio',
  promociones: 'promociones',
  planes_medicos: 'promociones',
  factura: 'facturacion',
  horarios_ubicacion: 'faq',
  precios_generales: 'faq',
  hablar_humano: 'escalamiento',
  saludo: 'faq',
  otro: 'faq',
}

const UMBRAL_CONFIANZA = Number(process.env.AGENTES_UMBRAL_CONFIANZA ?? '0.55')

/**
 * Clasificación de intención con OpenAI (JSON).
 * Fallback determinista si no hay API key.
 */
export async function clasificarIntencion(opts: {
  texto: string
  historial: { rol: string; contenido: string }[]
  tonoCanal: string
}): Promise<ResultadoEnrutamiento> {
  const texto = opts.texto.trim()
  const fallback = clasificarIntencionHeuristica(texto)

  if (!openAiConfigurado()) return fallback

  try {
    const raw = await chatCompletion({
      json: true,
      messages: [
        {
          role: 'system',
          content:
            'Clasificador de intenciones para una clínica médica en Honduras. ' +
            'Responde SOLO JSON: {"intencion":"...","confianza":0.0-1.0,"razon":"..."}. ' +
            `Intenciones válidas: ${INTENCIONES.join(', ')}. ` +
            'Si piden persona/recepcionista/enfermera → hablar_humano. ' +
            'Nunca inventes datos clínicos.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            tono_canal: opts.tonoCanal,
            historial_reciente: opts.historial.slice(-6),
            mensaje: texto,
          }),
        },
      ],
    })

    const parsed = JSON.parse(raw) as {
      intencion?: string
      confianza?: number
      razon?: string
    }
    const intencion = INTENCIONES.includes(parsed.intencion as IntencionUsuario)
      ? (parsed.intencion as IntencionUsuario)
      : 'otro'
    const confianza = Math.min(1, Math.max(0, Number(parsed.confianza) || 0))
    const agente = MAPA_AGENTE[intencion]

    return {
      agente: confianza < UMBRAL_CONFIANZA ? 'escalamiento' : agente,
      intencion,
      confianza,
      razon: parsed.razon ?? 'clasificación OpenAI',
      requiere_escalamiento: confianza < UMBRAL_CONFIANZA || intencion === 'hablar_humano',
    }
  } catch {
    return fallback
  }
}

/** Reglas simples cuando OpenAI no está disponible */
export function clasificarIntencionHeuristica(texto: string): ResultadoEnrutamiento {
  const t = texto.toLowerCase()
  const match = (words: string[]) => words.some(w => t.includes(w))

  let intencion: IntencionUsuario = 'otro'
  if (match(['hola', 'buenos', 'buenas', 'hey'])) intencion = 'saludo'
  else if (match(['humano', 'persona', 'recepcion', 'enfermera', 'asesor'])) intencion = 'hablar_humano'
  else if (match(['cita', 'agendar', 'agenda', 'turno'])) intencion = match(['cancel']) ? 'cancelar_cita' : 'agendar_cita'
  else if (match(['laboratorio', 'análisis', 'analisis', 'examen', 'resultado'])) {
    intencion = match(['resultado', 'listo']) ? 'resultados_lab' : 'estado_laboratorio'
  }
  else if (match(['promo', 'descuento', 'oferta'])) intencion = 'promociones'
  else if (match(['plan', 'membres', 'carnet'])) intencion = 'planes_medicos'
  else if (match(['factura', 'recibo', 'cai', 'rtn'])) intencion = 'factura'
  else if (match(['horario', 'ubicación', 'ubicacion', 'dónde', 'donde', 'dirección'])) intencion = 'horarios_ubicacion'
  else if (match(['precio', 'cuesta', 'vale', 'costo'])) intencion = 'precios_generales'

  const confianza = intencion === 'otro' ? 0.4 : 0.72
  return {
    agente: intencion === 'hablar_humano' || confianza < UMBRAL_CONFIANZA ? 'escalamiento' : MAPA_AGENTE[intencion],
    intencion,
    confianza,
    razon: 'heurística local',
    requiere_escalamiento: intencion === 'hablar_humano' || confianza < UMBRAL_CONFIANZA,
  }
}
