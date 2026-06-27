'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Landmark, CreditCard, Building2, Home, RefreshCw, DollarSign } from 'lucide-react'
import {
  fmtFin, calcularResumenDeudas,
  type FinPrestamo, type FinTarjeta, type FinDeuda, type FinAmbito,
} from '@/lib/finanzas-personales'
import { AMBITO_LABELS } from '@/lib/finanzas-sugerencias'
import PrestamosPanel from './prestamos-panel'

interface Props {
  prestamos: FinPrestamo[]
  tarjetas: FinTarjeta[]
  deudas: FinDeuda[]
  cxpSistema: number
  cxcSistema: number
  puedeEditar: boolean
  onRecargar: () => void
}

const TIPOS_DEUDA = [
  { value: 'PERSONA', label: 'Persona / familiar' },
  { value: 'PROVEEDOR', label: 'Proveedor informal' },
  { value: 'BANCO', label: 'Banco' },
  { value: 'FISCAL', label: 'Impuestos / fiscal' },
  { value: 'SERVICIO', label: 'Servicio / suscripción' },
  { value: 'OTRO', label: 'Otro' },
]

export default function DeudasPanel({
  prestamos, tarjetas, deudas, cxpSistema, cxcSistema, puedeEditar, onRecargar,
}: Props) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<'resumen' | 'prestamos' | 'otras'>('resumen')
  const [modal, setModal] = useState(false)
  const [modalPago, setModalPago] = useState<FinDeuda | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    nombre: '', acreedor: '', tipo: 'OTRO', ambito: 'PERSONAL' as FinAmbito,
    monto_original: '', saldo_pendiente: '', fecha_vencimiento: '', notas: '',
  })
  const [formPago, setFormPago] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })

  const resumen = calcularResumenDeudas({ prestamos, tarjetas, deudas, cxpSistema })

  async function guardarDeuda() {
    if (!form.nombre.trim() || !form.monto_original) return
    setGuardando(true)
    const monto = Number(form.monto_original)
    const { error } = await supabase.from('finanzas_deudas').insert({
      nombre: form.nombre.trim(),
      acreedor: form.acreedor.trim() || null,
      tipo: form.tipo,
      ambito: form.ambito,
      monto_original: monto,
      saldo_pendiente: form.saldo_pendiente ? Number(form.saldo_pendiente) : monto,
      fecha_vencimiento: form.fecha_vencimiento || null,
      notas: form.notas.trim() || null,
    })
    setGuardando(false)
    if (error) { alert(error.message); return }
    setModal(false)
    setForm({ nombre: '', acreedor: '', tipo: 'OTRO', ambito: 'PERSONAL', monto_original: '', saldo_pendiente: '', fecha_vencimiento: '', notas: '' })
    onRecargar()
  }

  async function registrarPagoDeuda() {
    if (!modalPago || !formPago.monto) return
    const monto = Number(formPago.monto)
    if (monto <= 0) return
    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const catRes = await supabase.from('finanzas_categorias').select('id').eq('clave', 'PRESTAMOS').maybeSingle()

    const { data: mov, error: errMov } = await supabase.from('finanzas_movimientos').insert({
      tipo: 'EGRESO',
      categoria_id: catRes.data?.id ?? null,
      monto,
      fecha: formPago.fecha,
      descripcion: `Pago deuda: ${modalPago.nombre}`,
      ambito: modalPago.ambito,
      usuario_id: user?.id,
    }).select('id').single()

    if (errMov) { setGuardando(false); alert(errMov.message); return }

    const nuevoSaldo = Math.max(0, Number(modalPago.saldo_pendiente) - monto)
    await supabase.from('finanzas_deuda_pagos').insert({
      deuda_id: modalPago.id, monto, fecha: formPago.fecha,
      notas: formPago.notas.trim() || null, movimiento_id: mov?.id,
    })
    await supabase.from('finanzas_deudas').update({ saldo_pendiente: nuevoSaldo, activo: nuevoSaldo > 0 }).eq('id', modalPago.id)

    setGuardando(false)
    setModalPago(null)
    onRecargar()
  }

  const items = [
    { label: 'Préstamos bancarios', monto: resumen.prestamos, icon: Landmark, color: 'text-orange-700' },
    { label: 'Tarjetas de crédito', monto: resumen.tarjetas, icon: CreditCard, color: 'text-indigo-700' },
    { label: 'Otras deudas', monto: resumen.deudas, icon: Home, color: 'text-purple-700' },
    { label: 'CXP proveedores (sistema)', monto: resumen.cxpSistema, icon: Building2, color: 'text-red-700' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-red-600 to-rose-700 rounded-xl p-5 text-white">
        <p className="text-sm opacity-90">Pasivo total (todo lo que debe)</p>
        <p className="text-3xl font-bold">{fmtFin(resumen.total)}</p>
        {cxcSistema > 0 && (
          <p className="text-xs opacity-75 mt-2">A su favor (CXC): {fmtFin(cxcSistema)} — no resta del pasivo</p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(i => (
          <div key={i.label} className="bg-white rounded-xl border p-4">
            <i.icon className={`w-5 h-5 ${i.color} mb-2`} />
            <p className="text-xs text-slate-500">{i.label}</p>
            <p className={`font-bold text-lg ${i.color}`}>{fmtFin(i.monto)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['resumen', 'prestamos', 'otras'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 rounded-md text-xs font-medium ${subTab === t ? 'bg-white shadow' : 'text-slate-600'}`}>
            {t === 'resumen' ? 'Detalle' : t === 'prestamos' ? 'Préstamos' : 'Otras deudas'}
          </button>
        ))}
      </div>

      {subTab === 'resumen' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="text-left px-4 py-3">Concepto</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-4 py-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {prestamos.filter(p => p.activo).map(p => (
                <tr key={`p-${p.id}`} className="border-t">
                  <td className="px-4 py-2.5">{p.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500">Préstamo · {AMBITO_LABELS[p.ambito ?? 'PERSONAL']}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-orange-700">{fmtFin(p.saldo_pendiente)}</td>
                </tr>
              ))}
              {tarjetas.filter(t => t.activo).map(t => (
                <tr key={`t-${t.id}`} className="border-t">
                  <td className="px-4 py-2.5">{t.alias} {t.ultimos_digitos ? `••${t.ultimos_digitos}` : ''}</td>
                  <td className="px-4 py-2.5 text-slate-500">Tarjeta · {AMBITO_LABELS[t.ambito]}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-indigo-700">{fmtFin(t.saldo_actual)}</td>
                </tr>
              ))}
              {deudas.filter(d => d.activo).map(d => (
                <tr key={`d-${d.id}`} className="border-t">
                  <td className="px-4 py-2.5">{d.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-500">{d.tipo} · {AMBITO_LABELS[d.ambito]}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmtFin(d.saldo_pendiente)}</td>
                </tr>
              ))}
              {cxpSistema > 0 && (
                <tr className="border-t bg-slate-50">
                  <td className="px-4 py-2.5">Proveedores (módulo CXP)</td>
                  <td className="px-4 py-2.5 text-slate-500">Sistema clínica</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-700">{fmtFin(cxpSistema)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'prestamos' && (
        <PrestamosPanel prestamos={prestamos} puedeEditar={puedeEditar} onRecargar={onRecargar} />
      )}

      {subTab === 'otras' && (
        <>
          {puedeEditar && (
            <button onClick={() => setModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Agregar deuda
            </button>
          )}
          <div className="bg-white rounded-xl border overflow-hidden">
            {deudas.filter(d => d.activo).length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">
                Deudas con personas, impuestos pendientes, proveedores informales, etc.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-left px-4 py-3">Acreedor</th>
                    <th className="text-left px-4 py-3">Vence</th>
                    <th className="text-right px-4 py-3">Saldo</th>
                    {puedeEditar && <th className="text-center px-4 py-3">Pago</th>}
                  </tr>
                </thead>
                <tbody>
                  {deudas.filter(d => d.activo).map(d => (
                    <tr key={d.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium">{d.nombre}</td>
                      <td className="px-4 py-2.5 text-slate-500">{d.acreedor || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{d.fecha_vencimiento || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmtFin(d.saldo_pendiente)}</td>
                      {puedeEditar && (
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => setModalPago(d)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-medium">
                            <DollarSign className="w-3 h-3" /> Abonar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3">
            <h3 className="font-bold text-lg">Nueva deuda</h3>
            <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Nombre *" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input value={form.acreedor} onChange={e => setForm(p => ({ ...p, acreedor: e.target.value }))}
              placeholder="Acreedor" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                {TIPOS_DEUDA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={form.ambito} onChange={e => setForm(p => ({ ...p, ambito: e.target.value as FinAmbito }))} className="border rounded-lg px-3 py-2 text-sm">
                <option value="CLINICA">Clínica</option>
                <option value="CASA">Casa</option>
                <option value="PERSONAL">Personal</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.monto_original} onChange={e => setForm(p => ({ ...p, monto_original: e.target.value }))}
                placeholder="Monto original *" className="border rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={form.saldo_pendiente} onChange={e => setForm(p => ({ ...p, saldo_pendiente: e.target.value }))}
                placeholder="Saldo pendiente" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardarDeuda()} disabled={guardando}
                className="px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPago && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-bold">Abonar: {modalPago.nombre}</h3>
            <p className="text-sm text-slate-500">Saldo: {fmtFin(modalPago.saldo_pendiente)}</p>
            <input type="number" value={formPago.monto} onChange={e => setFormPago(p => ({ ...p, monto: e.target.value }))}
              placeholder="Monto" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={formPago.fecha} onChange={e => setFormPago(p => ({ ...p, fecha: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalPago(null)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void registrarPagoDeuda()} disabled={guardando}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium">
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
