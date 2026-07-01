'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { History, ChevronDown, ChevronUp, Pill, Stethoscope } from 'lucide-react'
import { fmtFechaLarga } from '@/lib/consultas-utils'

interface ConsultaHist {
  id: number
  fecha: string
  hora?: string
  sintoma?: string
  impresion?: string
  tratamiento?: string
  tipo_nombre?: string
  consulta_detalle?: { no_producto: string; cant?: number }[]
}

interface Props {
  pacienteId: number
  consultaActualId?: number
}


export default function ConsultaHistorialPanel({ pacienteId, consultaActualId }: Props) {
  const [items, setItems] = useState<ConsultaHist[]>([])
  const [abierto, setAbierto] = useState(true)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!pacienteId) return
    setCargando(true)
    const sb = createClient()
    let q = sb.from('consultas')
      .select('id,fecha,hora,sintoma,impresion,tratamiento,tipo_nombre,consulta_detalle(no_producto,cant)')
      .eq('paciente_id', pacienteId)
      .in('estado', ['FINALIZADO', 'PAGADO'])
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(5)
    if (consultaActualId) q = q.neq('id', consultaActualId)
    q.then(({ data }) => {
      setItems((data ?? []) as ConsultaHist[])
      setCargando(false)
    })
  }, [pacienteId, consultaActualId])

  if (cargando && items.length === 0) {
    return (
      <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-sky-700">
        Cargando historial...
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/80 to-indigo-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/40 transition"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-sky-700" />
          <span className="text-sm font-bold text-sky-900">Historial reciente</span>
          <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
            {items.length} consulta{items.length > 1 ? 's' : ''}
          </span>
        </div>
        {abierto ? <ChevronUp className="w-4 h-4 text-sky-600" /> : <ChevronDown className="w-4 h-4 text-sky-600" />}
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-2 max-h-56 overflow-y-auto">
          {items.map(c => (
            <div key={c.id} className="bg-white border border-sky-100 rounded-lg px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <span className="font-semibold text-gray-800 text-xs">
                  {fmtFechaLarga(c.fecha)}{c.hora ? ` · ${c.hora.slice(0, 5)}` : ''}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">#{c.id}</span>
              </div>
              {c.tipo_nombre && (
                <p className="text-[11px] text-sky-700 mb-1">{c.tipo_nombre}</p>
              )}
              {c.sintoma && (
                <p className="text-xs text-gray-600"><Stethoscope className="w-3 h-3 inline mr-1 text-gray-400" />
                  <b>Síntoma:</b> {c.sintoma}</p>
              )}
              {c.impresion && (
                <p className="text-xs text-gray-700 mt-0.5"><b>Dx:</b> {c.impresion}</p>
              )}
              {c.tratamiento && (
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2"><b>Tx:</b> {c.tratamiento}</p>
              )}
              {(c.consulta_detalle?.length ?? 0) > 0 && (
                <p className="text-[11px] text-purple-700 mt-1 flex items-center gap-1">
                  <Pill className="w-3 h-3" />
                  {c.consulta_detalle!.map(m => m.no_producto).slice(0, 3).join(', ')}
                  {c.consulta_detalle!.length > 3 ? ` +${c.consulta_detalle!.length - 3}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
