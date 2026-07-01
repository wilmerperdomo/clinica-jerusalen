/** Análisis y resumen ejecutivo para Reportes Pro */

import { fmtReporte } from '@/lib/reporte-utils'
import { fechaHN } from '@/lib/fecha-hn'

export const CHART_COLORS = {
  ingreso: '#16a34a',
  egreso: '#dc2626',
  neto: '#2563eb',
  isv: '#4f46e5',
  amber: '#d97706',
  slate: '#64748b',
} as const

export const FORMA_PAGO_COLORS: Record<string, string> = {
  EFECTIVO: '#16a34a',
  TARJETA: '#2563eb',
  TRANSFERENCIA: '#7c3aed',
  CREDITO: '#d97706',
}

export type DiaFlujo = {
  fecha: string
  label: string
  ingresos: number
  egresos: number
  neto: number
}

export type ResumenEjecutivo = {
  periodo: string
  intro: string
  highlights: string[]
  alertas: string[]
}

function diasEnRango(desde: string, hasta: string): string[] {
  const dias: string[] = []
  const d = new Date(`${desde}T12:00:00`)
  const end = new Date(`${hasta}T12:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return dias
  while (d <= end) {
    dias.push(fechaHN(d))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

function fmtDiaCorto(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })
}

export function agregarMovimientosPorDia(
  movimientos: { tipo: string; monto: number; fecha: string }[],
  desde: string,
  hasta: string,
): DiaFlujo[] {
  const map = new Map<string, { fecha: string; ingresos: number; egresos: number }>()
  for (const f of diasEnRango(desde, hasta)) {
    map.set(f, { fecha: f, ingresos: 0, egresos: 0 })
  }
  for (const m of movimientos) {
    const row = map.get(m.fecha)
    if (!row) continue
    if (m.tipo === 'INGRESO') row.ingresos += m.monto
    else if (m.tipo === 'EGRESO') row.egresos += m.monto
  }
  return Array.from(map.values()).map(r => ({
    ...r,
    neto: r.ingresos - r.egresos,
    label: fmtDiaCorto(r.fecha),
  }))
}

export type AlertasInput = {
  totalIng: number
  totalEgr: number
  neto: number
  cxcSaldo: number
  cxpSaldo: number
  citasTotal: number
  citasNoAsistio: number
  labPendiente: number
  labTotal: number
  totalDesc: number
  factAnuladas: number
}

export function generarAlertas(d: AlertasInput): string[] {
  const alertas: string[] = []
  if (d.neto < 0) {
    alertas.push(`Los egresos superan los ingresos en ${fmtReporte(Math.abs(d.neto))} en el período.`)
  }
  if (d.totalIng > 0 && d.cxcSaldo > d.totalIng * 0.5) {
    alertas.push(`CXC pendiente (${fmtReporte(d.cxcSaldo)}) representa más del 50% de los ingresos del período.`)
  } else if (d.cxcSaldo > 50000) {
    alertas.push(`Saldo por cobrar elevado: ${fmtReporte(d.cxcSaldo)}.`)
  }
  if (d.cxpSaldo > 30000) {
    alertas.push(`CXP pendiente por ${fmtReporte(d.cxpSaldo)} — revise vencimientos con proveedores.`)
  }
  if (d.citasTotal > 0 && d.citasNoAsistio / d.citasTotal > 0.2) {
    const pct = Math.round((d.citasNoAsistio / d.citasTotal) * 100)
    alertas.push(`${pct}% de citas registradas como no asistió (${d.citasNoAsistio} de ${d.citasTotal}).`)
  }
  if (d.labTotal > 0 && d.labPendiente / d.labTotal > 0.3) {
    alertas.push(`${d.labPendiente} órdenes de laboratorio aún sin entregar.`)
  }
  if (d.totalIng > 0 && d.totalDesc / d.totalIng > 0.15) {
    const pct = Math.round((d.totalDesc / d.totalIng) * 100)
    alertas.push(`Descuentos del período equivalen al ${pct}% de los ingresos.`)
  }
  if (d.factAnuladas > 0) {
    alertas.push(`${d.factAnuladas} factura(s) anulada(s) en el período — verifique el tab Fiscal.`)
  }
  return alertas
}

export type ResumenInput = AlertasInput & {
  periodo: string
  movimientos: number
  factEmitidas: number
  fiscalISV: number
  fiscalTotal: number
  citasAtendidas: number
  nuevosPacientes: number
  comprasTotal: number
  porForma: { forma: string; total: number; label: string }[]
  topConcepto?: string
}

export function generarResumenEjecutivo(d: ResumenInput): ResumenEjecutivo {
  const alertas = generarAlertas(d)
  const highlights: string[] = []

  highlights.push(
    `Se registraron ${d.movimientos} movimientos de caja con un neto de ${fmtReporte(d.neto)}.`,
  )

  if (d.factEmitidas > 0) {
    highlights.push(
      `${d.factEmitidas} facturas emitidas por ${fmtReporte(d.fiscalTotal)} (ISV ${fmtReporte(d.fiscalISV)}).`,
    )
  }

  if (d.citasAtendidas > 0) {
    highlights.push(`${d.citasAtendidas} consultas atendidas en el período.`)
  }

  if (d.nuevosPacientes > 0) {
    highlights.push(`${d.nuevosPacientes} paciente(s) nuevo(s) registrado(s).`)
  }

  const formaTop = [...d.porForma].filter(f => f.total > 0).sort((a, b) => b.total - a.total)[0]
  if (formaTop && d.totalIng > 0) {
    const pct = Math.round((formaTop.total / d.totalIng) * 100)
    highlights.push(`Principal forma de cobro: ${formaTop.label} (${pct}% de ingresos).`)
  }

  if (d.topConcepto) {
    highlights.push(`Mayor fuente de ingreso: ${d.topConcepto}.`)
  }

  if (d.comprasTotal > 0) {
    highlights.push(`Compras a proveedores: ${fmtReporte(d.comprasTotal)}.`)
  }

  const intro = d.neto >= 0
    ? `El período ${d.periodo} cierra con balance positivo. A continuación, el detalle operativo y financiero.`
    : `El período ${d.periodo} presenta déficit operativo. Revise egresos y cuentas por pagar.`

  return { periodo: d.periodo, intro, highlights, alertas }
}

export function exportarResumenEjecutivoHtml(resumen: ResumenEjecutivo): string {
  const alertasHtml = resumen.alertas.length
    ? `<h2>Alertas</h2><ul>${resumen.alertas.map(a => `<li class="danger">${a}</li>`).join('')}</ul>`
    : ''
  const highlightsHtml = resumen.highlights.map(h => `<li>${h}</li>`).join('')
  return `
    <p>${resumen.intro}</p>
    ${alertasHtml}
    <h2>Puntos clave</h2>
    <ul>${highlightsHtml}</ul>
  `
}
