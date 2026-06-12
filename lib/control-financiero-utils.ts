/** Utilidades — Control financiero mensual por sucursal */

export function fmtL(n: number) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

export interface MovimientoCaja {
  tipo: string
  concepto: string
  monto: number
  fecha: string
  sucursal_id?: number
}

export interface ResumenFinanciero {
  ingresos_total: number
  egresos_total: number
  utilidad: number
  por_categoria: {
    consultas: number
    medicamentos: number
    servicios: number
    laboratorio: number
    otros_ingresos: number
  }
  egresos_por_tipo: {
    compras: number
    nomina: number
    gastos_fijos: number
    otros: number
  }
}

function clasificarIngreso(concepto: string): keyof ResumenFinanciero['por_categoria'] {
  const c = concepto.toLowerCase()
  if (c.includes('consulta')) return 'consultas'
  if (c.includes('medicamento') || c.includes('farmacia')) return 'medicamentos'
  if (c.includes('laboratorio') || c.includes('análisis') || c.includes('analisis')) return 'laboratorio'
  if (c.includes('servicio')) return 'servicios'
  return 'otros_ingresos'
}

function clasificarEgreso(concepto: string): keyof ResumenFinanciero['egresos_por_tipo'] {
  const c = concepto.toLowerCase()
  if (c.includes('compra') || c.includes('proveedor')) return 'compras'
  if (c.includes('nómina') || c.includes('nomina') || c.includes('sueldo') || c.includes('planilla')) return 'nomina'
  if (c.includes('gasto fijo') || c.includes('arriendo') || c.includes('luz') || c.includes('agua')) return 'gastos_fijos'
  return 'otros'
}

export function calcularResumen(
  movimientos: MovimientoCaja[],
  comprasTotal = 0,
): ResumenFinanciero {
  const res: ResumenFinanciero = {
    ingresos_total: 0,
    egresos_total: 0,
    utilidad: 0,
    por_categoria: { consultas: 0, medicamentos: 0, servicios: 0, laboratorio: 0, otros_ingresos: 0 },
    egresos_por_tipo: { compras: 0, nomina: 0, gastos_fijos: 0, otros: 0 },
  }

  for (const m of movimientos) {
    const tipo = (m.tipo || '').toUpperCase()
    const monto = Number(m.monto) || 0
    if (tipo === 'INGRESO') {
      res.ingresos_total += monto
      const cat = clasificarIngreso(m.concepto || '')
      res.por_categoria[cat] += monto
    } else if (tipo === 'EGRESO') {
      res.egresos_total += monto
      const cat = clasificarEgreso(m.concepto || '')
      res.egresos_por_tipo[cat] += monto
    }
  }

  res.egresos_por_tipo.compras += comprasTotal
  res.egresos_total += comprasTotal
  res.utilidad = res.ingresos_total - res.egresos_total
  return res
}

export function mesLabel(anio: number, mes: number) {
  const d = new Date(anio, mes - 1, 1)
  return d.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })
}

export function rangoMes(anio: number, mes: number) {
  const ultimo = new Date(anio, mes, 0).getDate()
  return {
    inicio: `${anio}-${String(mes).padStart(2, '0')}-01`,
    fin:    `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`,
  }
}

export const LABEL_PRODUCCION: Record<string, string> = {
  CONSULTA: 'Consultas',
  MEDICAMENTO: 'Medicamentos',
  SERVICIO: 'Servicios',
  ULTRASONIDO: 'Ultrasonidos',
  CITOLOGIA: 'Citologías',
  LABORATORIO: 'Laboratorio',
  HEMOGRAMA: 'Hemogramas',
  SUTURA: 'Suturas',
  ENFERMERIA: 'Enfermería',
  OXIGENOTERAPIA: 'Oxigenoterapia',
  HOSPITALIZACION: 'Hospitalización',
}

export function labelProduccion(clave: string) {
  return LABEL_PRODUCCION[clave] ?? clave
}

