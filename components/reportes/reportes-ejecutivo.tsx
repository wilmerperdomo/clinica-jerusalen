'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, Line, ComposedChart,
} from 'recharts'
import {
  AlertTriangle, BarChart3, Printer, TrendingUp, TrendingDown,
  DollarSign, Receipt, Stethoscope, FlaskConical,
} from 'lucide-react'
import { ChartCard } from './chart-card'
import { fmtReporte, imprimirReporte } from '@/lib/reporte-utils'
import {
  CHART_COLORS, FORMA_PAGO_COLORS,
  agregarMovimientosPorDia, generarResumenEjecutivo, exportarResumenEjecutivoHtml,
  type DiaFlujo,
} from '@/lib/reportes-analytics'

const fmt = fmtReporte

function fmtTooltip(v: number) {
  return fmt(v)
}

interface Movimiento {
  tipo: string; monto: number; fecha: string; forma_pago?: string; concepto?: string
}

interface Props {
  movimientos: Movimiento[]
  desde: string
  hasta: string
  periodo: string
  totalIng: number
  totalEgr: number
  neto: number
  totalDesc: number
  porForma: { forma: string; total: number; label: string }[]
  porConcepto: [string, number][]
  citasTotal: number
  citasAtendidas: number
  citasNoAsistio: number
  labTotal: number
  labPendiente: number
  cxcSaldo: number
  cxpSaldo: number
  factEmitidas: number
  factAnuladas: number
  fiscalSubtotal: number
  fiscalISV: number
  fiscalTotal: number
  nuevosPacientes: number
  comprasTotal: number
}

