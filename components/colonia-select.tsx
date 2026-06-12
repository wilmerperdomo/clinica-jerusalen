'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, MapPin, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Colonia {
  id: number
  nombre: string
  activo?: boolean
}

interface Props {
  colonias: Colonia[]
  value?: number | null
  name?: string
  onChange?: (id: number | null) => void
  required?: boolean
  className?: string
  allowEmpty?: boolean
  emptyLabel?: string
  showAdminLink?: boolean
}

export default function ColoniaSelect({
  colonias, value, name = 'colonia_id', onChange,
  required, className, allowEmpty = true,
  emptyLabel = '— Seleccionar colonia —',
  showAdminLink = true,
}: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(value ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelectedId(value ?? null) }, [value])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const activas = useMemo(
    () => colonias.filter(c => c.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [colonias],
  )

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return activas
    return activas.filter(c => c.nombre.toLowerCase().includes(t))
  }, [activas, q])

  const selected = colonias.find(c => c.id === selectedId)

  function elegir(id: number | null) {
    setSelectedId(id)
    onChange?.(id)
    setOpen(false)
    setQ('')
  }

  return (
    <div className={cn('space-y-1.5', className)} ref={ref}>
      <input type="hidden" name={name} value={selectedId ?? ''} />

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={cn(
            'w-full flex items-center gap-2 pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm text-left',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition',
            open && 'ring-2 ring-blue-500 border-blue-300',
          )}
        >
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <span className={cn('flex-1 truncate', !selected && 'text-slate-400')}>
            {selected?.nombre ?? emptyLabel}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute z-40 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="search"
                  autoFocus
                  placeholder="Buscar colonia..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {allowEmpty && (
                <li>
                  <button type="button" onClick={() => elegir(null)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50">
                    {emptyLabel}
                  </button>
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-slate-400">Sin coincidencias</li>
              ) : filtered.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => elegir(c.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition flex items-center gap-2',
                      selectedId === c.id && 'bg-blue-50 text-blue-700 font-medium',
                    )}
                  >
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                    {c.nombre}
                  </button>
                </li>
              ))}
            </ul>
            {showAdminLink && (
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <Link href="/colonias" target="_blank"
                  className="flex items-center justify-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 py-1.5">
                  <Plus className="w-3 h-3" /> Administrar catálogo de colonias
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {required && !selectedId && (
        <p className="text-xs text-slate-400">Seleccione una colonia del catálogo</p>
      )}
    </div>
  )
}