function escCsv(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`
}

function filaSeccion(titulo: string) {
  return [escCsv(`--- ${titulo} ---`), '', '', '', '']
}

function descargarCsv(nombre: string, lineas: string[]) {
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export interface DatosExportFinanciero {
  periodo: string
  sucursalLabel: string
  resumen: ResumenFinanciero
  categorias: { label: string; monto: number; pct: string }[]
  porSucursal: { nombre: string; ingresos_total: number; egresos_total: number; utilidad: number }[]
  produccion: { label: string; monto: number; comision: number }[]
  totalComisiones: number
  movimientos: { fecha: string; tipo: string; concepto: string; monto: number; sucursal: string }[]
  compras: { fecha: string; total: number; sucursal: string; estado?: string }[]
  cxcPendiente?: number
  cxpPendiente?: number
}

/** CSV completo — abre en Excel con todas las secciones */
export function exportarControlFinanciero(datos: DatosExportFinanciero) {
  const L: string[] = []

  L.push([escCsv('CLÍNICA MÉDICA JERUSALÉN — Control Financiero'), '', '', '', ''].join(','))
  L.push([escCsv(datos.periodo), escCsv(datos.sucursalLabel), '', '', ''].join(','))
  L.push('')

  L.push(filaSeccion('RESUMEN GENERAL').join(','))
  L.push([escCsv('Concepto'), escCsv('Monto (L)')].join(','))
  L.push([escCsv('Ingresos totales'), datos.resumen.ingresos_total].join(','))
  L.push([escCsv('Gastos totales'), datos.resumen.egresos_total].join(','))
  L.push([escCsv('Utilidad neta'), datos.resumen.utilidad].join(','))
  L.push([escCsv('Comisiones médicos (referencia)'), datos.totalComisiones].join(','))
  if (datos.cxcPendiente != null) {
    L.push([escCsv('Cuentas por cobrar pendientes'), datos.cxcPendiente].join(','))
  }
  if (datos.cxpPendiente != null) {
    L.push([escCsv('Cuentas por pagar pendientes'), datos.cxpPendiente].join(','))
  }
  L.push('')

  L.push(filaSeccion('INGRESOS POR CATEGORÍA').join(','))
  L.push([escCsv('Categoría'), escCsv('Monto (L)'), escCsv('% del total')].join(','))
  for (const c of datos.categorias) {
    L.push([escCsv(c.label), c.monto, escCsv(c.pct)].join(','))
  }
  L.push('')

  L.push(filaSeccion('GASTOS POR TIPO').join(','))
  L.push([escCsv('Tipo'), escCsv('Monto (L)')].join(','))
  L.push([escCsv('Compras a proveedores'), datos.resumen.egresos_por_tipo.compras].join(','))
  L.push([escCsv('Nómina / Planilla'), datos.resumen.egresos_por_tipo.nomina].join(','))
  L.push([escCsv('Gastos fijos'), datos.resumen.egresos_por_tipo.gastos_fijos].join(','))
  L.push([escCsv('Otros egresos caja'), datos.resumen.egresos_por_tipo.otros].join(','))
  L.push('')

  if (datos.porSucursal.length > 0) {
    L.push(filaSeccion('COMPARATIVO POR SUCURSAL').join(','))
    L.push([escCsv('Sucursal'), escCsv('Ingresos'), escCsv('Gastos'), escCsv('Utilidad')].join(','))
    for (const s of datos.porSucursal) {
      L.push([escCsv(s.nombre), s.ingresos_total, s.egresos_total, s.utilidad].join(','))
    }
    L.push('')
  }

  if (datos.produccion.length > 0) {
    L.push(filaSeccion('PRODUCCIÓN MÉDICA POR SERVICIO').join(','))
    L.push([escCsv('Servicio'), escCsv('Producción (L)'), escCsv('Comisión (L)')].join(','))
    for (const p of datos.produccion) {
      L.push([escCsv(p.label), p.monto, p.comision].join(','))
    }
    L.push('')
  }

  L.push(filaSeccion('DETALLE MOVIMIENTOS DE CAJA').join(','))
  L.push([escCsv('Fecha'), escCsv('Tipo'), escCsv('Concepto'), escCsv('Monto (L)'), escCsv('Sucursal')].join(','))
  for (const m of datos.movimientos) {
    L.push([escCsv(m.fecha), escCsv(m.tipo), escCsv(m.concepto), m.monto, escCsv(m.sucursal)].join(','))
  }
  L.push('')

  L.push(filaSeccion('DETALLE COMPRAS DEL PERÍODO').join(','))
  L.push([escCsv('Fecha'), escCsv('Total (L)'), escCsv('Estado'), escCsv('Sucursal')].join(','))
  for (const c of datos.compras) {
    L.push([escCsv(c.fecha), c.total, escCsv(c.estado ?? ''), escCsv(c.sucursal)].join(','))
  }

  const slug = datos.periodo.replace(/\s+/g, '_').toLowerCase()
  descargarCsv(`control_financiero_${slug}`, L)
}

/** Solo movimientos de caja */
export function exportarMovimientosCaja(
  periodo: string,
  movs: DatosExportFinanciero['movimientos'],
) {
  const L = [
    [escCsv('Fecha'), escCsv('Tipo'), escCsv('Concepto'), escCsv('Monto (L)'), escCsv('Sucursal')].join(','),
    ...movs.map(m => [escCsv(m.fecha), escCsv(m.tipo), escCsv(m.concepto), m.monto, escCsv(m.sucursal)].join(',')),
  ]
  descargarCsv(`movimientos_caja_${periodo.replace(/\s+/g, '_')}`, L)
}

/** Resumen por sucursal para vista consolidada */
export function resumenPorSucursal(
  movimientos: MovimientoCaja[],
  compras: { total: number; sucursal_id?: number }[],
  sucursales: { id: number; nombre: string }[],
) {
  return sucursales.map(s => {
    const movs = movimientos.filter(m => m.sucursal_id === s.id)
    const comps = compras.filter(c => c.sucursal_id === s.id)
    const comprasTotal = comps.reduce((a, c) => a + Number(c.total || 0), 0)
    const r = calcularResumen(movs, comprasTotal)
    return { id: s.id, nombre: s.nombre, ...r }
  })
}
