import type { SupabaseClient } from '@supabase/supabase-js'

/** Cada L 26.00 facturados = 1 punto */
export const LEMPIRAS_POR_PUNTO = 26

/** 1 punto = L 1.00 de descuento en laboratorio */
export const VALOR_LEMPIRA_POR_PUNTO = 1

export function calcularPuntosPorMonto(monto: number): number {
  const m = Number(monto)
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.floor(m / LEMPIRAS_POR_PUNTO)
}

export function valorLempirasDePuntos(puntos: number): number {
  return Math.max(0, Math.floor(Number(puntos) || 0)) * VALOR_LEMPIRA_POR_PUNTO
}

/** Máximo de puntos canjeables dado saldo y total a pagar (después de otros descuentos) */
export function maxPuntosCanjeables(saldoPuntos: number, totalAPagar: number): number {
  const saldo = Math.max(0, Math.floor(saldoPuntos))
  const total = Math.max(0, Number(totalAPagar) || 0)
  return Math.min(saldo, Math.floor(total / VALOR_LEMPIRA_POR_PUNTO))
}

export async function obtenerSaldoPuntos(
  sb: SupabaseClient,
  pacienteId: number | null | undefined,
): Promise<number> {
  if (!pacienteId) return 0
  const { data } = await sb
    .from('pacientes')
    .select('puntos')
    .eq('id', pacienteId)
    .maybeSingle()
  return Math.max(0, Number(data?.puntos ?? 0))
}

export type ResultadoAcumulacion = {
  ok: boolean
  puntos?: number
  error?: string
}

/** Acumula puntos tras emitir factura fiscal (idempotente por factura_id) */
export async function acumularPuntosPorFactura(
  sb: SupabaseClient,
  facturaId: number,
): Promise<ResultadoAcumulacion> {
  const { data, error } = await sb.rpc('fn_acumular_puntos_factura', {
    p_factura_id: facturaId,
  })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  const puntos = Number(row?.puntos_otorgados ?? row?.puntos ?? 0)
  return { ok: true, puntos }
}

export type ResultadoCanje = {
  ok: boolean
  puntos_canjeados?: number
  saldo_restante?: number
  error?: string
}

/** Canjea puntos al cobrar laboratorio directo */
export async function canjearPuntosLaboratorio(
  sb: SupabaseClient,
  params: {
    pacienteId: number
    puntos: number
    cajaMovimientoId?: number | null
    nota?: string | null
  },
): Promise<ResultadoCanje> {
  const { data, error } = await sb.rpc('fn_canjear_puntos_laboratorio', {
    p_paciente_id: params.pacienteId,
    p_puntos: params.puntos,
    p_movimiento_id: params.cajaMovimientoId ?? null,
    p_nota: params.nota ?? null,
  })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: true,
    puntos_canjeados: Number(row?.puntos_canjeados ?? params.puntos),
    saldo_restante: Number(row?.saldo_restante ?? 0),
  }
}
