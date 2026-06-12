'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PieChart, TrendingUp, TrendingDown, Building2,
  Stethoscope, Pill, FlaskConical, Briefcase, ShoppingCart,
  RefreshCw, Printer, Download, FileSpreadsheet,
} from 'lucide-react'
import { imprimirReporte } from '@/lib/reporte-utils'
import {
  calcularResumen, fmtL, mesLabel, rangoMes,
  labelProduccion, resumenPorSucursal,
  exportarControlFinanciero, exportarMovimientosCaja,
  type DatosExportFinanciero,
} from '@/lib/control-financiero-utils'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost, ModuleBtnPrimary } from '@/components/module-layout'

interface Sucursal { id: number; nombre: string }
interface Movimiento { id: number; tipo: string; concepto: string; monto: number; fecha: string; sucursal_id?: number }
interface Compra { id: number; total: number; fecha: string; sucursal_id?: number; estado?: string }
interface Produccion { categoria_comision: string; monto_neto: number; comision_monto: number; sucursal_id: number; fecha: string }

interface Props {
  sucursales: Sucursal[]
  sucursalDefault: number | null
  esSuperAdmin: boolean
  anioInicial: number
  mesInicial: number
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function ControlFinancieroClient({
  sucursales, sucursalDefault, esSuperAdmin, anioInicial, mesInicial,
}: Props) {
  const supabase = createClient()
  const [pending, startTransition] = useTransition()

  const [anio, setAnio] = useState(anioInicial)
  const [mes, setMes]     = useState(mesInicial)
  const [sucursalId, setSuc] = useState<number | 'todas'>(sucursalDefault ?? 'todas')
  const [movimientos, setMovs] = useState<Movimiento[]>([])
  const [compras, setCompras]   = useState<Compra[]>([])
  const [produccion, setProd]     = useState<Produccion[]>([])
  const [cxcPendiente, setCxc]    = useState(0)
  const [cxpPendiente, setCxp]    = useState(0)

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

      const [{ data: movs }, { data: comps }, prodData, cxcTotal, cxpTotal] = await Promise.all([
        movQ,
        compQ,
        fetchProd(),
        fetchCxc(),
        fetchCxp(),
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
      setCxc(cxcTotal)
      setCxp(cxpTotal)
    })
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
      categorias: categorias.map(c => ({ label: c.label, monto: c.val, pct: pct(c.val) })),
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

  function imprimir() {
    const filasCat = categorias.map(c =>
      `<tr><td>${c.label}</td><td class="right">${fmtL(c.val)}</td><td class="right">${pct(c.val)}</td></tr>`,
    ).join('')
    const filasSuc = porSucursal.map(s =>
      `<tr><td>${s.nombre}</td><td class="right success">${fmtL(s.ingresos_total)}</td><td class="right danger">${fmtL(s.egresos_total)}</td><td class="right bold">${fmtL(s.utilidad)}</td></tr>`,
    ).join('')

    imprimirReporte({
      titulo: 'Control Financiero',
      subtitulo: `${mesLabel(anio, mes)} · ${sucursalLabel}`,
      contenidoHtml: `
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-lbl">Ingresos</div><div class="kpi-val success">${fmtL(resumen.ingresos_total)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Gastos</div><div class="kpi-val danger">${fmtL(resumen.egresos_total)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Utilidad</div><div class="kpi-val">${fmtL(resumen.utilidad)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Comisiones (ref.)</div><div class="kpi-val">${fmtL(totalComisiones)}</div></div>
        </div>
        <h2>Ingresos por categoría</h2>
        <table><thead><tr><th>Categoría</th><th class="right">Monto</th><th class="right">%</th></tr></thead><tbody>${filasCat}</tbody></table>
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
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, sucursalId])

  const comprasTotal = compras.reduce((s, c) => s + Number(c.total || 0), 0)
  const resumen = calcularResumen(movimientos, comprasTotal)

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

  const categorias = [
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
          subtitle="Cuánto se ganó, cuánto se gastó y utilidad del mes — ambas sucursales"
          badge="Dirección financiera"
          icon={PieChart}
          gradient="emerald"
          kpis={[
            { label: 'Ingresos', value: fmtL(resumen.ingresos_total), icon: TrendingUp },
            { label: 'Gastos', value: fmtL(resumen.egresos_total), icon: TrendingDown },
            { label: 'Utilidad neta', value: fmtL(resumen.utilidad), icon: PieChart },
            { label: 'Comisiones (ref.)', value: fmtL(totalComisiones), icon: Stethoscope },
          ]}
          actions={
            <>
              <ModuleBtnGhost onClick={cargarDatos} disabled={pending}>
                <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} /> Actualizar
              </ModuleBtnGhost>
              <ModuleBtnGhost onClick={exportarExcel}>
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </ModuleBtnGhost>
              <ModuleBtnGhost onClick={exportarMovs}>
                <Download className="w-4 h-4" /> CSV
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

      {/* Ingresos por categoría */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-4">¿Cuánto se ganó por categoría?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorias.map(c => (
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
      </ModuleContent>
    </ModuleShell>
  )
}
