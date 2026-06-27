import type { SupabaseClient } from '@supabase/supabase-js'

export type FidelidadConfig = {
  lempiras_por_punto: number
  valor_lempira_por_punto: number
  /** Máximo % del total que puede pagarse con puntos (ej. 25) */
  porcentaje_max_canje: number
  /** Monto mínimo que debe quedar por cobrar/facturar */
  monto_minimo_cobro: number
  activo: boolean
}

export const FIDELIDAD_CONFIG_DEFAULT: FidelidadConfig = {
  lempiras_por_punto: 26,
  valor_lempira_por_punto: 1,
  porcentaje_max_canje: 25,
  monto_minimo_cobro: 1,
  activo: true,
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function normalizarFidelidadConfig(row: Record<string, unknown> | null | undefined): FidelidadConfig {
  if (!row) return { ...FIDELIDAD_CONFIG_DEFAULT }
  return {
    lempiras_por_punto: Math.max(1, num(row.lempiras_por_punto, FIDELIDAD_CONFIG_DEFAULT.lempiras_por_punto)),
    valor_lempira_por_punto: Math.max(0.01, num(row.valor_lempira_por_punto, FIDELIDAD_CONFIG_DEFAULT.valor_lempira_por_punto)),
    porcentaje_max_canje: Math.min(100, Math.max(0, num(row.porcentaje_max_canje, FIDELIDAD_CONFIG_DEFAULT.porcentaje_max_canje))),
    monto_minimo_cobro: Math.max(0, num(row.monto_minimo_cobro, FIDELIDAD_CONFIG_DEFAULT.monto_minimo_cobro)),
    activo: row.activo !== false,
  }
}

export async function obtenerFidelidadConfig(sb: SupabaseClient): Promise<FidelidadConfig> {
  const { data, error } = await sb
    .from('fidelidad_config')
    .select('lempiras_por_punto, valor_lempira_por_punto, porcentaje_max_canje, monto_minimo_cobro, activo')
    .eq('id', 1)
    .maybeSingle()
  if (error) return { ...FIDELIDAD_CONFIG_DEFAULT }
  return normalizarFidelidadConfig(data as Record<string, unknown> | null)
}
