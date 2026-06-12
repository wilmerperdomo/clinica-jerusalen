'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/confirm-dialog'
import {
  Truck, Plus, Search, Edit2, X, Save, CheckCircle2, XCircle,
  Phone, Mail, MapPin, CreditCard, Building2, Hash,
  ShoppingCart, Calendar, DollarSign, Package, AlertCircle,
  ChevronRight, RefreshCw,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

// ── Tipos ────────────────────────────────────────────────────────
interface Proveedor {
  id:               number
  codigo?:          string
  nombre:           string
  direccion?:       string
  ciudad?:          string
  pais?:            string
  telefono1?:       string
  telefono2?:       string
  correo?:          string
  vendedor?:        string
  rtn?:             string
  nota?:            string
  condicion_pago?:  string
  dias_credito?:    number
  banco?:           string
  cuenta_banco?:    string
  tipo_proveedor?:  string
  activo:           boolean
  created_at:       string
}

interface Compra {
  proveedor_id: number
  fecha:        string
  total:        number
  estado:       string
}

interface Props {
  proveedores: Proveedor[]
  compras:     Compra[]
}

const TIPOS = ['Medicamentos', 'Insumos', 'Equipos', 'Servicios', 'Otro']
const CONDICIONES = ['Contado', 'Crédito 15d', 'Crédito 30d', 'Crédito 45d', 'Crédito 60d', 'Crédito 90d']

const VACIO: Omit<Proveedor, 'id' | 'created_at'> = {
  codigo: '', nombre: '', direccion: '', ciudad: '', pais: 'Honduras',
  telefono1: '', telefono2: '', correo: '', vendedor: '', rtn: '',
  nota: '', condicion_pago: 'Contado', dias_credito: 0,
  banco: '', cuenta_banco: '', tipo_proveedor: 'Medicamentos', activo: true,
}

// ── Helpers ──────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(n)
}

