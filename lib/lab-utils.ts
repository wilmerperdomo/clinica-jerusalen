import {
  type EstadoLab,
  inferirEstadoLab,
  estadoMinimoGrupo,
  slaVencido,
  diasAtraso,
} from '@/lib/lab-estado-utils'
import { nombrePaciente } from '@/lib/consultas-utils'

export interface LabRango {
  id: number
  prueba_id: number
  genero?: string | null
  edad_min?: number
  edad_max?: number
  rango_min?: number | null
  rango_max?: number | null
  rango_texto?: string | null
  unidad?: string | null
}

export interface LabPanelCampo {
  id: number
  prueba_id: number
  codigo?: string
  nombre: string
  unidad?: string
  orden?: number
  activo?: boolean
}

export interface LabResultado {
  id: number
  orden_id: number
  prueba_id?: number
  campo_id?: number | null
  nombre_prueba?: string
  valor_resultado?: string
  rango_min?: number
  rango_max?: number
  rango_texto?: string
  unidad?: string
  anormal?: boolean
  observacion?: string
}

export interface OrdenLab {
  id: number
  id_consulta?: string
  id_cliente?: string
  paciente_id?: number
  id_analisis?: number | string
  lab_grupo_id?: string
  no_analisis: string
  valor: number
  cant: number
  importe: number
  fecha: string
  hora?: string
  entregado?: boolean
  pagado?: boolean
  estado_lab?: string
  resultado_resumen?: string
  fecha_resultado?: string
  fecha_prometida?: string
  validado_at?: string
  notificado_at?: string
  resultados?: LabResultado[]
}

export interface PruebaLab {
  id: number
  nombre: string
  description?: string
  color?: string
  dias?: number
  costo: number
  comision: number
  activo?: boolean
  es_panel?: boolean
}

export interface PacienteLab {
  id: number
  codigo: string
  tipo?: string
  nombre?: string
  apellido1?: string
  apellido2?: string
  nombre_empresa?: string
  rtn_empresa?: string
  contacto?: string
  fecha_nac?: string
  lista_id?: number
  celular?: string
  telefono?: string
  genero?: string
}

export interface GrupoLab {
  grupoId: string
  pacienteId: number
  pacienteNombre: string
  pacienteCodigo: string
  telefono: string
  fecha: string
  fechaPrometida?: string
  ordenes: OrdenLab[]
  estado: EstadoLab
  totalImporte: number
  pruebas: string[]
  atrasado: boolean
  diasAtraso: number
  tieneResultados: boolean
}

export function calcularEdad(fechaNac?: string): number | null {
  if (!fechaNac) return null
  const n = new Date(fechaNac + 'T12:00:00')
  if (Number.isNaN(n.getTime())) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - n.getFullYear()
  const m = hoy.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--
  return edad
}

export function grupoIdOrden(o: OrdenLab): string {
  if (o.lab_grupo_id) return o.lab_grupo_id
  const pid = o.paciente_id ?? o.id_cliente ?? '0'
  const cons = o.id_consulta ?? 'direct'
  return `legacy-${pid}-${o.fecha}-${cons}`
}

export function nombrePacienteLab(p: PacienteLab | undefined, fallbackId?: string): string {
  if (!p) return fallbackId ? `#${fallbackId}` : '—'
  return nombrePaciente(p) || (fallbackId ? `#${fallbackId}` : '—')
}

export function estadoOrdenLab(o: OrdenLab): EstadoLab {
  const tieneResultado = (o.resultados?.length ?? 0) > 0 && o.resultados!.some(r => !!r.valor_resultado?.trim())
  const tieneBorrador = (o.resultados?.length ?? 0) > 0 && !tieneResultado
  return inferirEstadoLab({
    estado_lab: o.estado_lab,
    pagado: o.pagado,
    entregado: o.entregado,
    tieneResultado,
    tieneBorrador,
  })
}

export function agruparOrdenes(
  ordenes: OrdenLab[],
  pacientes: PacienteLab[],
): GrupoLab[] {
  const mapPac = new Map(pacientes.map(p => [String(p.id), p]))
  const grupos = new Map<string, OrdenLab[]>()

  for (const o of ordenes) {
    const gid = grupoIdOrden(o)
    if (!grupos.has(gid)) grupos.set(gid, [])
    grupos.get(gid)!.push(o)
  }

  const out: GrupoLab[] = []
  for (const [grupoId, items] of grupos) {
    const sorted = [...items].sort((a, b) => a.id - b.id)
    const first = sorted[0]
    const pid = Number(first.paciente_id ?? first.id_cliente ?? 0)
    const pac = mapPac.get(String(pid))
    const estados = sorted.map(estadoOrdenLab)
    const estado = estadoMinimoGrupo(estados)
    const fechaPrometida = sorted
      .map(o => o.fecha_prometida)
      .filter(Boolean)
      .sort()
      .pop()

    out.push({
      grupoId,
      pacienteId: pid,
      pacienteNombre: nombrePacienteLab(pac, first.id_cliente),
      pacienteCodigo: pac?.codigo ?? '',
      telefono: pac?.celular || pac?.telefono || '',
      fecha: first.fecha,
      fechaPrometida,
      ordenes: sorted,
      estado,
      totalImporte: sorted.reduce((s, o) => s + Number(o.importe || 0), 0),
      pruebas: sorted.map(o => o.no_analisis),
      atrasado: slaVencido(fechaPrometida, estado),
      diasAtraso: diasAtraso(fechaPrometida),
      tieneResultados: sorted.some(o => (o.resultados?.length ?? 0) > 0),
    })
  }

  return out.sort((a, b) => {
    if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1
    return b.ordenes[0].id - a.ordenes[0].id
  })
}

