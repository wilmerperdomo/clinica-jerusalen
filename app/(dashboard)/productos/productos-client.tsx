'use client'

import { useState, useMemo, useTransition } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useConfirm } from '@/components/confirm-dialog'
import {
  Pill, Plus, Search, Edit2, X, Save, ToggleLeft, ToggleRight,
  Package, Beaker, AlertCircle, CheckCircle2, Filter,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

/* ─── tipos ─────────────────────────────────────────────── */
interface Producto {
  id: number; codigo: string; nombre: string
  nombre_generico?: string; laboratorio?: string
  categoria?: string; unidad?: string; tipo: string
  es_antibiotico: boolean; costo: number; precio_venta: number
  stock_minimo: number; activo: boolean
}

const TIPOS = ['Medicamento', 'Producto', 'Insumo'] as const
const CATEGORIAS = ['Medicamentos', 'Antibióticos', 'Vitaminas', 'Suplementos', 'Insumos Médicos', 'Productos de Limpieza', 'Otros']
const UNIDADES = ['Unidad', 'Caja', 'Frasco', 'Ampolla', 'Sobre', 'Tubo', 'Rollo', 'Par', 'Kit']

const TIPO_CFG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  'Medicamento': { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: Pill    },
  'Producto':    { color: 'text-green-700',  bg: 'bg-green-50 border-green-200', icon: Package },
  'Insumo':      { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', icon: Beaker  },
}

const FORM_VACIO = {
  codigo: '', nombre: '', nombre_generico: '', laboratorio: '',
  categoria: 'Medicamentos', unidad: 'Unidad', tipo: 'Medicamento',
  es_antibiotico: false, costo: '', precio_venta: '', stock_minimo: '5', activo: true,
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function ProductosClient({ productos: init }: { productos: Producto[] }) {
  const supabase = sb()
  const confirmDialog = useConfirm()
  const [, startTransition] = useTransition()
  const [productos,  setProductos]  = useState<Producto[]>(init)
  const [buscar,     setBuscar]     = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activo' | 'inactivo'>('activo')
  const [modal,      setModal]      = useState(false)
  const [editando,   setEditando]   = useState<Producto | null>(null)
  const [form,       setForm]       = useState<typeof FORM_VACIO>({ ...FORM_VACIO })
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState('')

  /* ── filtros ── */
  const lista = useMemo(() => {
    const q = buscar.toLowerCase()
    return productos.filter(p => {
      if (filtroTipo && p.tipo !== filtroTipo) return false
      if (filtroActivo === 'activo'   && !p.activo)  return false
      if (filtroActivo === 'inactivo' &&  p.activo)  return false
      if (!q) return true
      return `${p.nombre} ${p.nombre_generico ?? ''} ${p.codigo} ${p.laboratorio ?? ''}`.toLowerCase().includes(q)
    })
  }, [productos, buscar, filtroTipo, filtroActivo])

  /* ── stats ── */
  const stats = useMemo(() => ({
    total:       productos.length,
    activos:     productos.filter(p => p.activo).length,
    meds:        productos.filter(p => p.tipo === 'Medicamento').length,
    antibioticos:productos.filter(p => p.es_antibiotico).length,
    sinPrecio:   productos.filter(p => p.activo && !p.precio_venta).length,
  }), [productos])

  /* ── abrir modal ── */
  function abrirNuevo() {
    setEditando(null)
    setForm({ ...FORM_VACIO })
    setError('')
    setModal(true)
  }

  function abrirEditar(p: Producto) {
    setEditando(p)
    setForm({
      codigo: p.codigo, nombre: p.nombre,
      nombre_generico: p.nombre_generico ?? '',
      laboratorio: p.laboratorio ?? '',
      categoria: p.categoria ?? 'Medicamentos',
      unidad: p.unidad ?? 'Unidad',
      tipo: p.tipo,
      es_antibiotico: p.es_antibiotico,
      costo: String(p.costo),
      precio_venta: String(p.precio_venta),
      stock_minimo: String(p.stock_minimo),
      activo: p.activo,
    })
    setError('')
    setModal(true)
  }

  /* ── guardar ── */
  async function guardar() {
    if (!form.codigo.trim()) { setError('El código es obligatorio'); return }
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.precio_venta || Number(form.precio_venta) <= 0) { setError('El precio de venta es obligatorio'); return }
    setGuardando(true); setError('')

    const payload = {
      codigo:          form.codigo.trim().toUpperCase(),
      nombre:          form.nombre.trim(),
      nombre_generico: form.nombre_generico.trim() || null,
      laboratorio:     form.laboratorio.trim() || null,
      categoria:       form.categoria,
      unidad:          form.unidad,
      tipo:            form.tipo,
      es_antibiotico:  form.es_antibiotico,
      costo:           Number(form.costo) || 0,
      precio_venta:    Number(form.precio_venta),
      stock_minimo:    Number(form.stock_minimo) || 5,
      activo:          form.activo,
    }

    if (editando) {
      const { error: e } = await supabase.from('productos').update(payload).eq('id', editando.id)
      if (e) { setError(e.message); setGuardando(false); return }
      setProductos(prev => prev.map(p => p.id === editando.id ? { ...p, ...payload } : p))
    } else {
      const { data, error: e } = await supabase.from('productos').insert(payload).select().single()
      if (e) { setError(e.message); setGuardando(false); return }
      setProductos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    }
    setGuardando(false); setModal(false)
  }

  /* ── toggle activo ── */
  async function toggleActivo(p: Producto) {
    const { confirmed } = await confirmDialog({
      title: p.activo ? 'Desactivar producto' : 'Activar producto',
      message: p.activo
        ? `¿Está seguro que desea desactivar el producto "${p.nombre}"?`
        : `¿Activar el producto "${p.nombre}"?`,
      variant: p.activo ? 'warning' : 'success',
      confirmLabel: p.activo ? 'Desactivar' : 'Activar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return alert('Error: ' + error.message)
    setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x))
  }

  /* ══════════════════════════════════════════════════════════ */
  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Catálogo de Productos"
        subtitle="Medicamentos, productos e insumos"
        badge="Farmacia e inventario"
        icon={Pill}
        kpis={[
          { label: 'Total', value: stats.total, icon: Package },
          { label: 'Activos', value: stats.activos, icon: CheckCircle2 },
          { label: 'Medicamentos', value: stats.meds, icon: Pill },
          { label: 'Antibióticos', value: stats.antibioticos, icon: Beaker },
          { label: 'Sin precio', value: stats.sinPrecio, icon: AlertCircle },
        ]}
        actions={
          <ModuleBtnPrimary onClick={abrirNuevo}>
            <Plus className="w-4 h-4" /> Nuevo Producto
          </ModuleBtnPrimary>
        }
      />
      <ModuleContent>

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-300 outline-none bg-white"
            placeholder="Buscar por nombre, código, laboratorio..."
            value={buscar} onChange={e => setBuscar(e.target.value)}
          />
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex border rounded-xl overflow-hidden bg-white">
          {(['todos','activo','inactivo'] as const).map(v => (
            <button key={v} onClick={() => setFiltroActivo(v)}
              className={`px-3 py-2 text-sm capitalize transition ${filtroActivo === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {v === 'todos' ? 'Todos' : v === 'activo' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLA ── */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">{lista.length} producto{lista.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Laboratorio</th>
                <th className="text-right px-4 py-3">Costo</th>
                <th className="text-right px-4 py-3">P. Venta</th>
                <th className="text-center px-4 py-3 hidden sm:table-cell">Stock mín.</th>
                <th className="text-center px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <Pill className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>No se encontraron productos</p>
                  </td>
                </tr>
              ) : lista.map(p => {
                const cfg = TIPO_CFG[p.tipo] ?? TIPO_CFG['Producto']
                const Icon = cfg.icon
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 transition ${!p.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                        <div>
                          <p className="font-medium text-gray-900">{p.nombre}</p>
                          {p.nombre_generico && <p className="text-xs text-gray-400">{p.nombre_generico}</p>}
                          <p className="text-xs text-gray-400 font-mono">{p.codigo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
                        {p.tipo}
                        {p.es_antibiotico && ' 🔴'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">{p.laboratorio || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">L {Number(p.costo).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {Number(p.precio_venta) > 0
                        ? `L ${Number(p.precio_venta).toFixed(2)}`
                        : <span className="text-red-400 text-xs">Sin precio</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 hidden sm:table-cell">{p.stock_minimo}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}>
                        {p.activo
                          ? <ToggleRight className="w-6 h-6 text-green-500 mx-auto" />
                          : <ToggleLeft  className="w-6 h-6 text-gray-300 mx-auto" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => abrirEditar(p)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ MODAL NUEVO / EDITAR ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b flex-shrink-0">
              <h3 className="font-semibold text-gray-900">
                {editando ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1 space-y-4">

              {/* código y tipo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código <span className="text-red-500">*</span></label>
                  <input value={form.codigo}
                    onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-blue-300 outline-none"
                    placeholder="MED-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tipo}
                    onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                <input value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                  placeholder="Amoxicilina 500mg" />
              </div>

              {/* nombre genérico y laboratorio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Genérico</label>
                  <input value={form.nombre_generico}
                    onChange={e => setForm(p => ({ ...p, nombre_generico: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="Amoxicilina" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Laboratorio / Marca</label>
                  <input value={form.laboratorio}
                    onChange={e => setForm(p => ({ ...p, laboratorio: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="Bayer, Pfizer..." />
                </div>
              </div>

              {/* categoría, unidad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select value={form.categoria}
                    onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                  <select value={form.unidad}
                    onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* precios y stock mínimo */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Costo</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">L.</span>
                    <input type="number" min="0" step="0.01" value={form.costo}
                      onChange={e => setForm(p => ({ ...p, costo: e.target.value }))}
                      className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">L.</span>
                    <input type="number" min="0" step="0.01" value={form.precio_venta}
                      onChange={e => setForm(p => ({ ...p, precio_venta: e.target.value }))}
                      className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Mín.</label>
                  <input type="number" min="0" value={form.stock_minimo}
                    onChange={e => setForm(p => ({ ...p, stock_minimo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>

              {/* antibiótico + activo */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.es_antibiotico}
                    onChange={e => setForm(p => ({ ...p, es_antibiotico: e.target.checked }))}
                    className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-gray-700">🔴 Es Antibiótico (requiere receta)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.activo}
                    onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))}
                    className="w-4 h-4 accent-green-500" />
                  <span className="text-sm text-gray-700">Activo</span>
                </label>
              </div>

              {/* margen automático */}
              {Number(form.costo) > 0 && Number(form.precio_venta) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-green-700">Margen de ganancia</span>
                  <span className="font-bold text-green-800">
                    {(((Number(form.precio_venta) - Number(form.costo)) / Number(form.costo)) * 100).toFixed(1)}%
                    &nbsp;(L {(Number(form.precio_venta) - Number(form.costo)).toFixed(2)} por unidad)
                  </span>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-4 sm:px-6 py-4 border-t">
              <button onClick={() => setModal(false)} className="px-4 py-2.5 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-blue-700">
                <Save className="w-4 h-4" /> {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