export default function ProveedoresClient({ proveedores: initProv, compras }: Props) {
  const sb = createClient()
  const confirmDialog = useConfirm()

  const [proveedores, setProveedores] = useState<Proveedor[]>(initProv)
  const [buscar,      setBuscar]      = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroActivo,setFiltroActivo]= useState<'todos' | 'activos' | 'inactivos'>('activos')
  const [modal,       setModal]       = useState(false)
  const [editando,    setEditando]    = useState<Proveedor | null>(null)
  const [form,        setForm]        = useState(VACIO)
  const [guardando,   setGuardando]   = useState(false)
  const [error,       setError]       = useState('')
  const [detalle,     setDetalle]     = useState<Proveedor | null>(null)

  // ── Estadísticas por proveedor ────────────────────────────────
  const statsMap = useMemo(() => {
    const m = new Map<number, { total: number; numCompras: number; ultimaFecha: string }>()
    for (const c of compras) {
      if (!m.has(c.proveedor_id)) m.set(c.proveedor_id, { total: 0, numCompras: 0, ultimaFecha: '' })
      const s = m.get(c.proveedor_id)!
      s.total      += c.total ?? 0
      s.numCompras += 1
      if (!s.ultimaFecha || c.fecha > s.ultimaFecha) s.ultimaFecha = c.fecha
    }
    return m
  }, [compras])

  // ── KPIs ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activos   = proveedores.filter(p => p.activo).length
    const inactivos = proveedores.length - activos
    const credito   = proveedores.filter(p => p.condicion_pago && p.condicion_pago !== 'Contado' && p.activo).length
    const totalComprado = compras.reduce((s, c) => s + (c.total ?? 0), 0)
    return { total: proveedores.length, activos, inactivos, credito, totalComprado }
  }, [proveedores, compras])

  // ── Filtrado ─────────────────────────────────────────────────
  const lista = useMemo(() => {
    return proveedores.filter(p => {
      if (filtroActivo === 'activos'   && !p.activo) return false
      if (filtroActivo === 'inactivos' &&  p.activo) return false
      if (filtroTipo && p.tipo_proveedor !== filtroTipo) return false
      if (buscar) {
        const q = buscar.toLowerCase()
        return p.nombre.toLowerCase().includes(q) ||
          (p.vendedor ?? '').toLowerCase().includes(q) ||
          (p.correo   ?? '').toLowerCase().includes(q) ||
          (p.telefono1 ?? '').includes(q) ||
          (p.rtn      ?? '').includes(q) ||
          (p.codigo   ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [proveedores, buscar, filtroTipo, filtroActivo])

  // ── CRUD ─────────────────────────────────────────────────────
  function abrirNuevo() {
    setEditando(null)
    setForm(VACIO)
    setError('')
    setModal(true)
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p)
    setForm({
      codigo: p.codigo ?? '', nombre: p.nombre,
      direccion: p.direccion ?? '', ciudad: p.ciudad ?? '', pais: p.pais ?? 'Honduras',
      telefono1: p.telefono1 ?? '', telefono2: p.telefono2 ?? '',
      correo: p.correo ?? '', vendedor: p.vendedor ?? '', rtn: p.rtn ?? '',
      nota: p.nota ?? '', condicion_pago: p.condicion_pago ?? 'Contado',
      dias_credito: p.dias_credito ?? 0, banco: p.banco ?? '',
      cuenta_banco: p.cuenta_banco ?? '', tipo_proveedor: p.tipo_proveedor ?? 'Medicamentos',
      activo: p.activo,
    })
    setError('')
    setModal(true)
    setDetalle(null)
  }

  async function guardar() {
    if (!form.nombre.trim()) return setError('El nombre es requerido.')
    setGuardando(true)
    setError('')

    const payload = {
      ...form,
      nombre:   form.nombre.trim(),
      codigo:   form.codigo?.trim() || null,
      rtn:      form.rtn?.trim()    || null,
      correo:   form.correo?.trim() || null,
      dias_credito: Number(form.dias_credito) || 0,
    }

    if (editando) {
      const { error: err } = await sb.from('proveedores').update(payload).eq('id', editando.id)
      if (err) { setError(err.message); setGuardando(false); return }
      setProveedores(prev => prev.map(p => p.id === editando.id ? { ...p, ...payload } : p))
    } else {
      const { data, error: err } = await sb.from('proveedores').insert(payload).select().single()
      if (err) { setError(err.message); setGuardando(false); return }
      setProveedores(prev => [...prev, data])
    }

    setGuardando(false)
    setModal(false)
  }

  async function toggleActivo(p: Proveedor) {
    const { confirmed } = await confirmDialog({
      title: p.activo ? 'Desactivar proveedor' : 'Activar proveedor',
      message: p.activo
        ? `¿Está seguro que desea desactivar el proveedor "${p.nombre}"?`
        : `¿Activar el proveedor "${p.nombre}"?`,
      variant: p.activo ? 'warning' : 'success',
      confirmLabel: p.activo ? 'Desactivar' : 'Activar',
    })
    if (!confirmed) return
    const nuevoEstado = !p.activo
    const { error } = await sb.from('proveedores').update({ activo: nuevoEstado }).eq('id', p.id)
    if (error) return alert('Error: ' + error.message)
    setProveedores(prev => prev.map(x => x.id === p.id ? { ...x, activo: nuevoEstado } : x))
    if (detalle?.id === p.id) setDetalle(prev => prev ? { ...prev, activo: nuevoEstado } : null)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <ModuleShell tint="amber">
      <ModuleHero
        title="Proveedores"
        subtitle="Gestión del catálogo de proveedores"
        badge="Compras"
        icon={Truck}
        gradient="amber"
        kpis={[
          { label: 'Total', value: kpis.total, icon: Truck },
          { label: 'Activos', value: kpis.activos, icon: CheckCircle2 },
          { label: 'Inactivos', value: kpis.inactivos, icon: XCircle },
          { label: 'A crédito', value: kpis.credito, icon: CreditCard },
          { label: 'Total comprado', value: fmt(kpis.totalComprado), icon: DollarSign },
        ]}
        actions={
          <ModuleBtnPrimary onClick={abrirNuevo}>
            <Plus className="w-4 h-4" /> Nuevo Proveedor
          </ModuleBtnPrimary>
        }
      />
      <ModuleContent>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={buscar} onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por nombre, RTN, vendedor, teléfono…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroActivo} onChange={e => setFiltroActivo(e.target.value as any)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="activos">Solo activos</option>
          <option value="todos">Todos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        <span className="self-center text-sm text-slate-400">{lista.length} proveedor{lista.length !== 1 ? 'es' : ''}</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Contacto</th>
                <th className="px-4 py-3 text-left">RTN</th>
                <th className="px-4 py-3 text-left">Condición</th>
                <th className="px-4 py-3 text-right">Compras</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No se encontraron proveedores
                  </td>
                </tr>
              ) : lista.map(p => {
                const stats = statsMap.get(p.id)
                return (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetalle(p)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{p.nombre}</div>
                      {p.codigo && <div className="text-xs text-slate-400">#{p.codigo}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <TipoBadge tipo={p.tipo_proveedor} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{p.vendedor || '—'}</div>
                      {p.telefono1 && <div className="text-xs">{p.telefono1}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.rtn || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.condicion_pago === 'Contado' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>
                        {p.condicion_pago || 'Contado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{stats?.numCompras ?? 0}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{stats ? fmt(stats.total) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={e => { e.stopPropagation(); toggleActivo(p) }}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${p.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={e => { e.stopPropagation(); abrirEditar(p) }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
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

      {/* ── Panel de Detalle (slide-in derecha) ── */}
      {detalle && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetalle(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl z-50 flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
                  <Truck className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 leading-tight">{detalle.nombre}</h3>
                  <p className="text-xs text-slate-500">{detalle.tipo_proveedor}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => abrirEditar(detalle)}
                  className="p-1.5 rounded-lg bg-white border hover:bg-slate-50 text-slate-500 transition">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => setDetalle(null)}
                  className="p-1.5 rounded-lg hover:bg-orange-100 text-slate-400 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* Estado + condicion */}
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${detalle.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {detalle.activo ? 'Activo' : 'Inactivo'}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                  {detalle.condicion_pago || 'Contado'}
                </span>
              </div>

              {/* Datos de contacto */}
              <Section title="Contacto">
                <Row icon={<Hash className="w-4 h-4"/>}       label="Código"    val={detalle.codigo} />
                <Row icon={<Hash className="w-4 h-4"/>}       label="RTN"       val={detalle.rtn} mono />
                <Row icon={<Building2 className="w-4 h-4"/>}  label="Vendedor"  val={detalle.vendedor} />
                <Row icon={<Phone className="w-4 h-4"/>}      label="Teléfono 1" val={detalle.telefono1} />
                <Row icon={<Phone className="w-4 h-4"/>}      label="Teléfono 2" val={detalle.telefono2} />
                <Row icon={<Mail className="w-4 h-4"/>}       label="Correo"    val={detalle.correo} />
                <Row icon={<MapPin className="w-4 h-4"/>}     label="Dirección" val={[detalle.direccion, detalle.ciudad, detalle.pais].filter(Boolean).join(', ')} />
              </Section>

              {/* Datos de pago */}
              <Section title="Pago y Crédito">
                <Row icon={<CreditCard className="w-4 h-4"/>} label="Condición"  val={detalle.condicion_pago} />
                <Row icon={<Calendar   className="w-4 h-4"/>} label="Días crédito" val={detalle.dias_credito ? `${detalle.dias_credito} días` : undefined} />
                <Row icon={<Building2  className="w-4 h-4"/>} label="Banco"      val={detalle.banco} />
                <Row icon={<Hash       className="w-4 h-4"/>} label="Cuenta"     val={detalle.cuenta_banco} mono />
              </Section>

              {/* Historial de compras */}
              {(() => {
                const stats = statsMap.get(detalle.id)
                const historial = compras
                  .filter(c => c.proveedor_id === detalle.id)
                  .slice(0, 10)
                return (
                  <Section title={`Compras (${stats?.numCompras ?? 0})`}>
                    {stats && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-orange-50 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-orange-700">{stats.numCompras}</p>
                          <p className="text-xs text-slate-500">Órdenes</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <p className="text-sm font-bold text-purple-700">{fmt(stats.total)}</p>
                          <p className="text-xs text-slate-500">Total comprado</p>
                        </div>
                      </div>
                    )}
                    {historial.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">Sin compras registradas</p>
                    ) : historial.map((c, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0 text-sm">
                        <span className="text-slate-500">{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-HN')}</span>
                        <span className="font-medium text-slate-800">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </Section>
                )
              })()}

              {detalle.nota && (
                <Section title="Notas">
                  <p className="text-sm text-slate-600 leading-relaxed">{detalle.nota}</p>
                </Section>
              )}
            </div>

            {/* footer botones */}
            <div className="px-5 py-4 border-t flex gap-2">
              <button onClick={() => abrirEditar(detalle)}
                className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-xl text-sm font-medium transition">
                <Edit2 className="w-4 h-4" /> Editar
              </button>
              <button onClick={() => toggleActivo(detalle)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition border ${
                  detalle.activo
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-700 hover:bg-green-50'
                }`}>
                {detalle.activo ? <><XCircle className="w-4 h-4" /> Desactivar</> : <><CheckCircle2 className="w-4 h-4" /> Activar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Crear / Editar ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-600" />
                {editando ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* body */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
              {/* Datos principales */}
              <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
                <legend className="text-xs font-semibold text-slate-500 uppercase px-1">Datos principales</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código</label>
                    <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RTN</label>
                    <input value={form.rtn} onChange={e => setForm(f => ({ ...f, rtn: e.target.value }))}
                      placeholder="0000-0000-000000"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de proveedor</label>
                    <select value={form.tipo_proveedor} onChange={e => setForm(f => ({ ...f, tipo_proveedor: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      {TIPOS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <select value={form.activo ? 'activo' : 'inactivo'} onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'activo' }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Contacto */}
              <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
                <legend className="text-xs font-semibold text-slate-500 uppercase px-1">Contacto</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del vendedor</label>
                    <input value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
                    <input type="email" value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono 1</label>
                    <input value={form.telefono1} onChange={e => setForm(f => ({ ...f, telefono1: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono 2</label>
                    <input value={form.telefono2} onChange={e => setForm(f => ({ ...f, telefono2: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                    <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                    <input value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                    <input value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>
              </fieldset>

              {/* Pago y crédito */}
              <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
                <legend className="text-xs font-semibold text-slate-500 uppercase px-1">Pago y crédito</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Condición de pago</label>
                    <select value={form.condicion_pago} onChange={e => setForm(f => ({ ...f, condicion_pago: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      {CONDICIONES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Días de crédito</label>
                    <input type="number" min={0} value={form.dias_credito} onChange={e => setForm(f => ({ ...f, dias_credito: Number(e.target.value) }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Banco</label>
                    <input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Número de cuenta</label>
                    <input value={form.cuenta_banco} onChange={e => setForm(f => ({ ...f, cuenta_banco: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>
              </fieldset>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <textarea value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => setModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-xl text-sm font-medium transition">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition">
                {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</h4>
      <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ icon, label, val, mono }: { icon: React.ReactNode; label: string; val?: string | number | null; mono?: boolean }) {
  if (!val && val !== 0) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-300 mt-0.5">{icon}</span>
      <span className="text-slate-500 w-24 shrink-0">{label}</span>
      <span className={`text-slate-800 flex-1 ${mono ? 'font-mono text-xs' : ''}`}>{val}</span>
    </div>
  )
}

function TipoBadge({ tipo }: { tipo?: string }) {
  const colors: Record<string, string> = {
    'Medicamentos': 'bg-blue-50 text-blue-700',
    'Insumos':      'bg-teal-50 text-teal-700',
    'Equipos':      'bg-purple-50 text-purple-700',
    'Servicios':    'bg-amber-50 text-amber-700',
    'Otro':         'bg-slate-100 text-slate-600',
  }
  const cls = colors[tipo ?? ''] ?? colors['Otro']
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{tipo || 'Sin tipo'}</span>
}
