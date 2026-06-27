'use client'

import Link from 'next/link'
import { Stethoscope, FlaskConical, CreditCard, Receipt, FileText } from 'lucide-react'

export interface TimelineEvento {
  id: string
  fecha: string
  hora?: string
  tipo: 'consulta' | 'lab' | 'plan' | 'pago' | 'documento'
  titulo: string
  detalle?: string
  href?: string
}

interface Props {
  eventos: TimelineEvento[]
}

const ICONO: Record<TimelineEvento['tipo'], React.ReactNode> = {
  consulta: <Stethoscope className="w-4 h-4" />,
  lab: <FlaskConical className="w-4 h-4" />,
  plan: <CreditCard className="w-4 h-4" />,
  pago: <Receipt className="w-4 h-4" />,
  documento: <FileText className="w-4 h-4" />,
}

const COLOR: Record<TimelineEvento['tipo'], string> = {
  consulta: 'bg-blue-100 text-blue-700 border-blue-200',
  lab: 'bg-violet-100 text-violet-700 border-violet-200',
  plan: 'bg-amber-100 text-amber-800 border-amber-200',
  pago: 'bg-green-100 text-green-700 border-green-200',
  documento: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function ExpedienteTimeline({ eventos }: Props) {
  if (!eventos.length) {
    return <p className="text-sm text-gray-400 py-4">Sin eventos en la línea de tiempo.</p>
  }

  const ordenados = [...eventos].sort((a, b) => {
    const da = `${a.fecha} ${a.hora || ''}`
    const db = `${b.fecha} ${b.hora || ''}`
    return db.localeCompare(da)
  })

  return (
    <div className="space-y-0">
      {ordenados.map((e, i) => (
        <div key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${COLOR[e.tipo]}`}>
              {ICONO[e.tipo]}
            </div>
            {i < ordenados.length - 1 && <div className="w-px flex-1 bg-gray-200 min-h-[24px]" />}
          </div>
          <div className="pb-5 flex-1 min-w-0">
            <p className="text-xs text-gray-400">{e.fecha}{e.hora ? ` · ${e.hora}` : ''}</p>
            {e.href ? (
              <Link href={e.href} className="font-medium text-sm text-blue-700 hover:underline">{e.titulo}</Link>
            ) : (
              <p className="font-medium text-sm text-gray-900">{e.titulo}</p>
            )}
            {e.detalle && <p className="text-xs text-gray-500 mt-0.5">{e.detalle}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
