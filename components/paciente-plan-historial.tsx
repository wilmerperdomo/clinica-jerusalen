'use client'

import Link from 'next/link'
import { CreditCard, CalendarDays, Wallet, Users, AlertTriangle } from 'lucide-react'
import { estadoVisualPlan, etiquetaEstadoPlan, claseEstadoPlan } from '@/lib/membresia-estado'

const fmt = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`

export interface HistorialMembresia {
  id: number
  tipo_id: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
  numero_carnet?: string
  comentarios?: string
  created_at: string
  tipo?: { nombre: string; precio: number; duracion_dias: number }
  beneficiarios?: { nombre: string; parentesco?: string; activo: boolean }[]
}

export interface HistorialPago {
  id: number
  membresia_id: number
  numero_cuota: number
  fecha_vencimiento: string
  monto: number
  estado: string
  fecha_pago?: string | null
}

interface Props {
  membresias: HistorialMembresia[]
  pagos: HistorialPago[]
  linkCaja?: boolean
}

export default function PacientePlanHistorial({ membresias, pagos, linkCaja = true }: Props) {
  const hoy = new Date().toISOString().split('T')[0]
  const activa = membresias.find(m => m.estado === 'activo' && m.fecha_fin >= hoy)
  const anteriores = membresias.filter(m => m.id !== activa?.id)
  const pagosHechos = pagos.filter(p => p.estado === 'pagado')
  const cuotasVencidas = pagos.filter(p => p.estado !== 'pagado' && p.fecha_vencimiento < hoy)

  if (!membresias.length) {
    return (
      <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4 text-sm text-violet-800">
        Este paciente no tiene planes médicos registrados.
        <Link href="/membresias" className="ml-1 underline font-medium">Registrar plan</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activa && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
          <p className="text-xs font-bold text-violet-800 uppercase mb-2 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" /> Plan actual
          </p>
          <p className="font-semibold text-gray-900">{activa.tipo?.nombre || 'Plan médico'}</p>
          <p className="text-sm text-gray-600">{activa.fecha_inicio} → {activa.fecha_fin}</p>
          <p className="text-xs text-violet-700 font-mono mt-1">{activa.numero_carnet || '—'}</p>
          {(activa.beneficiarios || []).filter(b => b.activo).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activa.beneficiarios!.filter(b => b.activo).map((b, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white border border-violet-200 text-gray-700">
                  {b.nombre}{b.parentesco ? ` (${b.parentesco})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {anteriores.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Planes anteriores / renovaciones</p>
          <div className="space-y-2">
            {anteriores.map(m => {
              const ev = estadoVisualPlan({ estado: m.estado, fecha_fin: m.fecha_fin })
              return (
                <div key={m.id} className="rounded-lg border px-3 py-2 text-sm flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.tipo?.nombre || 'Plan'}</p>
                    <p className="text-xs text-gray-500">{m.fecha_inicio} → {m.fecha_fin}</p>
                    {m.comentarios?.includes('Renovación') && (
                      <p className="text-[10px] text-blue-600 mt-0.5">Renovación</p>
                    )}
                  </div>
                  <span className={`self-start px-2 py-0.5 rounded-full text-[10px] font-medium ${claseEstadoPlan(ev)}`}>
                    {etiquetaEstadoPlan(ev)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" /> Pagos realizados ({pagosHechos.length})
          </p>
          {pagosHechos.length === 0 ? (
            <p className="text-xs text-gray-400">Sin pagos registrados</p>
          ) : (
            <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
              {pagosHechos.slice(0, 8).map(p => (
                <li key={p.id} className="flex justify-between">
                  <span>Cuota #{p.numero_cuota} · {p.fecha_pago || '—'}</span>
                  <span className="font-medium text-green-700">{fmt(p.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Cuotas vencidas ({cuotasVencidas.length})
          </p>
          {cuotasVencidas.length === 0 ? (
            <p className="text-xs text-gray-400">Al día en cuotas</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {cuotasVencidas.map(p => (
                <li key={p.id} className="flex justify-between items-center gap-2">
                  <span className="text-red-700">#{p.numero_cuota} · vence {p.fecha_vencimiento}</span>
                  <span className="font-medium">{fmt(p.monto)}</span>
                  {linkCaja && (
                    <Link href={`/ventas?membresia_pago=${p.id}`}
                      className="text-[10px] font-semibold text-violet-700 hover:underline whitespace-nowrap">
                      Cobrar
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(activa?.beneficiarios || []).filter(b => b.activo).length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Beneficiarios del plan actual
          </p>
          <div className="flex flex-wrap gap-2">
            {activa!.beneficiarios!.filter(b => b.activo).map((b, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-lg bg-gray-50 border">{b.nombre} ({b.parentesco || '—'})</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 flex items-center gap-1">
        <CalendarDays className="w-3 h-3" />
        Historial completo en <Link href="/membresias" className="underline">Planes Médicos</Link>
      </p>
    </div>
  )
}
