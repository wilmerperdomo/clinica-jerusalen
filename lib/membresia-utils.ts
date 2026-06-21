/** Utilidades — planes médicos / membresías en consultas y caja */

/** Beneficios estructurados de un plan (computables en caja) */
export interface BeneficiosMembresia {
  consultaGratis: boolean
  pctConsulta: number
  pctLaboratorio: number
  pctMedicamentos: number
  pctServicios: number
}

export interface MembresiaPacienteInfo {
  tipo: string
  tipo_id?: number
  fecha_fin: string
  numero_carnet?: string
  dias_restantes: number
  beneficios: string[]
  /** Beneficios estructurados del plan para aplicar automáticamente al cobrar */
  estructurados: BeneficiosMembresia
  vencida: boolean
  por_vencer: boolean
}

export type MembresiasMap = Record<number, MembresiaPacienteInfo>

export const BENEFICIOS_VACIOS: BeneficiosMembresia = {
  consultaGratis: false,
  pctConsulta: 0,
  pctLaboratorio: 0,
  pctMedicamentos: 0,
  pctServicios: 0,
}

const clampPct = (n: unknown): number => {
  const v = Number(n) || 0
  return v < 0 ? 0 : v > 100 ? 100 : v
}

/** Normaliza los campos estructurados de un membresia_tipos a BeneficiosMembresia */
export function beneficiosDesdeTipo(tipo?: {
  consulta_gratis?: boolean | null
  pct_consulta?: number | null
  pct_laboratorio?: number | null
  pct_medicamentos?: number | null
  pct_servicios?: number | null
} | null): BeneficiosMembresia {
  if (!tipo) return { ...BENEFICIOS_VACIOS }
  return {
    consultaGratis: Boolean(tipo.consulta_gratis),
    pctConsulta: clampPct(tipo.pct_consulta),
    pctLaboratorio: clampPct(tipo.pct_laboratorio),
    pctMedicamentos: clampPct(tipo.pct_medicamentos),
    pctServicios: clampPct(tipo.pct_servicios),
  }
}

export type CategoriaCobro = 'consulta' | 'laboratorio' | 'medicamentos' | 'servicios'

/** ¿El plan otorga algún beneficio aplicable? */
export function tieneBeneficiosMembresia(b?: BeneficiosMembresia | null): boolean {
  if (!b) return false
  return b.consultaGratis || b.pctConsulta > 0 || b.pctLaboratorio > 0
    || b.pctMedicamentos > 0 || b.pctServicios > 0
}

/**
 * Descuento de membresía para una categoría.
 * Devuelve { pct, gratis } donde gratis indica consulta 100% cubierta.
 */
export function descuentoMembresiaCategoria(
  categoria: CategoriaCobro,
  b?: BeneficiosMembresia | null,
): { pct: number; gratis: boolean } {
  if (!b) return { pct: 0, gratis: false }
  switch (categoria) {
    case 'consulta':
      if (b.consultaGratis) return { pct: 100, gratis: true }
      return { pct: b.pctConsulta, gratis: false }
    case 'laboratorio':   return { pct: b.pctLaboratorio, gratis: false }
    case 'medicamentos':  return { pct: b.pctMedicamentos, gratis: false }
    case 'servicios':     return { pct: b.pctServicios, gratis: false }
    default:              return { pct: 0, gratis: false }
  }
}

/**
 * Combina el descuento por edad con el de membresía para una categoría.
 * Criterio: se aplica el MAYOR de los dos (no se suman). Consulta gratis manda.
 * Devuelve el pct efectivo y el motivo a registrar.
 */
export function descuentoEfectivo(
  categoria: CategoriaCobro,
  pctEdad: number,
  motivoEdad: string,
  b?: BeneficiosMembresia | null,
): { pct: number; motivo: string } {
  const memb = descuentoMembresiaCategoria(categoria, b)
  if (memb.gratis) return { pct: 100, motivo: 'Consulta gratis' }
  const edad = Math.max(0, pctEdad || 0)
  if (memb.pct > 0 && memb.pct >= edad) return { pct: memb.pct, motivo: 'Plan médico' }
  if (edad > 0) return { pct: edad, motivo: motivoEdad || 'Descuento edad' }
  return { pct: 0, motivo: '' }
}

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

type TipoBeneficiosFields = {
  nombre?: string
  consulta_gratis?: boolean | null
  pct_consulta?: number | null
  pct_laboratorio?: number | null
  pct_medicamentos?: number | null
  pct_servicios?: number | null
}

export function buildMembresiasMap(
  rows: {
    paciente_id: number
    fecha_fin: string
    numero_carnet?: string | null
    tipo_id?: number
    tipo?: TipoBeneficiosFields | TipoBeneficiosFields[] | null
    beneficiarios?: unknown
  }[],
  beneficiosPorTipo?: Record<number, string[]>,
  estructuradosPorTipo?: Record<number, BeneficiosMembresia>,
): MembresiasMap {
  const map: MembresiasMap = {}
  for (const m of rows) {
    const tipoObj = Array.isArray(m.tipo) ? m.tipo[0] : m.tipo
    const tipoNombre = tipoObj?.nombre ?? 'Plan médico'
    const dias = diasRestantesMembresia(m.fecha_fin)
    const tipoId = m.tipo_id
    // Beneficios estructurados: preferir el mapa explícito; si no, derivar del tipo embebido.
    const estructurados = (tipoId && estructuradosPorTipo?.[tipoId])
      ? estructuradosPorTipo[tipoId]
      : beneficiosDesdeTipo(tipoObj)
    map[m.paciente_id] = {
      tipo: tipoNombre,
      tipo_id: tipoId,
      fecha_fin: m.fecha_fin,
      numero_carnet: m.numero_carnet ?? undefined,
      dias_restantes: dias,
      beneficios: tipoId && beneficiosPorTipo?.[tipoId] ? beneficiosPorTipo[tipoId] : [],
      estructurados,
      vencida: dias < 0,
      por_vencer: dias >= 0 && dias <= 10,
    }
  }
  return map
}

export interface LineaCobroDesc {
  categoria: CategoriaCobro
  bruto: number
  pct: number
  descMonto: number
  neto: number
  motivo: string
}

const round2 = (n: number): number => parseFloat((n || 0).toFixed(2))

/**
 * Desglosa líneas de cobro aplicando, por categoría, el MAYOR entre el
 * descuento por edad y el de membresía (consulta gratis manda).
 * Devuelve cada línea con su % y motivo, más subtotal/descuento/total.
 */
export function desglosarLineasCobro(
  lineas: { categoria: CategoriaCobro; bruto: number }[],
  pctEdad: number,
  motivoEdad: string,
  b?: BeneficiosMembresia | null,
): { lineas: LineaCobroDesc[]; subtotal: number; descTotal: number; total: number; membAplicada: boolean } {
  let subtotal = 0
  let descTotal = 0
  let total = 0
  let membAplicada = false
  const out: LineaCobroDesc[] = []
  for (const l of lineas) {
    const bruto = Math.max(0, l.bruto || 0)
    const { pct, motivo } = descuentoEfectivo(l.categoria, pctEdad, motivoEdad, b)
    const descMonto = round2(bruto * pct / 100)
    const neto = round2(bruto - descMonto)
    if (motivo === 'Plan médico' || motivo === 'Consulta gratis') membAplicada = true
    subtotal += bruto
    descTotal += descMonto
    total += neto
    out.push({ categoria: l.categoria, bruto, pct, descMonto, neto, motivo })
  }
  return { lineas: out, subtotal: round2(subtotal), descTotal: round2(descTotal), total: round2(total), membAplicada }
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
