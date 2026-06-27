/** Morosidad en planes médicos: suspende beneficios en caja */

export const UMBRAL_CUOTAS_MORA = 2

export interface CuotaResumen {
  membresia_id: number
  estado: string
  fecha_vencimiento: string
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
