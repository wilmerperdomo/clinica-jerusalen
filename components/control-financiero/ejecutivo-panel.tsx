'use client'

import { Printer, TrendingUp, TrendingDown, AlertTriangle, BarChart3 } from 'lucide-react'
import { fmtFin } from '@/lib/finanzas-personales'
import {
  fmtVariacion, exportarReporteEjecutivoHtml,
  type ReporteEjecutivo, type ComparacionMes,
} from '@/lib/finanzas-analisis'
import { imprimirReporte } from '@/lib/reporte-utils'

interface Props {
  reporte: ReporteEjecutivo
  comparacion: ComparacionMes
}

function VariacionBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-slate-400 text-xs">—</span>
  const up = v > 0
  const bad = up
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmtVariacion(v)}
    </span>
  )
}

export default function EjecutivoPanel({ reporte, comparacion }: Props) {
  function imprimir() {
    imprimirReporte({
      titulo: 'Reporte Ejecutivo Financiero',
      subtitulo: reporte.periodo,
      contenidoHtml: exportarReporteEjecutivoHtml(reporte),
    })
  }

  const filasComp = [
    { label: 'Utilidad clínica', ...comparacion.utilidadClinica },
    { label: 'Ingresos clínica', ...comparacion.ingresosClinica },
    { label: 'Gastos clínica', ...comparacion.egresosClinica },
    { label: 'Gastos casa', ...comparacion.gastosCasa },
    { label: 'Deuda total', ...comparacion.deudaTotal },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" /> Reporte ejecutivo
        </h3>
        <button onClick={imprimir}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium">
          <Printer className="w-4 h-4" /> Imprimir reporte
        </button>
      </div>

      {reporte.alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          {reporte.alertas.map((a, i) => (
            <p key={i} className="text-sm text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {a}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ganancia real', val: reporte.gananciaReal },
          { label: 'Patrimonio neto', val: reporte.patrimonioNeto },
          { label: 'Proyección fin mes', val: reporte.flujo.proyeccionFinMes },
          { label: 'Pasivo total', val: reporte.pasivoTotal },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="font-bold text-xl text-slate-800">{fmtFin(k.val)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h4 className="font-bold text-slate-800 mb-3">Comparación vs mes anterior</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs">
              <th className="text-left pb-2">Concepto</th>
              <th className="text-right pb-2">Este mes</th>
              <th className="text-right pb-2">Mes anterior</th>
              <th className="text-right pb-2">Variación</th>
            </tr>
          </thead>
          <tbody>
            {filasComp.map(f => (
              <tr key={f.label} className="border-t">
                <td className="py-2.5">{f.label}</td>
                <td className="py-2.5 text-right font-medium">{fmtFin(f.actual)}</td>
                <td className="py-2.5 text-right text-slate-500">{fmtFin(f.anterior)}</td>
                <td className="py-2.5 text-right"><VariacionBadge v={f.variacion} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <h4 className="font-bold text-slate-800 mb-3">Top 10 gastos del mes</h4>
          <ul className="space-y-2 text-sm">
            {reporte.topGastos.map((g, i) => (
              <li key={i} className="flex justify-between gap-2 border-b pb-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{g.descripcion}</p>
                  <p className="text-xs text-slate-500">{g.categoria} · {g.ambito}</p>
                </div>
                <strong className="text-red-600 shrink-0">{fmtFin(g.monto)}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h4 className="font-bold text-slate-800 mb-3">¿Qué deuda pagar primero?</h4>
          <ul className="space-y-3 text-sm">
            {reporte.deudasPrioridad.map(d => (
              <li key={d.id} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">
                  {d.prioridad}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{d.nombre}</p>
                  <p className="text-xs text-slate-500">{d.razon}</p>
                  <p className="text-xs mt-1">Saldo {fmtFin(d.saldo)} · Sugerido {fmtFin(d.montoSugerido)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {reporte.presupuestosExcedidos.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h4 className="font-bold text-red-800 mb-2">Presupuestos excedidos</h4>
          <ul className="text-sm space-y-1">
            {reporte.presupuestosExcedidos.map(p => (
              <li key={p.id} className="flex justify-between text-red-700">
                <span>{p.etiqueta}</span>
                <span>{fmtFin(p.gastado)} / {fmtFin(p.monto_limite)} ({p.pct}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
