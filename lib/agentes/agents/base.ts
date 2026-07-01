import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResultadoAgente, ResultadoEnrutamiento, TurnoOrquestador } from '@/lib/agentes/types'

export type AgenteHandler = (
  sb: SupabaseClient,
  turno: TurnoOrquestador,
  enrutamiento: ResultadoEnrutamiento,
) => Promise<ResultadoAgente>

export function respuestaUnica(
  texto: string,
  agente: ResultadoAgente['agente'],
  intencion: ResultadoAgente['intencion'],
  confianza: number,
  extra?: Partial<ResultadoAgente>,
): ResultadoAgente {
  return {
    respuestas: [{ texto }],
    agente,
    intencion,
    confianza,
    ...extra,
  }
}

export const SIN_DATOS =
  'No encontré esa información en el sistema. Un miembro de nuestro equipo puede ayudarle en breve.'
