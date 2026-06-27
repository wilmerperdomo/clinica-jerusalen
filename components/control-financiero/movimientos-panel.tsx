'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, RefreshCw, Building2, Home, User } from 'lucide-react'
import {
  fmtFin, type FinCategoria, type FinMovimiento, type FinTarjeta, type FinAmbito, type FinFormaPago,
} from '@/lib/finanzas-personales'
import { AMBITO_LABELS, FORMA_PAGO_LABELS } from '@/lib/finanzas-sugerencias'
import { useConfirm } from '@/components/confirm-dialog'

interface Props {
  categorias: FinCategoria[]
  movimientos: FinMovimiento[]
  tarjetas: FinTarjeta[]
  sucursales: { id: number; nombre: string }[]
  puedeEditar: boolean
  onRecargar: () => void
}

const vacio = {
  tipo: 'EGRESO' as const,
  categoria_id: '',
  monto: '',
  fecha: new Date().toISOString().slice(0, 10),
  descripcion: '',
  referencia: '',
  sucursal_id: '',
  con_factura: false,
  notas: '',
  ambito: 'PERSONAL' as FinAmbito,
  forma_pago: 'EFECTIVO' as FinFormaPago,
  tarjeta_id: '',
  es_deducible: false,
  es_gasto_fijo: false,
}

const AMBITO_ICON = { CLINICA: Building2, CASA: Home, PERSONAL: User }

