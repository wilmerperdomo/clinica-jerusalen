'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Calendar, TrendingDown, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'
import { fmtFin, type FinAmbito } from '@/lib/finanzas-personales'
import {
  generarCalendarioPagos, calcularFlujoProyectado,
  type EventoCalendario, type FlujoProyectado, type FinPagoProgramado,
  type FinTarjeta, type FinPrestamo, type FinDeuda, type FinCuenta,
} from '@/lib/finanzas-analisis'

interface Props {
  anio: number
  mes: number
  tarjetas: FinTarjeta[]
  prestamos: FinPrestamo[]
  deudas: FinDeuda[]
  programados: FinPagoProgramado[]
  cuentas: FinCuenta[]
  planillaRef: number
  ingresosClinica: number
  ingresosPersonal: number
  egresosPersonal: number
  egresosClinicaSistema: number
  puedeEditar: boolean
  onRecargar: () => void
}

export default function FlujoPanel(props: Props) {
  const supabase = createClient()
  const [modal, setModal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    titulo: '', monto: '', dia_mes: '15', tipo: 'OTRO', ambito: 'PERSONAL' as FinAmbito, recurrente: true,
  })

  const calendario = generarCalendarioPagos({
    anio: props.anio,
    mes: props.mes,
    tarjetas: props.tarjetas,
    prestamos: props.prestamos,
    deudas: props.deudas,
    programados: props.programados,
    planillaMonto: props.planillaRef,
    planillaDia: 15,
  })

  const flujo: FlujoProyectado = calcularFlujoProyectado({
    anio: props.anio,
    mes: props.mes,
    ingresosClinicaMes: props.ingresosClinica,
    ingresosPersonalMes: props.ingresosPersonal,
    egresosRegistradosMes: props.egresosPersonal,
    egresosClinicaSistema: props.egresosClinicaSistema,
    calendario,
    cuentas: props.cuentas,
  })

  async function guardarPago() {
    if (!form.titulo.trim() || !form.monto) return
    setGuardando(true)
    await supabase.from('finanzas_pagos_programados').insert({
      titulo: form.titulo.trim(),
      monto: Number(form.monto),
      dia_mes: Number(form.dia_mes),
      recurrente: form.recurrente,
      tipo: form.tipo,
      ambito: form.ambito,
    })
    setGuardando(false)
    setModal(false)
    props.onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-5 text-white ${flujo.alertaFaltaDinero ? 'bg-red-600' : 'bg-gradient-to-r from-cyan-600 to-blue-700'}`}>
        <p className="text-sm opacity-90 flex items-center gap-2">
          {flujo.alertaFaltaDinero && <AlertTriangle className="w-5 h-5" />}
          Proyección a fin de mes ({flujo.diasRestantes} días restantes)
        </p>
        <p className="text-3xl font-bold mt-1">{fmtFin(flujo.proyeccionFinMes)}</p>
        <p className="text-xs opacity-80 mt-2">
          Cuentas {fmtFin(flujo.saldoCuentas)} + ingresos {fmtFin(flujo.ingresosEsperados)}
          − gastos {fmtFin(flujo.egresosRegistrados)} − pagos pendientes {fmtFin(flujo.pagosPendientesMes)}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ingresos esperados', val: flujo.ingresosEsperados, icon: TrendingUp, color: 'text-emerald-700' },
          { label: 'Gastos registrados', val: flujo.egresosRegistrados, icon: TrendingDown, color: 'text-red-600' },
          { label: 'Pagos pendientes', val: flujo.pagosPendientesMes, icon: Calendar, color: 'text-orange-700' },
          { label: 'Flujo neto mes', val: flujo.flujoNetoMes, icon: TrendingUp, color: flujo.flujoNetoMes >= 0 ? 'text-blue-700' : 'text-red-700' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4">
            <k.icon className={`w-5 h-5 ${k.color} mb-2`} />
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`font-bold text-lg ${k.color}`}>{fmtFin(k.val)}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Calendario de pagos
        </h3>
        {props.puedeEditar && (
          <button onClick={() => setModal(true)}
            className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium">
            <Plus className="w-3.5 h-3.5" /> Programar pago
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {calendario.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">Sin pagos programados este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="text-left px-4 py-3">Día</th>
                <th className="text-left px-4 py-3">Concepto</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-4 py-3">Monto</th>
              </tr>
            </thead>
            <tbody>
              {calendario.map(e => (
                <FilaCalendario key={e.id} evento={e} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-bold">Programar pago recurrente</h3>
            <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Título *" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
                placeholder="Monto *" className="border rounded-lg px-3 py-2 text-sm" />
              <input type="number" min={1} max={31} value={form.dia_mes} onChange={e => setForm(p => ({ ...p, dia_mes: e.target.value }))}
                placeholder="Día del mes" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="CASA">Casa / arriendo</option>
              <option value="SERVICIO">Servicio</option>
              <option value="IMPUESTO">Impuesto</option>
              <option value="OTRO">Otro</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardarPago()} disabled={guardando}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaCalendario({ evento: e }: { evento: EventoCalendario }) {
  return (
    <tr className={`border-t ${e.urgente ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
      <td className="px-4 py-2.5">
        <span className="font-bold">{e.dia}</span>
        {e.urgente && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Urgente</span>}
      </td>
      <td className="px-4 py-2.5 font-medium">{e.titulo}</td>
      <td className="px-4 py-2.5 text-slate-500 text-xs">{e.tipo} · {e.origen}</td>
      <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmtFin(e.monto)}</td>
    </tr>
  )
}
