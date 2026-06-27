'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useConfirm } from '@/components/confirm-dialog'
import {
  Pill, Plus, Search, Edit2, X, Save, ToggleLeft, ToggleRight,
  Package, Beaker, AlertCircle, CheckCircle2, Eye, Download, Upload,
  Wand2, Warehouse,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'
import {
  type Producto, type ProveedorMin, type StockProducto,
  ISV_OPCIONES, margenVenta, validarProducto, productosACsv,
} from '@/lib/productos-utils'
import ProductoDetalleModal from '@/components/productos/producto-detalle-modal'
import { siguienteCodigoProducto, importarProductos, type ImportProductoRow } from './actions'

interface CategoriaRow { id: number; nombre: string; tabla: string; activo: boolean }

const TIPOS = ['Medicamento', 'Producto', 'Insumo'] as const
const UNIDADES_FALLBACK = ['Unidad', 'Caja', 'Frasco', 'Ampolla', 'Sobre', 'Tubo', 'Rollo', 'Par', 'Kit']
const CATEGORIAS_FALLBACK = ['Medicamentos', 'Insumos Médicos', 'Reactivos Lab', 'Productos OTC', 'Otros']

const TIPO_CFG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  'Medicamento': { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: Pill    },
  'Producto':    { color: 'text-green-700',  bg: 'bg-green-50 border-green-200', icon: Package },
  'Insumo':      { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', icon: Beaker  },
}

// En Honduras los medicamentos están exentos de ISV.
const FORM_VACIO = {
  codigo: '', nombre: '', nombre_generico: '', laboratorio: '',
  categoria: 'Medicamentos', unidad: 'Unidad', tipo: 'Medicamento',
  es_antibiotico: false, costo: '', precio_venta: '', stock_minimo: '5', activo: true,
  codigo_barra: '', principio_activo: '', concentracion: '', presentacion: '', marca: '',
  requiere_receta: false, es_controlado: false, gravado: false, facturable: true,
  precio_minimo: '', dias_reposicion: '7', isv_porcentaje: '0', proveedor_preferido_id: '',
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

interface Props {
  productos: Producto[]
  proveedores: ProveedorMin[]
  categorias: CategoriaRow[]
  stock: StockProducto[]
  esSuperAdmin: boolean
}

/* ═══════════════════════════════════════════════════════════ */
export default function ProductosClient({
  productos: init, proveedores, categorias, stock, esSuperAdmin,
}: Props) {
  const supabase = sb()
  const confirmDialog = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)

  const [productos,  setProductos]  = useState<Producto[]>(init)
  const [buscar,     setBuscar]     = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activo' | 'inactivo'>('activo')
  const [modal,      setModal]      = useState(false)
  const [editando,   setEditando]   = useState<Producto | null>(null)
  const [form,       setForm]       = useState<typeof FORM_VACIO>({ ...FORM_VACIO })
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState('')
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [detalle,    setDetalle]    = useState<Producto | null>(null)
  const [importando, setImportando] = useState(false)

  /* categorías y unidades dinámicas */
  const catList = useMemo(() => {
    const c = categorias.filter(x => x.tabla === 'categoria' && x.activo).map(x => x.nombre)
    return c.length ? c : CATEGORIAS_FALLBACK
  }, [categorias])
  const uniList = useMemo(() => {
    const u = categorias.filter(x => x.tabla === 'unidad' && x.activo).map(x => x.nombre)
    return u.length ? u : UNIDADES_FALLBACK
  }, [categorias])

  const stockMap = useMemo(() => {
    const m = new Map<number, StockProducto>()
    stock.forEach(s => m.set(s.producto_id, s))
    return m
  }, [stock])

  const provMap = useMemo(() => {
    const m = new Map<number, string>()
    proveedores.forEach(p => m.set(p.id, p.nombre))
    return m
  }, [proveedores])

  /* ── filtros ── */
  const lista = useMemo(() => {
    const q = buscar.toLowerCase()
    return productos.filter(p => {
      if (filtroTipo && p.tipo !== filtroTipo) return false
      if (filtroActivo === 'activo'   && !p.activo)  return false
      if (filtroActivo === 'inactivo' &&  p.activo)  return false
      if (!q) return true
      return `${p.nombre} ${p.nombre_generico ?? ''} ${p.codigo} ${p.codigo_barra ?? ''} ${p.laboratorio ?? ''}`.toLowerCase().includes(q)
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
    setForm({ ...FORM_VACIO, categoria: catList[0] ?? 'Otros', unidad: uniList[0] ?? 'Unidad' })
    setError(''); setAdvertencias([])
    setModal(true)
  }

  function abrirEditar(p: Producto) {
    setEditando(p)
    setForm({
      codigo: p.codigo, nombre: p.nombre,
      nombre_generico: p.nombre_generico ?? '',
      laboratorio: p.laboratorio ?? '',
      categoria: p.categoria ?? (catList[0] ?? 'Otros'),
      unidad: p.unidad ?? 'Unidad',
      tipo: p.tipo,
      es_antibiotico: p.es_antibiotico,
      costo: String(p.costo),
      precio_venta: String(p.precio_venta),
      stock_minimo: String(p.stock_minimo),
      activo: p.activo,
      codigo_barra: p.codigo_barra ?? '',
      principio_activo: p.principio_activo ?? '',
      concentracion: p.concentracion ?? '',
      presentacion: p.presentacion ?? '',
      marca: p.marca ?? '',
      requiere_receta: Boolean(p.requiere_receta),
      es_controlado: Boolean(p.es_controlado),
      gravado: p.gravado ?? true,
      facturable: p.facturable ?? true,
      precio_minimo: p.precio_minimo ? String(p.precio_minimo) : '',
      dias_reposicion: p.dias_reposicion ? String(p.dias_reposicion) : '7',
      isv_porcentaje: p.isv_porcentaje != null ? String(p.isv_porcentaje) : '15',
      proveedor_preferido_id: p.proveedor_preferido_id ? String(p.proveedor_preferido_id) : '',
    })
    setError(''); setAdvertencias([])
    setModal(true)
  }

  function abrirEditarDesdeDetalle() {
    if (!detalle) return
    const p = detalle
    setDetalle(null)
    abrirEditar(p)
  }

  // En Honduras los medicamentos son exentos de ISV; al cambiar el tipo
  // ajustamos automáticamente gravado/ISV como ayuda (editable manualmente).
  function cambiarTipo(nuevoTipo: string) {
    setForm(p => {
      const esMed = nuevoTipo === 'Medicamento'
      return { ...p, tipo: nuevoTipo, gravado: !esMed, isv_porcentaje: esMed ? '0' : (p.gravado ? p.isv_porcentaje : '15') }
    })
  }

  async function generarCodigo() {
    const r = await siguienteCodigoProducto('PRD')
    if (r.ok && r.codigo) setForm(p => ({ ...p, codigo: r.codigo }))
  }

  /* ── guardar ── */
  async function guardar(forzar = false) {
    const validacion = validarProducto(form, productos, editando?.id ?? null)
    if (!validacion.ok) { setError(validacion.errores.join(' · ')); setAdvertencias([]); return }

    if (validacion.advertencias.length && !forzar) {
      setAdvertencias(validacion.advertencias)
      const { confirmed } = await confirmDialog({
        title: 'Confirmar precio',
        message: 'El producto tiene advertencias de precio. ¿Desea guardar de todas formas?',
        variant: 'warning',
        confirmLabel: 'Guardar igual',
        details: validacion.advertencias.map((a, i) => ({ label: `Aviso ${i + 1}`, value: a })),
      })
      if (!confirmed) return
    }

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
      codigo_barra:    form.codigo_barra.trim() || null,
      principio_activo: form.principio_activo.trim() || null,
      concentracion:   form.concentracion.trim() || null,
      presentacion:    form.presentacion.trim() || null,
      marca:           form.marca.trim() || null,
      requiere_receta: form.requiere_receta,
      es_controlado:   form.es_controlado,
      gravado:         form.gravado,
      facturable:      form.facturable,
      precio_minimo:   Number(form.precio_minimo || 0),
      dias_reposicion: Number(form.dias_reposicion || 7),
      isv_porcentaje:  Number(form.isv_porcentaje || 0),
      proveedor_preferido_id: form.proveedor_preferido_id ? Number(form.proveedor_preferido_id) : null,
    }

    if (editando) {
      const { error: e } = await supabase.from('productos').update(payload).eq('id', editando.id)
      if (e) { setError(e.message); setGuardando(false); return }
      setProductos(prev => prev.map(p => p.id === editando.id ? { ...p, ...payload } : p))
    } else {
      const { data, error: e } = await supabase.from('productos').insert(payload).select().single()
      if (e) { setError(e.message); setGuardando(false); return }
      setProductos(prev => [...prev, data as Producto].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    }
    setGuardando(false); setModal(false); setAdvertencias([])
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

  /* ── exportar CSV ── */
  function exportarCsv() {
    const csv = productosACsv(lista)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── importar CSV ── */
  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const texto = await file.text()
    if (fileRef.current) fileRef.current.value = ''

    const lineas = texto.split(/\r?\n/).filter(l => l.trim())
    if (lineas.length < 2) { alert('El archivo no tiene datos'); return }

    const headers = lineas[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
    const idx = (n: string) => headers.indexOf(n)
    const filas: ImportProductoRow[] = lineas.slice(1).map(linea => {
      const cells = linea.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const get = (n: string) => { const i = idx(n); return i >= 0 ? cells[i] : '' }
      return {
        codigo: get('codigo'),
        nombre: get('nombre'),
        tipo: get('tipo') || undefined,
        categoria: get('categoria') || undefined,
        unidad: get('unidad') || undefined,
        costo: Number(get('costo')) || 0,
        precio_venta: Number(get('precio_venta')) || 0,
        precio_minimo: Number(get('precio_minimo')) || 0,
        stock_minimo: Number(get('stock_minimo')) || 5,
        codigo_barra: get('codigo_barra') || undefined,
        laboratorio: get('laboratorio') || undefined,
        isv_porcentaje: get('isv_porcentaje') ? Number(get('isv_porcentaje')) : undefined,
      }
    }).filter(f => f.codigo && f.nombre)

    const { confirmed } = await confirmDialog({
      title: 'Importar productos',
      message: `Se procesarán ${filas.length} fila(s). Los códigos existentes se actualizarán y los nuevos se crearán.`,
      variant: 'info',
      confirmLabel: 'Importar',
    })
    if (!confirmed) return

    setImportando(true)
    const r = await importarProductos(filas)
    setImportando(false)
    if (!r.ok) { alert('Error: ' + r.error); return }
    await confirmDialog({
      title: 'Importación completada',
      message: `Creados: ${r.creados} · Actualizados: ${r.actualizados}${r.errores.length ? ` · Errores: ${r.errores.length}` : ''}`,
      variant: r.errores.length ? 'warning' : 'success',
      confirmLabel: 'Entendido',
      cancelLabel: 'Cerrar',
      details: r.errores.slice(0, 8).map((er, i) => ({ label: `Error ${i + 1}`, value: er })),
    })
    if (r.creados || r.actualizados) location.reload()
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
            placeholder="Buscar por nombre, código, barra, laboratorio..."
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
        <button onClick={exportarCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 bg-white">
          <Download className="w-4 h-4" /> Exportar
        </button>
        {esSuperAdmin && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={importando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 bg-white disabled:opacity-50">
              <Upload className="w-4 h-4" /> {importando ? 'Importando…' : 'Importar'}
            </button>
            <input ref={fileRef} type="file" accept=".csv" onChange={manejarArchivo} className="hidden" />
          </>
        )}
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
                <th className="text-center px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Costo</th>
                <th className="text-right px-4 py-3">P. Venta</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Margen</th>
                <th className="text-center px-4 py-3 hidden sm:table-cell">Stock mín.</th>
                <th className="text-center px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <Pill className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>No se encontraron productos</p>
                  </td>
                </tr>
              ) : lista.map(p => {
                const cfg = TIPO_CFG[p.tipo] ?? TIPO_CFG['Producto']
                const Icon = cfg.icon
                const st = stockMap.get(p.id)
                const totalStock = st?.total ?? 0
                const stockBajo = totalStock <= p.stock_minimo
                const margen = margenVenta(p.costo, p.precio_venta)
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 transition ${!p.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                        <div>
                          <button onClick={() => setDetalle(p)} className="font-medium text-gray-900 hover:text-sky-600 text-left">
                            {p.nombre}
                          </button>
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
                    <td className="px-4 py-3 text-center">
                      <Link href="/inventario" title="Ver en inventario"
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          totalStock === 0 ? 'bg-gray-100 text-gray-500'
                            : stockBajo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                        <Warehouse className="w-3 h-3" /> {totalStock}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">L {Number(p.costo).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {Number(p.precio_venta) > 0
                        ? `L ${Number(p.precio_venta).toFixed(2)}`
                        : <span className="text-red-400 text-xs">Sin precio</span>}
                    </td>
                    <td className={`px-4 py-3 text-right hidden lg:table-cell font-semibold ${
                      margen != null && margen < 0 ? 'text-red-600' : 'text-green-700'
                    }`}>
                      {margen != null ? `${margen.toFixed(1)}%` : '—'}
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
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetalle(p)} title="Ver detalle"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => abrirEditar(p)} title="Editar"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ DETALLE ══ */}
      {detalle && (
        <ProductoDetalleModal
          producto={detalle}
          stock={stockMap.get(detalle.id)}
          proveedorNombre={detalle.proveedor_preferido_id ? provMap.get(detalle.proveedor_preferido_id) : undefined}
          onClose={() => setDetalle(null)}
          onEditar={abrirEditarDesdeDetalle}
        />
      )}

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
                  <div className="flex gap-1">
                    <input value={form.codigo}
                      onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-blue-300 outline-none"
                      placeholder="MED-001" />
                    {!editando && (
                      <button type="button" onClick={generarCodigo} title="Generar código automático"
                        className="px-2 border rounded-lg text-gray-500 hover:bg-gray-50 flex-shrink-0">
                        <Wand2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tipo}
                    onChange={e => cambiarTipo(e.target.value)}
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
                    {catList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                  <select value={form.unidad}
                    onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {uniList.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* ficha profesional */}
              <div className="bg-slate-50 border rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Ficha profesional</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código de barra</label>
                    <input value={form.codigo_barra}
                      onChange={e => setForm(p => ({ ...p, codigo_barra: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Principio activo</label>
                    <input value={form.principio_activo}
                      onChange={e => setForm(p => ({ ...p, principio_activo: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concentración</label>
                    <input value={form.concentracion}
                      onChange={e => setForm(p => ({ ...p, concentracion: e.target.value }))}
                      placeholder="500mg, 10ml..."
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Presentación</label>
                    <input value={form.presentacion}
                      onChange={e => setForm(p => ({ ...p, presentacion: e.target.value }))}
                      placeholder="Caja x 100, frasco..."
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                    <input value={form.marca}
                      onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor preferido</label>
                    <select value={form.proveedor_preferido_id}
                      onChange={e => setForm(p => ({ ...p, proveedor_preferido_id: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="">— Ninguno —</option>
                      {proveedores.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                    </select>
                  </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio mínimo autorizado</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">L.</span>
                    <input type="number" min="0" step="0.01" value={form.precio_minimo}
                      onChange={e => setForm(p => ({ ...p, precio_minimo: e.target.value }))}
                      className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ISV</label>
                  <select value={form.isv_porcentaje}
                    onChange={e => setForm(p => ({ ...p, isv_porcentaje: e.target.value, gravado: Number(e.target.value) > 0 }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {ISV_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {form.tipo === 'Medicamento' && (
                    <p className="text-[11px] text-emerald-600 mt-1">Medicamentos exentos de ISV en Honduras</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Días reposición</label>
                  <input type="number" min="0" value={form.dias_reposicion}
                    onChange={e => setForm(p => ({ ...p, dias_reposicion: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>

              {/* controles */}
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.es_antibiotico}
                    onChange={e => setForm(p => ({ ...p, es_antibiotico: e.target.checked }))}
                    className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-gray-700">🔴 Es Antibiótico (requiere receta)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.requiere_receta}
                    onChange={e => setForm(p => ({ ...p, requiere_receta: e.target.checked }))}
                    className="w-4 h-4 accent-blue-500" />
                  <span className="text-sm text-gray-700">Requiere receta</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.es_controlado}
                    onChange={e => setForm(p => ({ ...p, es_controlado: e.target.checked }))}
                    className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-gray-700">Medicamento controlado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.gravado}
                    onChange={e => setForm(p => ({ ...p, gravado: e.target.checked }))}
                    className="w-4 h-4 accent-green-500" />
                  <span className="text-sm text-gray-700">Gravado ISV</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.facturable}
                    onChange={e => setForm(p => ({ ...p, facturable: e.target.checked }))}
                    className="w-4 h-4 accent-green-500" />
                  <span className="text-sm text-gray-700">Facturable</span>
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
                <div className={`border rounded-xl px-4 py-2.5 flex items-center justify-between text-sm ${
                  Number(form.precio_venta) < Number(form.costo) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}>
                  <span className={Number(form.precio_venta) < Number(form.costo) ? 'text-red-700' : 'text-green-700'}>
                    Margen de ganancia
                  </span>
                  <span className={`font-bold ${Number(form.precio_venta) < Number(form.costo) ? 'text-red-800' : 'text-green-800'}`}>
                    {(((Number(form.precio_venta) - Number(form.costo)) / Number(form.costo)) * 100).toFixed(1)}%
                    &nbsp;(L {(Number(form.precio_venta) - Number(form.costo)).toFixed(2)} por unidad)
                  </span>
                </div>
              )}

              {advertencias.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800 space-y-1">
                  {advertencias.map((a, i) => <p key={i}>⚠️ {a}</p>)}
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-4 sm:px-6 py-4 border-t">
              <button onClick={() => setModal(false)} className="px-4 py-2.5 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => guardar(false)} disabled={guardando}
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
