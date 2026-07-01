import { fechaHoyHN } from '@/lib/fecha-hn'

export type EstadoLab =
  | 'PENDIENTE_COBRO'
  | 'PAGADO'
  | 'EN_PROCESO'
  | 'BORRADOR'
  | 'RESULTADO_LISTO'
  | 'VALIDADO'
  | 'ENTREGADO'

export const ORDEN_ESTADOS_LAB: EstadoLab[] = [
  'PENDIENTE_COBRO',
  'PAGADO',
  'EN_PROCESO',
  'BORRADOR',
  'RESULTADO_LISTO',
  'VALIDADO',
  'ENTREGADO',
]

export interface KanbanColumnaLab {
  id: string
  label: string
  estados: EstadoLab[]
  color: string
}

export const KANBAN_COLUMNAS_LAB: KanbanColumnaLab[] = [
  { id: 'sin_cobrar', label: 'Sin cobrar', estados: ['PENDIENTE_COBRO'], color: 'bg-gray-100 border-gray-200' },
  { id: 'cola', label: 'Cola', estados: ['PAGADO'], color: 'bg-amber-50 border-amber-200' },
  { id: 'proceso', label: 'En análisis', estados: ['EN_PROCESO', 'BORRADOR'], color: 'bg-blue-50 border-blue-200' },
  { id: 'listo', label: 'Listo', estados: ['RESULTADO_LISTO'], color: 'bg-teal-50 border-teal-200' },
  { id: 'validado', label: 'Validado', estados: ['VALIDADO'], color: 'bg-indigo-50 border-indigo-200' },
  { id: 'entregado', label: 'Entregado', estados: ['ENTREGADO'], color: 'bg-green-50 border-green-200' },
]

export function etiquetaEstadoLab(estado?: string | null): string {
  const map: Record<string, string> = {
    PENDIENTE_COBRO: 'Pendiente de cobro',
    PAGADO: 'Pagado — en cola',
    EN_PROCESO: 'En proceso',
    BORRADOR: 'Borrador',
    RESULTADO_LISTO: 'Resultado listo',
    VALIDADO: 'Validado',
    ENTREGADO: 'Entregado',
  }
  return map[estado ?? ''] ?? 'Pendiente de cobro'
}

export function claseBadgeEstadoLab(estado?: string | null): string {
  const map: Record<string, string> = {
    PENDIENTE_COBRO: 'bg-gray-100 text-gray-600',
    PAGADO: 'bg-amber-100 text-amber-800',
    EN_PROCESO: 'bg-blue-100 text-blue-800',
    BORRADOR: 'bg-sky-100 text-sky-800',
    RESULTADO_LISTO: 'bg-teal-100 text-teal-800',
    VALIDADO: 'bg-indigo-100 text-indigo-800',
    ENTREGADO: 'bg-green-100 text-green-700',
  }
  return map[estado ?? ''] ?? 'bg-yellow-100 text-yellow-700'
}

export function prioridadEstadoLab(estado: EstadoLab): number {
  return ORDEN_ESTADOS_LAB.indexOf(estado)
}

export function inferirEstadoLab(orden: {
  estado_lab?: string | null
  pagado?: boolean | string | null
  entregado?: boolean | string | null
  tieneResultado?: boolean
  tieneBorrador?: boolean
}): EstadoLab {
  if (orden.estado_lab && ORDEN_ESTADOS_LAB.includes(orden.estado_lab as EstadoLab)) {
    return orden.estado_lab as EstadoLab
  }
  if (orden.entregado === true || orden.entregado === '1' || orden.entregado === 'true') return 'ENTREGADO'
  if (orden.tieneResultado) return 'RESULTADO_LISTO'
  if (orden.tieneBorrador) return 'BORRADOR'
  if (orden.pagado === true || orden.pagado === '1' || orden.pagado === 'true') return 'PAGADO'
  return 'PENDIENTE_COBRO'
}

export function columnaKanbanParaEstado(estado: EstadoLab): KanbanColumnaLab {
  return KANBAN_COLUMNAS_LAB.find(c => c.estados.includes(estado)) ?? KANBAN_COLUMNAS_LAB[0]
}

export function estadoMinimoGrupo(estados: EstadoLab[]): EstadoLab {
  if (!estados.length) return 'PENDIENTE_COBRO'
  return estados.reduce((min, e) =>
    prioridadEstadoLab(e) < prioridadEstadoLab(min) ? e : min,
  )
}

export function slaVencido(fechaPrometida?: string | null, estado?: EstadoLab): boolean {
  if (!fechaPrometida) return false
  if (estado === 'ENTREGADO' || estado === 'VALIDADO') return false
  const hoy = fechaHoyHN()
  return fechaPrometida < hoy
}

export function diasAtraso(fechaPrometida?: string | null): number {
  if (!fechaPrometida) return 0
  const hoy = new Date()
  const prom = new Date(fechaPrometida + 'T12:00:00')
  const diff = Math.floor((hoy.getTime() - prom.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}
