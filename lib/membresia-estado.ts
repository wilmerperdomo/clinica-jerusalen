/** Estados visuales de planes médicos registrados */

export type EstadoPlanVisual =
  | 'activo'
  | 'por_vencer'
  | 'vencido'
  | 'mora'
  | 'inactivo'
  | 'cancelado'

export interface MembresiaEstadoInput {
  estado?: string
  fecha_fin: string
  cuotas_vencidas?: number
}

export function diasRestantesPlan(fechaFin: string) {
  const fin = new Date(fechaFin)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.ceil((fin.getTime() - hoy.getTime()) / 86400000)
}

export function estadoVisualPlan(m: MembresiaEstadoInput): EstadoPlanVisual {
  if (m.estado === 'inactivo') return 'inactivo'
  if (m.estado === 'cancelado') return 'cancelado'
  const dias = diasRestantesPlan(m.fecha_fin)
  if ((m.cuotas_vencidas ?? 0) > 0 && m.estado === 'activo') return 'mora'
  if (dias < 0) return 'vencido'
  if (dias <= 7) return 'por_vencer'
  return 'activo'
}

export function etiquetaEstadoPlan(estado: EstadoPlanVisual) {
  switch (estado) {
    case 'activo':      return 'Activo'
    case 'por_vencer':  return 'Por vencer'
    case 'vencido':     return 'Vencido'
    case 'mora':        return 'Suspendido por mora'
    case 'inactivo':    return 'Inactivo'
    case 'cancelado':   return 'Cancelado'
  }
}

export function claseEstadoPlan(estado: EstadoPlanVisual) {
  switch (estado) {
    case 'activo':      return 'bg-green-100 text-green-700'
    case 'por_vencer':  return 'bg-amber-100 text-amber-700'
    case 'vencido':     return 'bg-red-100 text-red-700'
    case 'mora':        return 'bg-orange-100 text-orange-800'
    case 'inactivo':    return 'bg-gray-100 text-gray-600'
    case 'cancelado':   return 'bg-slate-100 text-slate-600'
  }
}

export function numCuotasPlan(duracionDias: number) {
  if (duracionDias <= 31) return 1
  if (duracionDias <= 93) return 3
  if (duracionDias <= 186) return 6
  return 12
}
