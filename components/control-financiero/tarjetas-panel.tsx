'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, CreditCard, DollarSign, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import {
  fmtFin, pctUsoTarjeta,
  type FinTarjeta, type FinAmbito,
} from '@/lib/finanzas-personales'
import { AMBITO_LABELS } from '@/lib/finanzas-sugerencias'

interface Props {
  tarjetas: FinTarjeta[]
  puedeEditar: boolean
  onRecargar: () => void
}

const COLORES = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#003366']

const vacioTarjeta = {
  alias: '', banco: '', ultimos_digitos: '', limite_credito: '', saldo_actual: '',
  pago_minimo: '', dia_corte: '', dia_pago: '', tasa_interes: '', color: COLORES[0],
  ambito: 'PERSONAL' as FinAmbito | 'MIXTO', notas: '',
}

export default function TarjetasPanel({ tarjetas, puedeEditar, onRecargar }: Props) {
  const supabase = createClient()
  const [modalTarjeta, setModalTarjeta] = useState(false)
  const [modalPago, setModalPago] = useState<FinTarjeta | null>(null)
  const [modalCargo, setModalCargo] = useState<FinTarjeta | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState(vacioTarjeta)
  const [formPago, setFormPago] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })
  const [formCargo, setFormCargo] = useState({
    monto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '', ambito: 'PERSONAL' as FinAmbito,
  })

  const activas = tarjetas.filter(t => t.activo)
  const totalSaldo = activas.reduce((s, t) => s + Number(t.saldo_actual || 0), 0)
  const totalLimite = activas.reduce((s, t) => s + Number(t.limite_credito || 0), 0)

  function abrirNueva() {
    setEditId(null)
    setForm(vacioTarjeta)
    setModalTarjeta(true)
  }

  function abrirEditar(t: FinTarjeta) {
    setEditId(t.id)
    setForm({
      alias: t.alias,
      banco: t.banco ?? '',
      ultimos_digitos: t.ultimos_digitos ?? '',
      limite_credito: t.limite_credito ? String(t.limite_credito) : '',
      saldo_actual: String(t.saldo_actual),
      pago_minimo: t.pago_minimo ? String(t.pago_minimo) : '',
      dia_corte: t.dia_corte ? String(t.dia_corte) : '',
      dia_pago: t.dia_pago ? String(t.dia_pago) : '',
      tasa_interes: t.tasa_interes ? String(t.tasa_interes) : '',
      color: t.color || COLORES[0],
      ambito: t.ambito,
      notas: t.notas ?? '',
    })
    setModalTarjeta(true)
  }

  async function guardarTarjeta() {
    if (!form.alias.trim()) return
    setGuardando(true)
    const payload = {
      alias: form.alias.trim(),
      banco: form.banco.trim() || null,
      ultimos_digitos: form.ultimos_digitos.trim() || null,
      limite_credito: form.limite_credito ? Number(form.limite_credito) : null,
      saldo_actual: form.saldo_actual ? Number(form.saldo_actual) : 0,
      pago_minimo: form.pago_minimo ? Number(form.pago_minimo) : null,
      dia_corte: form.dia_corte ? Number(form.dia_corte) : null,
      dia_pago: form.dia_pago ? Number(form.dia_pago) : null,
      tasa_interes: form.tasa_interes ? Number(form.tasa_interes) : null,
      color: form.color,
      ambito: form.ambito,
      notas: form.notas.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = editId
      ? await supabase.from('finanzas_tarjetas').update(payload).eq('id', editId)
      : await supabase.from('finanzas_tarjetas').insert(payload)
    setGuardando(false)
    if (error) { alert(error.message); return }
    setModalTarjeta(false)
    onRecargar()
  }

  async function registrarPago() {
    if (!modalPago || !formPago.monto) return
    const monto = Number(formPago.monto)
    if (monto <= 0) return
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const catRes = await supabase.from('finanzas_categorias').select('id').eq('clave', 'TARJETA_CREDITO').maybeSingle()

    const { data: mov, error: errMov } = await supabase.from('finanzas_movimientos').insert({
      tipo: 'EGRESO',
      categoria_id: catRes.data?.id ?? null,
      monto,
      fecha: formPago.fecha,
      descripcion: `Pago tarjeta: ${modalPago.alias}`,
      forma_pago: 'TRANSFERENCIA',
      ambito: modalPago.ambito === 'MIXTO' ? 'PERSONAL' : modalPago.ambito,
      notas: formPago.notas.trim() || null,
      usuario_id: user?.id,
    }).select('id').single()

    if (errMov) { setGuardando(false); alert(errMov.message); return }

    await supabase.from('finanzas_tarjeta_pagos').insert({
      tarjeta_id: modalPago.id,
      monto,
      fecha: formPago.fecha,
      notas: formPago.notas.trim() || null,
      movimiento_id: mov?.id,
    })

    const nuevoSaldo = Math.max(0, Number(modalPago.saldo_actual) - monto)
    await supabase.from('finanzas_tarjetas').update({
      saldo_actual: nuevoSaldo,
      activo: true,
      updated_at: new Date().toISOString(),
    }).eq('id', modalPago.id)

    setGuardando(false)
    setModalPago(null)
    setFormPago({ monto: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })
    onRecargar()
  }

  async function registrarCargo() {
    if (!modalCargo || !formCargo.monto || !formCargo.descripcion.trim()) return
    const monto = Number(formCargo.monto)
    if (monto <= 0) return
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error: errMov } = await supabase.from('finanzas_movimientos').insert({
      tipo: 'EGRESO',
      monto,
      fecha: formCargo.fecha,
      descripcion: formCargo.descripcion.trim(),
      forma_pago: 'TARJETA',
      ambito: formCargo.ambito,
      tarjeta_id: modalCargo.id,
      usuario_id: user?.id,
    })

    if (errMov) { setGuardando(false); alert(errMov.message); return }

    await supabase.from('finanzas_tarjetas').update({
      saldo_actual: Number(modalCargo.saldo_actual) + monto,
      updated_at: new Date().toISOString(),
    }).eq('id', modalCargo.id)

    setGuardando(false)
    setModalCargo(null)
    setFormCargo({ monto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '', ambito: 'PERSONAL' })
    onRecargar()
  }

  async function desactivar(id: number) {
    if (!confirm('¿Desactivar esta tarjeta?')) return
    await supabase.from('finanzas_tarjetas').update({ activo: false }).eq('id', id)
    onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Saldo total tarjetas</p>
          <p className="text-2xl font-bold text-red-600">{fmtFin(totalSaldo)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Límite combinado</p>
          <p className="text-2xl font-bold text-slate-800">{fmtFin(totalLimite)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Tarjetas activas</p>
          <p className="text-2xl font-bold text-indigo-700">{activas.length}</p>
        </div>
      </div>

      {puedeEditar && (
        <button onClick={abrirNueva}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Agregar tarjeta
        </button>
      )}

      {activas.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Registre cada tarjeta: banco, límite, saldo actual, día de corte y de pago.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activas.map(t => {
            const pct = pctUsoTarjeta(t)
            return (
              <div key={t.id} className="rounded-2xl text-white p-5 shadow-lg relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)` }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs opacity-80">{t.banco || 'Tarjeta'}</p>
                    <p className="text-lg font-bold mt-1">{t.alias}</p>
                    <p className="text-sm opacity-90 mt-2">•••• {t.ultimos_digitos || '????'}</p>
                  </div>
                  <CreditCard className="w-8 h-8 opacity-60" />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs opacity-75">Saldo</p>
                    <p className="font-bold text-lg">{fmtFin(t.saldo_actual)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-75">Límite</p>
                    <p className="font-bold">{t.limite_credito ? fmtFin(t.limite_credito) : '—'}</p>
                  </div>
                  {t.dia_corte && <div><p className="text-xs opacity-75">Corte</p><p>Día {t.dia_corte}</p></div>}
                  {t.dia_pago && <div><p className="text-xs opacity-75">Pago</p><p>Día {t.dia_pago}</p></div>}
                </div>
                {pct !== null && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 80 ? 'bg-red-300' : 'bg-white'}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <p className="text-xs mt-1 opacity-80">{pct}% del límite · {AMBITO_LABELS[t.ambito]}</p>
                  </div>
                )}
                {puedeEditar && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button onClick={() => { setModalCargo(t); setFormCargo(p => ({ ...p, ambito: t.ambito === 'MIXTO' ? 'PERSONAL' : t.ambito as FinAmbito })) }}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium">
                      + Cargo
                    </button>
                    <button onClick={() => setModalPago(t)}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium">
                      Pagar
                    </button>
                    <button onClick={() => abrirEditar(t)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => void desactivar(t.id)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalTarjeta && (
        <Modal title={editId ? 'Editar tarjeta' : 'Nueva tarjeta'} onClose={() => setModalTarjeta(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre / alias *" className="col-span-2">
              <input value={form.alias} onChange={e => setForm(p => ({ ...p, alias: e.target.value }))}
                placeholder="Ej: Visa BAC Negocios" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Banco"><input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Últimos 4 dígitos"><input maxLength={4} value={form.ultimos_digitos} onChange={e => setForm(p => ({ ...p, ultimos_digitos: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Límite crédito"><input type="number" value={form.limite_credito} onChange={e => setForm(p => ({ ...p, limite_credito: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Saldo actual *"><input type="number" value={form.saldo_actual} onChange={e => setForm(p => ({ ...p, saldo_actual: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Pago mínimo"><input type="number" value={form.pago_minimo} onChange={e => setForm(p => ({ ...p, pago_minimo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Tasa interés %"><input type="number" step="0.01" value={form.tasa_interes} onChange={e => setForm(p => ({ ...p, tasa_interes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Día corte"><input type="number" min={1} max={31} value={form.dia_corte} onChange={e => setForm(p => ({ ...p, dia_corte: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Día pago"><input type="number" min={1} max={31} value={form.dia_pago} onChange={e => setForm(p => ({ ...p, dia_pago: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Ámbito">
              <select value={form.ambito} onChange={e => setForm(p => ({ ...p, ambito: e.target.value as FinAmbito | 'MIXTO' }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                {Object.entries(AMBITO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Color">
              <div className="flex gap-1 mt-1">
                {COLORES.map(c => (
                  <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-slate-800' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
          <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
            placeholder="Notas..." rows={2} className="input mt-3 resize-none" />
          <ModalActions onCancel={() => setModalTarjeta(false)} onSave={() => void guardarTarjeta()} guardando={guardando} />
        </Modal>
      )}

      {modalPago && (
        <Modal title={`Pagar ${modalPago.alias}`} onClose={() => setModalPago(null)}>
          <p className="text-sm text-slate-500 mb-3">Saldo actual: <strong>{fmtFin(modalPago.saldo_actual)}</strong></p>
          <Field label="Monto del pago *"><input type="number" value={formPago.monto} onChange={e => setFormPago(p => ({ ...p, monto: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          <Field label="Fecha"><input type="date" value={formPago.fecha} onChange={e => setFormPago(p => ({ ...p, fecha: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          <textarea value={formPago.notas} onChange={e => setFormPago(p => ({ ...p, notas: e.target.value }))} rows={2} className="input resize-none" />
          <ModalActions onCancel={() => setModalPago(null)} onSave={() => void registrarPago()} guardando={guardando} label="Registrar pago" />
        </Modal>
      )}

      {modalCargo && (
        <Modal title={`Cargo en ${modalCargo.alias}`} onClose={() => setModalCargo(null)}>
          <Field label="Descripción *"><input value={formCargo.descripcion} onChange={e => setFormCargo(p => ({ ...p, descripcion: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto *"><input type="number" value={formCargo.monto} onChange={e => setFormCargo(p => ({ ...p, monto: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Fecha"><input type="date" value={formCargo.fecha} onChange={e => setFormCargo(p => ({ ...p, fecha: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></Field>
          </div>
          <Field label="Ámbito">
            <select value={formCargo.ambito} onChange={e => setFormCargo(p => ({ ...p, ambito: e.target.value as FinAmbito }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="CLINICA">Clínica</option>
              <option value="CASA">Casa</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </Field>
          <ModalActions onCancel={() => setModalCargo(null)} onSave={() => void registrarCargo()} guardando={guardando} label="Registrar cargo" />
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function ModalActions({ onCancel, onSave, guardando, label = 'Guardar' }: {
  onCancel: () => void; onSave: () => void; guardando: boolean; label?: string
}) {
  return (
    <div className="flex gap-2 justify-end pt-2">
      <button onClick={onCancel} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
      <button onClick={onSave} disabled={guardando}
        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2">
        {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} {label}
      </button>
    </div>
  )
}
