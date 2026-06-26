'use client'

import { useState } from 'react'
import { Stethoscope, Star, Trash2, Plus } from 'lucide-react'
import Cie10Buscador from '@/components/cie10-buscador'
import { createBrowserClient } from '@supabase/ssr'
import {
  type DiagnosticoItem,
  type Cie10Entry,
  agregarDiagnostico,
  marcarPrincipal,
  quitarDiagnostico,
} from '@/lib/consulta-diagnosticos-utils'

interface Props {
  items: DiagnosticoItem[]
  onChange: (items: DiagnosticoItem[]) => void
}

export default function ConsultaDiagnosticosPanel({ items, onChange }: Props) {
  const [textoLibre, setTextoLibre] = useState('')

  async function seleccionarCie10(entry: Cie10Entry) {
    onChange(agregarDiagnostico(items, {
      cie10_codigo: entry.codigo,
      descripcion: entry.descripcion,
      principal: items.length === 0,
    }))
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      await sb.from('medico_cie10_favorito').upsert({
        user_id: user.id,
        cie10_codigo: entry.codigo,
        uso_count: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,cie10_codigo' })
    } catch {
      // Favorito es opcional; ignorar errores (p.ej. migración 087 pendiente)
    }
  }

  function agregarLibre() {
    const desc = textoLibre.trim()
    if (!desc) return
    onChange(agregarDiagnostico(items, { descripcion: desc, principal: items.length === 0 }))
    setTextoLibre('')
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
        <Stethoscope className="w-3.5 h-3.5" />
        Análisis — Diagnósticos (CIE-10)
      </p>

      <Cie10Buscador onSeleccionar={seleccionarCie10} />

      <div className="flex gap-2">
        <input
          value={textoLibre}
          onChange={e => setTextoLibre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarLibre() } }}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="Diagnóstico libre (sin código CIE-10)"
        />
        <button
          type="button"
          onClick={agregarLibre}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((d, idx) => (
            <li
              key={d.id ?? `dx-${idx}`}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
                d.principal ? 'bg-indigo-100 border-indigo-200' : 'bg-white border-gray-100'
              }`}
            >
              <button
                type="button"
                title="Marcar como principal"
                onClick={() => onChange(marcarPrincipal(items, idx))}
                className={`mt-0.5 p-0.5 rounded ${d.principal ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
              >
                <Star className={`w-3.5 h-3.5 ${d.principal ? 'fill-current' : ''}`} />
              </button>
              <div className="flex-1 min-w-0">
                {d.cie10_codigo && (
                  <span className="font-mono text-[11px] font-bold text-indigo-700 mr-2">{d.cie10_codigo}</span>
                )}
                <span className="text-gray-800">{d.descripcion}</span>
                {d.principal && (
                  <span className="ml-2 text-[10px] font-semibold text-indigo-600 uppercase">Principal</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(quitarDiagnostico(items, idx))}
                className="p-1 text-red-400 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 italic">Sin diagnósticos. Busque CIE-10 o agregue texto libre.</p>
      )}
    </div>
  )
}
