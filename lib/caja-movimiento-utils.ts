import type { SupabaseClient } from '@supabase/supabase-js'

const COLUMNAS_DESCUENTO_CAJA = [
  'monto_bruto',
  'descuento_pct',
  'descuento_monto',
  'descuento_motivo',
] as const

export function esErrorColumnasDescuentoCaja(mensaje: string): boolean {
  return /descuento_monto|monto_bruto|descuento_pct|descuento_motivo|schema cache/i.test(mensaje)
}

export function sinColumnasDescuentoCaja<T extends Record<string, unknown>>(mov: T) {
  const out = { ...mov }
  for (const col of COLUMNAS_DESCUENTO_CAJA) delete out[col]
  return out
}

type InsertResult<T> = { data: T | null; error: { message: string } | null }

/** Inserta movimientos de caja; si faltan columnas de descuento en BD, reintenta sin ellas */
export async function insertarMovimientosCaja<T = unknown>(
  sb: SupabaseClient,
  movimientos: Record<string, unknown>[],
  conSelect = true,
): Promise<InsertResult<T[]>> {
  const query = sb.from('caja_movimientos').insert(movimientos)
  const res = conSelect ? await query.select<T>() : await query
  if (!res.error) return { data: (res.data as T[] | null) ?? null, error: null }

  if (esErrorColumnasDescuentoCaja(res.error.message)) {
    const fallback = movimientos.map(sinColumnasDescuentoCaja)
    const query2 = sb.from('caja_movimientos').insert(fallback)
    const res2 = conSelect ? await query2.select<T>() : await query2
    return { data: (res2.data as T[] | null) ?? null, error: res2.error }
  }

  return { data: null, error: res.error }
}

export async function insertarMovimientoCaja<T = unknown>(
  sb: SupabaseClient,
  movimiento: Record<string, unknown>,
  conSelect = false,
): Promise<InsertResult<T>> {
  const res = await insertarMovimientosCaja<T>(sb, [movimiento], conSelect)
  return {
    data: res.data?.[0] ?? null,
    error: res.error,
  }
}
