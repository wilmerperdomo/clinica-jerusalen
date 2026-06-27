'use client'

import { useState, useMemo, useTransition, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Wallet, Users, Stethoscope, Building2, Calendar, Lock,
  RefreshCw, Printer, DollarSign, UserCog, UserPlus, History,
  FileSpreadsheet, ClipboardList, Plus, AlertTriangle,
} from 'lucide-react'
import {
  fmtL, labelQuincena, rangoQuincena, sueldoQuincena,
  COMISIONES_DEFAULT,
} from '@/lib/planilla-utils'
import { validarCierrePlanilla } from '@/lib/planilla-validacion'
import {
  imprimirReciboPlanilla, exportarPlanillaCSV, imprimirPlanillaCompleta,
  type EstadoLiquidacion, type LiquidacionPrint,
} from '@/lib/planilla-print'
import AgregarEmpleadoPlanillaModal from '@/components/planilla/agregar-empleado-modal'
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
interface LiquidacionRow {
  id: number; periodo_id: number; perfil_id: string
  tipo_nomina: string; sueldo_fijo: number; total_comisiones: number
  bonificaciones: number; deducciones: number; total_pagar: number
  estado: EstadoLiquidacion; notas?: string
}
interface AjusteRow {
  id: number; liquidacion_id: number; tipo: string
  descripcion: string; monto: number
}
interface DetalleRow {
  id: number; liquidacion_id: number; descripcion: string
  monto_base: number; comision: number
}
interface HistorialRow {
  id: number; perfil_id: string
  sueldo_anterior?: number; sueldo_nuevo?: number
  tipo_nomina_anterior?: string; tipo_nomina_nuevo?: string
  created_at: string
}

interface Props {
  sucursales: Sucursal[]
  empleados: Empleado[]
  todosEmpleados: Empleado[]
  comisiones: Comision[]
  periodos: Periodo[]
  historialInicial: HistorialRow[]
  sucursalDefault: number | null
  esSuperAdmin: boolean
  esAdmin: boolean
  anioInicial: number
  mesInicial: number
  quincenaInicial: 1 | 2
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TIPOS_FIJOS = ['NINGUNO', 'ENFERMERA', 'ADMINISTRATIVO'] as const
const ESTADOS_LIQ: EstadoLiquidacion[] = ['PENDIENTE', 'PAGADO', 'RETENIDO', 'ANULADO']
const TIPOS_AJUSTE = ['BONO', 'ADELANTO', 'PRESTAMO', 'AUSENCIA', 'TARDANZA', 'DEDUCCION', 'MANUAL'] as const

const ESTADO_BADGE: Record<EstadoLiquidacion, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APROBADO: 'bg-blue-100 text-blue-800',
  PAGADO: 'bg-green-100 text-green-800',
  RETENIDO: 'bg-orange-100 text-orange-800',
  ANULADO: 'bg-red-100 text-red-800',
}