export default function ReportesEjecutivo(props: Props) {
  const {
    movimientos, desde, hasta, periodo,
    totalIng, totalEgr, neto, totalDesc,
    porForma, porConcepto,
    citasTotal, citasAtendidas, citasNoAsistio,
    labTotal, labPendiente,
    cxcSaldo, cxpSaldo,
    factEmitidas, factAnuladas,
    fiscalSubtotal, fiscalISV, fiscalTotal,
    nuevosPacientes, comprasTotal,
  } = props

  const flujoDiario: DiaFlujo[] = agregarMovimientosPorDia(movimientos, desde, hasta)

  const datosForma = porForma
    .filter(f => f.total > 0)
    .map(f => ({ name: f.label, value: f.total, key: f.forma }))

  const datosConceptos = porConcepto.slice(0, 8).map(([name, value]) => ({
    name: name.length > 28 ? `${name.slice(0, 26)}…` : name,
    fullName: name,
    value,
  }))

  const citasOtros = Math.max(0, citasTotal - citasAtendidas - citasNoAsistio)
  const datosCitas = [
    { name: 'Atendidas', value: citasAtendidas, color: CHART_COLORS.ingreso },
    { name: 'No asistió', value: citasNoAsistio, color: CHART_COLORS.egreso },
    ...(citasOtros > 0 ? [{ name: 'Otras', value: citasOtros, color: CHART_COLORS.slate }] : []),
  ].filter(d => d.value > 0)

  const datosFiscal = [
    { name: 'Subtotal', value: fiscalSubtotal, fill: CHART_COLORS.neto },
    { name: 'ISV', value: fiscalISV, fill: CHART_COLORS.isv },
    { name: 'Descuentos', value: Math.max(0, fiscalSubtotal + fiscalISV - fiscalTotal), fill: CHART_COLORS.amber },
  ].filter(d => d.value > 0)

  const resumen = generarResumenEjecutivo({
    periodo, totalIng, totalEgr, neto, cxcSaldo, cxpSaldo,
    citasTotal, citasNoAsistio, labPendiente, labTotal,
    totalDesc, factAnuladas, movimientos: movimientos.length,
    factEmitidas, fiscalISV, fiscalTotal, citasAtendidas,
    nuevosPacientes, comprasTotal, porForma,
    topConcepto: porConcepto[0]?.[0],
  })

  function imprimir() {
    const kpisHtml = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-val success">${fmt(totalIng)}</div><div class="kpi-lbl">Ingresos</div></div>
        <div class="kpi"><div class="kpi-val danger">${fmt(totalEgr)}</div><div class="kpi-lbl">Egresos</div></div>
        <div class="kpi"><div class="kpi-val">${fmt(neto)}</div><div class="kpi-lbl">Neto</div></div>
        <div class="kpi"><div class="kpi-val">${fmt(fiscalTotal)}</div><div class="kpi-lbl">Facturación</div></div>
      </div>`
    imprimirReporte({
      titulo: 'Reportes Pro — Resumen Ejecutivo',
      subtitulo: periodo,
      contenidoHtml: kpisHtml + exportarResumenEjecutivoHtml(resumen),
    })
  }

  const tickInterval = flujoDiario.length > 14 ? Math.ceil(flujoDiario.length / 7) : 0

  return (
    <div className="space-y-5">
      {/* Encabezado ejecutivo */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-lg">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-sky-300" />
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">Panel ejecutivo</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">Resumen del período</h2>
            <p className="text-sm text-slate-300 mt-1">{periodo}</p>
            <p className="text-sm text-slate-400 mt-3 max-w-2xl">{resumen.intro}</p>
          </div>
          <button onClick={imprimir}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition">
            <Printer className="w-4 h-4" /> Imprimir resumen
          </button>
        </div>

        {resumen.alertas.length > 0 && (
          <div className="mt-4 bg-amber-500/15 border border-amber-400/30 rounded-xl p-3 space-y-1.5">
            {resumen.alertas.map((a, i) => (
              <p key={i} className="text-sm text-amber-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {a}
              </p>
            ))}
          </div>
        )}

        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-300">
          {resumen.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-sky-400 mt-1">•</span> {h}
            </li>
          ))}
        </ul>
      </div>

      {/* KPIs ampliados */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { icon: TrendingUp, label: 'Ingresos', val: fmt(totalIng), color: 'text-green-600', bg: 'bg-green-50' },
          { icon: TrendingDown, label: 'Egresos', val: fmt(totalEgr), color: 'text-red-600', bg: 'bg-red-50' },
          { icon: DollarSign, label: 'Neto', val: fmt(neto), color: neto >= 0 ? 'text-blue-700' : 'text-red-700', bg: 'bg-blue-50' },
          { icon: Receipt, label: 'Facturación', val: fmt(fiscalTotal), color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { icon: Stethoscope, label: 'Citas atendidas', val: String(citasAtendidas), color: 'text-teal-600', bg: 'bg-teal-50' },
          { icon: FlaskConical, label: 'Lab pendientes', val: String(labPendiente), color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map(k => (
          <div key={k.label} className="bg-white border rounded-xl p-3">
            <div className={`w-8 h-8 ${k.bg} rounded-lg flex items-center justify-center mb-1.5`}>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className={`font-bold text-lg ${k.color}`}>{k.val}</p>
            <p className="text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Flujo diario" subtitle="Ingresos vs egresos por día" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={flujoDiario} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={tickInterval || 'preserveStartEnd'}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `L.${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtTooltip(v)} labelFormatter={(_, p) => {
                  const item = p?.[0]?.payload as DiaFlujo | undefined
                  return item?.fecha || ''
                }} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill={CHART_COLORS.ingreso} radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos" fill={CHART_COLORS.egreso} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="neto" name="Neto" stroke={CHART_COLORS.neto} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Formas de pago" subtitle="Distribución de ingresos">
          <div className="h-64">
            {datosForma.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosForma}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {datosForma.map((d, i) => (
                      <Cell key={d.key} fill={FORMA_PAGO_COLORS[d.key] || CHART_COLORS.slate} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtTooltip(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-16">Sin ingresos en el período</p>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Top conceptos de ingreso" subtitle="Principales fuentes de caja">
          <div className="h-64">
            {datosConceptos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosConceptos} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `L.${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number) => fmtTooltip(v)}
                    labelFormatter={(_, p) => {
                      const item = p?.[0]?.payload as { fullName?: string } | undefined
                      return item?.fullName || ''
                    }}
                  />
                  <Bar dataKey="value" name="Monto" fill={CHART_COLORS.neto} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-16">Sin conceptos registrados</p>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Consultas" subtitle="Estado de citas del período">
          <div className="h-64">
            {datosCitas.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datosCitas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}>
                    {datosCitas.map((d, i) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} citas`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-16">Sin citas en el período</p>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Composición fiscal" subtitle={`${factEmitidas} facturas emitidas`}>
          <div className="h-64">
            {fiscalTotal > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosFiscal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `L.${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtTooltip(v)} />
                  <Bar dataKey="value" name="Monto" radius={[4, 4, 0, 0]}>
                    {datosFiscal.map((d, i) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-16">Sin facturación en el período</p>
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
