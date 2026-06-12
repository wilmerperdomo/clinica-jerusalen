'use client'

import { useMemo, useState } from 'react'
import {
  Search, FlaskConical, X, Check, Layers, TestTube2,
  Clock, Sparkles,
} from 'lucide-react'
import type { PruebaLab } from '@/lib/lab-utils'
import { tuboColorClase } from '@/lib/lab-utils'

export type FiltroTipoPrueba = 'todas' | 'panel' | 'simple'

interface Props {
  pruebas: PruebaLab[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  pacienteId?: string
  precioParaPaciente: (pruebaId: number, pacienteId?: string) => number
  loading?: boolean
}

export default function LabSelectorPruebas({
  pruebas,
  selectedIds,
  onChange,
  pacienteId,
  precioParaPaciente,
  loading,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoPrueba>('todas')

  const activas = useMemo(
    () => pruebas.filter(p => p.activo !== false),
    [pruebas],
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return activas.filter(p => {
      if (filtroTipo === 'panel' && !p.es_panel) return false
      if (filtroTipo === 'simple' && p.es_panel) return false
      if (!q) return true
      const texto = [p.nombre, p.description, p.color, p.nota].filter(Boolean).join(' ').toLowerCase()
      return texto.includes(q)
    })
  }, [activas, busqueda, filtroTipo])

  const seleccionadas = useMemo(
    () => selectedIds
      .map(id => activas.find(p => p.id === id))
      .filter((p): p is PruebaLab => !!p),
    [selectedIds, activas],
  )

  const totalSeleccion = useMemo(
    () => selectedIds.reduce((s, id) => s + precioParaPaciente(id, pacienteId), 0),
    [selectedIds, pacienteId, precioParaPaciente],
  )

  function toggle(id: number) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id],
    )
  }

  function seleccionarVisibles() {
    const ids = new Set(selectedIds)
    for (const p of filtradas) ids.add(p.id)
    onChange([...ids])
  }

  function limpiar() {
    onChange([])
  }

  const contadores = useMemo(() => ({
    total: activas.length,
    paneles: activas.filter(p => p.es_panel).length,
    simples: activas.filter(p => !p.es_panel).length,
  }), [activas])

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FlaskConical className="w-4 h-4 text-cyan-600" />
          <span>
            <strong className="text-gray-900">{contadores.total}</strong> pruebas en catálogo
            {loading && <span className="ml-2 text-xs text-cyan-600 animate-pulse">actualizando…</span>}
          </span>
        </div>
        <div className="flex gap-1">
          {(['todas', 'panel', 'simple'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltroTipo(t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filtroTipo === t
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === 'todas' ? `Todas (${contadores.total})` : t === 'panel' ? `Paneles (${contadores.paneles})` : `Simples (${contadores.simples})`}
            </button>
          ))}
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, descripción, tubo, observación…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50/80 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          autoComplete="off"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Seleccionadas */}
      {seleccionadas.length > 0 && (
        <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-teal-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cyan-900 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              {seleccionadas.length} prueba{seleccionadas.length !== 1 ? 's' : ''} seleccionada{seleccionadas.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-cyan-800">L. {totalSeleccion.toFixed(2)}</span>
              <button type="button" onClick={limpiar} className="text-xs text-red-600 hover:underline">
                Quitar todas
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {seleccionadas.map(p => {
              const precio = precioParaPaciente(p.id, pacienteId)
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-white border border-cyan-200 text-xs font-medium text-gray-800 shadow-sm"
                >
                  {p.nombre}
                  <span className="text-cyan-700 font-semibold">L.{precio.toFixed(0)}</span>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="p-0.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={seleccionarVisibles}
          disabled={filtradas.length === 0}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-40"
        >
          Seleccionar {filtradas.length === activas.length ? 'todas' : `visibles (${filtradas.length})`}
        </button>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={limpiar}
            className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-600 font-medium"
          >
            Limpiar selección
          </button>
        )}
        <span className="self-center text-gray-400 ml-auto">
          Mostrando {filtradas.length} de {activas.length}
        </span>
      </div>

      {/* Lista completa */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="max-h-[min(52dvh,520px)] overflow-y-auto divide-y divide-gray-100">
          {filtradas.length === 0 ? (
            <div className="py-12 text-center text-gray-400 px-4">
              <TestTube2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No hay pruebas que coincidan</p>
              <p className="text-xs mt-1">Prueba otro término o agrega pruebas en el catálogo</p>
            </div>
          ) : (
            filtradas.map(p => {
              const sel = selectedIds.includes(p.id)
              const precio = precioParaPaciente(p.id, pacienteId)
              const precioBase = Number(p.costo)
              const esLista = pacienteId && precio !== precioBase

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition ${
                    sel ? 'bg-cyan-50/80 hover:bg-cyan-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
                    sel ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-gray-300 bg-white'
                  }`}>
                    {sel && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{p.nombre}</span>
                      {p.es_panel && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          <Layers className="w-3 h-3" /> Panel
                        </span>
                      )}
                      {p.color && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tuboColorClase(p.color)}`}>
                          {p.color}
                        </span>
                      )}
                      {esLista && (
                        <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                          <Sparkles className="w-3 h-3 inline" /> lista
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="font-bold text-cyan-700 text-sm">L. {precio.toFixed(2)}</span>
                      {p.dias != null && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {p.dias}d entrega
                        </span>
                      )}
                      {precioBase !== precio && (
                        <span className="line-through text-gray-400">L. {precioBase.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {!pacienteId && selectedIds.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Seleccione un paciente para aplicar precios por lista de precios.
        </p>
      )}
    </div>
  )
}
