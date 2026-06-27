/** Estados visuales de planes médicos registrados */

import { UMBRAL_CUOTAS_MORA } from '@/lib/membresia-mora'

export type EstadoPlanVisual =
  | 'activo'
  | 'por_vencer'
  | 'cuota_vencida'
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
  const vencidas = m.cuotas_vencidas ?? 0
  if (dias < 0) return 'vencido'
  if (vencidas >= UMBRAL_CUOTAS_MORA && m.estado === 'activo') return 'mora'
  if (vencidas > 0 && m.estado === 'activo') return 'cuota_vencida'
  if (dias <= 7) return 'por_vencer'
  return 'activo'
}

export function etiquetaEstadoPlan(estado: EstadoPlanVisual) {
  switch (estado) {
    case 'activo':         return 'Al día'
    case 'por_vencer':     return 'Por vencer'
    case 'cuota_vencida':  return 'Cuota vencida'
    case 'vencido':        return 'Vencido'
    case 'mora':           return 'Suspendido por mora'
    case 'inactivo':       return 'Inactivo'
    case 'cancelado':      return 'Cancelado'
  }
}

export function claseEstadoPlan(estado: EstadoPlanVisual) {
  switch (estado) {
    case 'activo':         return 'bg-green-100 text-green-700 ring-1 ring-green-200'
    case 'por_vencer':     return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
    case 'cuota_vencida':  return 'bg-red-100 text-red-700 ring-1 ring-red-200'
    case 'vencido':        return 'bg-red-100 text-red-800 ring-1 ring-red-300'
    case 'mora':           return 'bg-orange-100 text-orange-900 ring-1 ring-orange-300'
    case 'inactivo':       return 'bg-gray-100 text-gray-600'
    case 'cancelado':      return 'bg-slate-100 text-slate-600'
  }
}

/** Menor número = más urgente (para ordenar tablas). */
export function prioridadEstadoPlan(estado: EstadoPlanVisual): number {
  switch (estado) {
    case 'mora':          return 0
    case 'vencido':       return 1
    case 'cuota_vencida': return 2
    case 'por_vencer':    return 3
    case 'activo':        return 4
    case 'inactivo':      return 5
    case 'cancelado':     return 6
  }
}

export function bordeFilaEstadoPlan(estado: EstadoPlanVisual): string {
  switch (estado) {
    case 'mora':          return 'border-l-4 border-l-orange-500'
    case 'vencido':       return 'border-l-4 border-l-red-600'
    case 'cuota_vencida': return 'border-l-4 border-l-red-400'
    case 'por_vencer':    return 'border-l-4 border-l-amber-400'
    case 'activo':        return 'border-l-4 border-l-green-500'
    case 'inactivo':      return 'border-l-4 border-l-gray-300'
    case 'cancelado':     return 'border-l-4 border-l-slate-300'
  }
}

export function fondoFilaEstadoPlan(estado: EstadoPlanVisual): string {
  switch (estado) {
    case 'mora':          return 'bg-orange-50/50'
    case 'vencido':       return 'bg-red-50/40'
    case 'cuota_vencida': return 'bg-red-50/30'
    case 'por_vencer':    return 'bg-amber-50/30'
    default:              return ''
  }
}

export function numCuotasPlan(duracionDias: number) {
  if (duracionDias <= 31) return 1
  if (duracionDias <= 93) return 3
  if (duracionDias <= 186) return 6
  return 12
}
