export const ESTADOS_ATENDIDA = ['ASISTIO', 'ASISTIÓ'] as const

export interface CitaHistorial {
  paciente_id: number | null
  fecha: string
  estado: string
}

export interface PacienteBasico {
  id: number
  nombre: string
  apellido1: string
  celular?: string | null
  telefono?: string | null
}

export interface MovimientoPaciente {
  paciente_id?: number | null
  tipo: string
  monto: number
  concepto?: string | null
}

export interface LabOrdenPaciente {
  paciente_id?: number | null
  pagado?: boolean | null
  analisis?: { costo?: number | null } | null
}

export interface FilaRecurrencia {
  pacienteId: number
  nombre: string
  visitasPeriodo: number
  tipo: 'Nuevo' | 'Recurrente'
  etiqueta: string
  primeraVisita: string
  ultimaVisita: string
  celular: string
}

export interface PerfilUsoPaciente {
  pacienteId: number
  nombre: string
  consultas: number
  labOrdenes: number
  comprasFarmacia: number
  montoGastado: number
  celular: string
}

export interface MesVisitas {
  mes: string
  label: string
  nuevos: number
  recurrentes: number
  total: number
}

export interface PacienteInactivo {
  pacienteId: number
  nombre: string
  ultimaVisita: string
  mesesSinVisita: number
  celular: string
}

function esAtendida(estado: string): boolean {
  return ESTADOS_ATENDIDA.includes(estado as typeof ESTADOS_ATENDIDA[number])
}

function nombrePac(p: PacienteBasico): string {
  return `${p.nombre} ${p.apellido1}`.trim()
}

function contactoPac(p: PacienteBasico): string {
  return (p.celular || p.telefono || '').trim()
}

function mesesEntre(fechaIso: string, hasta: string): number {
  const a = new Date(fechaIso)
  const b = new Date(hasta)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
}

function fmtMesLabel(mes: string): string {
  const [y, mm] = mes.split('-')
  const d = new Date(Number(y), Number(mm) - 1, 1)
  return Number.isNaN(d.getTime())
    ? mes
    : d.toLocaleDateString('es-HN', { month: 'short', year: 'numeric' })
}

function esCompraFarmacia(concepto?: string | null): boolean {
  if (!concepto) return false
  const t = concepto.toLowerCase()
  return /medicamento|farmacia|producto|cotización.*med/i.test(t)
}

/** Historial de visitas atendidas por paciente (todas las fechas) */
function visitasPorPaciente(citasHistorial: CitaHistorial[]): Map<number, string[]> {
  const mapa = new Map<number, string[]>()
  for (const c of citasHistorial) {
    if (!c.paciente_id || !esAtendida(c.estado) || !c.fecha) continue
    const arr = mapa.get(c.paciente_id) || []
    arr.push(c.fecha)
    mapa.set(c.paciente_id, arr)
  }
  for (const [id, fechas] of mapa) {
    mapa.set(id, fechas.sort())
  }
  return mapa
}

