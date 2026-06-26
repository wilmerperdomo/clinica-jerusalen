/** Carnet de vacunación — catálogo y vencimientos */

export interface VacunaCatalogo {
  id: number
  codigo: string
  nombre: string
  dosis_etiqueta?: string | null
  edad_min_meses?: number | null
  edad_max_meses?: number | null
  intervalo_meses?: number | null
  orden?: number | null
  activo?: boolean | null
}

export interface PacienteVacuna {
  id: number
  paciente_id: number
  vacuna_id: number
  fecha_aplicada: string
  lote?: string | null
  notas?: string | null
  vacuna?: VacunaCatalogo
}

export function edadEnMeses(fechaNac?: string | null, ref = new Date()): number | null {
  if (!fechaNac) return null
  const nac = new Date(fechaNac)
  if (Number.isNaN(nac.getTime())) return null
  const diffMs = ref.getTime() - nac.getTime()
  if (diffMs < 0) return null
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44))
}

export function vacunasPendientes(
  catalogo: VacunaCatalogo[],
  aplicadas: PacienteVacuna[],
  edadMeses: number | null,
): VacunaCatalogo[] {
  const aplicadasIds = new Set(aplicadas.map(v => v.vacuna_id))
  return catalogo
    .filter(v => v.activo !== false)
    .filter(v => !aplicadasIds.has(v.id))
    .filter(v => {
      if (edadMeses == null) return true
      const min = v.edad_min_meses ?? 0
      const max = v.edad_max_meses ?? 999
      return edadMeses >= min - 1 && edadMeses <= max + 3
    })
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
}

export function etiquetaVacuna(v: VacunaCatalogo): string {
  return v.dosis_etiqueta ? `${v.nombre} (${v.dosis_etiqueta})` : v.nombre
}

export interface VacunaAlerta {
  tipo: 'pendiente' | 'proxima'
  vacuna: VacunaCatalogo
  mensaje: string
}

export function alertasVacunas(
  catalogo: VacunaCatalogo[],
  aplicadas: PacienteVacuna[],
  edadMeses: number | null,
): VacunaAlerta[] {
  if (edadMeses == null) return []
  const pendientes = vacunasPendientes(catalogo, aplicadas, edadMeses)
  return pendientes
    .filter(v => edadMeses >= (v.edad_min_meses ?? 0))
    .slice(0, 5)
    .map(v => ({
      tipo: 'pendiente' as const,
      vacuna: v,
      mensaje: `Vacuna pendiente: ${etiquetaVacuna(v)}`,
    }))
}
