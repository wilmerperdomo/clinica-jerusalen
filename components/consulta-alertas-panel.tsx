'use client'

import { ShieldAlert } from 'lucide-react'
import { type AlertaClinica, claseSeveridadAlerta } from '@/lib/alertas-clinicas'

interface Props {
  alertas: AlertaClinica[]
}

export default function ConsultaAlertasPanel({ alertas }: Props) {
  if (!alertas.length) return null

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-red-100 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-red-700" />
        <span className="text-sm font-bold text-red-900">
          Alertas clínicas ({alertas.length})
        </span>
      </div>
      <ul className="px-4 py-3 space-y-2 max-h-40 overflow-y-auto">
        {alertas.map(a => (
          <li
            key={a.id}
            className={`text-xs rounded-lg border px-3 py-2 ${claseSeveridadAlerta(a.severidad)}`}
          >
            <p className="font-bold">{a.titulo}</p>
            <p className="mt-0.5 opacity-90">{a.mensaje}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
