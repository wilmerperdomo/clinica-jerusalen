'use client'

import { Sparkles, FlaskConical, CalendarDays } from 'lucide-react'
import { sugerenciasDesdeDiagnosticos, type SugerenciaOrden } from '@/lib/diagnostico-ordenes-sugeridas'

interface Props {
  diagnosticos: { cie10_codigo?: string | null; descripcion: string }[]
  onAgregarLabs: (sugerencias: SugerenciaOrden[]) => void
  onAgregarSeguimiento: (s: SugerenciaOrden) => void
}

export default function ConsultaSugerenciasOrdenesPanel({
  diagnosticos, onAgregarLabs, onAgregarSeguimiento,
}: Props) {
  const sugerencias = sugerenciasDesdeDiagnosticos(diagnosticos)
  if (!sugerencias.length) return null

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5">
      <p className="text-[11px] font-bold text-violet-900 flex items-center gap-1 mb-2">
        <Sparkles className="w-3.5 h-3.5" /> Órdenes sugeridas según diagnóstico
      </p>
      <div className="flex flex-wrap gap-2">
        {sugerencias.map(s => (
          <button
            key={`${s.tipo}-${s.etiqueta}`}
            type="button"
            onClick={() => {
              if (s.tipo === 'lab') onAgregarLabs([s])
              else if (s.tipo === 'seguimiento') onAgregarSeguimiento(s)
            }}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-violet-300 bg-white text-violet-800 hover:bg-violet-100 flex items-center gap-1"
          >
            {s.tipo === 'lab' ? <FlaskConical className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
            {s.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}
