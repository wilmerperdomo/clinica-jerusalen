import type { SupabaseClient } from '@supabase/supabase-js'

export interface SucursalFiscal {
  id: number
  num_min?: string | number | null
  numero_inicial?: string | number | null
  num_max?: string | number | null
}

/** Extrae el segmento numérico final (ej. 002-001-01-00006001 → 6001) */
export function extraerCorrelativo(valor?: string | number | null): number {
  if (valor == null || valor === '') return 1
  const str = String(valor).trim()
  if (str.includes('-')) return Number(str.split('-').pop()) || 1
  return Number(str) || 1
}

export function formatearNumeroFactura(num: number, suc: SucursalFiscal): string {
  const correl = String(num).padStart(8, '0')
  const numMin = suc.num_min != null ? String(suc.num_min).trim() : ''
  if (numMin.includes('-')) {
    const partes = numMin.split('-')
    if (partes.length >= 3) {
      return `${partes.slice(0, partes.length - 1).join('-')}-${correl}`
    }
  }
  return correl
}

export function esErrorNumeroDuplicado(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return error.code === '23505'
    || (error.message ?? '').includes('facturas_numero_sucursal_id_key')
}

/** Calcula el siguiente número sin RPC (fallback) */
async function calcularSiguienteFallback(
  supabase: SupabaseClient,
  sucursalId: number,
  suc: SucursalFiscal,
): Promise<number> {
  const inicial = extraerCorrelativo(suc.numero_inicial ?? suc.num_min)

  const [{ data: cor }, { data: ultimas }] = await Promise.all([
    supabase.from('factura_correlativos').select('ultimo_numero').eq('sucursal_id', sucursalId).maybeSingle(),
    supabase.from('facturas').select('numero').eq('sucursal_id', sucursalId).order('id', { ascending: false }).limit(100),
  ])

  let maxFact = 0
  for (const f of ultimas ?? []) {
    const n = extraerCorrelativo(f.numero)
    if (n > maxFact) maxFact = n
  }

  const fromCor = Number(cor?.ultimo_numero ?? 0)
  return Math.max(maxFact, fromCor, inicial - 1) + 1
}

/**
 * Reserva el siguiente correlativo fiscal de forma segura.
 * Usa RPC atómica; si falla, calcula desde facturas existentes.
 */
export async function reservarSiguienteCorrelativo(
  supabase: SupabaseClient,
  sucursalId: number,
  suc: SucursalFiscal,
  forzarDesde?: number,
): Promise<{ numSig: number; numero: string }> {
  let numSig = forzarDesde

  if (numSig == null) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('fn_siguiente_correlativo', {
      p_sucursal_id: sucursalId,
    })

    if (!rpcError && rpcData != null) {
      numSig = Number(rpcData)
    } else {
      numSig = await calcularSiguienteFallback(supabase, sucursalId, suc)
      await supabase.from('factura_correlativos').upsert(
        { sucursal_id: sucursalId, ultimo_numero: numSig },
        { onConflict: 'sucursal_id' },
      )
    }
  }

  return { numSig, numero: formatearNumeroFactura(numSig, suc) }
}

/** Sincroniza correlativo local tras insert exitoso */
export async function confirmarCorrelativo(
  supabase: SupabaseClient,
  sucursalId: number,
  numSig: number,
) {
  await supabase.from('factura_correlativos').upsert(
    { sucursal_id: sucursalId, ultimo_numero: numSig },
    { onConflict: 'sucursal_id' },
  )
}
