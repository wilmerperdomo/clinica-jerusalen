/** Análisis avanzado — presupuestos, flujo, patrimonio, decisiones */

import { fmtFin, type FinAmbito, type FinMovimiento, type FinPrestamo, type FinTarjeta, type FinDeuda } from './finanzas-personales'

export type FinPresupuesto = {
  id: number
  anio: number
  mes: number
  clave: string
  etiqueta: string
  ambito?: FinAmbito | null
  categoria_clave?: string | null
  monto_limite: number
  activo: boolean
}

export type FinCuenta = {
  id: number
  nombre: string
  tipo: 'EFECTIVO' | 'BANCO' | 'CAJA_CLINICA'
  ambito: FinAmbito
  banco?: string | null
  saldo_actual: number
  activo: boolean
  notas?: string | null
}

export type FinPagoProgramado = {
  id: number
  titulo: string
  monto: number
  dia_mes?: number | null
  fecha_especifica?: string | null
  recurrente: boolean
  tipo: string
  ambito: FinAmbito
  activo: boolean
  notas?: string | null
}

export type PresupuestoUso = FinPresupuesto & {
  gastado: number
  pct: number
  excedido: boolean
  restante: number
}

export type GastoRanking = {
  descripcion: string
  categoria: string
  ambito: string
  monto: number
  fecha: string
  esFijo: boolean
}

export type ComparacionMes = {
  ingresosClinica: { actual: number; anterior: number; variacion: number | null }
  egresosClinica: { actual: number; anterior: number; variacion: number | null }
  utilidadClinica: { actual: number; anterior: number; variacion: number | null }
  gastosPersonales: { actual: number; anterior: number; variacion: number | null }
  gastosCasa: { actual: number; anterior: number; variacion: number | null }
  deudaTotal: { actual: number; anterior: number; variacion: number | null }
}

export type EventoCalendario = {
  id: string
  fecha: string
  dia: number
  titulo: string
  monto: number
  tipo: string
  ambito: string
  origen: 'tarjeta' | 'prestamo' | 'deuda' | 'programado' | 'planilla'
  urgente: boolean
}

export type FlujoProyectado = {
  ingresosEsperados: number
  egresosRegistrados: number
  pagosPendientesMes: number
  saldoCuentas: number
  flujoNetoMes: number
  proyeccionFinMes: number
  alertaFaltaDinero: boolean
  diasRestantes: number
}

export type RecomendacionDeuda = {
  id: string
  nombre: string
  tipo: string
  saldo: number
  tasa?: number | null
  cuota?: number | null
  prioridad: number
  razon: string
  montoSugerido: number
}

export type EstadoPatrimonio = {
  efectivoDisponible: number
  cuentasPorCobrar: number
  activoLiquido: number
  tarjetas: number
  prestamos: number
  otrasDeudas: number
  cxp: number
  pasivoTotal: number
  patrimonioNeto: number
}

export type ReporteEjecutivo = {
  periodo: string
  gananciaReal: number
  utilidadClinica: number
  gastosCasa: number
  gastosClinicaManual: number
  pasivoTotal: number
  patrimonioNeto: number
  flujo: FlujoProyectado
  topGastos: GastoRanking[]
  presupuestosExcedidos: PresupuestoUso[]
  comparacion: ComparacionMes
  calendarioProximos: EventoCalendario[]
  deudasPrioridad: RecomendacionDeuda[]
  alertas: string[]
}

export const PLANTILLAS_PRESUPUESTO = [
  { clave: 'AMB_CLINICA', etiqueta: 'Gastos clínica (manual)', ambito: 'CLINICA' as FinAmbito },
  { clave: 'AMB_CASA', etiqueta: 'Gastos casa', ambito: 'CASA' as FinAmbito },
  { clave: 'AMB_PERSONAL', etiqueta: 'Gastos personales', ambito: 'PERSONAL' as FinAmbito },
  { clave: 'COMBUSTIBLE', etiqueta: 'Combustible', ambito: 'CLINICA' as FinAmbito, categoria_clave: 'COMBUSTIBLE' },
  { clave: 'MEDICAMENTOS', etiqueta: 'Medicamentos sin factura', ambito: 'CLINICA' as FinAmbito, categoria_clave: 'MEDICAMENTOS_SF' },
  { clave: 'TARJETAS', etiqueta: 'Pagos tarjetas', ambito: 'PERSONAL' as FinAmbito, categoria_clave: 'TARJETA_CREDITO' },
  { clave: 'PRESTAMOS', etiqueta: 'Préstamos', ambito: 'PERSONAL' as FinAmbito, categoria_clave: 'PRESTAMOS' },
  { clave: 'ARRIENDO', etiqueta: 'Arriendo / hipoteca', ambito: 'CASA' as FinAmbito, categoria_clave: 'CASA_ARRIENDO' },
  { clave: 'SERVICIOS', etiqueta: 'Luz, agua, internet', ambito: 'CASA' as FinAmbito, categoria_clave: 'SERVICIOS_BASIC' },
  { clave: 'PLANILLA', etiqueta: 'Planilla (referencia)', ambito: 'CLINICA' as FinAmbito },
]

