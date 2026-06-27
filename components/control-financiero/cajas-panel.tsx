'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Building2, Landmark, RefreshCw } from 'lucide-react'
import { fmtFin, type FinAmbito } from '@/lib/finanzas-personales'
import { calcularEstadoPatrimonio, type FinCuenta } from '@/lib/finanzas-analisis'

interface Props {
  cuentas: FinCuenta[]
  cxc: number
  pasivo: { tarjetas: number; prestamos: number; deudas: number; cxp: number }
  puedeEditar: boolean
  onRecargar: () => void
}

const TIPO_ICON = { EFECTIVO: Wallet, BANCO: Landmark, CAJA_CLINICA: Building2 }

export default function CajasPanel({ cuentas, cxc, pasivo, puedeEditar, onRecargar }: Props) {
  const supabase = createClient()
  const [modalCuenta, setModalCuenta] = useState(false)
  const [modalMov, setModalMov] = useState<FinCuenta | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formCuenta, setFormCuenta] = useState({
    nombre: '', tipo: 'EFECTIVO' as FinCuenta['tipo'], ambito: 'PERSONAL' as FinAmbito,
    banco: '', saldo_actual: '',
  })
  const [formMov, setFormMov] = useState({
    tipo: 'INGRESO' as 'INGRESO' | 'EGRESO' | 'AJUSTE',
    monto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '',
  })

  const patrimonio = calcularEstadoPatrimonio({
    cuentas,
    cxc,
    tarjetas: pasivo.tarjetas,
    prestamos: pasivo.prestamos,
    deudas: pasivo.deudas,
    cxp: pasivo.cxp,
  })

  async function guardarCuenta() {
    if (!formCuenta.nombre.trim()) return
    setGuardando(true)
    await supabase.from('finanzas_cuentas').insert({
      nombre: formCuenta.nombre.trim(),
      tipo: formCuenta.tipo,
      ambito: formCuenta.ambito,
      banco: formCuenta.banco.trim() || null,
      saldo_actual: formCuenta.saldo_actual ? Number(formCuenta.saldo_actual) : 0,
    })
    setGuardando(false)
    setModalCuenta(false)
    onRecargar()
  }

  async function registrarMovimiento() {
    if (!modalMov || !formMov.monto || !formMov.descripcion.trim()) return
    const monto = Number(formMov.monto)
    setGuardando(true)
    await supabase.from('finanzas_cuenta_movimientos').insert({
      cuenta_id: modalMov.id,
      tipo: formMov.tipo,
      monto,
      fecha: formMov.fecha,
      descripcion: formMov.descripcion.trim(),
    })
    const delta = formMov.tipo === 'INGRESO' ? monto : -monto
    await supabase.from('finanzas_cuentas').update({
      saldo_actual: Number(modalMov.saldo_actual) + delta,
      updated_at: new Date().toISOString(),
    }).eq('id', modalMov.id)
    setGuardando(false)
    setModalMov(null)
    onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-emerald-600 text-white rounded-xl p-4">
          <p className="text-xs opacity-80">Efectivo disponible</p>
          <p className="text-2xl font-bold">{fmtFin(patrimonio.efectivoDisponible)}</p>
        </div>
        <div className="bg-blue-600 text-white rounded-xl p-4">
          <p className="text-xs opacity-80">Activo líquido (+ CXC)</p>
          <p className="text-2xl font-bold">{fmtFin(patrimonio.activoLiquido)}</p>
        </div>
        <div className={`rounded-xl p-4 text-white ${patrimonio.patrimonioNeto >= 0 ? 'bg-indigo-600' : 'bg-red-600'}`}>
          <p className="text-xs opacity-80">Patrimonio neto</p>
          <p className="text-2xl font-bold">{fmtFin(patrimonio.patrimonioNeto)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 text-sm space-y-1">
        <p className="flex justify-between"><span>+ Cuentas por cobrar</span><strong className="text-blue-700">{fmtFin(patrimonio.cuentasPorCobrar)}</strong></p>
        <p className="flex justify-between"><span>− Tarjetas</span><strong className="text-red-600">{fmtFin(patrimonio.tarjetas)}</strong></p>
        <p className="flex justify-between"><span>− Préstamos</span><strong>{fmtFin(patrimonio.prestamos)}</strong></p>
        <p className="flex justify-between"><span>− Otras deudas</span><strong>{fmtFin(patrimonio.otrasDeudas)}</strong></p>
        <p className="flex justify-between border-t pt-2"><span>− CXP proveedores</span><strong>{fmtFin(patrimonio.cxp)}</strong></p>
      </div>

      {puedeEditar && (
        <button onClick={() => setModalCuenta(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Agregar cuenta
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cuentas.filter(c => c.activo).map(c => {
          const Icon = TIPO_ICON[c.tipo]
          return (
            <div key={c.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{c.nombre}</p>
                  <p className="text-xs text-slate-500">{c.tipo} · {c.ambito} {c.banco ? `· ${c.banco}` : ''}</p>
                </div>
                <p className="text-lg font-bold text-emerald-700">{fmtFin(c.saldo_actual)}</p>
              </div>
              {puedeEditar && (
                <button onClick={() => setModalMov(c)}
                  className="mt-3 text-xs text-indigo-600 font-medium hover:underline">
                  + Movimiento
                </button>
              )}
            </div>
          )
        })}
      </div>

      {modalCuenta && (
        <Modal title="Nueva cuenta" onClose={() => setModalCuenta(false)}>
          <input value={formCuenta.nombre} onChange={e => setFormCuenta(p => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre *" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={formCuenta.tipo} onChange={e => setFormCuenta(p => ({ ...p, tipo: e.target.value as FinCuenta['tipo'] }))}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="EFECTIVO">Efectivo</option>
              <option value="BANCO">Banco</option>
              <option value="CAJA_CLINICA">Caja clínica</option>
            </select>
            <select value={formCuenta.ambito} onChange={e => setFormCuenta(p => ({ ...p, ambito: e.target.value as FinAmbito }))}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="CLINICA">Clínica</option>
              <option value="CASA">Casa</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </div>
          <input value={formCuenta.banco} onChange={e => setFormCuenta(p => ({ ...p, banco: e.target.value }))}
            placeholder="Banco (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <input type="number" value={formCuenta.saldo_actual} onChange={e => setFormCuenta(p => ({ ...p, saldo_actual: e.target.value }))}
            placeholder="Saldo actual" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <ModalActions onCancel={() => setModalCuenta(false)} onSave={() => void guardarCuenta()} guardando={guardando} />
        </Modal>
      )}

      {modalMov && (
        <Modal title={`Movimiento: ${modalMov.nombre}`} onClose={() => setModalMov(null)}>
          <select value={formMov.tipo} onChange={e => setFormMov(p => ({ ...p, tipo: e.target.value as typeof formMov.tipo }))}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3">
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
            <option value="AJUSTE">Ajuste (resta)</option>
          </select>
          <input type="number" value={formMov.monto} onChange={e => setFormMov(p => ({ ...p, monto: e.target.value }))}
            placeholder="Monto *" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <input type="date" value={formMov.fecha} onChange={e => setFormMov(p => ({ ...p, fecha: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <input value={formMov.descripcion} onChange={e => setFormMov(p => ({ ...p, descripcion: e.target.value }))}
            placeholder="Descripción *" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
          <ModalActions onCancel={() => setModalMov(null)} onSave={() => void registrarMovimiento()} guardando={guardando} />
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onCancel, onSave, guardando }: { onCancel: () => void; onSave: () => void; guardando: boolean }) {
  return (
    <div className="flex gap-2 justify-end">
      <button onClick={onCancel} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
      <button onClick={onSave} disabled={guardando}
        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center gap-2">
        {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} Guardar
      </button>
    </div>
  )
}
