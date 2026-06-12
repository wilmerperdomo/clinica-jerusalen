'use client'

import { BarChart3, Clock, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'
import { etiquetaEstadoLab, type EstadoLab } from '@/lib/lab-estado-utils'
import type { LabReporteStats } from '@/lib/lab-utils'

interface Props {
  stats: LabReporteStats
}

export default function LabReportesPanel({ stats }: Props) {
  const estadosOrden: EstadoLab[] = [
    'PENDIENTE_COBRO', 'PAGADO', 'EN_PROCESO', 'BORRADOR',
    'RESULTADO_LISTO', 'VALIDADO', 'ENTREGADO',
  ]

  const maxCount = Math.max(...estadosOrden.map(e => stats.porEstado[e]), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Órdenes período', value: stats.totalOrdenes, icon: BarChart3, color: 'text-blue-600' },
          { label: 'Pacientes / lotes', value: stats.totalGrupos, icon: TrendingUp, color: 'text-indigo-600' },
          { label: 'Atrasadas (SLA)', value: stats.atrasadas, icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Entregadas hoy', value: stats.entregadasHoy, icon: CheckCircle2, color: 'text-green-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4">
            <k.icon className={`w-5 h-5 ${k.color} mb-2`} />
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-600" /> Distribución por estado
          </h3>
          <div className="space-y-2">
            {estadosOrden.map(e => {
              const n = stats.porEstado[e]
              const pct = Math.round((n / maxCount) * 100)
              return (
                <div key={e} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-gray-600 truncate">{etiquetaEstadoLab(e)}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right font-semibold">{n}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" /> Tiempo promedio de entrega
            </h3>
            <p className="text-3xl font-bold text-gray-900">
              {stats.tiempoPromedioEntrega != null ? `${stats.tiempoPromedioEntrega} días` : '—'}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Ingresos del período</h3>
            <p className="text-xl font-bold text-teal-700">L. {stats.ingresosPeriodo.toFixed(2)}</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Pruebas más solicitadas</h3>
            {stats.topPruebas.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <ul className="text-sm space-y-1">
                {stats.topPruebas.map(t => (
                  <li key={t.nombre} className="flex justify-between">
                    <span className="text-gray-700 truncate">{t.nombre}</span>
                    <span className="font-semibold text-gray-900 ml-2">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
