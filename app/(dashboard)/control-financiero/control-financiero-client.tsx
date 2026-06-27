'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PieChart, TrendingUp, TrendingDown, Building2,
  Stethoscope, Pill, FlaskConical, Briefcase, ShoppingCart,
  RefreshCw, Printer, Download, FileSpreadsheet,
  Wallet, Landmark, BarChart3, Layers, CreditCard, Lightbulb, Home,
  Target, Calendar, FileText,
} from 'lucide-react'
import { imprimirReporte } from '@/lib/reporte-utils'
import {
  calcularResumen, fmtL, mesLabel, rangoMes,
  labelProduccion, resumenPorSucursal, resumirMargenLab,
  exportarControlFinanciero, exportarMovimientosCaja,
  type DatosExportFinanciero,
} from '@/lib/control-financiero-utils'
import {
  calcularResumenPersonal, calcularGananciaReal, calcularResumenDeudas, fmtFin,
  exportarMovimientosPersonalesCSV,
  type FinCategoria, type FinMovimiento, type FinPrestamo, type FinTarjeta, type FinDeuda,
} from '@/lib/finanzas-personales'
import { generarSugerencias } from '@/lib/finanzas-sugerencias'
import MovimientosPanel from '@/components/control-financiero/movimientos-panel'
import TarjetasPanel from '@/components/control-financiero/tarjetas-panel'
import DeudasPanel from '@/components/control-financiero/deudas-panel'
import IdeasPanel from '@/components/control-financiero/ideas-panel'
import PresupuestosPanel from '@/components/control-financiero/presupuestos-panel'
import CajasPanel from '@/components/control-financiero/cajas-panel'
import FlujoPanel from '@/components/control-financiero/flujo-panel'
import EjecutivoPanel from '@/components/control-financiero/ejecutivo-panel'
import {
  calcularUsoPresupuestos, calcularRankingGastos, calcularComparacionMes,
  generarCalendarioPagos, calcularFlujoProyectado, recomendarOrdenPagos,
  calcularEstadoPatrimonio, generarReporteEjecutivo, mesAnterior,
  type FinPresupuesto, type FinCuenta, type FinPagoProgramado,
} from '@/lib/finanzas-analisis'
import type { LabCostoOrden } from '@/lib/lab-costos'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost, ModuleBtnPrimary } from '@/components/module-layout'

interface Sucursal { id: number; nombre: string }
interface Movimiento { id: number; tipo: string; concepto: string; monto: number; fecha: string; sucursal_id?: number }
interface Compra { id: number; total: number; fecha: string; sucursal_id?: number; estado?: string }
interface Produccion { categoria_comision: string; monto_neto: number; comision_monto: number; sucursal_id: number; fecha: string }
type LabCostoFinanciero = LabCostoOrden & { orden?: { sucursal_id?: number | null; fecha?: string | null } | null }

interface Props {
  sucursales: Sucursal[]
  sucursalDefault: number | null
  esSuperAdmin: boolean
  esAdmin: boolean
  anioInicial: number
  mesInicial: number
  categoriasInicial: FinCategoria[]
  movimientosPersonalInicial: FinMovimiento[]
  prestamosInicial: FinPrestamo[]
  tarjetasInicial: FinTarjeta[]
  deudasInicial: FinDeuda[]
  presupuestosInicial: FinPresupuesto[]
  cuentasInicial: FinCuenta[]
  programadosInicial: FinPagoProgramado[]
  planillaReferenciaInicial: number
}

