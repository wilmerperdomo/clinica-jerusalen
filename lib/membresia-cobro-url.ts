/** URLs de cobro de cuotas → módulo Caja / Ventas */

export interface RespaldoCobroMembresia {
  paciente?: string
  plan?: string
  monto?: number
}

export function urlCobrarCuota(
  pagoId: number,
  respaldo?: RespaldoCobroMembresia,
): string {
  const params = new URLSearchParams({ membresia_pago: String(pagoId) })
  if (respaldo?.paciente) params.set('paciente', respaldo.paciente)
  if (respaldo?.plan) params.set('plan', respaldo.plan)
  if (respaldo?.monto != null && respaldo.monto > 0) {
    params.set('monto', String(respaldo.monto))
  }
  return `/ventas?${params}`
}

export function urlCobrarCuotasVencidas(
  pagoIds: number[],
  respaldo?: RespaldoCobroMembresia,
): string {
  if (pagoIds.length === 0) return '/ventas'
  if (pagoIds.length === 1) return urlCobrarCuota(pagoIds[0], respaldo)
  const params = new URLSearchParams({ membresia_pagos: pagoIds.join(',') })
  if (respaldo?.paciente) params.set('paciente', respaldo.paciente)
  if (respaldo?.plan) params.set('plan', respaldo.plan)
  if (respaldo?.monto != null && respaldo.monto > 0) {
    params.set('monto', String(respaldo.monto))
  }
  return `/ventas?${params}`
}

export function parseMembresiaPagosBulk(raw?: string | null): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0)
}
