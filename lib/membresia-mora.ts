/** Morosidad en planes médicos: suspende beneficios en caja */

export const UMBRAL_CUOTAS_MORA = 2

/** Recargo por cuota vencida (% sobre el monto de la cuota). */
export const PCT_RECARGO_MORA = 10

export interface CuotaResumen {
  membresia_id: number
  estado: string
  fecha_vencimiento: string
  monto?: number
}

export function cuotaEstaVencida(
  fechaVencimiento: string,
  hoy: string,
  estado = 'pendiente',
): boolean {
  if (estado === 'pagado') return false
  return estado === 'vencido' || fechaVencimiento < hoy
}

export function diasAtrasoCuota(fechaVencimiento: string, hoy: string): number {
  if (fechaVencimiento >= hoy) return 0
  const v = new Date(fechaVencimiento + 'T12:00:00')
  const h = new Date(hoy + 'T12:00:00')
  return Math.max(0, Math.ceil((h.getTime() - v.getTime()) / 86400000))
}

/** Recargo en lempiras por cuota vencida (redondeo a 2 decimales). */
export function calcularRecargoCuota(
  monto: number,
  fechaVencimiento: string,
  hoy: string,
  estado = 'pendiente',
): number {
  if (!cuotaEstaVencida(fechaVencimiento, hoy, estado)) return 0
  return Math.round(monto * PCT_RECARGO_MORA) / 100
}

export function montoCuotaConRecargo(
  monto: number,
  fechaVencimiento: string,
  hoy: string,
  estado = 'pendiente',
) {
  const recargo = calcularRecargoCuota(monto, fechaVencimiento, hoy, estado)
  return { montoBase: monto, recargo, total: monto + recargo }
}

export function totalLoteConRecargo(
  cuotas: { monto: number; fecha_vencimiento: string; estado: string }[],
  hoy: string,
) {
  let montoBase = 0
  let recargo = 0
  for (const c of cuotas) {
    const det = montoCuotaConRecargo(c.monto, c.fecha_vencimiento, hoy, c.estado)
    montoBase += det.montoBase
    recargo += det.recargo
  }
  return { montoBase, recargo, total: montoBase + recargo }
}

export function cuotasVencidasDeMembresia(cuotas: CuotaResumen[], hoy: string): number {
  return cuotas.filter(c =>
    c.estado !== 'pagado' && c.fecha_vencimiento < hoy
  ).length
}

export function membresiaEnMora(cuotas: CuotaResumen[], hoy: string): boolean {
  return cuotasVencidasDeMembresia(cuotas, hoy) >= UMBRAL_CUOTAS_MORA
}

/** Mapa membresia_id → cantidad de cuotas vencidas */
export function mapaCuotasVencidas(
  cuotas: CuotaResumen[],
  hoy: string,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of cuotas) {
    if (c.estado === 'pagado' || c.fecha_vencimiento >= hoy) continue
    map.set(c.membresia_id, (map.get(c.membresia_id) ?? 0) + 1)
  }
  return map
}

export function pacienteSuspendidoPorMora(
  pacienteId: number,
  membresiaIdPorPaciente: Map<number, number>,
  moraPorMembresia: Map<number, number>,
): boolean {
  const memId = membresiaIdPorPaciente.get(pacienteId)
  if (!memId) return false
  return (moraPorMembresia.get(memId) ?? 0) >= UMBRAL_CUOTAS_MORA
}
