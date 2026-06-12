/** Utilidades — Planilla y comisiones médicas */

export type CategoriaComision =
  | 'CONSULTA' | 'MEDICAMENTO' | 'SERVICIO' | 'ULTRASONIDO' | 'CITOLOGIA'
  | 'LABORATORIO' | 'HEMOGRAMA' | 'SUTURA' | 'ENFERMERIA' | 'OXIGENOTERAPIA' | 'HOSPITALIZACION'

export interface ReglaComision {
  clave: CategoriaComision
  nombre: string
  porcentaje: number
}

export const COMISIONES_DEFAULT: ReglaComision[] = [
  { clave: 'CONSULTA',        nombre: 'Consulta médica',         porcentaje: 50 },
  { clave: 'MEDICAMENTO',     nombre: 'Medicamentos',             porcentaje: 8 },
  { clave: 'SERVICIO',        nombre: 'Servicios (general)',     porcentaje: 30 },
  { clave: 'ULTRASONIDO',     nombre: 'Ultrasonidos',            porcentaje: 40 },
  { clave: 'CITOLOGIA',       nombre: 'Citologías',              porcentaje: 20 },
  { clave: 'LABORATORIO',     nombre: 'Laboratorio',             porcentaje: 10 },
  { clave: 'HEMOGRAMA',       nombre: 'Hemogramas',              porcentaje: 10 },
  { clave: 'SUTURA',          nombre: 'Suturas',                 porcentaje: 30 },
  { clave: 'ENFERMERIA',      nombre: 'Servicios de enfermería', porcentaje: 30 },
  { clave: 'OXIGENOTERAPIA',  nombre: 'Oxigenoterapia',          porcentaje: 30 },
  { clave: 'HOSPITALIZACION', nombre: 'Hospitalización',         porcentaje: 40 },
]

export function fmtL(n: number) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

/** Clasifica un servicio/lab por nombre */
export function clasificarServicio(nombre: string, tipo?: string): CategoriaComision {
  const n = (nombre + ' ' + (tipo || '')).toLowerCase()
  if (/ultra\s*son|ultrasonido|ecograf/i.test(n)) return 'ULTRASONIDO'
  if (/cito\s*log/i.test(n)) return 'CITOLOGIA'
  if (/hemograma/i.test(n)) return 'HEMOGRAMA'
  if (/sutura|suturas/i.test(n)) return 'SUTURA'
  if (/ox[ií]geno|oxigenoterapia/i.test(n)) return 'OXIGENOTERAPIA'
  if (/hospital/i.test(n)) return 'HOSPITALIZACION'
  if (/enfermer|inyecc|nebuliz|curaci|toma de presi|control de gluc|terapia respir/i.test(n)) return 'ENFERMERIA'
  if (/laboratorio|orina|embarazo|glicemia|análisis|analisis/i.test(n)) return 'LABORATORIO'
  return 'SERVICIO'
}

export function porcentajeComision(
  categoria: CategoriaComision,
  reglas: ReglaComision[] = COMISIONES_DEFAULT,
): number {
  return reglas.find(r => r.clave === categoria)?.porcentaje ?? 30
}

export function calcularComision(montoNeto: number, porcentaje: number) {
  return Math.round(montoNeto * (porcentaje / 100) * 100) / 100
}

/** Quincena 1 = días 1-15, quincena 2 = 16-fin */
export function rangoQuincena(anio: number, mes: number, quincena: 1 | 2) {
  const ultimo = new Date(anio, mes, 0).getDate()
  if (quincena === 1) {
    return {
      fecha_inicio: `${anio}-${String(mes).padStart(2, '0')}-01`,
      fecha_fin:    `${anio}-${String(mes).padStart(2, '0')}-15`,
    }
  }
  return {
    fecha_inicio: `${anio}-${String(mes).padStart(2, '0')}-16`,
    fecha_fin:    `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`,
  }
}

export function labelQuincena(quincena: 1 | 2, mes: number, anio: number) {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const r = rangoQuincena(anio, mes, quincena)
  return `Q${quincena} ${meses[mes - 1]} ${anio} (${r.fecha_inicio.slice(8)} al ${r.fecha_fin.slice(8)})`
}

export interface LineaProduccion {
  sucursal_id: number
  consulta_id: number
  doctor_id: string
  categoria_comision: CategoriaComision
  descripcion: string
  monto_bruto: number
  descuento: number
  monto_neto: number
  porcentaje_comision: number
  comision_monto: number
  fecha: string
}

/** Genera líneas de producción al cobrar una consulta */
export function generarLineasProduccion(opts: {
  sucursal_id: number
  consulta_id: number
  doctor_id: string
  fecha: string
  pctDescuento: number
  consulta: number
  servicios: { nombre: string; tipo?: string; precio: number; cantidad?: number }[]
  medicamentos: number
  laboratorio: number
  labItems?: { nombre: string; importe: number }[]
  reglas?: ReglaComision[]
}): LineaProduccion[] {
  const reglas = opts.reglas ?? COMISIONES_DEFAULT
  const factor = 1 - (opts.pctDescuento / 100)
  const lineas: LineaProduccion[] = []

  const push = (
    cat: CategoriaComision,
    desc: string,
    bruto: number,
  ) => {
    if (bruto <= 0) return
    const descuento = bruto * (opts.pctDescuento / 100)
    const neto = bruto - descuento
    const pct = porcentajeComision(cat, reglas)
    lineas.push({
      sucursal_id: opts.sucursal_id,
      consulta_id: opts.consulta_id,
      doctor_id: opts.doctor_id,
      categoria_comision: cat,
      descripcion: desc,
      monto_bruto: bruto,
      descuento,
      monto_neto: neto,
      porcentaje_comision: pct,
      comision_monto: calcularComision(neto, pct),
      fecha: opts.fecha,
    })
  }

  if (opts.consulta > 0) {
    push('CONSULTA', 'Consulta médica', opts.consulta)
  }

  for (const s of opts.servicios) {
    const bruto = (s.precio || 0) * (s.cantidad || 1)
    const cat = clasificarServicio(s.nombre, s.tipo)
    push(cat, s.nombre, bruto)
  }

  if (opts.medicamentos > 0) {
    push('MEDICAMENTO', 'Medicamentos', opts.medicamentos)
  }

  if (opts.labItems && opts.labItems.length > 0) {
    for (const lab of opts.labItems) {
      const cat = clasificarServicio(lab.nombre)
      push(cat, lab.nombre, lab.importe || 0)
    }
  } else if (opts.laboratorio > 0) {
    push('LABORATORIO', 'Laboratorio', opts.laboratorio)
  }

  return lineas
}

/** Sueldo fijo: cada quincena = 50% del mensual (pago total el día 1 del mes siguiente) */
export function sueldoQuincena(sueldoMensual: number, _quincena: 1 | 2) {
  if (!sueldoMensual) return 0
  return sueldoMensual / 2
}