export function analizarRecurrencia(opts: {
  citasHistorial: CitaHistorial[]
  citasPeriodo: CitaHistorial[]
  pacientes: PacienteBasico[]
  movimientos: MovimientoPaciente[]
  labOrdenes: LabOrdenPaciente[]
  desde: string
  hasta: string
  mesesInactivo?: number
}): {
  filas: FilaRecurrencia[]
  perfiles: PerfilUsoPaciente[]
  tendenciaMensual: MesVisitas[]
  inactivos3: PacienteInactivo[]
  inactivos6: PacienteInactivo[]
  promedioVisitasPorPaciente: number
  topGasto: PerfilUsoPaciente[]
  topFrecuencia: PerfilUsoPaciente[]
  totalNuevos: number
  totalRecurrentes: number
  tasaRetencion: number
} {
  const { citasHistorial, citasPeriodo, pacientes, movimientos, labOrdenes, desde, hasta } = opts
  const pacMap = new Map(pacientes.map(p => [p.id, p]))
  const historial = visitasPorPaciente(citasHistorial)

  /* visitas en período por paciente */
  const visitasPeriodoMap = new Map<number, number>()
  for (const c of citasPeriodo) {
    if (!c.paciente_id || !esAtendida(c.estado)) continue
    visitasPeriodoMap.set(c.paciente_id, (visitasPeriodoMap.get(c.paciente_id) || 0) + 1)
  }

  const filas: FilaRecurrencia[] = []
  let totalNuevos = 0
  let totalRecurrentes = 0

  for (const [pacienteId, nVisitas] of visitasPeriodoMap) {
    const fechas = historial.get(pacienteId) || []
    if (fechas.length === 0) continue
    const primera = fechas[0]
    const ultima = fechas[fechas.length - 1]
    const esNuevo = primera >= desde && primera <= hasta
    const tipo = esNuevo ? 'Nuevo' : 'Recurrente'
    if (esNuevo) totalNuevos++
    else totalRecurrentes++

    const p = pacMap.get(pacienteId)
    const nombre = p ? nombrePac(p) : `Paciente #${pacienteId}`
    const mesesSin = mesesEntre(ultima, hasta)
    const inactivoEnPeriodo = mesesSin >= (opts.mesesInactivo ?? 6)
    const etiqueta = inactivoEnPeriodo
      ? '⚠️ Inactivo'
      : esNuevo
        ? '🆕 Nuevo'
        : '🔁 Recurrente'

    filas.push({
      pacienteId,
      nombre,
      visitasPeriodo: nVisitas,
      tipo,
      etiqueta,
      primeraVisita: primera,
      ultimaVisita: ultima,
      celular: p ? contactoPac(p) : '',
    })
  }

  filas.sort((a, b) => b.visitasPeriodo - a.visitasPeriodo)

  /* perfiles de uso */
  const perfilMap = new Map<number, PerfilUsoPaciente>()
  function ensurePerfil(id: number): PerfilUsoPaciente {
    if (!perfilMap.has(id)) {
      const p = pacMap.get(id)
      perfilMap.set(id, {
        pacienteId: id,
        nombre: p ? nombrePac(p) : `Paciente #${id}`,
        consultas: 0,
        labOrdenes: 0,
        comprasFarmacia: 0,
        montoGastado: 0,
        celular: p ? contactoPac(p) : '',
      })
    }
    return perfilMap.get(id)!
  }

  for (const [id, n] of visitasPeriodoMap) {
    ensurePerfil(id).consultas = n
  }
  for (const l of labOrdenes) {
    if (!l.paciente_id) continue
    ensurePerfil(l.paciente_id).labOrdenes += 1
  }
  for (const m of movimientos) {
    if (!m.paciente_id || m.tipo !== 'INGRESO') continue
    const perf = ensurePerfil(m.paciente_id)
    perf.montoGastado += m.monto
    if (esCompraFarmacia(m.concepto)) perf.comprasFarmacia += 1
  }

  const perfiles = Array.from(perfilMap.values())
    .filter(p => p.consultas > 0 || p.labOrdenes > 0 || p.montoGastado > 0)
    .sort((a, b) => b.montoGastado - a.montoGastado)

  const topGasto = [...perfiles].sort((a, b) => b.montoGastado - a.montoGastado).slice(0, 10)
  const topFrecuencia = [...perfiles].sort((a, b) => b.consultas - a.consultas).slice(0, 10)

  const pacientesConVisitas = filas.length
  const totalVisitasPeriodo = filas.reduce((s, f) => s + f.visitasPeriodo, 0)
  const promedioVisitasPorPaciente = pacientesConVisitas > 0
    ? totalVisitasPeriodo / pacientesConVisitas
    : 0

  const tasaRetencion = totalVisitasPeriodo > 0
    ? (totalRecurrentes / totalVisitasPeriodo) * 100
    : 0

  /* tendencia mensual dentro del rango */
  const mesesMap = new Map<string, { nuevos: number; recurrentes: number }>()
  for (const c of citasPeriodo) {
    if (!c.paciente_id || !esAtendida(c.estado) || !c.fecha) continue
    const mes = c.fecha.slice(0, 7)
    if (!mesesMap.has(mes)) mesesMap.set(mes, { nuevos: 0, recurrentes: 0 })
    const fechas = historial.get(c.paciente_id) || []
    const primera = fechas[0] || c.fecha
    const bucket = mesesMap.get(mes)!
    if (primera.slice(0, 7) === mes) bucket.nuevos += 1
    else bucket.recurrentes += 1
  }
  const tendenciaMensual: MesVisitas[] = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      mes,
      label: fmtMesLabel(mes),
      nuevos: v.nuevos,
      recurrentes: v.recurrentes,
      total: v.nuevos + v.recurrentes,
    }))

  /* pacientes inactivos (sin visita en X meses, pero con historial) */
  function listarInactivos(meses: number): PacienteInactivo[] {
    const lista: PacienteInactivo[] = []
    for (const [pacienteId, fechas] of historial) {
      const ultima = fechas[fechas.length - 1]
      const sin = mesesEntre(ultima, hasta)
      if (sin < meses) continue
      const p = pacMap.get(pacienteId)
      lista.push({
        pacienteId,
        nombre: p ? nombrePac(p) : `Paciente #${pacienteId}`,
        ultimaVisita: ultima,
        mesesSinVisita: sin,
        celular: p ? contactoPac(p) : '',
      })
    }
    return lista.sort((a, b) => b.mesesSinVisita - a.mesesSinVisita)
  }

  return {
    filas,
    perfiles,
    tendenciaMensual,
    inactivos3: listarInactivos(3),
    inactivos6: listarInactivos(6),
    promedioVisitasPorPaciente,
    topGasto,
    topFrecuencia,
    totalNuevos,
    totalRecurrentes,
    tasaRetencion,
  }
}
