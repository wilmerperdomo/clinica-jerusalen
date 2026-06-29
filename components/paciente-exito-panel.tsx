'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Stethoscope, FileText, User, X,
  History, ShoppingBag, CreditCard, Wallet, Loader2,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { fmtReporte } from '@/lib/reporte-utils'
import {
  cargarHistorialPaciente,
  etiquetaConsulta,
  etiquetaMembresia,
  type HistorialPacienteReciente,
} from '@/lib/paciente-historial-reciente'

interface Props {
  pacienteId: number
  nombre: string
  aviso?: string | null
  onClose: () => void
}

function SeccionHistorial({
  titulo, icon: Icon, vacio, items, children,
}: {
  titulo: string
  icon: React.ElementType
  vacio: string
  items: unknown[]
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-slate-50/80 p-3">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5" /> {titulo}
      </p>
      {items.length === 0
        ? <p className="text-xs text-slate-400">{vacio}</p>
        : children}
    </div>
  )
}

export default function PacienteExitoPanel({ pacienteId, nombre, aviso, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [historial, setHistorial] = useState<HistorialPacienteReciente | null>(null)

  useEffect(() => {
    let activo = true
    ;(async () => {
      setLoading(true)
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const data = await cargarHistorialPaciente(supabase, pacienteId)
      if (activo) {
        setHistorial(data)
        setLoading(false)
      }
    })()
    return () => { activo = false }
  }, [pacienteId])

  const saldoDeuda = historial?.deudas.reduce((s, d) => s + d.saldo, 0) ?? 0

  return (
    <div className="p-5 sm:p-6 space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Paciente registrado</h3>
        <p className="text-sm text-slate-500 mt-1">{nombre}</p>
      </div>

      {aviso && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Link
          href={`/consultas?paciente=${pacienteId}&nuevo=1`}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white shadow-md hover:shadow-lg transition"
          style={{ backgroundColor: BRAND.navy }}
          onClick={onClose}
        >
          <Stethoscope className="w-4 h-4" /> Nueva consulta
        </Link>
        <Link
          href={`/expediente/${pacienteId}`}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition"
          onClick={onClose}
        >
          <FileText className="w-4 h-4" /> Ver expediente
        </Link>
        <Link
          href={`/pacientes/${pacienteId}`}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition sm:col-span-2"
          onClick={onClose}
        >
          <User className="w-4 h-4" /> Ver ficha del paciente
        </Link>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <History className="w-3.5 h-3.5" /> Historial reciente
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SeccionHistorial titulo="Consultas" icon={Stethoscope} vacio="Sin consultas previas"
              items={historial?.consultas ?? []}>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {(historial?.consultas ?? []).map(c => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{etiquetaConsulta(c)}</span>
                    <span className="text-slate-400 shrink-0">{c.estado}</span>
                  </li>
                ))}
              </ul>
            </SeccionHistorial>

            <SeccionHistorial titulo="Compras / cobros" icon={ShoppingBag} vacio="Sin movimientos de caja"
              items={historial?.compras ?? []}>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {(historial?.compras ?? []).map(c => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.concepto || 'Ingreso'}</span>
                    <span className="font-medium text-emerald-700 shrink-0">{fmtReporte(c.monto)}</span>
                  </li>
                ))}
              </ul>
            </SeccionHistorial>

            <SeccionHistorial titulo="Deudas (CXC)" icon={Wallet} vacio="Sin saldos pendientes"
              items={historial?.deudas ?? []}>
              <div>
                <p className="text-xs font-bold text-red-600 mb-1.5">Saldo total: {fmtReporte(saldoDeuda)}</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {(historial?.deudas ?? []).map(d => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span className="truncate">{d.concepto || 'Cuenta por cobrar'}</span>
                      <span className="font-medium text-red-600 shrink-0">{fmtReporte(d.saldo)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </SeccionHistorial>

            <SeccionHistorial titulo="Plan médico" icon={CreditCard} vacio="Sin membresía activa"
              items={historial?.membresia ? [historial.membresia] : []}>
              {historial?.membresia && (
                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-amber-800">{etiquetaMembresia(historial.membresia)}</p>
                  {historial.membresia.numero_carnet && (
                    <p className="text-slate-500">Carnet: {historial.membresia.numero_carnet}</p>
                  )}
                </div>
              )}
            </SeccionHistorial>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
      >
        <X className="w-4 h-4" /> Cerrar y volver al listado
      </button>
    </div>
  )
}
