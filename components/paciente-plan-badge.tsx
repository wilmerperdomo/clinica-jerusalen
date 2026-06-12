'use client'

import Link from 'next/link'
import { CreditCard, AlertTriangle, BadgeCheck } from 'lucide-react'
import { getMembresiaPaciente, type MembresiasMap } from '@/lib/membresia-utils'

interface Props {
  pacienteId?: number | null
  listaId?: number | null
  listaNombre?: string | null
  membresiasMap?: MembresiasMap
  size?: 'sm' | 'md'
  showLista?: boolean
  linkMembresias?: boolean
}

export function PacientePlanBadge({
  pacienteId, listaId, listaNombre, membresiasMap,
  size = 'sm', showLista = true, linkMembresias = false,
}: Props) {
  const mem = getMembresiaPaciente(pacienteId, membresiasMap)
  if (!mem && !listaId) return null

  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const pad = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {mem && (
        <span
          className={`inline-flex items-center gap-0.5 font-bold uppercase rounded-full ${pad} ${textSize} ${
            mem.vencida
              ? 'bg-red-100 text-red-700'
              : mem.por_vencer
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
          }`}
          title={mem.numero_carnet ? `Carnet ${mem.numero_carnet} · Vence ${mem.fecha_fin}` : `Vence ${mem.fecha_fin}`}
        >
          {mem.por_vencer && !mem.vencida
            ? <AlertTriangle className="w-2.5 h-2.5" />
            : <CreditCard className="w-2.5 h-2.5" />}
          {mem.tipo}
        </span>
      )}
      {showLista && listaNombre && listaId !== 1 && (
        <span className={`inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-800 font-semibold ${pad} ${textSize}`}>
          <BadgeCheck className="w-2.5 h-2.5" />
          Lista {listaNombre}
        </span>
      )}
      {linkMembresias && mem && (
        <Link href="/membresias" className={`${textSize} text-rose-600 hover:underline`}>Ver plan</Link>
      )}
    </span>
  )
}

interface BannerProps {
  pacienteId?: number | null
  listaId?: number | null
  listaNombre?: string | null
  membresiasMap?: MembresiasMap
}

export function PacientePlanBanner({ pacienteId, listaId, listaNombre, membresiasMap }: BannerProps) {
  const mem = getMembresiaPaciente(pacienteId, membresiasMap)
  if (!mem && !listaNombre) return null

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${
      mem?.por_vencer && !mem.vencida
        ? 'border-amber-200 bg-amber-50'
        : mem
          ? 'border-rose-200 bg-rose-50/80'
          : 'border-violet-200 bg-violet-50/80'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            <CreditCard className="w-4 h-4 text-rose-600" />
            {mem ? `Plan médico activo: ${mem.tipo}` : `Lista de precios: ${listaNombre}`}
          </p>
          {mem && (
            <p className="text-xs text-gray-600 mt-1">
              Vence {new Date(mem.fecha_fin + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {mem.numero_carnet ? ` · Carnet ${mem.numero_carnet}` : ''}
              {mem.dias_restantes >= 0 ? ` · ${mem.dias_restantes} día${mem.dias_restantes !== 1 ? 's' : ''} restantes` : ' · VENCIDO'}
            </p>
          )}
          {listaNombre && listaId !== 1 && (
            <p className="text-xs text-violet-700 mt-0.5">
              Precios de laboratorio según lista <strong>{listaNombre}</strong>
            </p>
          )}
          {mem && mem.beneficios.length > 0 && (
            <ul className="text-[11px] text-gray-600 mt-2 space-y-0.5 list-disc list-inside">
              {mem.beneficios.slice(0, 4).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
        <Link href="/membresias" className="text-xs font-semibold text-rose-700 hover:underline whitespace-nowrap">
          Ver membresías →
        </Link>
      </div>
      {mem?.por_vencer && !mem.vencida && (
        <p className="text-xs text-amber-800 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          El plan vence pronto — confirmar vigencia antes de aplicar beneficios.
        </p>
      )}
    </div>
  )
}
