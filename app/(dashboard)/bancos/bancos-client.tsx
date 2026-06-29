'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/confirm-dialog'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import type { BancoRow } from '@/lib/caja-bancos'
import {
  Landmark, Plus, Search, Edit2, Trash2, Download, Upload,
  ToggleLeft, ToggleRight, X, Save, CheckCircle2, AlertCircle, ArrowLeft, Sparkles,
} from 'lucide-react'

interface Props {
  bancos: BancoRow[]
}

type FiltroActivo = 'todos' | 'activo' | 'inactivo'

export default function BancosClient({ bancos: initial }: Props) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [, startTransition] = useTransition()

  const [bancos, setBancos] = useState<BancoRow[]>(initial)
  const [buscar, setBuscar] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<FiltroActivo>('todos')

  const [modal, setModal] = useState<'form' | 'import' | null>(null)
  const [editando, setEditando] = useState<BancoRow | null>(null)
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

  const stats = useMemo(() => ({
    total: bancos.length,
    activos: bancos.filter(b => b.activo).length,
    inactivos: bancos.filter(b => !b.activo).length,
  }), [bancos])

  const lista = useMemo(() => {
    const q = buscar.toLowerCase().trim()
    return bancos
      .filter(b => {
        if (filtroActivo === 'activo' && !b.activo) return false
        if (filtroActivo === 'inactivo' && b.activo) return false
        if (!q) return true
        return b.nombre.toLowerCase().includes(q)
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [bancos, buscar, filtroActivo])

  function notify(ok: boolean, text: string) { setToast({ ok, text }) }

  function abrirNuevo() {
    setEditando(null)
    setNombre('')
    setActivoForm(true)
    setError('')
    setModal('form')
  }

  function abrirEditar(b: BancoRow) {
    setEditando(b)
    setNombre(b.nombre)
    setActivoForm(b.activo)
    setError('')
    setModal('form')
  }

  async function guardar() {
    const n = nombre.trim()
    if (!n) { setError('Ingrese el nombre del banco.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()

    if (!editando) {
      const dup = bancos.find(b => b.nombre.toLowerCase() === n.toLowerCase())
      if (dup) {
        setError('Ya existe un banco con ese nombre.')
        setLoading(false)
        return
      }
      const { data, error: e } = await supabase
        .from('bancos')
        .insert({ nombre: n, activo: activoForm } as never)
        .select('id, nombre, activo, orden, created_at')
        .single()
      setLoading(false)
      if (e) { setError(e.message); return }
      if (data) {
        setBancos(prev => [...prev, data as BancoRow])
        notify(true, `Banco "${n}" registrado.`)
      }
    } else {
      const { error: e } = await supabase
        .from('bancos')
        .update({ nombre: n, activo: activoForm } as never)
        .eq('id', editando.id)
      setLoading(false)
      if (e) { setError(e.message); return }
      setBancos(prev => prev.map(b =>
        b.id === editando.id ? { ...b, nombre: n, activo: activoForm } : b,
      ))
      notify(true, 'Banco actualizado.')
    }
    setModal(null)
    startTransition(() => router.refresh())
  }

  async function importarMasivo() {
    const nombres = importText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
    if (!nombres.length) {
      setError('No hay nombres válidos. Escriba un banco por línea.')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const existentes = new Set(bancos.map(b => b.nombre.toLowerCase()))
    const nuevos = [...new Set(nombres)].filter(n => !existentes.has(n.toLowerCase()))

    if (!nuevos.length) {
      setError('Todos los bancos del listado ya existen.')
      setLoading(false)
      return
    }

    const { data, error: e } = await supabase
      .from('bancos')
      .insert(nuevos.map(nombre => ({ nombre, activo: true })) as never)
      .select('id, nombre, activo, orden, created_at')

    setLoading(false)
    if (e) { setError(e.message); return }

    const agregados = (data ?? []) as BancoRow[]
    setBancos(prev => [...prev, ...agregados])
    setModal(null)
    setImportText('')
    notify(true, `${agregados.length} banco(s) importados. ${nombres.length - nuevos.length} duplicados omitidos.`)
    startTransition(() => router.refresh())
  }

  async function toggleActivo(b: BancoRow) {
    const supabase = createClient()
    const { error: e } = await supabase
      .from('bancos')
      .update({ activo: !b.activo } as never)
      .eq('id', b.id)
    if (e) { notify(false, e.message); return }
    setBancos(prev => prev.map(x => x.id === b.id ? { ...x, activo: !b.activo } : x))
    notify(true, b.activo ? 'Banco desactivado.' : 'Banco activado.')
  }

  async function eliminar(b: BancoRow) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar banco',
      message: `¿Eliminar permanentemente "${b.nombre}" del catálogo? Las transferencias ya registradas no se modifican.`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    const supabase = createClient()
    const { error: e } = await supabase.from('bancos').delete().eq('id', b.id)
    if (e) { notify(false, e.message); return }
    setBancos(prev => prev.filter(x => x.id !== b.id))
    notify(true, 'Banco eliminado.')
    startTransition(() => router.refresh())
  }

  function exportar() {
    const filas = [
      ['Banco', 'Estado'],
      ...lista.map(b => [b.nombre, b.activo ? 'Activo' : 'Inactivo']),
    ]
    const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bancos_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notify(true, `Exportados ${lista.length} bancos.`)
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
              <Link href="/ventas"
                className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 mb-2 transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Ventas
              </Link>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  Configuración de cobros
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <Landmark className="w-8 h-8" style={{ color: BRAND.goldLight }} />
                Catálogo de Bancos
              </h1>
              <p className="text-white/60 text-sm mt-1">
                Bancos disponibles al cobrar transferencias. Edite la lista sin tocar código.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setImportText(''); setError(''); setModal('import') }}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <Upload className="w-3.5 h-3.5" /> Importar
              </button>
              <button onClick={abrirNuevo}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition"
                style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                <Plus className="w-4 h-4" /> Nuevo Banco
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5 max-w-md">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Activos', value: stats.activos },
              { label: 'Inactivos', value: stats.inactivos },
            ].map(k => (
              <div key={k.label}
                className="rounded-2xl p-3 bg-white/10 backdrop-blur border border-white/15 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <p className="text-xl sm:text-2xl font-black text-white leading-none">{k.value}</p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide mt-0.5">{k.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-[1100px] mx-auto w-full">

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
              placeholder="Buscar banco por nombre..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
            />
          </div>
          <div className="flex rounded-xl overflow-hidden border bg-white">
            {([['todos', 'Todos'], ['activo', 'Activos'], ['inactivo', 'Inactivos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFiltroActivo(v)}
                className={cn('px-3 py-2 text-sm font-medium transition',
                  filtroActivo === v ? 'text-white' : 'text-gray-600 hover:bg-gray-50')}
                style={filtroActivo === v ? { backgroundColor: BRAND.navy } : undefined}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              {lista.length} banco{lista.length !== 1 ? 's' : ''}
              {lista.length !== bancos.length && (
                <span className="text-slate-400 font-normal"> de {bancos.length}</span>
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
                  <th className="text-left px-4 py-3">Banco</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-16 text-slate-400">
                      <Landmark className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-slate-500">No hay bancos que coincidan</p>
                      <p className="text-xs mt-1">Agregue uno nuevo o importe un listado</p>
                      <button onClick={abrirNuevo}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
                        <Plus className="w-4 h-4" /> Nuevo banco
                      </button>
                    </td>
                  </tr>
                ) : lista.map((b, i) => (
                  <tr key={b.id} className={cn('hover:bg-violet-50/40 transition border-l-4 border-l-violet-400', !b.activo && 'opacity-55 border-l-gray-300')}>
                    <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <p className="font-semibold text-slate-800">{b.nombre}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActivo(b)} title={b.activo ? 'Desactivar' : 'Activar'}>
                        {b.activo
                          ? <ToggleRight className="w-6 h-6 text-emerald-500 mx-auto" />
                          : <ToggleLeft className="w-6 h-6 text-slate-300 mx-auto" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => abrirEditar(b)}
                          className="p-1.5 rounded-lg hover:bg-violet-50 transition" title="Editar"
                          style={{ color: BRAND.navy }}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => eliminar(b)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal formulario */}
      {modal === 'form' && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 text-white rounded-t-2xl"
              style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
              <h3 className="font-bold flex items-center gap-2">
                <Landmark className="w-5 h-5" style={{ color: BRAND.goldLight }} />
                {editando ? 'Editar banco' : 'Nuevo banco'}
              </h3>
              <button onClick={() => setModal(null)} className="text-white/70 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del banco <span className="text-red-500">*</span>
                </label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoFocus
                  placeholder="Ej: Banco Atlántida, BAC Honduras..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={e => e.key === 'Enter' && guardar()}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={activoForm}
                  onChange={e => setActivoForm(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded" />
                <span className="text-sm text-slate-700">Disponible al cobrar transferencias</span>
              </label>
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
                Importar bancos
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
                placeholder={'Banco Atlántida\nBAC Honduras\nBanco Ficohsa\n...'}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              {importText.trim() && (
                <p className="text-xs text-slate-500">
                  {importText.split('\n').map(l => l.trim()).filter(Boolean).length} nombre(s) detectados
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
  )
}
