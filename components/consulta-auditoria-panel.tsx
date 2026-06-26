'use client'

import { ClipboardCheck } from 'lucide-react'
import { auditarConsulta, claseAuditoria, type ItemAuditoria } from '@/lib/consulta-auditoria'

interface Props {
  sintoma: string
  historia: string
  impresion: string
  tratamiento: string
  tieneDiagnosticos: boolean
  recetaItems: { no_producto: string; indicacion: string }[]
  labItems: { no_analisis: string }[]
  embarazoActivo?: boolean
  fpp?: string | null
  fum?: string | null
  fechaNac?: string | null
  edadMeses?: number | null
}

export default function ConsultaAuditoriaPanel(props: Props) {
  const items = auditarConsulta({
    ...props,
    catalogoVacunasCargado: props.edadMeses != null && props.edadMeses <= 216,
  })

  if (!items.length) return null

  const errores = items.filter(i => i.tipo === 'error').length

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-slate-700" />
        <span className="text-sm font-bold text-slate-800">
          Calidad de la consulta
          {errores > 0 && (
            <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {errores} pendiente{errores > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
      <ul className="px-4 py-2 space-y-1 max-h-32 overflow-y-auto">
        {items.map(i => (
          <li key={i.id} className={`text-[11px] rounded px-2 py-1 border ${claseAuditoria(i.tipo)}`}>
            {i.mensaje}
          </li>
        ))}
      </ul>
    </div>
  )
}
