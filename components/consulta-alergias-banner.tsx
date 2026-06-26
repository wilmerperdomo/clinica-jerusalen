'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  alergias?: string | null
  personal?: string | null
}

export default function ConsultaAlergiasBanner({ alergias, personal }: Props) {
  const alerta = alergias?.trim()
  const cronico = personal?.trim()

  if (!alerta && !cronico) return null

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 flex items-start gap-3 shadow-sm">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        {alerta && (
          <>
            <p className="text-sm font-bold text-amber-900 uppercase tracking-wide">Alergias del paciente</p>
            <p className="text-sm text-amber-950 font-medium mt-1">{alerta}</p>
          </>
        )}
        {cronico && (
          <p className={`text-xs text-amber-900 ${alerta ? 'mt-2 pt-2 border-t border-amber-200' : ''}`}>
            <span className="font-semibold">Antecedentes / problemas: </span>{cronico}
          </p>
        )}
      </div>
    </div>
  )
}
