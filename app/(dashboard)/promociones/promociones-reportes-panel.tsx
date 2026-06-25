'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { BarChart3, Mail, MessageCircle, Eye, Reply, Send } from 'lucide-react'
import { nombrePaciente } from '@/lib/consultas-utils'
import { calcularResumenReporte } from '@/lib/promociones-plantillas'
import { ESTADO_CAMPANA_CFG, type Campana, type EnvioRegistro } from '@/lib/promociones-utils'

interface Props {
  campanas: Campana[]
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function PromocionesReportesPanel({ campanas }: Props) {
  const supabase = sb()
  const [campanaId, setCampanaId] = useState<number | ''>('')
  const [envios, setEnvios] = useState<EnvioRegistro[]>([])
  const [cargando, setCargando] = useState(false)

  const campanasReporte = useMemo(
    () => campanas.filter(c => ['completada', 'en_proceso', 'lista_envio'].includes(c.estado)),
    [campanas],
  )

  const resumen = useMemo(() => calcularResumenReporte(envios), [envios])

  const cargarEnvios = useCallback(async (id: number) => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('promocion_envios')
        .select('*, paciente:pacientes(id, codigo, nombre, apellido1), contacto:promocion_contactos(id, nombre)')
        .eq('campana_id', id)
        .order('id')
      if (error) throw error
      setEnvios((data ?? []) as EnvioRegistro[])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cargar envíos')
    } finally {
      setCargando(false)
    }
  }, [supabase])

  useEffect(() => {
    if (campanaId) void cargarEnvios(Number(campanaId))
    else setEnvios([])
  }, [campanaId, cargarEnvios])

  const campanaSel = campanasReporte.find(c => c.id === campanaId)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border shadow-sm p-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-violet-600" /> Reportes de campaña
        </h3>
        <select value={campanaId} onChange={e => setCampanaId(e.target.value ? Number(e.target.value) : '')}
          className="w-full border rounded-xl px-3 py-2 text-sm">
          <option value="">Seleccione una campaña…</option>
          {campanasReporte.map(c => {
            const est = ESTADO_CAMPANA_CFG[c.estado]
            return (
              <option key={c.id} value={c.id}>
                {c.nombre} — {est.label} ({c.total_enviados}/{c.total_destinatarios})
              </option>
            )
          })}
        </select>
        <p className="text-[10px] text-gray-400 mt-2">
          Apertura: correo (pixel automático) o clic en WhatsApp asistido. Respuesta: marcado manualmente por el equipo.
        </p>
      </div>

      {campanaId && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Enviados', value: resumen.enviados, icon: Send, color: 'text-sky-700 bg-sky-50 border-sky-200' },
              { label: 'Abiertos', value: resumen.abiertos, sub: `${resumen.tasaApertura}%`, icon: Eye, color: 'text-violet-700 bg-violet-50 border-violet-200' },
              { label: 'Respondieron', value: resumen.respondieron, sub: `${resumen.tasaRespuesta}%`, icon: Reply, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'Pendientes', value: resumen.pendientes, icon: MessageCircle, color: 'text-amber-700 bg-amber-50 border-amber-200' },
            ].map(k => (
              <div key={k.label} className={`rounded-xl border p-3 ${k.color}`}>
                <k.icon className="w-4 h-4 mb-1 opacity-70" />
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-[10px] font-semibold">{k.label}{k.sub ? ` · ${k.sub}` : ''}</p>
              </div>
            ))}
          </div>

          {cargando ? (
            <p className="text-center text-gray-400 py-8 text-sm">Cargando detalle…</p>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-600">
                Detalle — {campanaSel?.nombre}
              </div>
              <div className="max-h-96 overflow-y-auto divide-y">
                {envios.map(e => {
                  const nombre = e.paciente
                    ? nombrePaciente(e.paciente)
                    : e.contacto?.nombre ?? '—'
                  return (
                    <div key={e.id} className="px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{nombre}</p>
                        <p className="text-[10px] text-gray-400">{e.estado}</p>
                      </div>
                      {e.canal === 'whatsapp'
                        ? <MessageCircle className="w-4 h-4 text-emerald-600" />
                        : <Mail className="w-4 h-4 text-sky-600" />}
                      {e.abierto_at && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 flex items-center gap-0.5">
                          <Eye className="w-3 h-3" /> Abierto
                        </span>
                      )}
                      {e.respondio && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                          <Reply className="w-3 h-3" /> Respondió
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
