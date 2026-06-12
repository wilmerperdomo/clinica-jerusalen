/** Utilidades — planes médicos / membresías en consultas y caja */

export interface MembresiaPacienteInfo {
  tipo: string
  tipo_id?: number
  fecha_fin: string
  numero_carnet?: string
  dias_restantes: number
  beneficios: string[]
  vencida: boolean
  por_vencer: boolean
}

export type MembresiasMap = Record<number, MembresiaPacienteInfo>

export function diasRestantesMembresia(fechaFin: string): number {
  const fin = new Date(fechaFin + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.ceil((fin.getTime() - hoy.getTime()) / 86400000)
}

export function getMembresiaPaciente(
  pacienteId?: number | null,
  map?: MembresiasMap,
): MembresiaPacienteInfo | null {
  if (!pacienteId || !map) return null
  return map[pacienteId] ?? null
}

export function buildMembresiasMap(
  rows: {
    paciente_id: number
    fecha_fin: string
    numero_carnet?: string | null
    tipo_id?: number
    tipo?: { nombre: string } | { nombre: string }[] | null
    beneficiarios?: unknown
  }[],
  beneficiosPorTipo?: Record<number, string[]>,
): MembresiasMap {
  const map: MembresiasMap = {}
  for (const m of rows) {
    const tipoObj = Array.isArray(m.tipo) ? m.tipo[0] : m.tipo
    const tipoNombre = tipoObj?.nombre ?? 'Plan médico'
    const dias = diasRestantesMembresia(m.fecha_fin)
    const tipoId = m.tipo_id
    map[m.paciente_id] = {
      tipo: tipoNombre,
      tipo_id: tipoId,
      fecha_fin: m.fecha_fin,
      numero_carnet: m.numero_carnet ?? undefined,
      dias_restantes: dias,
      beneficios: tipoId && beneficiosPorTipo?.[tipoId] ? beneficiosPorTipo[tipoId] : [],
      vencida: dias < 0,
      por_vencer: dias >= 0 && dias <= 10,
    }
  }
  return map
}

export function precioLabLista(
  pruebaId: number,
  listaId: number | null | undefined,
  preciosLista: Record<number, Record<number, number>>,
  costoDefault: number,
): number {
  if (!listaId) return costoDefault
  const v = preciosLista[listaId]?.[pruebaId]
  return v != null && v > 0 ? v : costoDefault
}