type TabId = 'resumen' | 'ejecutivo' | 'presupuesto' | 'flujo' | 'cajas' | 'ideas' | 'movimientos' | 'tarjetas' | 'deudas' | 'clinica'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function ControlFinancieroClient({
  sucursales, sucursalDefault, esSuperAdmin, esAdmin,
  anioInicial, mesInicial,
  categoriasInicial, movimientosPersonalInicial, prestamosInicial,
  tarjetasInicial, deudasInicial,
  presupuestosInicial, cuentasInicial, programadosInicial,
  planillaReferenciaInicial,
}: Props) {
  const supabase = createClient()
  const [pending, startTransition] = useTransition()
  const puedeEditar = esAdmin || esSuperAdmin
  const [tab, setTab] = useState<TabId>('resumen')

  const [anio, setAnio] = useState(anioInicial)
  const [mes, setMes]     = useState(mesInicial)
  const [sucursalId, setSuc] = useState<number | 'todas'>(sucursalDefault ?? 'todas')
  const [movimientos, setMovs] = useState<Movimiento[]>([])
  const [compras, setCompras]   = useState<Compra[]>([])
  const [produccion, setProd]     = useState<Produccion[]>([])
  const [labCostos, setLabCostos] = useState<LabCostoFinanciero[]>([])
  const [cxcPendiente, setCxc]    = useState(0)
  const [cxpPendiente, setCxp]    = useState(0)

  const [categoriasFin, setCategoriasFin] = useState(categoriasInicial)
  const [movPersonal, setMovPersonal] = useState(movimientosPersonalInicial)
  const [prestamos, setPrestamos] = useState(prestamosInicial)
  const [tarjetas, setTarjetas] = useState(tarjetasInicial)
  const [deudas, setDeudas] = useState(deudasInicial)
  const [presupuestos, setPresupuestos] = useState(presupuestosInicial)
  const [cuentas, setCuentas] = useState(cuentasInicial)
  const [programados, setProgramados] = useState(programadosInicial)
  const [movAnterior, setMovAnterior] = useState<FinMovimiento[]>([])
  const [resumenClinicaAnterior, setResumenClinicaAnterior] = useState({ ingresos: 0, egresos: 0, utilidad: 0 })
  const [planillaRef, setPlanillaRef] = useState(planillaReferenciaInicial)

  const { inicio: mesInicio, fin: mesFin } = rangoMes(anio, mes)

  function cargarDatos() {
    startTransition(async () => {
      let movQ = supabase
        .from('caja_movimientos')
        .select('id, tipo, concepto, monto, fecha, sucursal_id, sesion:caja_sesiones(sucursal_id)')
        .gte('fecha', mesInicio)
        .lte('fecha', mesFin)
        .eq('anulado', false)

      let compQ = supabase
        .from('compras')
        .select('id, total, fecha, sucursal_id, estado')
        .gte('fecha', mesInicio)
        .lte('fecha', mesFin)
        .neq('estado', 'anulada')

      let prodQ = supabase
        .from('produccion_medica')
        .select('categoria_comision, monto_neto, comision_monto, sucursal_id, fecha')
        .gte('fecha', mesInicio)
        .lte('fecha', mesFin)

      const sid = sucursalId === 'todas' ? null : sucursalId
      if (sid) {
        compQ = compQ.eq('sucursal_id', sid)
        prodQ = prodQ.eq('sucursal_id', sid)
      }

      async function fetchProd() {
        const { data, error } = await prodQ
        if (error) return [] as Produccion[]
        return (data as Produccion[]) ?? []
      }

      async function fetchCxc() {
        let q = supabase.from('cxc').select('saldo').in('estado', ['PENDIENTE', 'PARCIAL'])
        if (sid) q = q.eq('sucursal_id', sid)
        const { data, error } = await q
        if (error) return 0
        return (data ?? []).reduce((s, r) => s + Number(r.saldo || 0), 0)
      }

      async function fetchCxp() {
        let q = supabase.from('compra_cxp').select('saldo').in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
        if (sid) q = q.eq('sucursal_id', sid)
        const { data, error } = await q
        if (error) return 0
        return (data ?? []).reduce((s, r) => s + Number(r.saldo || 0), 0)
      }

      async function fetchLabCostos() {
        const { data, error } = await supabase
          .from('lab_costos_orden')
          .select('*, orden:consulta_analisis(sucursal_id, fecha)')
          .gte('created_at', `${mesInicio}T00:00:00`)
          .lte('created_at', `${mesFin}T23:59:59`)
        if (error) return [] as LabCostoFinanciero[]
        const rows = (data as unknown as LabCostoFinanciero[]) ?? []
        return sid ? rows.filter(r => r.orden?.sucursal_id === sid) : rows
      }

      const [{ data: movs }, { data: comps }, prodData, cxcTotal, cxpTotal, labCostosData] = await Promise.all([
        movQ,
        compQ,
        fetchProd(),
        fetchCxc(),
        fetchCxp(),
        fetchLabCostos(),
      ])

      const movsFlat = (movs ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as number,
        tipo: m.tipo as string,
        concepto: m.concepto as string,
        monto: m.monto as number,
        fecha: m.fecha as string,
        sucursal_id: (m.sucursal_id as number) ?? (m.sesion as { sucursal_id?: number })?.sucursal_id,
      }))

      const movsFiltrados = sid
        ? movsFlat.filter(m => m.sucursal_id === sid)
        : movsFlat

      setMovs(movsFiltrados)
      setCompras((comps as Compra[]) ?? [])
      setProd(prodData)
      setLabCostos(labCostosData)
      setCxc(cxcTotal)
      setCxp(cxpTotal)
    })
  }

  function cargarPersonal() {
    startTransition(async () => {
      const { inicio, fin } = rangoMes(anio, mes)
      const prev = mesAnterior(anio, mes)
      const { inicio: inicioPrev, fin: finPrev } = rangoMes(prev.anio, prev.mes)

      const [movRes, prestRes, tarjRes, deudRes, planRes, presRes, cuentRes, progRes, movPrevRes, movsClinPrev, compsPrev] = await Promise.all([
        supabase.from('finanzas_movimientos')
          .select('*, categoria:finanzas_categorias(id, tipo, clave, nombre, icono, orden, activo)')
          .gte('fecha', inicio).lte('fecha', fin)
          .order('fecha', { ascending: false }),
        supabase.from('finanzas_prestamos').select('*').order('activo', { ascending: false }).order('nombre'),
        supabase.from('finanzas_tarjetas').select('*').order('activo', { ascending: false }).order('alias'),
        supabase.from('finanzas_deudas').select('*').order('activo', { ascending: false }).order('nombre'),
        supabase.from('planilla_liquidaciones')
          .select('total_pagar, estado, periodo:planilla_periodos(fecha_inicio, fecha_fin)')
          .in('estado', ['PAGADO', 'APROBADO', 'PENDIENTE']),
        supabase.from('finanzas_presupuestos').select('*').eq('anio', anio).eq('mes', mes).eq('activo', true),
        supabase.from('finanzas_cuentas').select('*').eq('activo', true).order('nombre'),
        supabase.from('finanzas_pagos_programados').select('*').eq('activo', true).order('dia_mes'),
        supabase.from('finanzas_movimientos')
          .select('*, categoria:finanzas_categorias(id, tipo, clave, nombre, icono, orden, activo)')
          .gte('fecha', inicioPrev).lte('fecha', finPrev),
        supabase.from('caja_movimientos')
          .select('tipo, monto, fecha').gte('fecha', inicioPrev).lte('fecha', finPrev).eq('anulado', false),
        supabase.from('compras').select('total, fecha, estado').gte('fecha', inicioPrev).lte('fecha', finPrev).neq('estado', 'anulada'),
      ])
      setMovPersonal(movRes.error ? [] : (movRes.data ?? []))
      setPrestamos(prestRes.error ? [] : (prestRes.data ?? []))
      setTarjetas(tarjRes.error ? [] : (tarjRes.data ?? []))
      setDeudas(deudRes.error ? [] : (deudRes.data ?? []))
      setPresupuestos(presRes.error ? [] : (presRes.data ?? []))
      setCuentas(cuentRes.error ? [] : (cuentRes.data ?? []))
      setProgramados(progRes.error ? [] : (progRes.data ?? []))
      setMovAnterior(movPrevRes.error ? [] : (movPrevRes.data ?? []))

      const movsPrev = (movsClinPrev.data ?? []) as { tipo: string; monto: number }[]
      const compsPrevTotal = ((compsPrev.data ?? []) as { total: number }[]).reduce((s, c) => s + Number(c.total), 0)
      const resPrev = calcularResumen(
        movsPrev.map((m, i) => ({ id: i, tipo: m.tipo, concepto: '', monto: Number(m.monto), fecha: '' })),
        compsPrevTotal,
      )
      setResumenClinicaAnterior({ ingresos: resPrev.ingresos_total, egresos: resPrev.egresos_total, utilidad: resPrev.utilidad })

      let planilla = 0
      if (!planRes.error && planRes.data) {
        for (const l of planRes.data) {
          const per = l.periodo as { fecha_inicio?: string; fecha_fin?: string } | null
          if (per?.fecha_inicio && per.fecha_inicio >= inicio && per?.fecha_fin && per.fecha_fin <= fin) {
            planilla += Number(l.total_pagar || 0)
          }
        }
      }
      setPlanillaRef(planilla)
    })
  }

  function recargarTodo() {
    cargarDatos()
    cargarPersonal()
  }

  function nombreSuc(id?: number) {
    if (!id) return '—'
    return sucursales.find(s => s.id === id)?.nombre ?? `Sucursal #${id}`
  }

  const sucursalLabel = sucursalId === 'todas'
    ? 'Consolidado — todas las sucursales'
    : nombreSuc(sucursalId as number)

  function armarExport(): DatosExportFinanciero {
    const prodExport = Object.entries(
      produccion.reduce<Record<string, { monto: number; comision: number }>>((acc, p) => {
        const k = p.categoria_comision
        if (!acc[k]) acc[k] = { monto: 0, comision: 0 }
        acc[k].monto += Number(p.monto_neto)
        acc[k].comision += Number(p.comision_monto)
        return acc
      }, {}),
    ).map(([k, v]) => ({ label: labelProduccion(k), monto: v.monto, comision: v.comision }))

    return {
      periodo: mesLabel(anio, mes),
      sucursalLabel,
      resumen,
      categorias: catsIngreso.map(c => ({ label: c.label, monto: c.val, pct: pct(c.val) })),
      porSucursal: porSucursal.map(s => ({
        nombre: s.nombre,
        ingresos_total: s.ingresos_total,
        egresos_total: s.egresos_total,
        utilidad: s.utilidad,
      })),
      produccion: prodExport,
      totalComisiones,
      movimientos: movimientos.map(m => ({
        fecha: m.fecha,
        tipo: m.tipo,
        concepto: m.concepto,
        monto: m.monto,
        sucursal: nombreSuc(m.sucursal_id),
      })),
      compras: compras.map(c => ({
        fecha: c.fecha,
        total: Number(c.total),
        estado: c.estado,
        sucursal: nombreSuc(c.sucursal_id),
      })),
      cxcPendiente,
      cxpPendiente,
    }
  }

  function exportarExcel() {
    exportarControlFinanciero(armarExport())
  }

  function exportarMovs() {
    exportarMovimientosCaja(mesLabel(anio, mes), armarExport().movimientos)
  }

  function exportarPersonal() {
    exportarMovimientosPersonalesCSV(movPersonal, mesLabel(anio, mes))
  }

  function imprimir() {
    const filasCat = catsIngreso.map(c =>
      `<tr><td>${c.label}</td><td class="right">${fmtL(c.val)}</td><td class="right">${pct(c.val)}</td></tr>`,
    ).join('')
    const filasPersIng = Object.entries(resumenPersonal.porCategoria)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<tr><td>${k}</td><td class="right success">${fmtFin(v)}</td></tr>`)
      .join('')
    const filasPersEgr = Object.entries(resumenPersonal.porCategoria)
      .filter(([, v]) => v < 0)
      .map(([k, v]) => `<tr><td>${k}</td><td class="right danger">${fmtFin(Math.abs(v))}</td></tr>`)
      .join('')
    const filasSuc = porSucursal.map(s =>
      `<tr><td>${s.nombre}</td><td class="right success">${fmtL(s.ingresos_total)}</td><td class="right danger">${fmtL(s.egresos_total)}</td><td class="right bold">${fmtL(s.utilidad)}</td></tr>`,
    ).join('')

    imprimirReporte({
      titulo: 'Control Financiero Total',
      subtitulo: `${mesLabel(anio, mes)} · ${sucursalLabel}`,
      contenidoHtml: `
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-lbl">Ganancia real</div><div class="kpi-val bold">${fmtFin(resumenTotal.gananciaReal)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Utilidad clínica</div><div class="kpi-val">${fmtL(resumen.utilidad)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Utilidad personal</div><div class="kpi-val">${fmtFin(resumenPersonal.utilidad)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Planilla (ref.)</div><div class="kpi-val danger">${fmtFin(planillaRef)}</div></div>
        </div>
        <h2>Clínica — ingresos por categoría</h2>
        <table><thead><tr><th>Categoría</th><th class="right">Monto</th><th class="right">%</th></tr></thead><tbody>${filasCat}</tbody></table>
        <h2>Finanzas personales — ingresos</h2>
        <table><thead><tr><th>Categoría</th><th class="right">Monto</th></tr></thead><tbody>${filasPersIng || '<tr><td colspan="2">Sin ingresos</td></tr>'}</tbody></table>
        <h2>Finanzas personales — gastos</h2>
        <table><thead><tr><th>Categoría</th><th class="right">Monto</th></tr></thead><tbody>${filasPersEgr || '<tr><td colspan="2">Sin gastos</td></tr>'}</tbody></table>
        ${porSucursal.length > 0 ? `<h2>Comparativo por sucursal</h2><table><thead><tr><th>Sucursal</th><th class="right">Ingresos</th><th class="right">Gastos</th><th class="right">Utilidad</th></tr></thead><tbody>${filasSuc}</tbody></table>` : ''}
        <h2>Gastos del mes</h2>
        <table><tbody>
          <tr><td>Compras</td><td class="right">${fmtL(resumen.egresos_por_tipo.compras)}</td></tr>
          <tr><td>Nómina</td><td class="right">${fmtL(resumen.egresos_por_tipo.nomina)}</td></tr>
          <tr><td>Gastos fijos</td><td class="right">${fmtL(resumen.egresos_por_tipo.gastos_fijos)}</td></tr>
          <tr><td>Otros</td><td class="right">${fmtL(resumen.egresos_por_tipo.otros)}</td></tr>
        </tbody></table>
        <p style="margin-top:16px;font-size:11px;color:#666">CXC pendiente: ${fmtL(cxcPendiente)} · CXP pendiente: ${fmtL(cxpPendiente)}</p>
      `,
    })
  }

  useEffect(() => {
    recargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, sucursalId])

  const comprasTotal = compras.reduce((s, c) => s + Number(c.total || 0), 0)
  const resumen = calcularResumen(movimientos, comprasTotal)
  const resumenPersonal = useMemo(() => calcularResumenPersonal(movPersonal), [movPersonal])
  const resumenDeudas = useMemo(() => calcularResumenDeudas({
    prestamos, tarjetas, deudas, cxpSistema: cxpPendiente,
  }), [prestamos, tarjetas, deudas, cxpPendiente])
  const resumenTotal = useMemo(() => calcularGananciaReal({
    clinicaUtilidad: resumen.utilidad,
    clinicaIngresos: resumen.ingresos_total,
    clinicaEgresos: resumen.egresos_total,
    personal: resumenPersonal,
    planillaReferencia: planillaRef,
    deudas: resumenDeudas,
  }), [resumen, resumenPersonal, planillaRef, resumenDeudas])

  const sugerencias = useMemo(() => generarSugerencias({
    movimientos: movPersonal,
    categorias: categoriasFin,
    tarjetas,
    prestamos,
    deudas,
    cxcPendiente,
    cxpPendiente,
    planillaMes: planillaRef,
    comprasMes: comprasTotal,
    anio,
    mes,
  }), [movPersonal, categoriasFin, tarjetas, prestamos, deudas, cxcPendiente, cxpPendiente, planillaRef, comprasTotal, anio, mes])

  const presupuestosUso = useMemo(() => calcularUsoPresupuestos(presupuestos, movPersonal, { planilla: planillaRef }), [presupuestos, movPersonal, planillaRef])
  const topGastos = useMemo(() => calcularRankingGastos(movPersonal, 10), [movPersonal])
  const calendario = useMemo(() => generarCalendarioPagos({
    anio, mes, tarjetas, prestamos, deudas, programados, planillaMonto: planillaRef,
  }), [anio, mes, tarjetas, prestamos, deudas, programados, planillaRef])
  const flujo = useMemo(() => calcularFlujoProyectado({
    anio, mes,
    ingresosClinicaMes: resumen.ingresos_total,
    ingresosPersonalMes: resumenPersonal.ingresos,
    egresosPersonalMes: resumenPersonal.egresos,
    egresosClinicaSistema: resumen.egresos_total,
    calendario, cuentas,
  }), [anio, mes, resumen, resumenPersonal, calendario, cuentas])
  const deudasPrioridad = useMemo(() => recomendarOrdenPagos(prestamos, tarjetas, deudas), [prestamos, tarjetas, deudas])
  const patrimonio = useMemo(() => calcularEstadoPatrimonio({
    cuentas, cxc: cxcPendiente,
    tarjetas: resumenDeudas.tarjetas, prestamos: resumenDeudas.prestamos,
    deudas: resumenDeudas.deudas, cxp: cxpPendiente,
  }), [cuentas, cxcPendiente, resumenDeudas, cxpPendiente])
  const comparacion = useMemo(() => calcularComparacionMes({
    utilidadClinicaActual: resumen.utilidad,
    utilidadClinicaAnterior: resumenClinicaAnterior.utilidad,
    ingresosClinicaActual: resumen.ingresos_total,
    ingresosClinicaAnterior: resumenClinicaAnterior.ingresos,
    egresosClinicaActual: resumen.egresos_total,
    egresosClinicaAnterior: resumenClinicaAnterior.egresos,
    movActual: movPersonal,
    movAnterior,
    deudaActual: resumenDeudas.total,
    deudaAnterior: resumenDeudas.total,
  }), [resumen, resumenClinicaAnterior, movPersonal, movAnterior, resumenDeudas.total])
  const reporteEjecutivo = useMemo(() => generarReporteEjecutivo({
    periodo: mesLabel(anio, mes),
    gananciaReal: resumenTotal.gananciaReal,
    utilidadClinica: resumen.utilidad,
    gastosCasa: resumenPersonal.porAmbito.CASA.egresos,
    gastosClinicaManual: resumenPersonal.porAmbito.CLINICA.egresos,
    pasivoTotal: resumenDeudas.total,
    patrimonio,
    flujo,
    topGastos,
    presupuestos: presupuestosUso,
    comparacion,
    calendario,
    deudasPrioridad,
  }), [anio, mes, resumenTotal, resumen, resumenPersonal, resumenDeudas, patrimonio, flujo, topGastos, presupuestosUso, comparacion, calendario, deudasPrioridad])

  const margenLab = useMemo(() => resumirMargenLab(labCostos), [labCostos])

  const prodPorCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of produccion) {
      m[p.categoria_comision] = (m[p.categoria_comision] || 0) + Number(p.monto_neto)
    }
    return m
  }, [produccion])

  const totalComisiones = produccion.reduce((s, p) => s + Number(p.comision_monto || 0), 0)

  const porSucursal = useMemo(() => {
    if (sucursalId !== 'todas' || sucursales.length < 2) return []
    return resumenPorSucursal(movimientos, compras, sucursales)
  }, [movimientos, compras, sucursales, sucursalId])

  const catsIngreso = [
    { key: 'consultas', label: 'Consultas', val: resumen.por_categoria.consultas, icon: Stethoscope, color: 'bg-blue-500' },
    { key: 'medicamentos', label: 'Medicamentos', val: resumen.por_categoria.medicamentos, icon: Pill, color: 'bg-green-500' },
    { key: 'servicios', label: 'Servicios', val: resumen.por_categoria.servicios, icon: Briefcase, color: 'bg-purple-500' },
    { key: 'laboratorio', label: 'Laboratorio', val: resumen.por_categoria.laboratorio, icon: FlaskConical, color: 'bg-cyan-500' },
    { key: 'otros_ingresos', label: 'Otros ingresos', val: resumen.por_categoria.otros_ingresos, icon: TrendingUp, color: 'bg-slate-500' },
  ]

  const pct = (v: number) => resumen.ingresos_total > 0
    ? `${((v / resumen.ingresos_total) * 100).toFixed(1)}%`
    : '0%'

  return (
    <ModuleShell tint="emerald" className="print:bg-white">
      <div className="print:hidden">
        <ModuleHero
          title="Control Financiero"
          subtitle="Clínica + casa + tarjetas + deudas — control total y ganancia real"
          badge="Dirección financiera"
          icon={PieChart}
          gradient="emerald"
          kpis={[
            { label: 'Ganancia real', value: fmtFin(resumenTotal.gananciaReal), icon: BarChart3 },
            { label: 'Pasivo total', value: fmtFin(resumenDeudas.total), icon: Landmark },
            { label: 'Gastos casa', value: fmtFin(resumenPersonal.porAmbito.CASA.egresos), icon: Home },
            { label: 'Saldo tarjetas', value: fmtFin(resumenDeudas.tarjetas), icon: CreditCard },
          ]}
          actions={
            <>
              <ModuleBtnGhost onClick={recargarTodo} disabled={pending}>
                <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} /> Actualizar
              </ModuleBtnGhost>
              <ModuleBtnGhost onClick={exportarExcel}>
                <FileSpreadsheet className="w-4 h-4" /> Excel clínica
              </ModuleBtnGhost>
              <ModuleBtnGhost onClick={exportarPersonal}>
                <Download className="w-4 h-4" /> CSV personal
              </ModuleBtnGhost>
              <ModuleBtnPrimary onClick={imprimir}>
                <Printer className="w-4 h-4" /> Imprimir
              </ModuleBtnPrimary>
            </>
          }
        />
      </div>
      <ModuleContent className="print:p-4">

      <div className="flex flex-wrap gap-3 bg-white rounded-xl border p-4 shadow-sm print:hidden">
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[anioInicial - 1, anioInicial, anioInicial + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        {esSuperAdmin && (
          <select value={sucursalId} onChange={e => setSuc(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="todas">Consolidado — todas las sucursales</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <span className="text-sm text-slate-600 ml-auto flex items-center gap-1">
          <Building2 className="w-4 h-4" /> {mesLabel(anio, mes)}
          {pending && <span className="text-xs text-slate-400">cargando…</span>}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        {([
          { id: 'resumen' as const, label: 'Resumen', icon: Layers },
          { id: 'ejecutivo' as const, label: 'Ejecutivo', icon: FileText },
          { id: 'presupuesto' as const, label: 'Presupuesto', icon: Target, badge: presupuestosUso.filter(p => p.excedido).length },
          { id: 'flujo' as const, label: 'Flujo', icon: Calendar, badge: flujo.alertaFaltaDinero ? 1 : 0 },
          { id: 'cajas' as const, label: 'Cajas', icon: Wallet },
          { id: 'ideas' as const, label: 'Ideas', icon: Lightbulb, badge: sugerencias.filter(s => s.prioridad === 'alta').length },
          { id: 'movimientos' as const, label: 'Movimientos', icon: BarChart3 },
          { id: 'tarjetas' as const, label: 'Tarjetas', icon: CreditCard },
          { id: 'deudas' as const, label: 'Deudas', icon: Landmark },
          { id: 'clinica' as const, label: 'Clínica', icon: Building2 },
        ]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t.id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {'badge' in t && t.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl p-6 text-white shadow-lg">
            <p className="text-sm opacity-90">Ganancia real del mes</p>
            <p className="text-4xl font-bold mt-1">{fmtFin(resumenTotal.gananciaReal)}</p>
            <p className="text-xs opacity-75 mt-2">
              Utilidad clínica ({fmtL(resumen.utilidad)}) + personal ({fmtFin(resumenPersonal.utilidad)})
              {planillaRef > 0 ? ` − planilla (${fmtFin(planillaRef)})` : ''}
            </p>
            <p className="text-sm mt-3 opacity-90">
              Posición estimada (ganancia − deudas): <strong>{fmtFin(resumenTotal.patrimonioEstimado)}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" /> Clínica (caja + compras)
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>Ingresos</span><strong className="text-green-700">{fmtL(resumen.ingresos_total)}</strong></li>
                <li className="flex justify-between"><span>Gastos</span><strong className="text-red-600">{fmtL(resumen.egresos_total)}</strong></li>
                <li className="flex justify-between border-t pt-2"><span>Utilidad</span><strong>{fmtL(resumen.utilidad)}</strong></li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" /> Finanzas personales
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>Ingresos extra</span><strong className="text-green-700">{fmtFin(resumenPersonal.ingresos)}</strong></li>
                <li className="flex justify-between"><span>Gastos personales</span><strong className="text-red-600">{fmtFin(resumenPersonal.egresos)}</strong></li>
                <li className="flex justify-between border-t pt-2"><span>Utilidad</span><strong>{fmtFin(resumenPersonal.utilidad)}</strong></li>
              </ul>
              <p className="text-xs text-slate-400 mt-3">{movPersonal.length} movimiento(s) este mes</p>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Home className="w-5 h-5 text-orange-600" /> Casa
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>Gastos casa</span><strong className="text-red-600">{fmtFin(resumenPersonal.porAmbito.CASA.egresos)}</strong></li>
                <li className="flex justify-between"><span>Ingresos casa</span><strong className="text-green-700">{fmtFin(resumenPersonal.porAmbito.CASA.ingresos)}</strong></li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-red-600" /> Pasivo total
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>Préstamos</span><strong>{fmtFin(resumenDeudas.prestamos)}</strong></li>
                <li className="flex justify-between"><span>Tarjetas</span><strong>{fmtFin(resumenDeudas.tarjetas)}</strong></li>
                <li className="flex justify-between"><span>Otras deudas</span><strong>{fmtFin(resumenDeudas.deudas)}</strong></li>
                <li className="flex justify-between"><span>CXP sistema</span><strong>{fmtFin(resumenDeudas.cxpSistema)}</strong></li>
                <li className="flex justify-between border-t pt-2 font-bold"><span>Total</span><strong className="text-red-700">{fmtFin(resumenDeudas.total)}</strong></li>
              </ul>
            </div>
          </div>

          {sugerencias.length > 0 && (
            <button type="button" onClick={() => setTab('ideas')}
              className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-left hover:bg-amber-100 transition-colors">
              <p className="font-bold text-amber-900 flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                {sugerencias.length} sugerencia(s) — {sugerencias.filter(s => s.prioridad === 'alta').length} urgentes
              </p>
              <p className="text-sm text-amber-800 mt-1">{sugerencias[0].titulo}</p>
            </button>
          )}

          {Object.keys(resumenPersonal.porCategoria).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <h3 className="font-bold text-slate-800 mb-3">Ingresos personales por categoría</h3>
                <ul className="space-y-2 text-sm">
                  {Object.entries(resumenPersonal.porCategoria).filter(([, v]) => v > 0).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><strong className="text-green-700">{fmtFin(v)}</strong></li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <h3 className="font-bold text-slate-800 mb-3">Gastos personales por categoría</h3>
                <ul className="space-y-2 text-sm">
                  {Object.entries(resumenPersonal.porCategoria).filter(([, v]) => v < 0).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><strong className="text-red-600">{fmtFin(Math.abs(v))}</strong></li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'ejecutivo' && (
        <EjecutivoPanel reporte={reporteEjecutivo} comparacion={comparacion} />
      )}

      {tab === 'presupuesto' && (
        <PresupuestosPanel
          presupuestos={presupuestos}
          movimientos={movPersonal}
          anio={anio}
          mes={mes}
          planillaRef={planillaRef}
          puedeEditar={puedeEditar}
          onRecargar={cargarPersonal}
        />
      )}

      {tab === 'flujo' && (
        <FlujoPanel
          anio={anio}
          mes={mes}
          tarjetas={tarjetas}
          prestamos={prestamos}
          deudas={deudas}
          programados={programados}
          cuentas={cuentas}
          planillaRef={planillaRef}
          ingresosClinica={resumen.ingresos_total}
          ingresosPersonal={resumenPersonal.ingresos}
          egresosPersonal={resumenPersonal.egresos}
          egresosClinicaSistema={resumen.egresos_total}
          puedeEditar={puedeEditar}
          onRecargar={cargarPersonal}
        />
      )}

      {tab === 'cajas' && (
        <CajasPanel
          cuentas={cuentas}
          cxc={cxcPendiente}
          pasivo={{
            tarjetas: resumenDeudas.tarjetas,
            prestamos: resumenDeudas.prestamos,
            deudas: resumenDeudas.deudas,
            cxp: cxpPendiente,
          }}
          puedeEditar={puedeEditar}
          onRecargar={cargarPersonal}
        />
      )}

      {tab === 'ideas' && (
        <IdeasPanel sugerencias={sugerencias} onIrATab={(t) => setTab(t as TabId)} />
      )}

      {tab === 'movimientos' && (
        <MovimientosPanel
          categorias={categoriasFin}
          movimientos={movPersonal}
          tarjetas={tarjetas}
          sucursales={sucursales}
          puedeEditar={puedeEditar}
          onRecargar={cargarPersonal}
        />
      )}

      {tab === 'tarjetas' && (
        <TarjetasPanel
          tarjetas={tarjetas}
          puedeEditar={puedeEditar}
          onRecargar={cargarPersonal}
        />
      )}

      {tab === 'deudas' && (
        <DeudasPanel
          prestamos={prestamos}
          tarjetas={tarjetas}
          deudas={deudas}
          cxpSistema={cxpPendiente}
          cxcSistema={cxcPendiente}
          puedeEditar={puedeEditar}
          onRecargar={recargarTodo}
        />
      )}

      {tab === 'clinica' && (
      <>
      {/* Ingresos por categoría */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-4">¿Cuánto se ganó por categoría?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {catsIngreso.map(c => (
            <div key={c.key} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border">
              <div className={`w-10 h-10 rounded-lg ${c.color} flex items-center justify-center shrink-0`}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="font-bold text-slate-800">{fmtL(c.val)}</p>
                <p className="text-xs text-slate-400">{pct(c.val)} del total</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-cyan-600" /> Margen real de laboratorio
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Calculado desde órdenes procesadas: ingreso cobrado menos insumos, maquila y comisión configurada.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Órdenes con costo', value: String(margenLab.ordenes), color: 'text-slate-800' },
            { label: 'Ingresos lab', value: fmtL(margenLab.ingresos), color: 'text-cyan-700' },
            { label: 'Costo directo', value: fmtL(margenLab.costoDirecto), color: 'text-orange-700' },
            { label: 'Utilidad lab', value: fmtL(margenLab.utilidad), color: margenLab.utilidad >= 0 ? 'text-emerald-700' : 'text-red-600' },
            { label: 'Margen', value: margenLab.margenPct != null ? `${margenLab.margenPct}%` : '—', color: 'text-indigo-700' },
          ].map(k => (
            <div key={k.label} className="rounded-lg bg-slate-50 border p-3">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        {margenLab.ordenes === 0 && (
          <p className="text-xs text-amber-700 mt-3">
            Aún no hay costos históricos de laboratorio en este período. Se crearán al pasar órdenes a proceso o validar resultados.
          </p>
        )}
      </div>

      {/* Comparativo sucursales */}
      {porSucursal.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <h2 className="font-bold text-slate-800 px-5 py-4 border-b">Comparativo por sucursal</h2>
          <table className="w-full text-sm">
            <thead className="bg-[#003366] text-white">
              <tr>
                <th className="text-left px-4 py-3">Sucursal</th>
                <th className="text-right px-4 py-3">Ingresos</th>
                <th className="text-right px-4 py-3">Gastos</th>
                <th className="text-right px-4 py-3">Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {porSucursal.map(s => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.nombre}</td>
                  <td className="px-4 py-3 text-right text-green-700">{fmtL(s.ingresos_total)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{fmtL(s.egresos_total)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${s.utilidad >= 0 ? 'text-[#003366]' : 'text-red-700'}`}>
                    {fmtL(s.utilidad)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t">
              <tr>
                <td className="px-4 py-3">Total consolidado</td>
                <td className="px-4 py-3 text-right text-green-700">{fmtL(resumen.ingresos_total)}</td>
                <td className="px-4 py-3 text-right text-red-600">{fmtL(resumen.egresos_total)}</td>
                <td className="px-4 py-3 text-right text-[#003366]">{fmtL(resumen.utilidad)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Cuentas pendientes (saldo actual) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-blue-100 p-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500">Cuentas por cobrar pendientes</p>
            <p className="text-lg font-bold text-blue-700">{fmtL(cxcPendiente)}</p>
          </div>
          <p className="text-xs text-slate-400">Saldo actual · no del mes</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-100 p-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500">Cuentas por pagar pendientes</p>
            <p className="text-lg font-bold text-orange-700">{fmtL(cxpPendiente)}</p>
          </div>
          <p className="text-xs text-slate-400">Saldo actual · no del mes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" /> Gastos del mes
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between border-b pb-2">
              <span>Compras a proveedores</span><strong>{fmtL(resumen.egresos_por_tipo.compras)}</strong>
            </li>
            <li className="flex justify-between"><span>Egresos de caja — nómina</span><strong>{fmtL(resumen.egresos_por_tipo.nomina)}</strong></li>
            <li className="flex justify-between"><span>Gastos fijos (luz, arriendo…)</span><strong>{fmtL(resumen.egresos_por_tipo.gastos_fijos)}</strong></li>
            <li className="flex justify-between"><span>Otros egresos de caja</span><strong>{fmtL(resumen.egresos_por_tipo.otros)}</strong></li>
          </ul>
          <p className="text-xs text-slate-400 mt-3">{compras.length} compra(s) registrada(s) en el período.</p>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-3">Producción por tipo de servicio</h2>
          {Object.keys(prodPorCat).length === 0 ? (
            <p className="text-slate-400 text-sm">
              Sin producción registrada. Los datos aparecen al cobrar consultas en Ventas/Caja.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {Object.entries(prodPorCat)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-slate-600">{labelProduccion(k)}</span>
                    <strong>{fmtL(v)}</strong>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 print:hidden">
        Fuente: movimientos de caja + compras. Las comisiones médicas son informativas (planilla) y no afectan la utilidad de caja.
      </p>
      </>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