export function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 }
  return { anio, mes: mes - 1 }
}

export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null
  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

function gastoAmbito(movs: FinMovimiento[], ambito: FinAmbito): number {
  return movs.filter(m => m.tipo === 'EGRESO' && (m.ambito ?? 'PERSONAL') === ambito)
    .reduce((s, m) => s + Number(m.monto), 0)
}

function gastoCategoria(movs: FinMovimiento[], clave: string): number {
  return movs.filter(m => m.tipo === 'EGRESO' && m.categoria?.clave === clave)
    .reduce((s, m) => s + Number(m.monto), 0)
}

export function calcularUsoPresupuestos(
  presupuestos: FinPresupuesto[],
  movimientos: FinMovimiento[],
  extras: { planilla?: number; egresosClinicaSistema?: number },
): PresupuestoUso[] {
  return presupuestos.filter(p => p.activo).map(p => {
    let gastado = 0
    if (p.clave === 'PLANILLA') gastado = extras.planilla ?? 0
    else if (p.categoria_clave) gastado = gastoCategoria(movimientos, p.categoria_clave)
    else if (p.ambito) gastado = gastoAmbito(movimientos, p.ambito)
    const limite = Number(p.monto_limite)
    const pct = limite > 0 ? Math.round((gastado / limite) * 100) : 0
    return {
      ...p,
      gastado,
      pct,
      excedido: gastado > limite,
      restante: Math.max(0, limite - gastado),
    }
  }).sort((a, b) => b.pct - a.pct)
}

