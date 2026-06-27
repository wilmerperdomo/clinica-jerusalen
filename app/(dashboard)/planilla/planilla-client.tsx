'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Wallet, Users, Stethoscope, Building2, Calendar, Lock,
  RefreshCw, Printer, ChevronDown, DollarSign, UserCog,
} from 'lucide-react'
import {
  fmtL, labelQuincena, rangoQuincena, sueldoQuincena,
  COMISIONES_DEFAULT, type CategoriaComision,
} from '@/lib/planilla-utils'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost, ModuleBtnPrimary } from '@/components/module-layout'

interface Sucursal { id: number; nombre: string }
interface Empleado {
  id: string; nombre: string; apellido?: string
  sucursal_id?: number; sueldo_fijo?: number; tipo_nomina: string
  roles?: { nombre: string }
}
interface Comision { clave: string; nombre: string; porcentaje: number }
interface Periodo {
  id: number; anio: number; mes: number; quincena: number
  fecha_inicio: string; fecha_fin: string; estado: string; sucursal_id?: number
}
interface Produccion {
  id: number; doctor_id: string; categoria_comision: string
  descripcion: string; monto_neto: number; comision_monto: number
  porcentaje_comision?: number
  fecha: string; sucursal_id: number
}

interface Props {
  sucursales: Sucursal[]
  empleados: Empleado[]
  comisiones: Comision[]
  periodos: Periodo[]
  sucursalDefault: number | null
  esSuperAdmin: boolean
  anioInicial: number
  mesInicial: number
  quincenaInicial: 1 | 2
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function PlanillaClient({
  sucursales, empleados, comisiones, periodos: initPeriodos,
  sucursalDefault, esSuperAdmin, anioInicial, mesInicial, quincenaInicial,
}: Props) {
  const supabase = createClient()
  const [pending, startTransition] = useTransition()

  const [anio, setAnio]       = useState(anioInicial)
  const [mes, setMes]         = useState(mesInicial)
  const [quincena, setQuinc]  = useState<1 | 2>(quincenaInicial)
  const [sucursalId, setSuc]  = useState<number | 'todas'>(sucursalDefault ?? 'todas')
  const [produccion, setProd]   = useState<Produccion[]>([])
  const [periodos, setPeriodos] = useState(initPeriodos)
  const [tab, setTab]         = useState<'medicos' | 'fijos' | 'reglas'>('medicos')

  const rango = rangoQuincena(anio, mes, quincena)

  const medicos = useMemo(() => empleados.filter(e => e.tipo_nomina === 'MEDICO'), [empleados])
  const fijos   = useMemo(() => empleados.filter(e => ['ENFERMERA','ADMINISTRATIVO'].includes(e.tipo_nomina)), [empleados])

  function cargarProduccion() {
    startTransition(async () => {
      let q = supabase
        .from('produccion_medica')
        .select('*')
        .gte('fecha', rango.fecha_inicio)
        .lte('fecha', rango.fecha_fin)
      if (sucursalId !== 'todas') q = q.eq('sucursal_id', sucursalId)
      const { data } = await q
      setProd((data as Produccion[]) ?? [])
    })
  }

  useEffect(() => {
    cargarProduccion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, quincena, sucursalId])

  const resumenMedicos = useMemo(() => {
    const map = new Map<string, { nombre: string; comision: number; produccion: number; lineas: Produccion[] }>()
    for (const m of medicos) {
      map.set(m.id, {
        nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(),
        comision: 0, produccion: 0, lineas: [],
      })
    }
    for (const p of produccion) {
      const row = map.get(p.doctor_id)
      if (!row) continue
      row.comision += Number(p.comision_monto)
      row.produccion += Number(p.monto_neto)
      row.lineas.push(p)
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).filter(r => r.lineas.length > 0)
  }, [produccion, medicos])

  const totalComisiones = resumenMedicos.reduce((s, r) => s + r.comision, 0)
  const totalFijos = fijos.reduce((s, e) => s + sueldoQuincena(Number(e.sueldo_fijo || 0), quincena), 0)
  const totalPlanilla = totalComisiones + totalFijos

  const periodoActual = periodos.find(p =>
    p.anio === anio && p.mes === mes && p.quincena === quincena &&
    (sucursalId === 'todas' ? !p.sucursal_id : p.sucursal_id === sucursalId),
  )

  async function cerrarPeriodo() {
    if (!confirm(`¿Cerrar planilla ${labelQuincena(quincena, mes, anio)}?`)) return

    let prodActual = produccion
    if (prodActual.length === 0) {
      let q = supabase
        .from('produccion_medica')
        .select('*')
        .gte('fecha', rango.fecha_inicio)
        .lte('fecha', rango.fecha_fin)
      if (sucursalId !== 'todas') q = q.eq('sucursal_id', sucursalId)
      const { data } = await q
      prodActual = (data as Produccion[]) ?? []
      setProd(prodActual)
    }

    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      anio, mes, quincena,
      fecha_inicio: rango.fecha_inicio,
      fecha_fin: rango.fecha_fin,
      estado: 'CERRADO',
      cerrado_por: user?.id,
      cerrado_en: new Date().toISOString(),
      sucursal_id: sucursalId === 'todas' ? null : sucursalId,
    }
    const { data, error } = await supabase
      .from('planilla_periodos')
      .upsert(payload, { onConflict: 'sucursal_id,anio,mes,quincena' })
      .select().single()
    if (error) { alert('Error: ' + error.message); return }

    const periodoId = (data as Periodo).id

    for (const med of medicos) {
      const lineas = prodActual.filter(p => p.doctor_id === med.id)
      const totalCom = lineas.reduce((s, l) => s + Number(l.comision_monto), 0)
      if (totalCom <= 0) continue

      const { data: liq, error: errLiq } = await supabase
        .from('planilla_liquidaciones')
        .upsert({
          periodo_id: periodoId,
          perfil_id: med.id,
          tipo_nomina: 'MEDICO',
          sueldo_fijo: 0,
          total_comisiones: totalCom,
          total_pagar: totalCom,
          estado: 'PENDIENTE',
        }, { onConflict: 'periodo_id,perfil_id' })
        .select().single()
      if (errLiq || !liq) continue

      await supabase.from('planilla_liquidacion_detalle').delete().eq('liquidacion_id', liq.id)
      if (lineas.length > 0) {
        await supabase.from('planilla_liquidacion_detalle').insert(
          lineas.map(l => ({
            liquidacion_id: liq.id,
            produccion_medica_id: l.id,
            categoria: l.categoria_comision,
            descripcion: l.descripcion,
            monto_base: l.monto_neto,
            porcentaje: l.porcentaje_comision ?? 0,
            comision: l.comision_monto,
          })),
        )
      }
    }

    for (const emp of fijos) {
      const sueldo = sueldoQuincena(Number(emp.sueldo_fijo || 0), quincena)
      if (sueldo <= 0) continue
      await supabase.from('planilla_liquidaciones').upsert({
        periodo_id: periodoId,
        perfil_id: emp.id,
        tipo_nomina: emp.tipo_nomina,
        sueldo_fijo: sueldo,
        total_comisiones: 0,
        total_pagar: sueldo,
        estado: 'PENDIENTE',
      }, { onConflict: 'periodo_id,perfil_id' })
    }

    setPeriodos(prev => {
      const rest = prev.filter(p => p.id !== data.id)
      return [...rest, data as Periodo]
    })
    alert('Período cerrado y liquidaciones generadas. Pago programado para el día 1 del mes siguiente.')
  }

