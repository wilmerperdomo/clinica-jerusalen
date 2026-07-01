'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, AlertTriangle, CheckCircle2, Phone, UserRound,
  Clock, Shield,
} from 'lucide-react'
import {
  ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost,
} from '@/components/module-layout'
import { cn } from '@/lib/utils'

type Mensaje = {
  id: number
  rol: string
  contenido: string
  agente: string | null
  intencion: string | null
  confianza: number | null
  created_at: string
}

type Escalamiento = {
  id: number
  motivo: string
  prioridad: string
  resuelto_at: string | null
  notas: string | null
  created_at: string
}

type Auditoria = {
  id: number
  accion: string
  agente: string | null
  detalle: Record<string, unknown>
  created_at: string
}

type Conversacion = {
  id: string
  contacto_externo: string
  contacto_nombre: string | null
  estado: string
  ultimo_agente: string | null
  paciente_id: number | null
  created_at: string
  ultimo_mensaje_at: string | null
}

type Canal = { id: number; clave: string; nombre: string } | null

const AGENTE_LABEL: Record<string, string> = {
  citas: 'Citas',
  laboratorio: 'Laboratorio',
  promociones: 'Promociones',
  facturacion: 'Facturación',
  faq: 'FAQ',
  escalamiento: 'Escalamiento',
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  conversacion: Conversacion
  canal: Canal
  mensajes: Mensaje[]
  auditoria: Auditoria[]
  escalamientos: Escalamiento[]
}

export default function ConversacionClient({
  conversacion: convInicial,
  canal,
  mensajes: msgsInicial,
  auditoria,
  escalamientos: escInicial,
}: Props) {
  const router = useRouter()
  const [conv, setConv] = useState(convInicial)
  const [mensajes] = useState(msgsInicial)
  const [escalamientos, setEscalamientos] = useState(escInicial)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const pendientes = escalamientos.filter(e => !e.resuelto_at)

  async function patch(body: Record<string, unknown>) {
    setGuardando(true)
    try {
      const res = await fetch(`/api/agentes/conversaciones/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      router.refresh()
      return true
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function resolverEscalamiento() {
    const ok = await patch({ accion: 'resolver_escalamiento', notas })
    if (ok) {
      setEscalamientos(prev =>
        prev.map(e => e.resuelto_at ? e : { ...e, resuelto_at: new Date().toISOString(), notas }),
      )
      setConv(c => ({ ...c, estado: 'activa' }))
      setNotas('')
    }
  }

  async function cerrarConversacion() {
    if (!confirm('¿Cerrar esta conversación?')) return
    const ok = await patch({ accion: 'cerrar' })
    if (ok) setConv(c => ({ ...c, estado: 'cerrada' }))
  }

  return (
    <ModuleShell tint="cyan">
      <ModuleHero
        title={conv.contacto_nombre || fmtTel(conv.contacto_externo)}
        subtitle={`${canal?.nombre ?? 'Canal'} · ${conv.estado}`}
        badge="Conversación"
        icon={MessageSquare}
        gradient="cyan"
        backLink={{ href: '/agentes', label: '← Volver a Agentes IA' }}
        actions={
          conv.estado !== 'cerrada' ? (
            <ModuleBtnGhost onClick={cerrarConversacion} disabled={guardando}>
              Cerrar conversación
            </ModuleBtnGhost>
          ) : null
        }
      />

      <ModuleContent maxWidth="3xl">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Chat */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 min-h-[420px] flex flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[520px] pr-1">
                {mensajes.length === 0 ? (
                  <p className="text-center text-slate-400 py-12">Sin mensajes aún.</p>
                ) : mensajes.map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex',
                      m.rol === 'usuario' ? 'justify-start' : 'justify-end',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                        m.rol === 'usuario'
                          ? 'bg-slate-100 text-slate-800 rounded-bl-md'
                          : 'bg-sky-600 text-white rounded-br-md',
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.contenido}</p>
                      <div className={cn(
                        'text-[10px] mt-1 flex flex-wrap gap-2',
                        m.rol === 'usuario' ? 'text-slate-400' : 'text-sky-200',
                      )}>
                        <span>{fmtFecha(m.created_at)}</span>
                        {m.agente && m.rol !== 'usuario' && (
                          <span>{AGENTE_LABEL[m.agente] ?? m.agente}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 text-sm">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserRound className="w-4 h-4" /> Contacto
              </h3>
              <p className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4" /> {fmtTel(conv.contacto_externo)}
              </p>
              {conv.paciente_id && (
                <p className="text-xs text-emerald-700">Paciente vinculado #{conv.paciente_id}</p>
              )}
              <p className="flex items-center gap-2 text-slate-500 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Inicio: {fmtFecha(conv.created_at)}
              </p>
            </div>

            {pendientes.length > 0 && (
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-3">
                <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Escalamiento pendiente
                </h3>
                {pendientes.map(e => (
                  <div key={e.id} className="text-sm text-amber-900">
                    <p>{e.motivo}</p>
                    <p className="text-xs text-amber-700 mt-1 capitalize">Prioridad: {e.prioridad}</p>
                  </div>
                ))}
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Notas al resolver (opcional)"
                  rows={2}
                  className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm"
                />
                <ModuleBtnPrimary onClick={resolverEscalamiento} disabled={guardando} className="w-full justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                  Marcar atendido
                </ModuleBtnPrimary>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4" /> Auditoría
              </h3>
              {auditoria.length === 0 ? (
                <p className="text-xs text-slate-400">Sin registros.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {auditoria.map(a => (
                    <li key={a.id} className="text-xs border-b border-slate-50 pb-2">
                      <span className="font-medium text-slate-700">{a.accion}</span>
                      {a.agente && (
                        <span className="text-slate-500"> · {AGENTE_LABEL[a.agente] ?? a.agente}</span>
                      )}
                      <p className="text-slate-400">{fmtFecha(a.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </ModuleContent>
    </ModuleShell>
  )
}

function fmtTel(t: string) {
  const d = t.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('504')) return `+504 ${d.slice(3, 7)}-${d.slice(7)}`
  return t
}
