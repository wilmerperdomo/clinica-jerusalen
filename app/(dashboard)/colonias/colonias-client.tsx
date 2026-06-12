'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/confirm-dialog'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import {
  exportarColoniasCsv, parseColoniasImport, fmtFechaColonia, type ColoniaRow,
} from '@/lib/colonia-utils'
import {
  MapPin, Plus, Search, Edit2, Trash2, Users, Download, Upload,
  ToggleLeft, ToggleRight, X, Save, CheckCircle2, AlertCircle,
  ArrowLeft, Sparkles,
} from 'lucide-react'

interface Props {
  colonias: ColoniaRow[]
  usoMap: Record<number, number>
}

type FiltroActivo = 'todos' | 'activo' | 'inactivo'
type FiltroUso = 'todos' | 'con_pacientes' | 'sin_pacientes'
type Orden = 'nombre' | 'pacientes' | 'reciente'

const PAGE_SIZE = 30

export default function ColoniasClient({ colonias: initial, usoMap: initialUso }: Props) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [, startTransition] = useTransition()

  const [colonias, setColonias] = useState(initial)
  const [usoMap, setUsoMap] = useState(initialUso)
  const [buscar, setBuscar] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<FiltroActivo>('activo')
  const [filtroUso, setFiltroUso] = useState<FiltroUso>('todos')
  const [orden, setOrden] = useState<Orden>('nombre')
  const [pagina, setPagina] = useState(1)

  const [modal, setModal] = useState<'form' | 'import' | null>(null)
  const [editando, setEditando] = useState<ColoniaRow | null>(null)
  const [nombre, setNombre] = useState('')
  const [activoForm, setActivoForm] = useState(true)
  const [importText, setImportText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const stats = useMemo(() => {
    const pacientesTotal = Object.values(usoMap).reduce((s, n) => s + n, 0)
    const conPacientes = colonias.filter(c => (usoMap[c.id] ?? 0) > 0).length
    const sinUso = colonias.filter(c => !(usoMap[c.id] ?? 0)).length
    const top = [...colonias]
      .sort((a, b) => (usoMap[b.id] ?? 0) - (usoMap[a.id] ?? 0))[0]
    return {
      total: colonias.length,
      activas: colonias.filter(c => c.activo).length,
      inactivas: colonias.filter(c => !c.activo).length,
      pacientesTotal,
      conPacientes,
      sinUso,
      topNombre: top && (usoMap[top.id] ?? 0) > 0 ? top.nombre : null,
      topCount: top ? usoMap[top.id] ?? 0 : 0,
    }
  }, [colonias, usoMap])

  const lista = useMemo(() => {
    const q = buscar.toLowerCase().trim()
    let rows = colonias.filter(c => {
      if (filtroActivo === 'activo' && !c.activo) return false
      if (filtroActivo === 'inactivo' && c.activo) return false
      const uso = usoMap[c.id] ?? 0
      if (filtroUso === 'con_pacientes' && uso === 0) return false
      if (filtroUso === 'sin_pacientes' && uso > 0) return false
      if (!q) return true
      return c.nombre.toLowerCase().includes(q)
    })

    rows = [...rows].sort((a, b) => {
      if (orden === 'pacientes') return (usoMap[b.id] ?? 0) - (usoMap[a.id] ?? 0)
      if (orden === 'reciente') {
        return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      }
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    return rows
  }, [colonias, buscar, filtroActivo, filtroUso, orden, usoMap])

  const totalPaginas = Math.max(1, Math.ceil(lista.length / PAGE_SIZE))
  const paginada = lista.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  useEffect(() => { setPagina(1) }, [buscar, filtroActivo, filtroUso, orden])

  function notify(ok: boolean, text: string) {
    setToast({ ok, text })
  }

  function abrirNueva() {
    setEditando(null)
    setNombre('')
    setActivoForm(true)
    setError('')
    setModal('form')
  }

  function abrirEditar(c: ColoniaRow) {
    setEditando(c)
    setNombre(c.nombre)
    setActivoForm(c.activo)
    setError('')
    setModal('form')
  }

  async function guardar() {
    const n = nombre.trim()
    if (!n) { setError('Ingrese el nombre de la colonia.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()

    if (!editando) {
      const dup = colonias.find(c => c.nombre.toLowerCase() === n.toLowerCase())
      if (dup) {
        setError('Ya existe una colonia con ese nombre.')
        setLoading(false)
        return
      }
      const { data, error: e } = await supabase
        .from('colonias')
        .insert({ nombre: n, activo: activoForm } as never)
        .select('id, nombre, activo, created_at')
        .single()
      setLoading(false)
      if (e) { setError(e.message); return }
      if (data) {
        setColonias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
        notify(true, `Colonia "${n}" registrada.`)
      }
    } else {
      const { error: e } = await supabase
        .from('colonias')
        .update({ nombre: n, activo: activoForm } as never)
        .eq('id', editando.id)
      setLoading(false)
      if (e) { setError(e.message); return }
      setColonias(prev => prev.map(c =>
        c.id === editando.id ? { ...c, nombre: n, activo: activoForm } : c,
      ))
      notify(true, 'Colonia actualizada.')
    }
    setModal(null)
    startTransition(() => router.refresh())
  }

  async function importarMasivo() {
    const nombres = parseColoniasImport(importText)
    if (!nombres.length) {
      setError('No hay nombres válidos. Escriba una colonia por línea.')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const existentes = new Set(colonias.map(c => c.nombre.toLowerCase()))
    const nuevas = nombres.filter(n => !existentes.has(n.toLowerCase()))

    if (!nuevas.length) {
      setError('Todas las colonias del listado ya existen.')
      setLoading(false)
      return
    }

    const { data, error: e } = await supabase
      .from('colonias')
      .insert(nuevas.map(nombre => ({ nombre, activo: true })) as never)
      .select('id, nombre, activo, created_at')

    setLoading(false)
    if (e) { setError(e.message); return }

    const agregadas = data ?? []
    setColonias(prev =>
      [...prev, ...agregadas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    )
    setModal(null)
    setImportText('')
    notify(true, `${agregadas.length} colonia(s) importadas. ${nombres.length - nuevas.length} duplicadas omitidas.`)
    startTransition(() => router.refresh())
  }

  async function toggleActivo(c: ColoniaRow) {
    const { confirmed } = await confirmDialog({
      title: c.activo ? 'Desactivar colonia' : 'Activar colonia',
      message: c.activo
        ? `¿Desactivar "${c.nombre}"? No aparecerá al registrar pacientes.`
        : `¿Activar "${c.nombre}" para uso en pacientes?`,
      variant: c.activo ? 'warning' : 'success',
      confirmLabel: c.activo ? 'Desactivar' : 'Activar',
      details: usoMap[c.id]
        ? [{ label: 'Pacientes asignados', value: String(usoMap[c.id]) }]
        : undefined,
    })
    if (!confirmed) return

    const supabase = createClient()
    const { error: e } = await supabase
      .from('colonias')
      .update({ activo: !c.activo } as never)
      .eq('id', c.id)
    if (e) { notify(false, e.message); return }
    setColonias(prev => prev.map(x => x.id === c.id ? { ...x, activo: !c.activo } : x))
    notify(true, c.activo ? 'Colonia desactivada.' : 'Colonia activada.')
  }

  async function eliminar(c: ColoniaRow) {
    const uso = usoMap[c.id] ?? 0
    if (uso > 0) {
      notify(false, `No se puede eliminar: ${uso} paciente(s) usan esta colonia.`)
      return
    }
    const { confirmed } = await confirmDialog({
      title: 'Eliminar colonia',
      message: `¿Eliminar permanentemente "${c.nombre}" del catálogo?`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    const supabase = createClient()
    const { error: e } = await supabase.from('colonias').delete().eq('id', c.id)
    if (e) { notify(false, e.message); return }
    setColonias(prev => prev.filter(x => x.id !== c.id))
    notify(true, 'Colonia eliminada.')
    startTransition(() => router.refresh())
  }

  function exportar() {
    exportarColoniasCsv(lista.map(c => ({
      nombre: c.nombre,
      activo: c.activo ? 'Sí' : 'No',
      pacientes: usoMap[c.id] ?? 0,
    })))
    notify(true, `Exportadas ${lista.length} colonias.`)
  }

  return (
    <div className="min-h-full min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50/20">

      {toast && (
        <div className={cn(
          'fixed top-20 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm',
          toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.text}
        </div>
      )}

      {/* HERO */}
      <div className="relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, #1a4a6e 45%, #2d1b4e 100%)` }}>
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-10 bg-violet-300 blur-3xl" />
        <div className="absolute -left-10 bottom-0 w-40 h-40 rounded-full opacity-15"
          style={{ backgroundColor: BRAND.gold }} />

        <div className="relative px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/pacientes"
                className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 mb-2 transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Pacientes
              </Link>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  Dirección de pacientes
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <MapPin className="w-8 h-8" style={{ color: BRAND.goldLight }} />
                Catálogo de Colonias
              </h1>
              <p className="text-white/60 text-sm mt-1">
                Barrios y colonias para registro de pacientes
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setImportText(''); setError(''); setModal('import') }}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <Upload className="w-3.5 h-3.5" /> Importar
              </button>
              <button onClick={abrirNueva}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition"
                style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                <Plus className="w-4 h-4" /> Nueva Colonia
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mt-5">
            {[
              { label: 'Total', value: stats.total, icon: MapPin },
              { label: 'Activas', value: stats.activas, icon: CheckCircle2 },
              { label: 'Inactivas', value: stats.inactivas, icon: ToggleLeft },
              { label: 'Con pacientes', value: stats.conPacientes, icon: Users },
              { label: 'Sin uso', value: stats.sinUso, icon: MapPin },
              { label: 'Pacientes', value: stats.pacientesTotal, icon: Users },
            ].map(k => (
              <div key={k.label}
                className="rounded-2xl p-3 bg-white/10 backdrop-blur border border-white/15 flex items-center gap-2">
                <k.icon className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <p className="text-xl sm:text-2xl font-black text-white leading-none">{k.value}</p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide mt-0.5">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {stats.topNombre && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: BRAND.gold }}>
                <MapPin className="w-4 h-4" style={{ color: BRAND.navy }} />
              </div>
              <p className="text-sm text-white">
                <span className="text-white/60">Más usada: </span>
                <strong>{stats.topNombre}</strong>
                <span className="text-white/70 ml-1">({stats.topCount} pacientes)</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto w-full">

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
            placeholder="Buscar colonia por nombre..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl overflow-hidden border bg-white">
            {([['todos', 'Todas'], ['activo', 'Activas'], ['inactivo', 'Inactivas']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFiltroActivo(v)}
                className={cn('px-3 py-2 text-sm font-medium transition',
                  filtroActivo === v ? 'text-white' : 'text-gray-600 hover:bg-gray-50')}
                style={filtroActivo === v ? { backgroundColor: BRAND.navy } : undefined}>
                {l}
              </button>
            ))}
          </div>
          <select value={filtroUso} onChange={e => setFiltroUso(e.target.value as FiltroUso)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="todos">Todos los usos</option>
            <option value="con_pacientes">Con pacientes</option>
            <option value="sin_pacientes">Sin pacientes</option>
          </select>
          <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="nombre">Orden A → Z</option>
            <option value="pacientes">Más pacientes</option>
            <option value="reciente">Más recientes</option>
          </select>
        </div>
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">
            {lista.length} colonia{lista.length !== 1 ? 's' : ''}
            {lista.length !== colonias.length && (
              <span className="text-slate-400 font-normal"> de {colonias.length}</span>
            )}
          </p>
          <button onClick={exportar} disabled={!lista.length}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Colonia / Barrio</th>
                <th className="text-center px-4 py-3 hidden sm:table-cell">Pacientes</th>
                <th className="text-center px-4 py-3 hidden md:table-cell">Registro</th>
                <th className="text-center px-4 py-3">Estado</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginada.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-400">
                    <MapPin className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-slate-500">No hay colonias que coincidan</p>
                    <p className="text-xs mt-1">Agregue una nueva o importe un listado</p>
                    <button onClick={abrirNueva}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
                      <Plus className="w-4 h-4" /> Nueva colonia
                    </button>
                  </td>
                </tr>
              ) : paginada.map((c, i) => {
                const uso = usoMap[c.id] ?? 0
                return (
                  <tr key={c.id} className={cn('hover:bg-violet-50/40 transition border-l-4 border-l-violet-400', !c.activo && 'opacity-55 border-l-gray-300')}>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {(pagina - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{c.nombre}</p>
                          {uso > 0 && (
                            <p className="text-xs text-slate-400 sm:hidden">{uso} paciente(s)</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {uso > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-violet-50 text-violet-700 px-2 py-1 rounded-full">
                          <Users className="w-3 h-3" /> {uso}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 hidden md:table-cell">
                      {fmtFechaColonia(c.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActivo(c)} title={c.activo ? 'Desactivar' : 'Activar'}>
                        {c.activo
                          ? <ToggleRight className="w-6 h-6 text-emerald-500 mx-auto" />
                          : <ToggleLeft className="w-6 h-6 text-slate-300 mx-auto" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => abrirEditar(c)}
                          className="p-1.5 rounded-lg hover:bg-violet-50 transition" title="Editar"
                          style={{ color: BRAND.navy }}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!uso && (
                          <button onClick={() => eliminar(c)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Página {pagina} de {totalPaginas}</span>
            <div className="flex gap-1">
              <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50">Anterior</button>
              <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal formulario */}
      {modal === 'form' && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 text-white rounded-t-2xl"
              style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
              <h3 className="font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5" style={{ color: BRAND.goldLight }} />
                {editando ? 'Editar colonia' : 'Nueva colonia'}
              </h3>
              <button onClick={() => setModal(null)} className="text-white/70 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre de la colonia <span className="text-red-500">*</span>
                </label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoFocus
                  placeholder="Ej: Res. La Cañada, Los Pinos..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={e => e.key === 'Enter' && guardar()}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={activoForm}
                  onChange={e => setActivoForm(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded" />
                <span className="text-sm text-slate-700">Disponible para selección en pacientes</span>
              </label>
              {editando && usoMap[editando.id] > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
                  {usoMap[editando.id]} paciente(s) tienen asignada esta colonia.
                </p>
              )}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600">
                Cancelar
              </button>
              <button onClick={guardar} disabled={loading}
                className="flex-1 py-2.5 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: BRAND.navy }}>
                <Save className="w-4 h-4" />
                {loading ? 'Guardando...' : editando ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {modal === 'import' && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 text-white rounded-t-2xl"
              style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
              <h3 className="font-bold flex items-center gap-2">
                <Upload className="w-5 h-5" style={{ color: BRAND.goldLight }} />
                Importar colonias
              </h3>
              <button onClick={() => setModal(null)} className="text-white/70 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3 overflow-y-auto flex-1">
              <p className="text-sm text-slate-600">
                Pegue un nombre por línea. Se omiten duplicados y entradas inválidas.
              </p>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                rows={12}
                placeholder={'Res. La Cañada\nLos Pinos\nVilla Nueva\n...'}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              {importText.trim() && (
                <p className="text-xs text-slate-500">
                  {parseColoniasImport(importText).length} nombre(s) detectados
                </p>
              )}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm">Cancelar</button>
              <button onClick={importarMasivo} disabled={loading}
                className="flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: BRAND.navy }}>
                {loading ? 'Importando...' : 'Importar listado'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
