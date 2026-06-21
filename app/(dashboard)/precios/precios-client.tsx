'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Search, Tag, Pill, FlaskConical, ClipboardList, X, Package,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent } from '@/components/module-layout'
import { precioLabLista } from '@/lib/membresia-utils'

/* ── Tipos de datos de catálogo ── */
interface Producto { id: number; codigo?: string | null; nombre: string; nombre_generico?: string | null; categoria?: string | null; unidad?: string | null; tipo?: string | null; precio_venta: number | null }
interface Servicio { id: number; nombre: string; tipo?: string | null; precio: number | null }
interface Prueba   { id: number; nombre: string; costo: number | null; es_panel?: boolean | null }
interface Lista    { id: number; nombre: string }

interface Props {
  productos: Producto[]
  servicios: Servicio[]
  pruebas: Prueba[]
  listas: Lista[]
  preciosLista: Record<number, Record<number, number>>
}

type Categoria = 'medicamento' | 'laboratorio' | 'servicio'
type Filtro = 'todos' | Categoria

interface ItemPrecio {
  key: string
  categoria: Categoria
  nombre: string
  codigo?: string
  detalle?: string
  precio: number
}

/* ── Helpers ── */
const fmt = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const META: Record<Categoria, { label: string; icon: typeof Pill; chip: string; badge: string; iconCls: string }> = {
  medicamento:  { label: 'Medicamentos',  icon: Pill,          chip: 'bg-sky-600',     badge: 'bg-sky-100 text-sky-700',         iconCls: 'text-sky-600' },
  laboratorio:  { label: 'Laboratorio',   icon: FlaskConical,  chip: 'bg-cyan-600',    badge: 'bg-cyan-100 text-cyan-700',       iconCls: 'text-cyan-600' },
  servicio:     { label: 'Servicios',     icon: ClipboardList, chip: 'bg-violet-600',  badge: 'bg-violet-100 text-violet-700',   iconCls: 'text-violet-600' },
}

const LIMITE = 80

