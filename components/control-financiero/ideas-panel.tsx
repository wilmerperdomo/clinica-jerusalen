'use client'

import type { ComponentType } from 'react'
import {
  Lightbulb, AlertTriangle, Info, ChevronRight,
  CreditCard, Home, Building2, ClipboardList, Calendar, Clock, Users, TrendingUp, TrendingDown, Landmark,
} from 'lucide-react'
import type { SugerenciaFin } from '@/lib/finanzas-sugerencias'

const ICONOS: Record<string, ComponentType<{ className?: string }>> = {
  'credit-card': CreditCard,
  alert: AlertTriangle,
  calendar: Calendar,
  clipboard: ClipboardList,
  home: Home,
  building: Building2,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  users: Users,
  landmark: Landmark,
  clock: Clock,
}

interface Props {
  sugerencias: SugerenciaFin[]
  onIrATab: (tab: string) => void
}

const PRIORIDAD_STYLE = {
  alta: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800', icon: AlertTriangle },
  media: { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800', icon: Info },
  baja: { bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800', icon: Lightbulb },
}

export default function IdeasPanel({ sugerencias, onIrATab }: Props) {
  if (sugerencias.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-10 text-center">
        <Lightbulb className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <p className="font-bold text-emerald-800">¡Excelente! No hay alertas pendientes</p>
        <p className="text-sm text-emerald-600 mt-2">Siga registrando movimientos de clínica y casa cada semana.</p>
      </div>
    )
  }

  const altas = sugerencias.filter(s => s.prioridad === 'alta').length

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          Qué más conviene registrar
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {sugerencias.length} sugerencia(s)
          {altas > 0 && <span className="text-red-600 font-medium"> · {altas} prioridad alta</span>}
        </p>
      </div>

      <div className="space-y-3">
        {sugerencias.map(s => {
          const style = PRIORIDAD_STYLE[s.prioridad]
          const Icon = s.icono ? (ICONOS[s.icono] ?? style.icon) : style.icon
          return (
            <div key={s.id} className={`rounded-xl border p-4 ${style.bg}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${style.badge}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800">{s.titulo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${style.badge}`}>
                      {s.prioridad}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{s.descripcion}</p>
                  {s.tab && (
                    <button onClick={() => onIrATab(s.tab!)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900">
                      Ir a registrar <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-slate-800 text-white rounded-xl p-5">
        <h4 className="font-bold mb-3">Checklist mensual recomendado</h4>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {[
            'Combustible y transporte (clínica)',
            'Medicamentos comprados sin factura',
            'Ingresos ambulancia y ataúdes',
            'Arriendo / hipoteca de casa',
            'Luz, agua, internet (casa)',
            'Supermercado y gastos familiares',
            'Pagos de tarjetas de crédito',
            'Abonos a préstamos y deudas',
            'Gastos clínica en efectivo',
            'Revisar CXP y CXC del sistema',
          ].map(item => (
            <li key={item} className="flex items-center gap-2 opacity-90">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