export function calcularRankingGastos(movimientos: FinMovimiento[], limite = 10): GastoRanking[] {
  return movimientos
    .filter(m => m.tipo === 'EGRESO')
    .map(m => ({
      descripcion: m.descripcion,
      categoria: m.categoria?.nombre ?? 'Sin categoría',
      ambito: m.ambito ?? 'PERSONAL',
      monto: Number(m.monto),
      fecha: m.fecha,
      esFijo: Boolean(m.es_gasto_fijo),
    }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, limite)
}

export function calcularComparacionMes(opts: {
  utilidadClinicaActual: number
  utilidadClinicaAnterior: number
  ingresosClinicaActual: number
  ingresosClinicaAnterior: number
  egresosClinicaActual: number
  egresosClinicaAnterior: number
  movActual: FinMovimiento[]
  movAnterior: FinMovimiento[]
  deudaActual: number
  deudaAnterior: number
}): ComparacionMes {
  const v = (a: number, b: number) => variacionPct(a, b)
  return {
    ingresosClinica: { actual: opts.ingresosClinicaActual, anterior: opts.ingresosClinicaAnterior, variacion: v(opts.ingresosClinicaActual, opts.ingresosClinicaAnterior) },
    egresosClinica: { actual: opts.egresosClinicaActual, anterior: opts.egresosClinicaAnterior, variacion: v(opts.egresosClinicaActual, opts.egresosClinicaAnterior) },
    utilidadClinica: { actual: opts.utilidadClinicaActual, anterior: opts.utilidadClinicaAnterior, variacion: v(opts.utilidadClinicaActual, opts.utilidadClinicaAnterior) },
    gastosPersonales: { actual: gastoAmbito(opts.movActual, 'PERSONAL') + gastoAmbito(opts.movActual, 'CLINICA') + gastoAmbito(opts.movActual, 'CASA'), anterior: gastoAmbito(opts.movAnterior, 'PERSONAL') + gastoAmbito(opts.movAnterior, 'CLINICA') + gastoAmbito(opts.movAnterior, 'CASA'), variacion: v(gastoAmbito(opts.movActual, 'PERSONAL') + gastoAmbito(opts.movActual, 'CLINICA') + gastoAmbito(opts.movActual, 'CASA'), gastoAmbito(opts.movAnterior, 'PERSONAL') + gastoAmbito(opts.movAnterior, 'CLINICA') + gastoAmbito(opts.movAnterior, 'CASA')) },
    gastosCasa: { actual: gastoAmbito(opts.movActual, 'CASA'), anterior: gastoAmbito(opts.movAnterior, 'CASA'), variacion: v(gastoAmbito(opts.movActual, 'CASA'), gastoAmbito(opts.movAnterior, 'CASA')) },
    deudaTotal: { actual: opts.deudaActual, anterior: opts.deudaAnterior, variacion: v(opts.deudaActual, opts.deudaAnterior) },
  }
}

function fechaEnMes(anio: number, mes: number, dia: number): string {
  const d = Math.min(dia, new Date(anio, mes, 0).getDate())
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function generarCalendarioPagos(opts: {
  anio: number
  mes: number
  tarjetas: FinTarjeta[]
  prestamos: FinPrestamo[]
  deudas: FinDeuda[]
  programados: FinPagoProgramado[]
  planillaMonto?: number
  planillaDia?: number
}): EventoCalendario[] {
  const { anio, mes } = opts
  const hoy = new Date()
  const eventos: EventoCalendario[] = []

  for (const t of opts.tarjetas.filter(x => x.activo && x.dia_pago)) {
    const fecha = fechaEnMes(anio, mes, t.dia_pago!)
    const dias = Math.ceil((new Date(fecha).getTime() - hoy.getTime()) / 86400000)
    eventos.push({
      id: `tarj-${t.id}`,
      fecha,
      dia: t.dia_pago!,
      titulo: `Pago tarjeta: ${t.alias}`,
      monto: Number(t.pago_minimo || t.saldo_actual),
      tipo: 'TARJETA',
      ambito: t.ambito === 'MIXTO' ? 'PERSONAL' : t.ambito,
      origen: 'tarjeta',
      urgente: dias >= 0 && dias <= 5,
    })
  }

  for (const p of opts.prestamos.filter(x => x.activo && x.cuota_mensual)) {
    const dia = p.fecha_inicio ? new Date(p.fecha_inicio).getDate() : 15
    const fecha = fechaEnMes(anio, mes, dia)
    eventos.push({
      id: `prest-${p.id}`,
      fecha,
      dia,
      titulo: `Cuota: ${p.nombre}`,
      monto: Number(p.cuota_mensual),
      tipo: 'PRESTAMO',
      ambito: p.ambito ?? 'PERSONAL',
      origen: 'prestamo',
      urgente: false,
    })
  }

  for (const d of opts.deudas.filter(x => x.activo && x.fecha_vencimiento)) {
    const fv = d.fecha_vencimiento!
    if (fv.startsWith(`${anio}-${String(mes).padStart(2, '0')}`)) {
      const dias = Math.ceil((new Date(fv).getTime() - hoy.getTime()) / 86400000)
      eventos.push({
        id: `deuda-${d.id}`,
        fecha: fv,
        dia: new Date(fv).getDate(),
        titulo: d.nombre,
        monto: Number(d.saldo_pendiente),
        tipo: d.tipo,
        ambito: d.ambito,
        origen: 'deuda',
        urgente: dias >= 0 && dias <= 7,
      })
    }
  }

  for (const pg of opts.programados.filter(x => x.activo)) {
    if (pg.recurrente && pg.dia_mes) {
      eventos.push({
        id: `prog-${pg.id}`,
        fecha: fechaEnMes(anio, mes, pg.dia_mes),
        dia: pg.dia_mes,
        titulo: pg.titulo,
        monto: Number(pg.monto),
        tipo: pg.tipo,
        ambito: pg.ambito,
        origen: 'programado',
        urgente: false,
      })
    } else if (pg.fecha_especifica?.startsWith(`${anio}-${String(mes).padStart(2, '0')}`)) {
      eventos.push({
        id: `prog-${pg.id}`,
        fecha: pg.fecha_especifica,
        dia: new Date(pg.fecha_especifica).getDate(),
        titulo: pg.titulo,
        monto: Number(pg.monto),
        tipo: pg.tipo,
        ambito: pg.ambito,
        origen: 'programado',
        urgente: false,
      })
    }
  }

  if (opts.planillaMonto && opts.planillaMonto > 0) {
    const dia = opts.planillaDia ?? 15
    eventos.push({
      id: 'planilla',
      fecha: fechaEnMes(anio, mes, dia),
      dia,
      titulo: 'Planilla quincenal / mensual',
      monto: opts.planillaMonto,
      tipo: 'PLANILLA',
      ambito: 'CLINICA',
      origen: 'planilla',
      urgente: false,
    })
  }

  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function calcularFlujoProyectado(opts: {
  anio: number
  mes: number
  ingresosClinicaMes: number
  ingresosPersonalMes: number
  egresosRegistradosMes: number
  egresosClinicaSistema: number
  calendario: EventoCalendario[]
  cuentas: FinCuenta[]
  hoy?: Date
}): FlujoProyectado {
  const hoy = opts.hoy ?? new Date()
  const ultimoDia = new Date(opts.anio, opts.mes, 0).getDate()
  const diaActual = hoy.getMonth() + 1 === opts.mes && hoy.getFullYear() === opts.anio
    ? hoy.getDate()
    : ultimoDia
  const diasRestantes = Math.max(0, ultimoDia - diaActual)

  const ingresosEsperados = opts.ingresosClinicaMes + opts.ingresosPersonalMes
  const pagosPendientesMes = opts.calendario
    .filter(e => e.dia >= diaActual)
    .reduce((s, e) => s + e.monto, 0)
  const saldoCuentas = opts.cuentas.filter(c => c.activo).reduce((s, c) => s + Number(c.saldo_actual), 0)
  const egresosTotales = opts.egresosRegistradosMes + opts.egresosClinicaSistema
  const flujoNetoMes = ingresosEsperados - egresosTotales - pagosPendientesMes
  const proyeccionFinMes = saldoCuentas + flujoNetoMes

  return {
    ingresosEsperados,
    egresosRegistrados: egresosTotales,
    pagosPendientesMes,
    saldoCuentas,
    flujoNetoMes,
    proyeccionFinMes,
    alertaFaltaDinero: proyeccionFinMes < 0,
    diasRestantes,
  }
}

export function recomendarOrdenPagos(
  prestamos: FinPrestamo[],
  tarjetas: FinTarjeta[],
  deudas: FinDeuda[],
): RecomendacionDeuda[] {
  const items: RecomendacionDeuda[] = []

  for (const t of tarjetas.filter(x => x.activo && x.saldo_actual > 0)) {
    const tasa = Number(t.tasa_interes || 0)
    items.push({
      id: `tarj-${t.id}`,
      nombre: t.alias,
      tipo: 'Tarjeta de crédito',
      saldo: Number(t.saldo_actual),
      tasa: tasa || null,
      cuota: t.pago_minimo ? Number(t.pago_minimo) : null,
      prioridad: 0,
      razon: tasa > 0 ? `Tasa ${tasa}% — conviene bajar saldo antes del corte` : 'Saldo alto en tarjeta',
      montoSugerido: Number(t.pago_minimo || t.saldo_actual),
    })
  }

  for (const p of prestamos.filter(x => x.activo && x.saldo_pendiente > 0)) {
    const tasa = Number(p.tasa_interes || 0)
    items.push({
      id: `prest-${p.id}`,
      nombre: p.nombre,
      tipo: 'Préstamo',
      saldo: Number(p.saldo_pendiente),
      tasa: tasa || null,
      cuota: p.cuota_mensual ? Number(p.cuota_mensual) : null,
      prioridad: 0,
      razon: tasa > 0 ? `Interés ${tasa}% anual` : 'Reduce pasivo a largo plazo',
      montoSugerido: Number(p.cuota_mensual || p.saldo_pendiente),
    })
  }

  for (const d of deudas.filter(x => x.activo && x.saldo_pendiente > 0)) {
    const urgente = d.fecha_vencimiento
      ? Math.ceil((new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86400000) <= 14
      : false
    items.push({
      id: `deuda-${d.id}`,
      nombre: d.nombre,
      tipo: d.tipo,
      saldo: Number(d.saldo_pendiente),
      prioridad: 0,
      razon: urgente ? 'Vence pronto — prioridad alta' : 'Deuda pendiente',
      montoSugerido: Number(d.saldo_pendiente),
    })
  }

  items.sort((a, b) => {
    const ta = a.tasa ?? 0
    const tb = b.tasa ?? 0
    if (tb !== ta) return tb - ta
    return b.saldo - a.saldo
  })

  return items.map((item, i) => ({ ...item, prioridad: i + 1 }))
}

export function calcularEstadoPatrimonio(opts: {
  cuentas: FinCuenta[]
  cxc: number
  tarjetas: number
  prestamos: number
  deudas: number
  cxp: number
}): EstadoPatrimonio {
  const efectivoDisponible = opts.cuentas.filter(c => c.activo).reduce((s, c) => s + Number(c.saldo_actual), 0)
  const activoLiquido = efectivoDisponible + opts.cxc
  const pasivoTotal = opts.tarjetas + opts.prestamos + opts.deudas + opts.cxp
  return {
    efectivoDisponible,
    cuentasPorCobrar: opts.cxc,
    activoLiquido,
    tarjetas: opts.tarjetas,
    prestamos: opts.prestamos,
    otrasDeudas: opts.deudas,
    cxp: opts.cxp,
    pasivoTotal,
    patrimonioNeto: activoLiquido - pasivoTotal,
  }
}

export function generarReporteEjecutivo(opts: {
  periodo: string
  gananciaReal: number
  utilidadClinica: number
  gastosCasa: number
  gastosClinicaManual: number
  pasivoTotal: number
  patrimonio: EstadoPatrimonio
  flujo: FlujoProyectado
  topGastos: GastoRanking[]
  presupuestos: PresupuestoUso[]
  comparacion: ComparacionMes
  calendario: EventoCalendario[]
  deudasPrioridad: RecomendacionDeuda[]
}): ReporteEjecutivo {
  const alertas: string[] = []
  if (opts.flujo.alertaFaltaDinero) alertas.push('Proyección negativa a fin de mes — revise pagos pendientes')
  const excedidos = opts.presupuestos.filter(p => p.excedido)
  if (excedidos.length) alertas.push(`${excedidos.length} presupuesto(s) excedido(s)`)
  const urgentes = opts.calendario.filter(e => e.urgente)
  if (urgentes.length) alertas.push(`${urgentes.length} pago(s) urgente(s) esta semana`)
  if (opts.patrimonio.patrimonioNeto < 0) alertas.push('Patrimonio neto negativo — pasivo mayor que activo líquido')

  return {
    periodo: opts.periodo,
    gananciaReal: opts.gananciaReal,
    utilidadClinica: opts.utilidadClinica,
    gastosCasa: opts.gastosCasa,
    gastosClinicaManual: opts.gastosClinicaManual,
    pasivoTotal: opts.pasivoTotal,
    patrimonioNeto: opts.patrimonio.patrimonioNeto,
    flujo: opts.flujo,
    topGastos: opts.topGastos,
    presupuestosExcedidos: excedidos,
    comparacion: opts.comparacion,
    calendarioProximos: opts.calendario.filter(e => e.urgente || e.dia >= new Date().getDate()).slice(0, 8),
    deudasPrioridad: opts.deudasPrioridad.slice(0, 5),
    alertas,
  }
}

export function fmtVariacion(v: number | null): string {
  if (v === null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v}%`
}

export function exportarReporteEjecutivoHtml(r: ReporteEjecutivo): string {
  const filasGastos = r.topGastos.map(g =>
    `<tr><td>${g.descripcion}</td><td>${g.categoria}</td><td>${g.ambito}</td><td class="right">${fmtFin(g.monto)}</td></tr>`,
  ).join('')
  const filasDeudas = r.deudasPrioridad.map(d =>
    `<tr><td>${d.prioridad}</td><td>${d.nombre}</td><td>${d.razon}</td><td class="right">${fmtFin(d.montoSugerido)}</td></tr>`,
  ).join('')
  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-lbl">Ganancia real</div><div class="kpi-val">${fmtFin(r.gananciaReal)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Patrimonio neto</div><div class="kpi-val">${fmtFin(r.patrimonioNeto)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Proyección fin mes</div><div class="kpi-val">${fmtFin(r.flujo.proyeccionFinMes)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Pasivo total</div><div class="kpi-val danger">${fmtFin(r.pasivoTotal)}</div></div>
    </div>
    ${r.alertas.length ? `<p><strong>Alertas:</strong> ${r.alertas.join(' · ')}</p>` : ''}
    <h2>Top gastos del mes</h2>
    <table><thead><tr><th>Descripción</th><th>Categoría</th><th>Ámbito</th><th class="right">Monto</th></tr></thead><tbody>${filasGastos}</tbody></table>
    <h2>Prioridad de pagos de deuda</h2>
    <table><thead><tr><th>#</th><th>Deuda</th><th>Razón</th><th class="right">Sugerido</th></tr></thead><tbody>${filasDeudas}</tbody></table>
  `
}