  async function importarDesdeCaja() {
    try {
      const res = await fetch(`/api/planilla/importar-caja?anio=${anio}&mes=${mes}&quincena=${quincena}`)
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Error al importar'); return }
      alert(`Se encontraron ${data.lineas?.length ?? 0} líneas de comisión en caja para este período.\n\nRevise producción médica y cierre la quincena.`)
    } catch {
      alert('No se pudo consultar la caja')
    }
  }

  const reglas = comisiones.length ? comisiones : COMISIONES_DEFAULT

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Planilla y Comisiones"
        subtitle="Quincenas: 1 al 15 y 16 al fin de mes · Pago el día 1 de cada mes"
        badge="Recursos humanos"
        icon={Wallet}
        gradient="violet"
        kpis={[
          { label: 'Comisiones médicos', value: fmtL(totalComisiones), icon: Stethoscope },
          { label: 'Sueldos fijos (Q)', value: fmtL(totalFijos), icon: UserCog },
          { label: 'Total planilla', value: fmtL(totalPlanilla), icon: DollarSign },
        ]}
        actions={
          <>
            <ModuleBtnGhost onClick={cargarProduccion} disabled={pending}>
              <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} /> Actualizar
            </ModuleBtnGhost>
            <ModuleBtnGhost onClick={() => void importarDesdeCaja()}>
              <DollarSign className="w-4 h-4" /> Importar desde Caja
            </ModuleBtnGhost>
            {periodoActual?.estado !== 'CERRADO' && (
              <ModuleBtnPrimary onClick={cerrarPeriodo}>
                <Lock className="w-4 h-4" /> Cerrar quincena
              </ModuleBtnPrimary>
            )}
          </>
        }
      />
      <ModuleContent>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl border p-4 shadow-sm">
        <select value={anio} onChange={e => setAnio(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm">
          {[anioInicial - 1, anioInicial, anioInicial + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={quincena} onChange={e => setQuinc(Number(e.target.value) as 1 | 2)}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value={1}>Q1 (1 al 15)</option>
          <option value={2}>Q2 (16 al fin)</option>
        </select>
        {esSuperAdmin && (
          <select value={sucursalId} onChange={e => setSuc(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="todas">Todas las sucursales</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <span className="text-sm text-slate-500 flex items-center gap-1 ml-auto">
          <Calendar className="w-4 h-4" />
          {labelQuincena(quincena, mes, anio)}
          {periodoActual?.estado === 'CERRADO' && (
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Cerrado</span>
          )}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          ['medicos', 'Médicos (comisiones)', Stethoscope],
          ['fijos', 'Enfermeras y Admin', Users],
          ['reglas', 'Reglas de comisión', Building2],
        ] as const).map(([k, lbl, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === k ? 'bg-white shadow text-[#003366]' : 'text-slate-600 hover:text-slate-900'
            }`}>
            <Icon className="w-4 h-4" /> {lbl}
          </button>
        ))}
      </div>

      {tab === 'medicos' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b">
            Las comisiones se calculan al cobrar en Ventas/Caja — no afectan la caja. Base = monto neto después de descuentos.
          </p>
          {resumenMedicos.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">
              Sin producción en este período. Verifica que las consultas tengan médico asignado y estén cobradas.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#003366] text-white">
                <tr>
                  <th className="text-left px-4 py-3">Médico</th>
                  <th className="text-right px-4 py-3">Producción</th>
                  <th className="text-right px-4 py-3">Comisión</th>
                  <th className="text-center px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {resumenMedicos.map(r => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{r.nombre}</td>
                    <td className="px-4 py-3 text-right">{fmtL(r.produccion)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#003366]">{fmtL(r.comision)}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{r.lineas.length} líneas</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{fmtL(resumenMedicos.reduce((s, r) => s + r.produccion, 0))}</td>
                  <td className="px-4 py-3 text-right text-[#003366]">{fmtL(totalComisiones)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {tab === 'fijos' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-purple-700 text-white">
              <tr>
                <th className="text-left px-4 py-3">Empleado</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-4 py-3">Sueldo mensual</th>
                <th className="text-right px-4 py-3">Esta quincena</th>
              </tr>
            </thead>
            <tbody>
              {fijos.map(e => (
                <tr key={e.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{e.nombre} {e.apellido}</td>
                  <td className="px-4 py-3 text-slate-500">{e.tipo_nomina}</td>
                  <td className="px-4 py-3 text-right">{fmtL(Number(e.sueldo_fijo || 0))}</td>
                  <td className="px-4 py-3 text-right font-bold">{fmtL(sueldoQuincena(Number(e.sueldo_fijo || 0), quincena))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fijos.length === 0 && (
            <p className="p-6 text-center text-slate-400 text-sm">
              Asigna sueldo fijo en Configuración → Usuarios (campo sueldo_fijo y tipo_nomina).
            </p>
          )}
        </div>
      )}

      {tab === 'reglas' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#c9a227] text-white">
              <tr>
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-right px-4 py-3">% Comisión doctor</th>
              </tr>
            </thead>
            <tbody>
              {reglas.map(r => (
                <tr key={r.clave} className="border-t">
                  <td className="px-4 py-3">{r.nombre}</td>
                  <td className="px-4 py-3 text-right font-bold">{r.porcentaje}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
