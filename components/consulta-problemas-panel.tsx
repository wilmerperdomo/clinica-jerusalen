'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { HeartPulse, Plus, Trash2, X } from 'lucide-react'

export interface ProblemaActivo {
  id?: number
  etiqueta: string
  cie10_codigo?: string | null
  activo: boolean
  notas?: string
}

interface Props {
  pacienteId: number
  diagnosticosActuales?: { cie10_codigo?: string | null; descripcion: string; principal?: boolean }[]
}

const ETIQUETAS_RAPIDAS = ['HTA', 'Diabetes', 'Asma', 'Embarazo', 'Alergias', 'ERC', 'Obesidad']

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function ConsultaProblemasPanel({ pacienteId, diagnosticosActuales = [] }: Props) {
  const [items, setItems] = useState<ProblemaActivo[]>([])
  const [nuevo, setNuevo] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!pacienteId) return
    const sb = supabase()
    sb.from('paciente_problema_activo')
      .select('id,etiqueta,cie10_codigo,activo,notas')
      .eq('paciente_id', pacienteId)
      .eq('activo', true)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as ProblemaActivo[])
        setCargando(false)
      })
  }, [pacienteId])

  async function guardar(lista: ProblemaActivo[]) {
    setItems(lista)
    const sb = supabase()
    for (const p of lista) {
      if (p.id) continue
      const { data } = await sb.from('paciente_problema_activo').insert({
        paciente_id: pacienteId,
        etiqueta: p.etiqueta,
        cie10_codigo: p.cie10_codigo ?? null,
        activo: true,
      }).select('id').single()
      if (data) p.id = data.id as number
    }
  }

  function agregar(etiqueta: string, cie10?: string | null) {
    const e = etiqueta.trim()
    if (!e || items.some(i => i.etiqueta.toLowerCase() === e.toLowerCase())) return
    guardar([...items, { etiqueta: e, cie10_codigo: cie10 ?? null, activo: true }])
    setNuevo('')
  }

  async function quitar(idx: number) {
    const p = items[idx]
    if (p.id) {
      await supabase().from('paciente_problema_activo').update({ activo: false }).eq('id', p.id)
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function importarDesdeDx() {
    for (const d of diagnosticosActuales) {
      agregar(d.descripcion.slice(0, 120), d.cie10_codigo)
    }
  }

  if (cargando && !items.length) return null

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-rose-900 uppercase flex items-center gap-1.5">
          <HeartPulse className="w-3.5 h-3.5" /> Problemas activos
        </p>
        {diagnosticosActuales.length > 0 && (
          <button type="button" onClick={importarDesdeDx}
            className="text-[10px] font-semibold text-rose-700 hover:underline">
            + desde diagnósticos de hoy
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((p, idx) => (
          <span key={p.id ?? idx}
            className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-rose-200 text-rose-900 px-2 py-1 rounded-full">
            {p.cie10_codigo && <span className="font-mono text-rose-600">{p.cie10_codigo}</span>}
            {p.etiqueta}
            <button type="button" onClick={() => quitar(idx)} className="text-rose-400 hover:text-rose-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {ETIQUETAS_RAPIDAS.map(e => (
          <button key={e} type="button" onClick={() => agregar(e)}
            className="text-[10px] px-2 py-0.5 rounded-full border border-rose-200 bg-white hover:bg-rose-100 text-rose-800">
            + {e}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={nuevo} onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(nuevo) } }}
          className="flex-1 text-xs border border-rose-200 rounded-lg px-2 py-1.5 outline-none"
          placeholder="Agregar problema activo..." />
        <button type="button" onClick={() => agregar(nuevo)}
          className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
