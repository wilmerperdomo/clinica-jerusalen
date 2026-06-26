'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  History, ChevronDown, ChevronUp, Pill, Stethoscope, Activity,
  FlaskConical, AlertCircle,
} from 'lucide-react'
import { fmtFechaLarga } from '@/lib/consultas-utils'
import { columnaConsultaDetalle } from '@/lib/consulta-detalle-utils'

interface DxHist {
  cie10_codigo?: string | null
  descripcion: string
  principal?: boolean
  consulta_id: number
  fecha: string
}

interface SignosHist {
  id: number
  fecha: string
  presion?: string | null
  temperatura?: string | null
  peso?: string | null
  talla?: string | null
}

interface LabHist {
  no_analisis: string
  fecha?: string | null
  estado_lab?: string | null
  pagado?: boolean | null
}

interface MedHist {
  no_producto: string
  fecha: string
  consulta_id: number
}

interface Props {
  pacienteId: number
  consultaActualId?: number
  alergias?: string | null
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function ConsultaContextoClinicoPanel({ pacienteId, consultaActualId, alergias }: Props) {
  const [abierto, setAbierto] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [dx, setDx] = useState<DxHist[]>([])
  const [meds, setMeds] = useState<MedHist[]>([])
  const [signos, setSignos] = useState<SignosHist[]>([])
  const [labs, setLabs] = useState<LabHist[]>([])
  const [pendientes, setPendientes] = useState<string[]>([])

  useEffect(() => {
    if (!pacienteId) return
    setCargando(true)
    const sb = supabase()
    const col = columnaConsultaDetalle()

    Promise.all([
      sb.from('consultas')
        .select('id,fecha')
        .eq('paciente_id', pacienteId)
        .in('estado', ['FINALIZADO', 'PAGADO', 'ATENDIENDO'])
        .order('fecha', { ascending: false })
        .limit(8),
      sb.from('consulta_analisis')
        .select('no_analisis,fecha,estado_lab,pagado')
        .eq('paciente_id', pacienteId)
        .order('fecha', { ascending: false })
        .limit(6),
      sb.from('citas')
        .select('fecha,motivo,estado')
        .eq('paciente_id', pacienteId)
        .gte('fecha', new Date().toISOString().slice(0, 10))
        .in('estado', ['ACTIVO', 'CONFIRMADO', 'PENDIENTE'])
        .limit(3),
    ]).then(async ([consRes, labRes, citasRes]) => {
      const consultas = (consRes.data ?? []).filter(c => c.id !== consultaActualId)
      const ids = consultas.map(c => c.id)

      if (ids.length) {
        const [dxRes, signosRes, detRes] = await Promise.all([
          sb.from('consulta_diagnosticos')
            .select('cie10_codigo,descripcion,principal,consulta_id,consultas!inner(fecha)')
            .in('consulta_id', ids)
            .order('consulta_id', { ascending: false })
            .limit(8),
          sb.from('consultas')
            .select('id,fecha,presion,temperatura,peso,talla')
            .in('id', ids)
            .order('fecha', { ascending: false })
            .limit(4),
          sb.from('consulta_detalle')
            .select(`${col},no_producto,created_at`)
            .in(col, ids.map(String))
            .order('created_at', { ascending: false })
            .limit(12),
        ])

        if (!dxRes.error && dxRes.data) {
          setDx(dxRes.data.map((r: Record<string, unknown>) => {
            const c = r.consultas as { fecha?: string } | { fecha?: string }[] | null
            const fecha = Array.isArray(c) ? c[0]?.fecha : c?.fecha
            return {
              cie10_codigo: r.cie10_codigo as string | null,
              descripcion: String(r.descripcion),
              principal: Boolean(r.principal),
              consulta_id: Number(r.consulta_id),
              fecha: fecha ?? '',
            }
          }))
        }

        if (!signosRes.error && signosRes.data) {
          setSignos(signosRes.data as SignosHist[])
        }

        if (!detRes.error && detRes.data) {
          const mapFecha = Object.fromEntries(consultas.map(c => [c.id, c.fecha]))
          setMeds(detRes.data.map((r: Record<string, unknown>) => {
            const cid = Number(r[col])
            return {
              no_producto: String(r.no_producto),
              fecha: mapFecha[cid] ?? String(r.created_at ?? '').slice(0, 10),
              consulta_id: cid,
            }
          }))
        }
      } else {
        setDx([])
        setSignos([])
        setMeds([])
      }

      if (!labRes.error && labRes.data) {
        setLabs(labRes.data as LabHist[])
      }

      const pend: string[] = []
      for (const c of citasRes.data ?? []) {
        pend.push(`Cita ${c.fecha}: ${c.motivo || 'seguimiento'}`)
      }
      for (const l of labRes.data ?? []) {
        if (l.estado_lab && l.estado_lab !== 'ENTREGADO' && l.pagado) {
          pend.push(`Lab pendiente entrega: ${l.no_analisis}`)
        } else if (!l.pagado && l.estado_lab === 'PENDIENTE_COBRO') {
          pend.push(`Lab sin cobrar: ${l.no_analisis}`)
        }
      }
      setPendientes(pend.slice(0, 5))
      setCargando(false)
    }).catch(() => setCargando(false))
  }, [pacienteId, consultaActualId])

  const hayDatos = dx.length || meds.length || signos.length || labs.length || pendientes.length || alergias

  if (!cargando && !hayDatos) return null

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/90 to-white overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/50 transition"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-sky-700" />
          <span className="text-sm font-bold text-sky-900">Contexto clínico del paciente</span>
        </div>
        {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          {cargando ? (
            <p className="text-xs text-sky-700">Cargando historial...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {alergias?.trim() && (
                <div className="md:col-span-2 lg:col-span-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="font-bold text-amber-900 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Alergias
                  </p>
                  <p className="text-amber-950 mt-0.5">{alergias}</p>
                </div>
              )}

              {dx.length > 0 && (
                <div className="bg-white border border-sky-100 rounded-lg p-2.5">
                  <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <Stethoscope className="w-3 h-3 text-sky-600" /> Últimos diagnósticos
                  </p>
                  <ul className="space-y-1">
                    {dx.slice(0, 5).map((d, i) => (
                      <li key={i} className="text-gray-700">
                        {d.cie10_codigo && <span className="font-mono text-indigo-700">{d.cie10_codigo} </span>}
                        {d.descripcion}
                        {d.fecha && <span className="text-gray-400 ml-1">· {d.fecha}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {meds.length > 0 && (
                <div className="bg-white border border-purple-100 rounded-lg p-2.5">
                  <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <Pill className="w-3 h-3 text-purple-600" /> Medicamentos recientes
                  </p>
                  <ul className="space-y-0.5">
                    {meds.slice(0, 6).map((m, i) => (
                      <li key={i} className="text-gray-700 truncate">{m.no_producto}</li>
                    ))}
                  </ul>
                </div>
              )}

              {signos.length > 0 && (
                <div className="bg-white border border-emerald-100 rounded-lg p-2.5">
                  <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-600" /> Signos vitales previos
                  </p>
                  {signos.slice(0, 3).map(s => (
                    <p key={s.id} className="text-gray-600 mb-1">
                      <span className="text-gray-400">{fmtFechaLarga(s.fecha).slice(0, 12)}</span>
                      {s.peso && ` · ${s.peso}kg`}
                      {s.presion && ` · PA ${s.presion}`}
                      {s.temperatura && ` · ${s.temperatura}°C`}
                    </p>
                  ))}
                </div>
              )}

              {labs.length > 0 && (
                <div className="bg-white border border-blue-100 rounded-lg p-2.5">
                  <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <FlaskConical className="w-3 h-3 text-blue-600" /> Laboratorios recientes
                  </p>
                  <ul className="space-y-0.5">
                    {labs.slice(0, 5).map((l, i) => (
                      <li key={i} className="text-gray-700 truncate">
                        {l.no_analisis}
                        {l.fecha && <span className="text-gray-400"> · {l.fecha}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pendientes.length > 0 && (
                <div className="md:col-span-2 lg:col-span-3 bg-orange-50 border border-orange-100 rounded-lg p-2.5">
                  <p className="font-semibold text-orange-900 mb-1">Controles / pendientes</p>
                  <ul className="text-orange-800 space-y-0.5">
                    {pendientes.map((p, i) => <li key={i}>· {p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
