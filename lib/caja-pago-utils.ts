import type { CategoriaCobro } from '@/lib/membresia-utils'

/** Estado inicial compartido para formularios de cobro en caja */
export const FORM_COBRO_VACIO = {
  forma_pago: 'EFECTIVO',
  referencia: '',
  banco: '',
  monto_efectivo: '',
  nota: '',
  descuento_pct: '0',
  monto_manual: '',
  descuento_confirmado: false,
  desc_pct_consulta: '0',
  desc_pct_servicios: '0',
  desc_pct_lab: '0',
  desc_pct_meds: '0',
} as const

export type FormCobroBase = typeof FORM_COBRO_VACIO

/** Referencia guardada en caja_movimientos.referencia_pago */
export function construirReferenciaPago(
  formaPago: string,
  referencia: string,
  banco?: string,
): string | null {
  const ref = referencia.trim()
  if (formaPago === 'TRANSFERENCIA') {
    const b = banco?.trim()
    if (b && ref) return `Banco: ${b} | Ref: ${ref}`
    if (b) return `Banco: ${b}`
    if (ref) return ref
    return null
  }
  return ref || null
}

export function validarCobroEfectivo(
  formaPago: string,
  total: number,
  montoRecibido?: string | null,
): string | null {
  if (formaPago !== 'EFECTIVO') return null
  if (total <= 0) return null
  const raw = montoRecibido?.trim()
  if (!raw) return 'Indique con cuánto efectivo paga el cliente'
  const recibido = Number(raw)
  if (Number.isNaN(recibido) || recibido < 0) return 'Monto en efectivo inválido'
  if (recibido < total) {
    return `Falta L ${(total - recibido).toFixed(2)} — debe recibir al menos L ${total.toFixed(2)}`
  }
  return null
}

export function calcularCambioEfectivo(total: number, montoRecibido?: string | null): number | null {
  if (!montoRecibido?.trim()) return null
  const recibido = Number(montoRecibido)
  if (Number.isNaN(recibido) || recibido < total) return null
  return parseFloat((recibido - total).toFixed(2))
}

export function validarBancoTransferencia(formaPago: string, banco?: string | null): string | null {
  if (formaPago !== 'TRANSFERENCIA') return null
  if (!banco?.trim()) return 'Seleccione el banco donde se recibió la transferencia'
  return null
}

export function pctManualDesdeForm(form: {
  desc_pct_consulta?: string
  desc_pct_servicios?: string
  desc_pct_lab?: string
  desc_pct_meds?: string
}): Partial<Record<CategoriaCobro, number>> {
  const clamp = (v: string | undefined) => Math.max(0, Math.min(100, Number(v) || 0))
  return {
    consulta: clamp(form.desc_pct_consulta),
    servicios: clamp(form.desc_pct_servicios),
    laboratorio: clamp(form.desc_pct_lab),
    medicamentos: clamp(form.desc_pct_meds),
  }
}

/** Valida referencia, banco y efectivo antes de registrar el cobro */
export function validarFormaPagoCobro(
  formaPago: string,
  total: number,
  opts: { referencia?: string; banco?: string; montoEfectivo?: string },
): string | null {
  if (formaPago === 'TARJETA' || formaPago === 'TRANSFERENCIA') {
    const errRef = formaPago === 'TARJETA'
      ? (!opts.referencia?.trim() ? 'Ingrese el número de voucher de tarjeta' : null)
      : (!opts.referencia?.trim() ? 'Ingrese la referencia de transferencia' : null)
    if (errRef) return errRef
  }
  const errBanco = validarBancoTransferencia(formaPago, opts.banco)
  if (errBanco) return errBanco
  return validarCobroEfectivo(formaPago, total, opts.montoEfectivo)
}
