'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bot, MessageSquare, AlertTriangle, RefreshCw, Search, Filter,
  Phone, ChevronRight, UserRound,
} from 'lucide-react'
import {
  ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost,
} from '@/components/module-layout'
import { cn } from '@/lib/utils'

export type ConversacionRow = {
  id: string
  contacto_externo: string
  contacto_nombre: string | null
  estado: string
  ultimo_agente: string | null
  ultimo_mensaje_at: string | null
  created_at: string
  paciente_id: number | null
  canal: { id: number; clave: string; nombre: string } | { id: number; clave: string; nombre: string }[] | null
}

export type EscalamientoRow = {
  id: number
  conversacion_id: string
  motivo: string
  prioridad: string
  created_at: string
}

type Canal = { id: number; clave: string; nombre: string }

const ESTADO_STYLE: Record<string, string> = {
  activa: 'bg-emerald-100 text-emerald-800',
  escalada: 'bg-amber-100 text-amber-800',
  cerrada: 'bg-slate-100 text-slate-600',
  bloqueada: 'bg-red-100 text-red-800',
}

const AGENTE_LABEL: Record<string, string> = {
  citas: 'Citas',
  laboratorio: 'Laboratorio',
  promociones: 'Promociones',
  facturacion: 'Facturación',
  faq: 'FAQ',
  escalamiento: 'Escalamiento',
}

function canalDe(row: ConversacionRow): { clave: string; nombre: string } | null {
  const c = row.canal
  if (!c) return null
  if (Array.isArray(c)) return c[0] ?? null
  return c
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtTel(t: string) {
  const d = t.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('504')) {
    return `+504 ${d.slice(3, 7)}-${d.slice(7)}`
  }
  return t
}

interface Props {
  conversacionesIniciales: ConversacionRow[]
  escalamientosIniciales: EscalamientoRow[]
  canales: Canal[]
}

export default function AgentesClient({
  conversacionesIniciales,
  escalamientosIniciales,
  canales,
}: Props) {
  const router = useRouter()
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales)
  const [escalamientos, setEscalamientos] = useState(escalamientosIniciales)
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [filtroCanal, setFiltroCanal] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      if (filtroEstado !== 'todas') params.set('estado', filtroEstado)
      if (filtroCanal !== 'todas') params.set('canal', filtroCanal)
      if (busqueda.trim()) params.set('q', busqueda.trim())
      const res = await fetch(`/api/agentes/conversaciones?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setConversaciones(data.conversaciones ?? [])
        setEscalamientos(data.escalamientosPendientes ?? [])
      }
    } finally {
      setCargando(false)
    }
  }, [filtroEstado, filtroCanal, busqueda])

  const lista = useMemo(() => {
    let rows = conversaciones
    if (filtroEstado !== 'todas') rows = rows.filter(r => r.estado === filtroEstado)
    if (filtroCanal !== 'todas') {
      rows = rows.filter(r => canalDe(r)?.clave === filtroCanal)
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      rows = rows.filter(r =>
        r.contacto_externo.includes(q)
        || (r.contacto_nombre?.toLowerCase().includes(q)),
      )
    }
    return rows
  }, [conversaciones, filtroEstado, filtroCanal, busqueda])

  const kpis = useMemo(() => ({
    total: conversaciones.length,
    activas: conversaciones.filter(c => c.estado === 'activa').length,
    escaladas: conversaciones.filter(c => c.estado === 'escalada').length,
    pendientes: escalamientos.length,
  }), [conversaciones, escalamientos])

  return (
    <ModuleShell tint="cyan">
      <ModuleHero
        title="Agentes IA"
        subtitle="Conversaciones WhatsApp y Messenger · bot automático"
        badge="Atención digital"
        icon={Bot}
        gradient="cyan"
        kpis={[
          { label: 'Conversaciones', value: kpis.total, icon: MessageSquare },
          { label: 'Activas', value: kpis.activas, icon: Bot },
          { label: 'Escaladas', value: kpis.escaladas, icon: AlertTriangle },
          { label: 'Pendientes humano', value: kpis.pendientes, icon: UserRound },
        ]}
        actions={
          <ModuleBtnGhost onClick={recargar} disabled={cargando}>
            <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
            Actualizar
          </ModuleBtnGhost>
        }
      />

      <ModuleContent>
        {escalamientos.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Escalamientos pendientes ({escalamientos.length})
            </p>
            <div className="space-y-2">
              {escalamientos.slice(0, 5).map(e => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => router.push(`/agentes/${e.conversacion_id}`)}
                  className="w-full text-left rounded-xl bg-white border border-amber-100 px-3 py-2 hover:border-amber-300 transition flex items-center justify-between gap-2"
                >
                  <span className="text-sm text-slate-700 truncate">{e.motivo}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && recargar()}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="todas">Todos los estados</option>
              <option value="activa">Activas</option>
              <option value="escalada">Escaladas</option>
              <option value="cerrada">Cerradas</option>
            </select>
            <select
              value={filtroCanal}
              onChange={e => setFiltroCanal(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="todas">Todos los canales</option>
              {canales.map(c => (
                <option key={c.clave} value={c.clave}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Último agente</th>
                  <th className="px-4 py-3">Última actividad</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No hay conversaciones con los filtros actuales.
                    </td>
                  </tr>
                ) : lista.map(row => {
                  const ch = canalDe(row)
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/agentes/${row.id}`)}
                      className="border-t border-slate-100 hover:bg-sky-50/50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {row.contacto_nombre || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {fmtTel(row.contacto_externo)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{ch?.nombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          ESTADO_STYLE[row.estado] ?? 'bg-slate-100 text-slate-600',
                        )}>
                          {row.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.ultimo_agente ? (AGENTE_LABEL[row.ultimo_agente] ?? row.ultimo_agente) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {fmtFecha(row.ultimo_mensaje_at ?? row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ModuleContent>
    </ModuleShell>
  )
}