export default function PlanillaClient({
  sucursales, empleados, todosEmpleados, comisiones, periodos: initPeriodos,
  historialInicial, sucursalDefault, esSuperAdmin, esAdmin,
  anioInicial, mesInicial, quincenaInicial,
}: Props) {
  const supabase = createClient()
  const [pending, startTransition] = useTransition()
  const puedeEditar = esAdmin || esSuperAdmin

  const [anio, setAnio] = useState(anioInicial)
  const [mes, setMes] = useState(mesInicial)
  const [quincena, setQuinc] = useState<1 | 2>(quincenaInicial)
  const [sucursalId, setSuc] = useState<number | 'todas'>(sucursalDefault ?? 'todas')
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [produccion, setProd] = useState<Produccion[]>([])
  const [periodos, setPeriodos] = useState(initPeriodos)
  const [tab, setTab] = useState<'medicos' | 'fijos' | 'liquidaciones' | 'historial' | 'reglas'>('liquidaciones')

  const [empState, setEmpState] = useState<Empleado[]>(empleados)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [modalAgregar, setModalAgregar] = useState(false)

  const [liquidaciones, setLiquidaciones] = useState<LiquidacionRow[]>([])
  const [ajustesMap, setAjustesMap] = useState<Record<number, AjusteRow[]>>({})
  const [detalleMap, setDetalleMap] = useState<Record<number, DetalleRow[]>>({})
  const [historial, setHistorial] = useState<HistorialRow[]>(historialInicial)

  const [ajusteModal, setAjusteModal] = useState<LiquidacionRow | null>(null)
  const [formAjuste, setFormAjuste] = useState({ tipo: 'BONO' as string, descripcion: '', monto: '' })

  const rango = rangoQuincena(anio, mes, quincena)

  const medicos = useMemo(() => empState.filter(e => e.tipo_nomina === 'MEDICO'), [empState])
  const fijos = useMemo(() => empState.filter(e => e.tipo_nomina !== 'MEDICO'), [empState])

  const periodoActual = periodos.find(p =>
    p.anio === anio && p.mes === mes && p.quincena === quincena &&
    (sucursalId === 'todas' ? !p.sucursal_id : p.sucursal_id === sucursalId),
  )
  const periodoCerrado = periodoActual?.estado === 'CERRADO'

  const nombreEmpleado = useCallback((id: string) => {
    const e = empState.find(x => x.id === id) ?? todosEmpleados.find(x => x.id === id)
    return e ? `${e.nombre} ${e.apellido ?? ''}`.trim() : id.slice(0, 8)
  }, [empState, todosEmpleados])

  const matchFiltro = useCallback((id: string, nombre?: string) => {
    if (!filtroEmpleado.trim()) return true
    const q = filtroEmpleado.toLowerCase()
    const n = (nombre ?? nombreEmpleado(id)).toLowerCase()
    return n.includes(q)
  }, [filtroEmpleado, nombreEmpleado])

  function setEmpField(id: string, campo: 'sueldo_fijo' | 'tipo_nomina', valor: string | number) {
    setEmpState(prev => prev.map(e => e.id === id ? { ...e, [campo]: valor } : e))
  }

  async function guardarEmpleado(emp: Empleado) {
    if (!puedeEditar) { alert('Solo administradores pueden modificar sueldos.'); return }
    setSavingId(emp.id)
    const { error } = await supabase.from('perfiles').update({
      sueldo_fijo: Number(emp.sueldo_fijo || 0),
      tipo_nomina: emp.tipo_nomina || 'NINGUNO',
    }).eq('id', emp.id)
    setSavingId(null)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    await cargarHistorial()
  }

  async function agregarEmpleadoPlanilla(
    emp: Empleado, tipo: string, sueldo: number,
  ) {
    const { error } = await supabase.from('perfiles').update({
      tipo_nomina: tipo,
      sueldo_fijo: sueldo,
    }).eq('id', emp.id)
    if (error) { alert(error.message); return }
    const actualizado = { ...emp, tipo_nomina: tipo, sueldo_fijo: sueldo }
    setEmpState(prev => {
      const existe = prev.some(e => e.id === emp.id)
      return existe ? prev.map(e => e.id === emp.id ? actualizado : e) : [...prev, actualizado]
    })
    await cargarHistorial()
  }

  async function cargarHistorial() {
    const { data } = await supabase
      .from('planilla_sueldo_historial')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setHistorial(data as HistorialRow[])
  }

  async function cargarLiquidaciones(periodoId: number) {
    const { data: liqs } = await supabase
      .from('planilla_liquidaciones')
      .select('*')
      .eq('periodo_id', periodoId)
    if (!liqs?.length) { setLiquidaciones([]); return }

    const ids = liqs.map(l => l.id)
    const [{ data: ajustes }, { data: detalle }] = await Promise.all([
      supabase.from('planilla_liquidacion_ajustes').select('*').in('liquidacion_id', ids),
      supabase.from('planilla_liquidacion_detalle').select('*').in('liquidacion_id', ids),
    ])

    setLiquidaciones(liqs as LiquidacionRow[])
    const am: Record<number, AjusteRow[]> = {}
    for (const a of ajustes ?? []) {
      if (!am[a.liquidacion_id]) am[a.liquidacion_id] = []
      am[a.liquidacion_id].push(a as AjusteRow)
    }
    setAjustesMap(am)
    const dm: Record<number, DetalleRow[]> = {}
    for (const d of detalle ?? []) {
      if (!dm[d.liquidacion_id]) dm[d.liquidacion_id] = []
      dm[d.liquidacion_id].push(d as DetalleRow)
    }
    setDetalleMap(dm)
  }

  function cargarProduccion() {
    startTransition(async () => {
      let q = supabase.from('produccion_medica').select('*')
        .gte('fecha', rango.fecha_inicio).lte('fecha', rango.fecha_fin)
      if (sucursalId !== 'todas') q = q.eq('sucursal_id', sucursalId)
      const { data } = await q
      setProd((data as Produccion[]) ?? [])
    })
  }

  useEffect(() => { cargarProduccion() }, [anio, mes, quincena, sucursalId]) // eslint-disable-line

  useEffect(() => {
    if (periodoActual?.id && periodoActual.estado === 'CERRADO') {
      void cargarLiquidaciones(periodoActual.id)
    } else {
      setLiquidaciones([])
      setAjustesMap({})
      setDetalleMap({})
    }
  }, [periodoActual?.id, periodoActual?.estado])

  const resumenMedicos = useMemo(() => {
    const map = new Map<string, { nombre: string; comision: number; produccion: number; lineas: Produccion[] }>()
    for (const m of medicos) {
      map.set(m.id, { nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(), comision: 0, produccion: 0, lineas: [] })
    }
    for (const p of produccion) {
      const row = map.get(p.doctor_id)
      if (!row) continue
      row.comision += Number(p.comision_monto)
      row.produccion += Number(p.monto_neto)
      row.lineas.push(p)
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .filter(r => matchFiltro(r.id, r.nombre))
  }, [produccion, medicos, matchFiltro])

  const fijosFiltrados = useMemo(() =>
    fijos.filter(e => matchFiltro(e.id, `${e.nombre} ${e.apellido ?? ''}`)),
  [fijos, matchFiltro])

  const totalComisiones = resumenMedicos.reduce((s, r) => s + r.comision, 0)
  const totalFijos = fijos
    .filter(e => ['ENFERMERA', 'ADMINISTRATIVO'].includes(e.tipo_nomina))
    .reduce((s, e) => s + sueldoQuincena(Number(e.sueldo_fijo || 0), quincena), 0)
  const totalPlanilla = totalComisiones + totalFijos

  const liquidacionesVista: LiquidacionPrint[] = useMemo(() => {
    if (liquidaciones.length > 0) {
      return liquidaciones
        .filter(l => matchFiltro(l.perfil_id))
        .map(l => ({
          id: l.id,
          empleadoNombre: nombreEmpleado(l.perfil_id),
          tipoNomina: l.tipo_nomina,
          sueldoFijo: Number(l.sueldo_fijo),
          totalComisiones: Number(l.total_comisiones),
          bonificaciones: Number(l.bonificaciones),
          deducciones: Number(l.deducciones),
          totalPagar: Number(l.total_pagar),
          estado: l.estado,
          ajustes: (ajustesMap[l.id] ?? []).map(a => ({
            tipo: a.tipo, descripcion: a.descripcion, monto: Number(a.monto),
          })),
          detalleComisiones: (detalleMap[l.id] ?? []).map(d => ({
            descripcion: d.descripcion, monto: Number(d.monto_base), comision: Number(d.comision),
          })),
        }))
    }
    const prev: LiquidacionPrint[] = []
    for (const m of resumenMedicos.filter(r => r.comision > 0)) {
      prev.push({
        empleadoNombre: m.nombre, tipoNomina: 'MEDICO', sueldoFijo: 0,
        totalComisiones: m.comision, bonificaciones: 0, deducciones: 0,
        totalPagar: m.comision, estado: 'PENDIENTE',
        detalleComisiones: m.lineas.map(l => ({
          descripcion: l.descripcion, monto: Number(l.monto_neto), comision: Number(l.comision_monto),
        })),
      })
    }
    for (const e of fijos.filter(x => ['ENFERMERA', 'ADMINISTRATIVO'].includes(x.tipo_nomina))) {
      const sq = sueldoQuincena(Number(e.sueldo_fijo || 0), quincena)
      if (sq <= 0) continue
      if (!matchFiltro(e.id, `${e.nombre} ${e.apellido}`)) continue
      prev.push({
        empleadoNombre: `${e.nombre} ${e.apellido ?? ''}`.trim(),
        tipoNomina: e.tipo_nomina, sueldoFijo: sq, totalComisiones: 0,
        bonificaciones: 0, deducciones: 0, totalPagar: sq, estado: 'PENDIENTE',
      })
    }
    return prev
  }, [liquidaciones, ajustesMap, detalleMap, resumenMedicos, fijos, quincena, matchFiltro, nombreEmpleado])

  async function recalcularLiquidacion(liqId: number) {
    const ajustes = ajustesMap[liqId] ?? []
    let bonos = 0
    let deducs = 0
    for (const a of ajustes) {
      const m = Number(a.monto)
      if (['BONO', 'MANUAL'].includes(a.tipo) && m > 0) bonos += m
      else deducs += Math.abs(m)
    }
    const liq = liquidaciones.find(l => l.id === liqId)
    if (!liq) return
    const total = Number(liq.sueldo_fijo) + Number(liq.total_comisiones) + bonos - deducs
    await supabase.from('planilla_liquidaciones').update({
      bonificaciones: bonos, deducciones: deducs, total_pagar: Math.max(0, total),
    }).eq('id', liqId)
    setLiquidaciones(prev => prev.map(l => l.id === liqId
      ? { ...l, bonificaciones: bonos, deducciones: deducs, total_pagar: Math.max(0, total) }
      : l))
  }

  async function cambiarEstadoLiq(liqId: number, estado: EstadoLiquidacion) {
    const { error } = await supabase.from('planilla_liquidaciones')
      .update({ estado, pagado_en: estado === 'PAGADO' ? new Date().toISOString() : null })
      .eq('id', liqId)
    if (error) { alert(error.message); return }
    setLiquidaciones(prev => prev.map(l => l.id === liqId ? { ...l, estado } : l))
  }

  async function guardarAjuste() {
    if (!ajusteModal || !formAjuste.descripcion.trim()) return
    const monto = Number(formAjuste.monto)
    if (!monto) return
    const signed = ['ADELANTO', 'PRESTAMO', 'AUSENCIA', 'TARDANZA', 'DEDUCCION'].includes(formAjuste.tipo)
      ? -Math.abs(monto) : monto

    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('planilla_liquidacion_ajustes').insert({
      liquidacion_id: ajusteModal.id,
      tipo: formAjuste.tipo,
      descripcion: formAjuste.descripcion.trim(),
      monto: signed,
      usuario_id: user?.id,
    }).select().single()
    if (error) { alert(error.message); return }

    setAjustesMap(prev => ({
      ...prev,
      [ajusteModal.id]: [...(prev[ajusteModal.id] ?? []), data as AjusteRow],
    }))
    setAjusteModal(null)
    setFormAjuste({ tipo: 'BONO', descripcion: '', monto: '' })
    await recalcularLiquidacion(ajusteModal.id)
  }

  async function cerrarPeriodo() {
    const alertas = validarCierrePlanilla({
      medicos: medicos.map(m => ({
        id: m.id, nombre: `${m.nombre} ${m.apellido ?? ''}`,
        lineas: produccion.filter(p => p.doctor_id === m.id).length,
        comision: produccion.filter(p => p.doctor_id === m.id).reduce((s, p) => s + Number(p.comision_monto), 0),
      })),
      fijos,
      quincena,
    })

    const bloquea = alertas.some(a => a.tipo === 'error')
    const msg = alertas.map(a => `${a.tipo === 'error' ? '⛔' : a.tipo === 'warning' ? '⚠️' : 'ℹ️'} ${a.mensaje}`).join('\n')
    if (!confirm(`Validación antes de cerrar:\n\n${msg}\n\n${bloquea ? 'No se puede cerrar.' : '¿Cerrar planilla ' + labelQuincena(quincena, mes, anio) + '?'}`)) return
    if (bloquea) return

    let prodActual = produccion
    if (!prodActual.length) {
      let q = supabase.from('produccion_medica').select('*')
        .gte('fecha', rango.fecha_inicio).lte('fecha', rango.fecha_fin)
      if (sucursalId !== 'todas') q = q.eq('sucursal_id', sucursalId)
      const { data } = await q
      prodActual = (data as Produccion[]) ?? []
      setProd(prodActual)
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('planilla_periodos').upsert({
      anio, mes, quincena,
      fecha_inicio: rango.fecha_inicio, fecha_fin: rango.fecha_fin,
      estado: 'CERRADO', cerrado_por: user?.id, cerrado_en: new Date().toISOString(),
      sucursal_id: sucursalId === 'todas' ? null : sucursalId,
    }, { onConflict: 'sucursal_id,anio,mes,quincena' }).select().single()
    if (error) { alert('Error: ' + error.message); return }

    const periodoId = (data as Periodo).id

    for (const med of medicos) {
      const lineas = prodActual.filter(p => p.doctor_id === med.id)
      const totalCom = lineas.reduce((s, l) => s + Number(l.comision_monto), 0)
      if (totalCom <= 0) continue
      const { data: liq, error: errLiq } = await supabase.from('planilla_liquidaciones').upsert({
        periodo_id: periodoId, perfil_id: med.id, tipo_nomina: 'MEDICO',
        sueldo_fijo: 0, total_comisiones: totalCom, total_pagar: totalCom, estado: 'PENDIENTE',
      }, { onConflict: 'periodo_id,perfil_id' }).select().single()
      if (errLiq || !liq) continue
      await supabase.from('planilla_liquidacion_detalle').delete().eq('liquidacion_id', liq.id)
      if (lineas.length) {
        await supabase.from('planilla_liquidacion_detalle').insert(lineas.map(l => ({
          liquidacion_id: liq.id, produccion_medica_id: l.id,
          categoria: l.categoria_comision, descripcion: l.descripcion,
          monto_base: l.monto_neto, porcentaje: l.porcentaje_comision ?? 0, comision: l.comision_monto,
        })))
      }
    }

    for (const emp of fijos.filter(e => ['ENFERMERA', 'ADMINISTRATIVO'].includes(e.tipo_nomina))) {
      const sueldo = sueldoQuincena(Number(emp.sueldo_fijo || 0), quincena)
      if (sueldo <= 0) continue
      await supabase.from('planilla_liquidaciones').upsert({
        periodo_id: periodoId, perfil_id: emp.id, tipo_nomina: emp.tipo_nomina,
        sueldo_fijo: sueldo, total_comisiones: 0, total_pagar: sueldo, estado: 'PENDIENTE',
      }, { onConflict: 'periodo_id,perfil_id' })
    }

    setPeriodos(prev => [...prev.filter(p => p.id !== data.id), data as Periodo])
    await cargarLiquidaciones(periodoId)
    alert('Período cerrado. Revise liquidaciones, ajustes y estados de pago.')
  }

  const sucursalNombre = sucursalId === 'todas'
    ? undefined
    : sucursales.find(s => s.id === sucursalId)?.nombre

  const reglas = comisiones.length ? comisiones : COMISIONES_DEFAULT
  const enPlanilla = useMemo(() => new Set(empState.map(e => e.id)), [empState])

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Planilla y Comisiones"
        subtitle="Control interno de nómina · No genera movimientos en caja"
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
            {liquidacionesVista.length > 0 && (
              <>
                <ModuleBtnGhost onClick={() => exportarPlanillaCSV(liquidacionesVista, { quincena, mes, anio })}>
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </ModuleBtnGhost>
                <ModuleBtnGhost onClick={() => imprimirPlanillaCompleta(liquidacionesVista, { quincena, mes, anio }, sucursalNombre)}>
                  <Printer className="w-4 h-4" /> PDF
                </ModuleBtnGhost>
              </>
            )}
            {puedeEditar && periodoActual?.estado !== 'CERRADO' && (
              <ModuleBtnPrimary onClick={cerrarPeriodo}>
                <Lock className="w-4 h-4" /> Cerrar quincena
              </ModuleBtnPrimary>
            )}
          </>
        }
      />
      <ModuleContent>
        <div className="flex flex-wrap gap-3 bg-white rounded-xl border p-4 shadow-sm">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[anioInicial - 1, anioInicial, anioInicial + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={quincena} onChange={e => setQuinc(Number(e.target.value) as 1 | 2)} className="border rounded-lg px-3 py-2 text-sm">
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
          <input
            value={filtroEmpleado}
            onChange={e => setFiltroEmpleado(e.target.value)}
            placeholder="Filtrar empleado..."
            className="border rounded-lg px-3 py-2 text-sm min-w-[160px]"
          />
          <span className="text-sm text-slate-500 flex items-center gap-1 ml-auto">
            <Calendar className="w-4 h-4" />
            {labelQuincena(quincena, mes, anio)}
            {periodoActual?.estado === 'CERRADO' && (
              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Cerrado</span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {([
            ['liquidaciones', 'Liquidación', ClipboardList],
            ['medicos', 'Médicos', Stethoscope],
            ['fijos', 'Enfermeras y Admin', Users],
            ['historial', 'Historial sueldos', History],
            ['reglas', 'Reglas', Building2],
          ] as const).map(([k, lbl, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                tab === k ? 'bg-white shadow text-[#003366]' : 'text-slate-600 hover:text-slate-900'
              }`}>
              <Icon className="w-4 h-4" /> {lbl}
            </button>
          ))}
        </div>

        {tab === 'liquidaciones' && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <p className="px-4 py-3 text-xs text-slate-600 bg-slate-50 border-b flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              {periodoCerrado
                ? 'Período cerrado. Puede cambiar estados, agregar bonos/deducciones e imprimir recibos.'
                : 'Vista previa. Cierre la quincena para guardar liquidaciones y registrar ajustes.'}
            </p>
            {liquidacionesVista.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">Sin liquidaciones en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#003366] text-white">
                    <tr>
                      <th className="text-left px-4 py-3">Empleado</th>
                      <th className="text-left px-4 py-3">Tipo</th>
                      <th className="text-right px-4 py-3">Sueldo Q</th>
                      <th className="text-right px-4 py-3">Comisiones</th>
                      <th className="text-right px-4 py-3">Bonos</th>
                      <th className="text-right px-4 py-3">Deducc.</th>
                      <th className="text-right px-4 py-3">Total</th>
                      <th className="text-center px-4 py-3">Estado</th>
                      <th className="text-center px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidacionesVista.map((l, i) => (
                      <tr key={l.id ?? i} className="border-t hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{l.empleadoNombre}</td>
                        <td className="px-4 py-3 text-slate-500">{l.tipoNomina}</td>
                        <td className="px-4 py-3 text-right">{fmtL(l.sueldoFijo)}</td>
                        <td className="px-4 py-3 text-right">{fmtL(l.totalComisiones)}</td>
                        <td className="px-4 py-3 text-right text-green-700">{fmtL(l.bonificaciones)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{fmtL(l.deducciones)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fmtL(l.totalPagar)}</td>
                        <td className="px-4 py-3 text-center">
                          {periodoCerrado && l.id && puedeEditar ? (
                            <select
                              value={l.estado}
                              onChange={e => void cambiarEstadoLiq(l.id!, e.target.value as EstadoLiquidacion)}
                              className={`text-xs px-2 py-1 rounded-full border-0 font-medium ${ESTADO_BADGE[l.estado]}`}>
                              {ESTADOS_LIQ.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_BADGE[l.estado]}`}>{l.estado}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => imprimirReciboPlanilla(l, { quincena, mes, anio }, sucursalNombre)}
                              className="p-1.5 text-slate-500 hover:text-[#003366]" title="Imprimir recibo">
                              <Printer className="w-4 h-4" />
                            </button>
                            {periodoCerrado && l.id && puedeEditar && (
                              <button
                                onClick={() => { setAjusteModal(liquidaciones.find(x => x.id === l.id) ?? null); setFormAjuste({ tipo: 'BONO', descripcion: '', monto: '' }) }}
                                className="p-1.5 text-violet-600 hover:text-violet-800" title="Agregar ajuste">
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'medicos' && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b">
              Comisiones calculadas al cobrar en Ventas/Caja (solo control, no afecta caja).
            </p>
            {resumenMedicos.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">Sin producción en este período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#003366] text-white">
                  <tr>
                    <th className="text-left px-4 py-3">Médico</th>
                    <th className="text-right px-4 py-3">Producción</th>
                    <th className="text-right px-4 py-3">Comisión</th>
                    <th className="text-center px-4 py-3">Líneas</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenMedicos.map(r => (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{r.nombre}</td>
                      <td className="px-4 py-3 text-right">{fmtL(r.produccion)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#003366]">{fmtL(r.comision)}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{r.lineas.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'fijos' && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 text-xs text-purple-700 bg-purple-50 border-b flex items-center justify-between gap-2">
              <span>Asigna tipo de nómina y sueldo mensual. La quincena = 50% del mensual.</span>
              {puedeEditar && (
                <button onClick={() => setModalAgregar(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium">
                  <UserPlus className="w-3.5 h-3.5" /> Agregar empleado
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-purple-700 text-white">
                  <tr>
                    <th className="text-left px-4 py-3">Empleado</th>
                    <th className="text-left px-4 py-3">Rol</th>
                    <th className="text-left px-4 py-3">Tipo nómina</th>
                    <th className="text-right px-4 py-3">Sueldo mensual</th>
                    <th className="text-right px-4 py-3">Esta quincena</th>
                    {puedeEditar && <th className="text-center px-4 py-3">Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {fijosFiltrados.map(e => {
                    const cuenta = ['ENFERMERA', 'ADMINISTRATIVO'].includes(e.tipo_nomina)
                    return (
                      <tr key={e.id} className="border-t hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{e.nombre} {e.apellido}</td>
                        <td className="px-4 py-3 text-slate-500">{e.roles?.nombre ?? '—'}</td>
                        <td className="px-4 py-3">
                          {puedeEditar ? (
                            <select value={TIPOS_FIJOS.includes(e.tipo_nomina as typeof TIPOS_FIJOS[number]) ? e.tipo_nomina : 'NINGUNO'}
                              onChange={ev => setEmpField(e.id, 'tipo_nomina', ev.target.value)}
                              className="border rounded-lg px-2 py-1.5 text-sm">
                              <option value="NINGUNO">Ninguno</option>
                              <option value="ENFERMERA">Enfermera</option>
                              <option value="ADMINISTRATIVO">Administrativo</option>
                            </select>
                          ) : e.tipo_nomina}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {puedeEditar ? (
                            <input type="number" min={0} step="0.01" value={e.sueldo_fijo ?? ''}
                              onChange={ev => setEmpField(e.id, 'sueldo_fijo', ev.target.value === '' ? 0 : Number(ev.target.value))}
                              className="w-32 border rounded-lg px-2 py-1.5 text-sm text-right" />
                          ) : fmtL(Number(e.sueldo_fijo || 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          {cuenta ? fmtL(sueldoQuincena(Number(e.sueldo_fijo || 0), quincena)) : '—'}
                        </td>
                        {puedeEditar && (
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => void guardarEmpleado(e)} disabled={savingId === e.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                              {savingId === e.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                              Guardar
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'historial' && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {historial.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">Sin cambios de sueldo registrados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Empleado</th>
                    <th className="text-left px-4 py-3">Tipo anterior → nuevo</th>
                    <th className="text-right px-4 py-3">Sueldo anterior</th>
                    <th className="text-right px-4 py-3">Sueldo nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.filter(h => matchFiltro(h.perfil_id)).map(h => (
                    <tr key={h.id} className="border-t">
                      <td className="px-4 py-3 text-slate-500">{new Date(h.created_at).toLocaleString('es-HN')}</td>
                      <td className="px-4 py-3 font-medium">{nombreEmpleado(h.perfil_id)}</td>
                      <td className="px-4 py-3">{h.tipo_nomina_anterior ?? '—'} → {h.tipo_nomina_nuevo ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{fmtL(Number(h.sueldo_anterior ?? 0))}</td>
                      <td className="px-4 py-3 text-right font-bold">{fmtL(Number(h.sueldo_nuevo ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {modalAgregar && (
        <AgregarEmpleadoPlanillaModal
          todosEmpleados={todosEmpleados}
          enPlanilla={enPlanilla}
          onAgregar={agregarEmpleadoPlanilla}
          onClose={() => setModalAgregar(false)}
        />
      )}

      {ajusteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Ajuste — {nombreEmpleado(ajusteModal.perfil_id)}</h3>
            <select value={formAjuste.tipo} onChange={e => setFormAjuste(p => ({ ...p, tipo: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {TIPOS_AJUSTE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={formAjuste.descripcion} onChange={e => setFormAjuste(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Descripción" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="number" step="0.01" min={0} value={formAjuste.monto}
              onChange={e => setFormAjuste(p => ({ ...p, monto: e.target.value }))}
              placeholder="Monto (L.)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAjusteModal(null)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={() => void guardarAjuste()} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}
