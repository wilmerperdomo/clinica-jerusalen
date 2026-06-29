export interface MovimientoPago {
  tipo: string
  forma_pago: string
  referencia_pago?: string | null
  monto: number
  fecha: string
  hora?: string
  paciente_nombre?: string | null
  concepto?: string | null
}

export interface FilaPagoBanco {
  banco: string
  cantidad: number
  total: number
}

export interface FilaPagoVoucher {
  voucher: string
  fecha: string
  hora?: string
  paciente: string
  monto: number
  concepto: string
}

/** Parsea referencia_pago de transferencias y tarjetas */
export function parseReferenciaPago(ref: string | null | undefined): {
  banco?: string
  referencia?: string
} {
  if (!ref?.trim()) return {}
  const bancoMatch = ref.match(/^Banco:\s*([^|]+)/i)
  const refMatch = ref.match(/Ref:\s*(.+)$/i)
  if (bancoMatch) {
    return {
      banco: bancoMatch[1].trim(),
      referencia: refMatch?.[1]?.trim() || ref.replace(/^Banco:[^|]+\|?\s*(Ref:\s*)?/i, '').trim(),
    }
  }
  return { referencia: ref.trim() }
}

export function agruparTransferenciasPorBanco(
  movimientos: MovimientoPago[],
): FilaPagoBanco[] {
  const mapa = new Map<string, { cantidad: number; total: number }>()
  for (const m of movimientos) {
    if (m.tipo !== 'INGRESO' || m.forma_pago !== 'TRANSFERENCIA') continue
    const { banco } = parseReferenciaPago(m.referencia_pago)
    const key = banco || 'Sin banco'
    const prev = mapa.get(key) || { cantidad: 0, total: 0 }
    prev.cantidad += 1
    prev.total += m.monto
    mapa.set(key, prev)
  }
  return Array.from(mapa.entries())
    .map(([banco, v]) => ({ banco, cantidad: v.cantidad, total: v.total }))
    .sort((a, b) => b.total - a.total)
}

export function listarVouchersTarjeta(
  movimientos: MovimientoPago[],
): FilaPagoVoucher[] {
  return movimientos
    .filter(m => m.tipo === 'INGRESO' && m.forma_pago === 'TARJETA')
    .map(m => {
      const { referencia } = parseReferenciaPago(m.referencia_pago)
      return {
        voucher: referencia || '—',
        fecha: m.fecha,
        hora: m.hora,
        paciente: m.paciente_nombre || '—',
        monto: m.monto,
        concepto: m.concepto || '—',
      }
    })
    .sort((a, b) => `${b.fecha}${b.hora || ''}`.localeCompare(`${a.fecha}${a.hora || ''}`))
}