export function buscarRangoAplicable(
  rangos: LabRango[],
  pruebaId: number,
  edad: number | null,
  genero?: string | null,
): LabRango | null {
  const candidatos = rangos.filter(r => r.prueba_id === pruebaId)
  if (!candidatos.length) return null

  const sexoNorm = genero?.toUpperCase().startsWith('M') ? 'M'
    : genero?.toUpperCase().startsWith('F') ? 'F' : null

  const scored = candidatos.map(r => {
    let score = 0
    if (r.genero && sexoNorm && r.genero === sexoNorm) score += 4
    else if (!r.genero) score += 2
    else if (r.genero && !sexoNorm) score += 1

    const emin = r.edad_min ?? 0
    const emax = r.edad_max ?? 999
    if (edad != null && edad >= emin && edad <= emax) score += 5
    else if (edad == null) score += 1

    return { r, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score > 0 ? scored[0].r : candidatos[0]
}

export type IndicadorRango = 'ALTO' | 'BAJO' | 'NORMAL' | ''

export interface EvalRango {
  anormal: boolean
  indicador: IndicadorRango
  rangoTexto: string
  unidad: string
  rangoMin: number | null
  rangoMax: number | null
}

/** Calcula el indicador alto/bajo/normal a partir de un valor y un rango numérico. */
export function indicadorDesdeRango(
  valor: string | number | null | undefined,
  rangoMin: number | null | undefined,
  rangoMax: number | null | undefined,
): IndicadorRango {
  if (valor == null || valor === '') return ''
  if (rangoMin == null || rangoMax == null) return ''
  const num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
  if (Number.isNaN(num)) return ''
  if (num < Number(rangoMin)) return 'BAJO'
  if (num > Number(rangoMax)) return 'ALTO'
  return 'NORMAL'
}

export function evaluarValorRango(
  valor: string,
  rango: LabRango | null,
): EvalRango {
  const unidad = rango?.unidad ?? ''
  const rangoMin = rango?.rango_min ?? null
  const rangoMax = rango?.rango_max ?? null
  const rangoTexto = rango?.rango_texto
    ?? (rangoMin != null && rangoMax != null ? `${rangoMin} – ${rangoMax}` : '')

  const indicador = indicadorDesdeRango(valor, rangoMin, rangoMax)
  const anormal = indicador === 'ALTO' || indicador === 'BAJO'
  return { anormal, indicador, rangoTexto, unidad, rangoMin, rangoMax }
}

export function computeFechaPrometida(fechaOrden: string, diasEntrega: number): string {
  const d = new Date(fechaOrden + 'T12:00:00')
  d.setDate(d.getDate() + Math.max(1, diasEntrega || 1))
  return d.toISOString().split('T')[0]
}

export interface LabReporteStats {
  totalOrdenes: number
  totalGrupos: number
  porEstado: Record<EstadoLab, number>
  atrasadas: number
  entregadasHoy: number
  tiempoPromedioEntrega: number | null
  topPruebas: { nombre: string; count: number }[]
  ingresosPeriodo: number
}

export function calcularReportesLab(
  ordenes: OrdenLab[],
  grupos: GrupoLab[],
  fechaHoy: string,
): LabReporteStats {
  const porEstado = {
    PENDIENTE_COBRO: 0,
    PAGADO: 0,
    EN_PROCESO: 0,
    BORRADOR: 0,
    RESULTADO_LISTO: 0,
    VALIDADO: 0,
    ENTREGADO: 0,
  } satisfies Record<EstadoLab, number>

  for (const o of ordenes) {
    const e = estadoOrdenLab(o)
    porEstado[e]++
  }

  const pruebaCount = new Map<string, number>()
  for (const o of ordenes) {
    pruebaCount.set(o.no_analisis, (pruebaCount.get(o.no_analisis) ?? 0) + 1)
  }

  const entregadas = ordenes.filter(o => estadoOrdenLab(o) === 'ENTREGADO')
  const entregadasHoy = entregadas.filter(o => (o.fecha_resultado ?? o.fecha) === fechaHoy).length

  let sumDias = 0
  let countDias = 0
  for (const o of entregadas) {
    if (o.fecha_resultado && o.fecha) {
      const ini = new Date(o.fecha + 'T12:00:00').getTime()
      const fin = new Date(o.fecha_resultado + 'T12:00:00').getTime()
      const dias = Math.round((fin - ini) / 86400000)
      if (dias >= 0) { sumDias += dias; countDias++ }
    }
  }

  return {
    totalOrdenes: ordenes.length,
    totalGrupos: grupos.length,
    porEstado,
    atrasadas: grupos.filter(g => g.atrasado).length,
    entregadasHoy,
    tiempoPromedioEntrega: countDias ? Math.round((sumDias / countDias) * 10) / 10 : null,
    topPruebas: [...pruebaCount.entries()]
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    ingresosPeriodo: ordenes.reduce((s, o) => s + Number(o.importe || 0), 0),
  }
}

export function tuboColorClase(color?: string): string {
  const map: Record<string, string> = {
    lila: 'bg-purple-200 text-purple-800',
    morado: 'bg-purple-200 text-purple-800',
    rojo: 'bg-red-200 text-red-800',
    rosado: 'bg-pink-200 text-pink-800',
    amarillo: 'bg-yellow-200 text-yellow-800',
    gris: 'bg-gray-200 text-gray-700',
    verde: 'bg-green-200 text-green-800',
    azul: 'bg-blue-200 text-blue-800',
  }
  return map[(color || '').toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}
