'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, DollarSign, RefreshCw } from 'lucide-react'
import { fmtFin, type FinPrestamo } from '@/lib/finanzas-personales'

interface Props {
  prestamos: FinPrestamo[]
  puedeEditar: boolean
  onRecargar: () => void
}

export default function PrestamosPanel({ prestamos, puedeEditar, onRecargar }: Props) {
  const supabase = createClient()
  const [modalPrestamo, setModalPrestamo] = useState(false)
  const [modalPago, setModalPago] = useState<FinPrestamo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formPrestamo, setFormPrestamo] = useState({
    nombre: '', acreedor: '', monto_original: '', saldo_pendiente: '',
    cuota_mensual: '', fecha_inicio: '', notas: '',
  })
  const [formPago, setFormPago] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })

  async function guardarPrestamo() {
    if (!formPrestamo.nombre.trim() || !formPrestamo.monto_original) return
    setGuardando(true)
    const monto = Number(formPrestamo.monto_original)
    const saldo = formPrestamo.saldo_pendiente ? Number(formPrestamo.saldo_pendiente) : monto
    const { error } = await supabase.from('finanzas_prestamos').insert({
      nombre: formPrestamo.nombre.trim(),
      acreedor: formPrestamo.acreedor.trim() || null,
      monto_original: monto,
      saldo_pendiente: saldo,
      cuota_mensual: formPrestamo.cuota_mensual ? Number(formPrestamo.cuota_mensual) : null,
      fecha_inicio: formPrestamo.fecha_inicio || null,
      notas: formPrestamo.notas.trim() || null,
    })
    setGuardando(false)
    if (error) { alert(error.message); return }
    setModalPrestamo(false)
    setFormPrestamo({ nombre: '', acreedor: '', monto_original: '', saldo_pendiente: '', cuota_mensual: '', fecha_inicio: '', notas: '' })
    onRecargar()
  }

  async function registrarPago() {
    if (!modalPago || !formPago.monto) return
    const monto = Number(formPago.monto)
    if (monto <= 0) return
    setGuardando(true)

    const catPrestamo = await supabase.from('finanzas_categorias').select('id').eq('clave', 'PRESTAMOS').maybeSingle()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: mov, error: errMov } = await supabase.from('finanzas_movimientos').insert({
      tipo: 'EGRESO',
      categoria_id: catPrestamo.data?.id ?? null,
      monto,
      fecha: formPago.fecha,
      descripcion: `Pago préstamo: ${modalPago.nombre}`,
      notas: formPago.notas.trim() || null,
      usuario_id: user?.id,
    }).select('id').single()

    if (errMov) { setGuardando(false); alert(errMov.message); return }

    const nuevoSaldo = Math.max(0, Number(modalPago.saldo_pendiente) - monto)
    await supabase.from('finanzas_prestamo_pagos').insert({
      prestamo_id: modalPago.id,
      monto,
      fecha: formPago.fecha,
      notas: formPago.notas.trim() || null,
      movimiento_id: mov?.id,
    })

    await supabase.from('finanzas_prestamos').update({
      saldo_pendiente: nuevoSaldo,
      activo: nuevoSaldo > 0,
    }).eq('id', modalPago.id)

    setGuardando(false)
    setModalPago(null)
    setFormPago({ monto: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })
    onRecargar()
  }

  const activos = prestamos.filter(p => p.activo)
  const totalDeuda = activos.reduce((s, p) => s + Number(p.saldo_pendiente), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3">
          <p className="text-xs text-orange-700">Deuda total activa</p>
          <p className="text-xl font-bold text-orange-800">{fmtFin(totalDeuda)}</p>
          <p className="text-[10px] text-orange-600">{activos.length} préstamo(s) activo(s)</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setModalPrestamo(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nuevo préstamo
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {prestamos.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">Sin préstamos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-700 text-white">
              <tr>
                <th className="text-left px-4 py-3">Préstamo</th>
                <th className="text-left px-4 py-3">Acreedor</th>
                <th className="text-right px-4 py-3">Original</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="text-right px-4 py-3">Cuota</th>
                <th className="text-center px-4 py-3">Estado</th>
                {puedeEditar && <th className="text-center px-4 py-3">Pago</th>}
              </tr>
            </thead>
            <tbody>
              {prestamos.map(p => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{p.acreedor ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{fmtFin(p.monto_original)}</td>
                  <td className="px-4 py-3 text-right font-bold text-orange-700">{fmtFin(p.saldo_pendiente)}</td>
                  <td className="px-4 py-3 text-right">{p.cuota_mensual ? fmtFin(p.cuota_mensual) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.activo ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                      {p.activo ? 'Activo' : 'Pagado'}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-3 text-center">
                      {p.activo && (
                        <button onClick={() => { setModalPago(p); setFormPago({ monto: String(p.cuota_mensual ?? ''), fecha: new Date().toISOString().slice(0, 10), notas: '' }) }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-lg text-xs font-medium">
                          <DollarSign className="w-3.5 h-3.5" /> Abonar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalPrestamo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-bold">Nuevo préstamo</h3>
            <input value={formPrestamo.nombre} onChange={e => setFormPrestamo(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Nombre del préstamo *" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input value={formPrestamo.acreedor} onChange={e => setFormPrestamo(p => ({ ...p, acreedor: e.target.value }))}
              placeholder="Banco / acreedor" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={formPrestamo.monto_original} onChange={e => setFormPrestamo(p => ({ ...p, monto_original: e.target.value }))}
                placeholder="Monto original *" className="border rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={formPrestamo.saldo_pendiente} onChange={e => setFormPrestamo(p => ({ ...p, saldo_pendiente: e.target.value }))}
                placeholder="Saldo actual" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <input type="number" value={formPrestamo.cuota_mensual} onChange={e => setFormPrestamo(p => ({ ...p, cuota_mensual: e.target.value }))}
              placeholder="Cuota mensual (L.)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={formPrestamo.fecha_inicio} onChange={e => setFormPrestamo(p => ({ ...p, fecha_inicio: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalPrestamo(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardarPrestamo()} disabled={guardando}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm flex items-center gap-2">
                {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPago && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h3 className="font-bold">Abonar — {modalPago.nombre}</h3>
            <p className="text-sm text-slate-500">Saldo: {fmtFin(modalPago.saldo_pendiente)}</p>
            <input type="number" value={formPago.monto} onChange={e => setFormPago(p => ({ ...p, monto: e.target.value }))}
              placeholder="Monto del abono" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={formPago.fecha} onChange={e => setFormPago(p => ({ ...p, fecha: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <p className="text-[10px] text-slate-400">Se registrará también como gasto en movimientos personales.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalPago(null)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void registrarPago()} disabled={guardando}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm">Registrar pago</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
