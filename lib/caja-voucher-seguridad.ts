import type { SupabaseClient } from '@supabase/supabase-js'

/** Normaliza voucher para comparación anti-fraude */
export function normalizarVoucher(ref: string): string {
  return ref.trim().replace(/\s+/g, '').toUpperCase()
}

/**
 * Valida que el voucher de tarjeta no se haya usado el mismo día.
 * Retorna mensaje de error o null si está OK.
 */
export async function validarVoucherDuplicadoDia(
  sb: SupabaseClient,
  voucher: string,
  fecha: string,
): Promise<string | null> {
  const norm = normalizarVoucher(voucher)
  if (!norm) return null

  const { data, error } = await sb
    .from('caja_movimientos')
    .select('id, referencia_pago, paciente_nombre, monto, hora, concepto')
    .eq('forma_pago', 'TARJETA')
    .eq('fecha', fecha)
    .eq('anulado', false)

  if (error) {
    console.warn('validarVoucherDuplicadoDia:', error.message)
    return 'No se pudo verificar el voucher. Intente de nuevo en unos segundos.'
  }

  const dup = (data || []).find(
    m => m.referencia_pago && normalizarVoucher(String(m.referencia_pago)) === norm,
  )
  if (!dup) return null

  const hora = dup.hora || '—'
  const pac = dup.paciente_nombre || 'sin paciente'
  const monto = Number(dup.monto).toFixed(2)
  return (
    `Voucher duplicado: ya se registró hoy a las ${hora} ` +
    `(${pac}, L ${monto}). Verifique el voucher antes de continuar.`
  )
}
