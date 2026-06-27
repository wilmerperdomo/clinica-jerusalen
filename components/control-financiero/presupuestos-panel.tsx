'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, RefreshCw, Target, AlertTriangle } from 'lucide-react'
import { fmtFin, type FinAmbito } from '@/lib/finanzas-personales'
import {
  PLANTILLAS_PRESUPUESTO, calcularUsoPresupuestos,
  type FinPresupuesto, type PresupuestoUso,
} from '@/lib/finanzas-analisis'
import type { FinMovimiento } from '@/lib/finanzas-personales'

interface Props {
  presupuestos: FinPresupuesto[]
  movimientos: FinMovimiento[]
  anio: number
  mes: number
  planillaRef: number
  puedeEditar: boolean
  onRecargar: () => void
}

export default function PresupuestosPanel({
  presupuestos, movimientos, anio, mes, planillaRef, puedeEditar, onRecargar,
}: Props) {
  const supabase = createClient()
  const [modal, setModal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ etiqueta: '', clave: '', ambito: 'PERSONAL' as FinAmbito, monto_limite: '' })

  const usos = calcularUsoPresupuestos(presupuestos, movimientos, { planilla: planillaRef })
  const excedidos = usos.filter(u => u.excedido).length

  async function crearPlantilla() {
    setGuardando(true)
    const existentes = new Set(presupuestos.map(p => p.clave))
    const nuevos = PLANTILLAS_PRESUPUESTO.filter(p => !existentes.has(p.clave))
      .map(p => ({
        anio, mes, clave: p.clave, etiqueta: p.etiqueta,
        ambito: p.ambito, categoria_clave: (p as { categoria_clave?: string }).categoria_clave ?? null,
        monto_limite: 0, activo: true,
      }))
    if (nuevos.length) await supabase.from('finanzas_presupuestos').insert(nuevos)
    setGuardando(false)
    onRecargar()
  }

  async function guardar() {
    if (!form.etiqueta.trim() || !form.monto_limite) return
    setGuardando(true)
    const clave = form.clave.trim() || `CUSTOM_${Date.now()}`
    await supabase.from('finanzas_presupuestos').upsert({
      anio, mes, clave, etiqueta: form.etiqueta.trim(),
      ambito: form.ambito, monto_limite: Number(form.monto_limite), activo: true,
    }, { onConflict: 'anio,mes,clave' })
    setGuardando(false)
    setModal(false)
    setForm({ etiqueta: '', clave: '', ambito: 'PERSONAL', monto_limite: '' })
    onRecargar()
  }

  async function actualizarLimite(p: PresupuestoUso, monto: number) {
    await supabase.from('finanzas_presupuestos').update({ monto_limite: monto }).eq('id', p.id)
    onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600" /> Presupuesto mensual
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {excedidos > 0 ? (
              <span className="text-red-600 font-medium">{excedidos} área(s) excedida(s)</span>
            ) : 'Todo dentro del presupuesto'}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex gap-2">
            <button onClick={() => void crearPlantilla()} disabled={guardando}
              className="px-3 py-2 border rounded-lg text-xs font-medium hover:bg-slate-50">
              Cargar plantilla
            </button>
            <button onClick={() => setModal(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        )}
      </div>

      {usos.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-400 text-sm">
          Sin presupuestos. Pulse &quot;Cargar plantilla&quot; para empezar y luego edite los límites.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {usos.map(u => (
            <div key={u.id} className={`bg-white rounded-xl border p-4 ${u.excedido ? 'border-red-300 bg-red-50/50' : ''}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium text-slate-800">{u.etiqueta}</p>
                  <p className="text-xs text-slate-500">{u.ambito ?? '—'} · {fmtFin(u.gastado)} de {fmtFin(u.monto_limite)}</p>
                </div>
                {u.excedido && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
              </div>
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${u.pct >= 100 ? 'bg-red-500' : u.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, u.pct)}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className={u.excedido ? 'text-red-600 font-bold' : 'text-slate-500'}>{u.pct}% usado</span>
                <span className="text-slate-500">Resta {fmtFin(u.restante)}</span>
              </div>
              {puedeEditar && (
                <div className="mt-3 flex gap-2 items-center">
                  <span className="text-xs text-slate-500">Límite:</span>
                  <input type="number" defaultValue={u.monto_limite}
                    onBlur={e => void actualizarLimite(u, Number(e.target.value))}
                    className="w-28 border rounded px-2 py-1 text-xs" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-bold">Nuevo presupuesto</h3>
            <input value={form.etiqueta} onChange={e => setForm(p => ({ ...p, etiqueta: e.target.value }))}
              placeholder="Nombre *" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <select value={form.ambito} onChange={e => setForm(p => ({ ...p, ambito: e.target.value as FinAmbito }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="CLINICA">Clínica</option>
              <option value="CASA">Casa</option>
              <option value="PERSONAL">Personal</option>
            </select>
            <input type="number" value={form.monto_limite} onChange={e => setForm(p => ({ ...p, monto_limite: e.target.value }))}
              placeholder="Límite mensual (L.) *" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={guardando}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                {guardando && <RefreshCw className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
