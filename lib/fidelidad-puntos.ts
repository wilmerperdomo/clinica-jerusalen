import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type FidelidadConfig,
  FIDELIDAD_CONFIG_DEFAULT,
  obtenerFidelidadConfig,
} from '@/lib/fidelidad-config'

/** @deprecated Usar FIDELIDAD_CONFIG_DEFAULT.lempiras_por_punto */
export const LEMPIRAS_POR_PUNTO = FIDELIDAD_CONFIG_DEFAULT.lempiras_por_punto

/** @deprecated Usar FIDELIDAD_CONFIG_DEFAULT.valor_lempira_por_punto */
export const VALOR_LEMPIRA_POR_PUNTO = FIDELIDAD_CONFIG_DEFAULT.valor_lempira_por_punto

export function calcularPuntosPorMonto(monto: number, config: FidelidadConfig = FIDELIDAD_CONFIG_DEFAULT): number {
  const m = Number(monto)
  if (!config.activo || !Number.isFinite(m) || m <= 0) return 0
  const divisor = Math.max(1, config.lempiras_por_punto)
  return Math.floor(m / divisor)
}

export function valorLempirasDePuntos(puntos: number, config: FidelidadConfig = FIDELIDAD_CONFIG_DEFAULT): number {
  const valor = Math.max(0.01, config.valor_lempira_por_punto)
  return Math.max(0, Math.floor(Number(puntos) || 0)) * valor
}

/** Descuento máximo en lempiras permitido por reglas de canje */
export function descuentoMaximoCanje(totalAPagar: number, config: FidelidadConfig = FIDELIDAD_CONFIG_DEFAULT): number {
  if (!config.activo) return 0
  const total = Math.max(0, Number(totalAPagar) || 0)
  if (total <= 0) return 0

  const pct = Math.min(100, Math.max(0, config.porcentaje_max_canje))
  const minCobro = Math.max(0, config.monto_minimo_cobro)
  const maxPorPct = total * (pct / 100)
  const maxPorMinimo = Math.max(0, total - minCobro)

  return Math.min(maxPorPct, maxPorMinimo, total)
}

/** Máximo de puntos canjeables dado saldo, total y configuración */
export function maxPuntosCanjeables(
  saldoPuntos: number,
  totalAPagar: number,
  config: FidelidadConfig = FIDELIDAD_CONFIG_DEFAULT,
): number {
  if (!config.activo) return 0
  const saldo = Math.max(0, Math.floor(saldoPuntos))
  const maxDescuento = descuentoMaximoCanje(totalAPagar, config)
  const valorPt = Math.max(0.01, config.valor_lempira_por_punto)
  const maxPorReglas = Math.floor(maxDescuento / valorPt)
  return Math.min(saldo, maxPorReglas)
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
  saldo?: number
  error?: string
}

/** Mensaje estándar en la factura sobre el canje de puntos */
export const MENSAJE_CANJE_FIDELIDAD =
  'Sus puntos se pueden canjear en exámenes de laboratorio.'

export type FidelidadFacturaPrint = {
  puntos_acumulados: number
  puntos_ganados?: number
  mensaje_canje: string
}

/** Datos de fidelidad para imprimir en la factura */
export async function datosFidelidadParaFactura(
  sb: SupabaseClient,
  pacienteId: number | null | undefined,
  opts?: { puntosGanados?: number; saldo?: number; config?: FidelidadConfig },
): Promise<FidelidadFacturaPrint | undefined> {
  if (!pacienteId) return undefined
  const config = opts?.config ?? await obtenerFidelidadConfig(sb)
  if (!config.activo) return undefined

  const saldo = opts?.saldo != null
    ? opts.saldo
    : await obtenerSaldoPuntos(sb, pacienteId)

  return {
    puntos_acumulados: saldo,
    puntos_ganados: opts?.puntosGanados && opts.puntosGanados > 0 ? opts.puntosGanados : undefined,
    mensaje_canje: MENSAJE_CANJE_FIDELIDAD,
  }
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
  const saldo = Number(row?.saldo_nuevo ?? 0)
  return { ok: true, puntos, saldo }
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