export default function PreciosClient({ productos, servicios, pruebas, listas, preciosLista }: Props) {
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [listaSel, setListaSel] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* Catálogo unificado (recalcula precio de lab según lista seleccionada) */
  const catalogo = useMemo<ItemPrecio[]>(() => {
    const meds: ItemPrecio[] = productos.map(p => ({
      key: `m-${p.id}`,
      categoria: 'medicamento',
      nombre: p.nombre,
      codigo: p.codigo ?? undefined,
      detalle: [p.nombre_generico, p.tipo || p.categoria, p.unidad].filter(Boolean).join(' · ') || undefined,
      precio: Number(p.precio_venta || 0),
    }))
    const labs: ItemPrecio[] = pruebas.map(pr => ({
      key: `l-${pr.id}`,
      categoria: 'laboratorio',
      nombre: pr.nombre,
      detalle: pr.es_panel ? 'Panel / perfil' : 'Análisis',
      precio: precioLabLista(pr.id, listaSel, preciosLista, Number(pr.costo || 0)),
    }))
    const servs: ItemPrecio[] = servicios.map(s => ({
      key: `s-${s.id}`,
      categoria: 'servicio',
      nombre: s.nombre,
      detalle: s.tipo ?? undefined,
      precio: Number(s.precio || 0),
    }))
    return [...meds, ...labs, ...servs]
  }, [productos, servicios, pruebas, preciosLista, listaSel])

  const conteos = useMemo(() => ({
    medicamento: productos.length,
    laboratorio: pruebas.length,
    servicio: servicios.length,
  }), [productos.length, pruebas.length, servicios.length])

  /* Filtro + búsqueda con ranking (empieza-con primero) */
  const resultados = useMemo(() => {
    const q = norm(query.trim())
    let base = filtro === 'todos' ? catalogo : catalogo.filter(i => i.categoria === filtro)
    if (q) {
      const term = q.split(/\s+/).filter(Boolean)
      base = base
        .map(i => {
          const hay = norm(`${i.nombre} ${i.codigo ?? ''} ${i.detalle ?? ''}`)
          const todas = term.every(t => hay.includes(t))
          if (!todas) return null
          const empieza = norm(i.nombre).startsWith(q) || (i.codigo ? norm(i.codigo).startsWith(q) : false)
          return { item: i, score: empieza ? 0 : 1 }
        })
        .filter((x): x is { item: ItemPrecio; score: number } => x !== null)
        .sort((a, b) => a.score - b.score || a.item.nombre.localeCompare(b.item.nombre))
        .map(x => x.item)
    } else {
      base = [...base].sort((a, b) => a.nombre.localeCompare(b.nombre))
    }
    return base
  }, [catalogo, filtro, query])

  const totalFiltrado = resultados.length
  const visibles = resultados.slice(0, LIMITE)

  const chips: { id: Filtro; label: string; count?: number }[] = [
    { id: 'todos', label: 'Todos', count: catalogo.length },
    { id: 'medicamento', label: 'Medicamentos', count: conteos.medicamento },
    { id: 'laboratorio', label: 'Laboratorio', count: conteos.laboratorio },
    { id: 'servicio', label: 'Servicios', count: conteos.servicio },
  ]

  return (
    <ModuleShell tint="emerald">
      <ModuleHero
        title="Consulta de Precios"
        subtitle="Busca medicamentos, laboratorio y servicios al instante"
        badge="Mostrador"
        icon={Tag}
        gradient="emerald"
        kpis={[
          { label: 'Medicamentos', value: conteos.medicamento, icon: Pill },
          { label: 'Pruebas lab', value: conteos.laboratorio, icon: FlaskConical },
          { label: 'Servicios', value: conteos.servicio, icon: ClipboardList },
        ]}
      />
      <ModuleContent maxWidth="3xl">
        {/* Buscador */}
        <div className="sticky top-2 z-10">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Escribe un nombre o código…"
              className="w-full border border-gray-200 rounded-2xl pl-12 pr-12 py-4 text-lg shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Limpiar"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Filtros + lista de precios */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {chips.map(c => (
              <button
                key={c.id}
                onClick={() => setFiltro(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  filtro === c.id
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {c.label}{typeof c.count === 'number' ? ` · ${c.count}` : ''}
              </button>
            ))}

            {listas.length > 0 && (filtro === 'todos' || filtro === 'laboratorio') && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-gray-500">Lista lab:</span>
                <select
                  value={listaSel ?? ''}
                  onChange={e => setListaSel(e.target.value ? Number(e.target.value) : null)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
                >
                  <option value="">Precio base</option>
                  {listas.map(l => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Resultados */}
        <div className="mt-4">
          {totalFiltrado === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {query ? `Sin resultados para “${query}”.` : 'Empieza a escribir para buscar precios.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2 px-1">
                {totalFiltrado} resultado{totalFiltrado !== 1 ? 's' : ''}
                {totalFiltrado > LIMITE ? ` · mostrando ${LIMITE}, refina la búsqueda` : ''}
              </p>
              <div className="space-y-2">
                {visibles.map(item => {
                  const meta = META[item.categoria]
                  const Icon = meta.icon
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm hover:border-emerald-200 transition"
                    >
                      <div className={`w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 ${meta.iconCls}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">{item.nombre}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.badge}`}>{meta.label}</span>
                          {item.codigo && <span className="text-xs text-gray-400">#{item.codigo}</span>}
                          {item.detalle && <span className="text-xs text-gray-500 truncate">{item.detalle}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-lg font-black tabular-nums ${item.precio > 0 ? 'text-gray-900' : 'text-amber-600'}`}>
                          {item.precio > 0 ? fmt(item.precio) : 'Sin precio'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </ModuleContent>
    </ModuleShell>
  )
}