export default function MovimientosPanel({
  categorias, movimientos, tarjetas, sucursales, puedeEditar, onRecargar,
}: Props) {
  const supabase = createClient()
  const confirmDialog = useConfirm()
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(vacio)
  const [guardando, setGuardando] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [filtroAmbito, setFiltroAmbito] = useState<'TODOS' | FinAmbito>('TODOS')

  const catsFiltradas = categorias.filter(c => c.tipo === form.tipo && c.activo)
  const lista = movimientos.filter(m => {
    if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) return false
    if (filtroAmbito !== 'TODOS' && (m.ambito ?? 'PERSONAL') !== filtroAmbito) return false
    return true
  })

  const totalesAmbito = { CLINICA: 0, CASA: 0, PERSONAL: 0 } as Record<FinAmbito, number>
  for (const m of movimientos.filter(x => x.tipo === 'EGRESO')) {
    const a = (m.ambito ?? 'PERSONAL') as FinAmbito
    totalesAmbito[a] += Number(m.monto)
  }

  function abrirNuevo(tipo: 'INGRESO' | 'EGRESO', ambito?: FinAmbito) {
    const cat = categorias.find(c => c.tipo === tipo && c.activo)
    setEditId(null)
    setForm({ ...vacio, tipo, ambito: ambito ?? 'PERSONAL', categoria_id: cat ? String(cat.id) : '' })
    setModal(true)
  }

  function abrirEditar(m: FinMovimiento) {
    setEditId(m.id)
    setForm({
      tipo: m.tipo,
      categoria_id: m.categoria_id ? String(m.categoria_id) : '',
      monto: String(m.monto),
      fecha: m.fecha,
      descripcion: m.descripcion,
      referencia: m.referencia ?? '',
      sucursal_id: m.sucursal_id ? String(m.sucursal_id) : '',
      con_factura: m.con_factura,
      notas: m.notas ?? '',
      ambito: (m.ambito ?? 'PERSONAL') as FinAmbito,
      forma_pago: (m.forma_pago ?? 'EFECTIVO') as FinFormaPago,
      tarjeta_id: m.tarjeta_id ? String(m.tarjeta_id) : '',
      es_deducible: Boolean((m as { es_deducible?: boolean }).es_deducible),
      es_gasto_fijo: Boolean((m as { es_gasto_fijo?: boolean }).es_gasto_fijo),
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.descripcion.trim() || !form.monto || Number(form.monto) <= 0) {
      alert('Complete descripción y monto válido')
      return
    }
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const monto = Number(form.monto)
    const payload = {
      tipo: form.tipo,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      monto,
      fecha: form.fecha,
      descripcion: form.descripcion.trim(),
      referencia: form.referencia.trim() || null,
      sucursal_id: form.sucursal_id ? Number(form.sucursal_id) : null,
      con_factura: form.con_factura,
      notas: form.notas.trim() || null,
      ambito: form.ambito,
      forma_pago: form.forma_pago,
      tarjeta_id: form.forma_pago === 'TARJETA' && form.tarjeta_id ? Number(form.tarjeta_id) : null,
      es_deducible: form.es_deducible,
      es_gasto_fijo: form.es_gasto_fijo,
      usuario_id: user?.id,
      updated_at: new Date().toISOString(),
    }

    const { error } = editId
      ? await supabase.from('finanzas_movimientos').update(payload).eq('id', editId)
      : await supabase.from('finanzas_movimientos').insert(payload)

    if (!error && !editId && form.forma_pago === 'TARJETA' && form.tarjeta_id && form.tipo === 'EGRESO') {
      const tarjeta = tarjetas.find(t => t.id === Number(form.tarjeta_id))
      if (tarjeta) {
        await supabase.from('finanzas_tarjetas').update({
          saldo_actual: Number(tarjeta.saldo_actual) + monto,
          updated_at: new Date().toISOString(),
        }).eq('id', tarjeta.id)
      }
    }

    setGuardando(false)
    if (error) { alert(error.message); return }
    setModal(false)
    onRecargar()
  }

  async function eliminar(id: number) {
    const mov = movimientos.find(m => m.id === id)
    const { confirmed } = await confirmDialog({
      title: 'Eliminar movimiento',
      message: '¿Está seguro que desea eliminar este movimiento? Esta acción no se puede deshacer.',
      variant: 'danger',
      confirmLabel: 'Eliminar',
      details: mov ? [
        { label: 'Tipo', value: mov.tipo },
        { label: 'Monto', value: fmtFin(mov.monto) },
        { label: 'Descripción', value: mov.descripcion || '—' },
      ] : undefined,
    })
    if (!confirmed) return
    const { error } = await supabase.from('finanzas_movimientos').delete().eq('id', id)
    if (error) alert(error.message)
    else onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(['CLINICA', 'CASA', 'PERSONAL'] as FinAmbito[]).map(a => {
          const Icon = AMBITO_ICON[a]
          return (
            <div key={a} className="bg-white rounded-xl border p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Icon className="w-4 h-4" /> Gastos {AMBITO_LABELS[a]}
              </div>
              <p className="font-bold text-red-600 mt-1">{fmtFin(totalesAmbito[a])}</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(['TODOS', 'INGRESO', 'EGRESO'] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${filtroTipo === t ? 'bg-white shadow' : 'text-slate-600'}`}>
                {t === 'TODOS' ? 'Todos' : t === 'INGRESO' ? 'Ingresos' : 'Gastos'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(['TODOS', 'CLINICA', 'CASA', 'PERSONAL'] as const).map(t => (
              <button key={t} onClick={() => setFiltroAmbito(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${filtroAmbito === t ? 'bg-white shadow' : 'text-slate-600'}`}>
                {t === 'TODOS' ? 'Todo' : AMBITO_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        {puedeEditar && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => abrirNuevo('INGRESO')}
              className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Ingreso
            </button>
            <button onClick={() => abrirNuevo('EGRESO', 'CLINICA')}
              className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Gasto clínica
            </button>
            <button onClick={() => abrirNuevo('EGRESO', 'CASA')}
              className="inline-flex items-center gap-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Gasto casa
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {lista.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">
            Registre gastos de clínica, casa y ingresos extra (ambulancia, ataúdes, etc.)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Ámbito</th>
                  <th className="text-left px-4 py-3">Categoría</th>
                  <th className="text-left px-4 py-3">Descripción</th>
                  <th className="text-left px-4 py-3">Pago</th>
                  <th className="text-right px-4 py-3">Monto</th>
                  {puedeEditar && <th className="text-center px-4 py-3">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {lista.map(m => (
                  <tr key={m.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{m.fecha}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {AMBITO_LABELS[m.ambito ?? 'PERSONAL']}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{m.categoria?.nombre ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {m.tipo === 'INGRESO' ? '+' : '−'}
                      </span>{' '}
                      {m.descripcion}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {FORMA_PAGO_LABELS[m.forma_pago ?? 'EFECTIVO']}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${
                      m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-red-600'
                    }`}>{fmtFin(m.monto)}</td>
                    {puedeEditar && (
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => abrirEditar(m)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => void eliminar(m.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg">{editId ? 'Editar' : 'Nuevo'} {form.tipo === 'INGRESO' ? 'ingreso' : 'gasto'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as 'INGRESO' | 'EGRESO', categoria_id: '' }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="INGRESO">Ingreso</option>
                  <option value="EGRESO">Gasto</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Ámbito</label>
                <select value={form.ambito} onChange={e => setForm(p => ({ ...p, ambito: e.target.value as FinAmbito }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="CLINICA">Clínica</option>
                  <option value="CASA">Casa</option>
                  <option value="PERSONAL">Personal</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Forma de pago</label>
                <select value={form.forma_pago} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value as FinFormaPago, tarjeta_id: '' }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  {Object.entries(FORMA_PAGO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {form.forma_pago === 'TARJETA' && tarjetas.filter(t => t.activo).length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500">Tarjeta</label>
                <select value={form.tarjeta_id} onChange={e => setForm(p => ({ ...p, tarjeta_id: e.target.value }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Seleccionar —</option>
                  {tarjetas.filter(t => t.activo).map(t => (
                    <option key={t.id} value={t.id}>{t.alias} ••{t.ultimos_digitos || '??'}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-500">Categoría</label>
              <select value={form.categoria_id} onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccionar —</option>
                {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Descripción *</label>
              <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej: Combustible ambulancia, Supermercado casa..."
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">Monto (L.) *</label>
                <input type="number" min={0.01} step="0.01" value={form.monto}
                  onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Referencia</label>
                <input value={form.referencia} onChange={e => setForm(p => ({ ...p, referencia: e.target.value }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {sucursales.length > 0 && form.ambito === 'CLINICA' && (
              <div>
                <label className="text-xs font-semibold text-gray-500">Sucursal</label>
                <select value={form.sucursal_id} onChange={e => setForm(p => ({ ...p, sucursal_id: e.target.value }))}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Ninguna —</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.con_factura}
                onChange={e => setForm(p => ({ ...p, con_factura: e.target.checked }))} />
              Tiene factura fiscal
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.es_deducible}
                  onChange={e => setForm(p => ({ ...p, es_deducible: e.target.checked }))} />
                Deducible / fiscal
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.es_gasto_fijo}
                  onChange={e => setForm(p => ({ ...p, es_gasto_fijo: e.target.checked }))} />
                Gasto fijo mensual
              </label>
            </div>
            <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={guardando}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
