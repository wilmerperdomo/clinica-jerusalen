'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign,
  Users, Stethoscope, FlaskConical, CreditCard,
  Printer, RefreshCw, CheckCircle2, Clock,
  Banknote, ArrowRightLeft, Receipt, FileDown,
  Scale, ShoppingCart, LayoutGrid, BadgePercent,
} from 'lucide-react'
import { exportarCSV, fmtReporte, imprimirReporte } from '@/lib/reporte-utils'
import { ModuleShell, ModuleHero, ModuleContent } from '@/components/module-layout'
import ReportesEjecutivo from '@/components/reportes/reportes-ejecutivo'

/* ─── tipos ─────────────────────────────────────────────── */
interface Movimiento {
  tipo: string; concepto: string; forma_pago: string
  monto: number; monto_bruto?: number; descuento_monto?: number
  descuento_motivo?: string; paciente_nombre?: string
  fecha: string; hora?: string; anulado: boolean; sucursal_id?: number
}
interface Sesion {
  id: number; fecha: string; cajero_nombre?: string
  monto_inicial: number; total_ingresos: number; total_egresos: number
  estado: string; hora_apertura: string; hora_cierre?: string
  sucursal_id?: number; sucursal?: { nombre: string }
}
interface Cita {
  id: number; estado: string; tipo_consulta?: string; fecha: string; hora?: string
  paciente?: { nombre: string; apellido1: string }
}
interface LabOrden {
  id: number; estado?: string; pagado?: boolean; entregado?: boolean
  fecha_orden?: string
  paciente?: { nombre: string; apellido1: string }
  analisis?: { nombre: string; costo: number }
}
interface CXC {
  id: number; paciente_nombre?: string; concepto?: string
  monto_total: number; monto_pagado: number; saldo: number
  estado: string; fecha: string
}
interface Paciente {
  id: number; nombre: string; apellido1: string
  fecha_nacimiento?: string; sexo?: string; created_at: string
}
interface Sucursal { id: number; nombre: string }

interface InvMov {
  producto_id: number; cantidad: number; tipo: string; fecha: string
  sucursal_id?: number
  producto?: { id: number; nombre: string; codigo: string; categoria?: string; unidad?: string; precio_venta: number; costo: number }
}
interface Factura {
  id: number; numero: string; fecha: string; hora?: string
  cliente_nombre?: string; cliente_rtn?: string
  subtotal: number; descuento_monto?: number; isv_monto: number; total: number
  estado: string; motivo_anulacion?: string; cai?: string; cajero_nombre?: string
  sucursal_id?: number; exento_isv?: boolean
}
interface Compra {
  id: number; numero?: string; proveedor_nombre?: string
  fecha: string; hora?: string; contado?: number; credito?: number
  total: number; estado?: string; tipo_costo?: string; cajero_nombre?: string; sucursal_id?: number
}
interface CxpItem {
  id: number; compra_id?: number; proveedor_nombre?: string
  fecha: string; fecha_vencimiento?: string
  monto_total: number; monto_pagado: number; saldo: number
  estado: string; numero_compra?: string; sucursal_id?: number
}
interface CxpAbono {
  id: number; cxp_id: number; proveedor_nombre?: string
  monto: number; forma_pago?: string; nota?: string
  cajero_nombre?: string; fecha: string; hora?: string; sucursal_id?: number
}

type TabId = 'resumen' | 'caja' | 'consultas' | 'lab' | 'cxc' | 'fiscal' | 'cxp' | 'compras' | 'inventario' | 'pacientes' | 'descuentos'

interface Props {
  movimientos:      Movimiento[]
  sesiones:         Sesion[]
  citas:            Cita[]
  labOrdenes:       LabOrden[]
  cxc:              CXC[]
  nuevosPacientes:  Paciente[]
  sucursales:       Sucursal[]
  invMovimientos:   InvMov[]
  facturas:         Factura[]
  compras:          Compra[]
  cxpLista:         CxpItem[]
  cxpAbonos:        CxpAbono[]
  desde:            string
  hasta:            string
  sucursalFiltro:   string
  tabInicial:       string
}

const fmt = fmtReporte

function BtnExport({ headers, rows, nombre }: { headers: string[]; rows: (string|number)[][]; nombre: string }) {
  return (
    <button onClick={() => exportarCSV(nombre, headers, rows)}
      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
      <FileDown className="w-3.5 h-3.5" /> CSV
    </button>
  )
}

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'resumen',    label: 'Resumen',      icon: LayoutGrid    },
  { id: 'caja',       label: 'Caja',         icon: DollarSign    },
  { id: 'fiscal',     label: 'Fiscal',       icon: Scale         },
  { id: 'consultas',  label: 'Consultas',    icon: Stethoscope   },
  { id: 'lab',        label: 'Laboratorio',  icon: FlaskConical  },
  { id: 'cxc',        label: 'CXC',          icon: CreditCard    },
  { id: 'cxp',        label: 'CXP',          icon: Receipt       },
  { id: 'compras',    label: 'Compras',      icon: ShoppingCart  },
  { id: 'inventario', label: 'Inventario',   icon: TrendingUp    },
  { id: 'pacientes',  label: 'Pacientes',    icon: Users         },
  { id: 'descuentos', label: 'Desc. edad',   icon: BadgePercent  },
]

const FORMAS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  EFECTIVO:      { label: 'Efectivo',     icon: Banknote,         color: 'text-green-600' },
  TARJETA:       { label: 'Tarjeta',      icon: CreditCard,       color: 'text-blue-600'  },
  TRANSFERENCIA: { label: 'Transferencia',icon: ArrowRightLeft,   color: 'text-purple-600'},
  CREDITO:       { label: 'Crédito',      icon: Clock,            color: 'text-amber-600' },
}

/* ═══════════════════════════════════════════════════════ */
export default function ReportesClient({
  movimientos, sesiones, citas, labOrdenes, cxc,
  nuevosPacientes, sucursales, invMovimientos,
  facturas, compras, cxpLista, cxpAbonos,
  desde, hasta, sucursalFiltro, tabInicial,
}: Props) {
  const router = useRouter()
  const tabValido = TABS.some(t => t.id === tabInicial) ? tabInicial as TabId : 'resumen'
  const [tabActivo, setTabActivo] = useState<TabId>(tabValido)

  const rangoStr = desde === hasta ? desde : `${desde} al ${hasta}`
  const sucStr   = sucursales.find(s => String(s.id) === sucursalFiltro)?.nombre || 'Todas las sucursales'
  const subtitulo = `Período: ${rangoStr} · ${sucStr}`

  /* ── filtros de fecha ─ */
  function aplicarFiltro(d: string, h: string, suc: string) {
    const params = new URLSearchParams({ desde: d, hasta: h, tab: tabActivo })
    if (suc) params.set('sucursal', suc)
    router.push(`/reportes?${params.toString()}`)
  }

  function cambiarTab(tab: TabId) {
    setTabActivo(tab)
    const params = new URLSearchParams({ desde, hasta, tab })
    if (sucursalFiltro) params.set('sucursal', sucursalFiltro)
    router.replace(`/reportes?${params.toString()}`, { scroll: false })
  }

  /* ── cálculos caja ─ */
  const ingresos  = movimientos.filter(m => m.tipo === 'INGRESO')
  const egresos   = movimientos.filter(m => m.tipo === 'EGRESO')
  const totalIng  = ingresos.reduce((s, m) => s + m.monto, 0)
  const totalEgr  = egresos.reduce((s, m) => s + m.monto, 0)
  const totalDesc = movimientos.reduce((s, m) => s + (m.descuento_monto || 0), 0)
  const neto      = totalIng - totalEgr

  /* ingresos por forma de pago */
  const porForma = Object.keys(FORMAS).map(fp => ({
    forma: fp,
    label: FORMAS[fp].label,
    total: ingresos.filter(m => m.forma_pago === fp).reduce((s, m) => s + m.monto, 0),
  }))
  const cxcSaldoTotal = cxc.reduce((s, c) => s + c.saldo, 0)

  /* ingresos por concepto (top 10) */
  const porConcepto = Object.entries(
    ingresos.reduce((acc, m) => {
      acc[m.concepto] = (acc[m.concepto] || 0) + m.monto
      return acc
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 10)

  /* ── descuentos 3ra/4ta edad (de caja_movimientos) ─ */
  const movsDescEdad = movimientos.filter(m =>
    (m.descuento_monto || 0) > 0 && /edad/i.test(m.descuento_motivo || ''))
  const clasifEdad = (motivo?: string): '3ra' | '4ta' | null => {
    const t = (motivo || '').toLowerCase()
    if (/4ta|cuarta/.test(t)) return '4ta'
    if (/3ra|tercera/.test(t)) return '3ra'
    return null
  }
  const descEdadTercera = movsDescEdad.filter(m => clasifEdad(m.descuento_motivo) === '3ra')
  const descEdadCuarta  = movsDescEdad.filter(m => clasifEdad(m.descuento_motivo) === '4ta')
  const sumDesc = (arr: Movimiento[]) => arr.reduce((s, m) => s + (m.descuento_monto || 0), 0)
  const descEdadTotal     = sumDesc(movsDescEdad)
  const descEdadTotal3ra  = sumDesc(descEdadTercera)
  const descEdadTotal4ta  = sumDesc(descEdadCuarta)
  /* agrupado por mes (YYYY-MM) para el reporte mensual */
  const descEdadPorMes = Object.entries(
    movsDescEdad.reduce((acc, m) => {
      const mes = (m.fecha || '').slice(0, 7)
      if (!mes) return acc
      if (!acc[mes]) acc[mes] = { mes, total: 0, t3: 0, t4: 0, cuenta: 0 }
      acc[mes].total += m.descuento_monto || 0
      if (clasifEdad(m.descuento_motivo) === '4ta') acc[mes].t4 += m.descuento_monto || 0
      else acc[mes].t3 += m.descuento_monto || 0
      acc[mes].cuenta += 1
      return acc
    }, {} as Record<string, { mes: string; total: number; t3: number; t4: number; cuenta: number }>)
  ).sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v)
  const fmtMes = (mes: string) => {
    const [y, mm] = mes.split('-')
    const d = new Date(Number(y), Number(mm) - 1, 1)
    return Number.isNaN(d.getTime()) ? mes : d.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })
  }

  /* ── cálculos consultas ─ */
  const citasAtendidas = citas.filter(c => c.estado === 'ASISTIO' || c.estado === 'ASISTIÓ').length
  const citasNoAsistio = citas.filter(c => c.estado === 'NO ASISTIÓ' || c.estado === 'NO ASISTIO').length

  /* ── cálculos lab ─ */
  const labTotal     = labOrdenes.length
  const labPendiente = labOrdenes.filter(l => !l.entregado).length
  const labIngresos  = labOrdenes.reduce((s, l) => s + (l.analisis?.costo || 0), 0)

  /* ── cálculos fiscal ─ */
  const factEmitidas  = facturas.filter(f => f.estado === 'EMITIDA' || f.estado === 'ACTIVA')
  const factAnuladas  = facturas.filter(f => f.estado === 'ANULADA')
  const fiscalSubtotal = factEmitidas.reduce((s, f) => s + f.subtotal, 0)
  const fiscalISV      = factEmitidas.reduce((s, f) => s + (f.isv_monto || 0), 0)
  const fiscalDesc     = factEmitidas.reduce((s, f) => s + (f.descuento_monto || 0), 0)
  const fiscalTotal    = factEmitidas.reduce((s, f) => s + f.total, 0)
  const fiscalExentas  = factEmitidas.filter(f => f.exento_isv).length

  /* ── cálculos CXP ─ */
  const cxpPendientes  = cxpLista.filter(c => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL')
  const cxpSaldoTotal  = cxpPendientes.reduce((s, c) => s + c.saldo, 0)
  const cxpAbonadoPer  = cxpAbonos.reduce((s, a) => s + a.monto, 0)
  /* ── cálculos compras ─ */
  const comprasTotal   = compras.reduce((s, c) => s + c.total, 0)
  const comprasContado = compras.reduce((s, c) => s + (c.contado || 0), 0)
  const comprasCredito = compras.reduce((s, c) => s + (c.credito || 0), 0)

  /* ── imprimir / exportar ─ */
  function imprimir(titulo: string, contenidoRef: React.RefObject<HTMLDivElement | null>) {
    const contenido = contenidoRef.current
    if (!contenido) return
    imprimirReporte({ titulo, subtitulo, contenidoHtml: contenido.innerHTML })
  }

  /* refs para impresión por sección */
  const refCaja       = useRef<HTMLDivElement>(null)
  const refConsultas  = useRef<HTMLDivElement>(null)
  const refLab        = useRef<HTMLDivElement>(null)
  const refCxc        = useRef<HTMLDivElement>(null)
  const refFiscal     = useRef<HTMLDivElement>(null)
  const refCxp        = useRef<HTMLDivElement>(null)
  const refCompras    = useRef<HTMLDivElement>(null)
  const refMedMovidos = useRef<HTMLDivElement>(null)

  /* ── ranking medicamentos más movidos ─ */
  const rankingMeds = (() => {
    const mapa = new Map<number, {
      nombre: string; codigo: string; categoria: string; unidad: string
      totalUnidades: number; totalCosto: number; totalVenta: number; movimientos: number
    }>()
    for (const m of invMovimientos) {
      if (!m.producto) continue
      const cantAbs = Math.abs(m.cantidad)
      if (!mapa.has(m.producto_id)) {
        mapa.set(m.producto_id, {
          nombre:       m.producto.nombre,
          codigo:       m.producto.codigo,
          categoria:    m.producto.categoria || '—',
          unidad:       m.producto.unidad    || 'unidad',
          totalUnidades: 0, totalCosto: 0, totalVenta: 0, movimientos: 0,
        })
      }
      const entry = mapa.get(m.producto_id)!
      entry.totalUnidades += cantAbs
      entry.totalCosto    += cantAbs * (m.producto.costo        || 0)
      entry.totalVenta    += cantAbs * (m.producto.precio_venta || 0)
      entry.movimientos   += 1
    }
    return Array.from(mapa.values()).sort((a, b) => b.totalUnidades - a.totalUnidades)
  })()

  /* ═══════════════ JSX ═══════════════════════════════════ */
  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Reportes Pro"
        subtitle="Panel ejecutivo con gráficas y análisis del período"
        badge="Panel ejecutivo"
        icon={BarChart3}
      />
      <ModuleContent>

      {/* ── barra de filtros ─ */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" defaultValue={desde} id="f-desde"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" defaultValue={hasta} id="f-hasta"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Sucursal</label>
            <select defaultValue={sucursalFiltro} id="f-suc"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">Todas</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <button onClick={() => {
            const d = (document.getElementById('f-desde') as HTMLInputElement).value
            const h = (document.getElementById('f-hasta') as HTMLInputElement).value
            const s = (document.getElementById('f-suc')  as HTMLSelectElement).value
            aplicarFiltro(d, h, s)
          }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> Generar
          </button>
          {/* accesos rápidos */}
          {[
            { label: 'Hoy', fn: () => { const h = new Date().toISOString().split('T')[0]; aplicarFiltro(h, h, sucursalFiltro) } },
            { label: 'Esta semana', fn: () => {
              const hoy  = new Date()
              const lun  = new Date(hoy); lun.setDate(hoy.getDate() - hoy.getDay() + 1)
              aplicarFiltro(lun.toISOString().split('T')[0], hoy.toISOString().split('T')[0], sucursalFiltro)
            }},
            { label: 'Este mes', fn: () => {
              const hoy = new Date()
              const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
              aplicarFiltro(ini, hoy.toISOString().split('T')[0], sucursalFiltro)
            }},
          ].map(r => (
            <button key={r.label} onClick={r.fn}
              className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Mostrando: <strong>{desde === hasta ? desde : `${desde} → ${hasta}`}</strong>
          {sucursalFiltro && ` · ${sucursales.find(s => String(s.id) === sucursalFiltro)?.nombre}`}
        </p>
      </div>

      {/* ── tarjetas KPI ─ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp,   label: 'Total Ingresos',  value: fmt(totalIng), color: 'text-green-600', bg: 'bg-green-50' },
          { icon: TrendingDown, label: 'Total Egresos',   value: fmt(totalEgr), color: 'text-red-600',   bg: 'bg-red-50'   },
          { icon: DollarSign,   label: 'Neto del Período',value: fmt(neto),     color: neto>=0?'text-blue-700':'text-red-700', bg: 'bg-blue-50' },
          { icon: Receipt,      label: 'Descuentos dados',value: fmt(totalDesc),color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(c => (
          <div key={c.label} className="bg-white border rounded-xl p-4">
            <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── pestañas ─ */}
      <div className="bg-white border rounded-2xl p-2 flex flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => cambiarTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              tabActivo === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ══════════ RESUMEN EJECUTIVO ══════════ */}
      {tabActivo === 'resumen' && (
        <div className="space-y-5">
          <ReportesEjecutivo
            movimientos={movimientos}
            desde={desde}
            hasta={hasta}
            periodo={subtitulo}
            totalIng={totalIng}
            totalEgr={totalEgr}
            neto={neto}
            totalDesc={totalDesc}
            porForma={porForma}
            porConcepto={porConcepto}
            citasTotal={citas.length}
            citasAtendidas={citasAtendidas}
            citasNoAsistio={citasNoAsistio}
            labTotal={labTotal}
            labPendiente={labPendiente}
            cxcSaldo={cxcSaldoTotal}
            cxpSaldo={cxpSaldoTotal}
            factEmitidas={factEmitidas.length}
            factAnuladas={factAnuladas.length}
            fiscalSubtotal={fiscalSubtotal}
            fiscalISV={fiscalISV}
            fiscalTotal={fiscalTotal}
            nuevosPacientes={nuevosPacientes.length}
            comprasTotal={comprasTotal}
          />

          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Acceso rápido a reportes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { tab: 'caja' as TabId,       icon: DollarSign,    title: 'Caja',         desc: `${movimientos.length} movimientos · Neto ${fmt(neto)}` },
                { tab: 'fiscal' as TabId,     icon: Scale,         title: 'Fiscal',       desc: `${factEmitidas.length} facturas · ISV ${fmt(fiscalISV)}` },
                { tab: 'consultas' as TabId,  icon: Stethoscope,   title: 'Consultas',    desc: `${citas.length} citas · ${citasAtendidas} atendidas` },
                { tab: 'lab' as TabId,        icon: FlaskConical,  title: 'Laboratorio',  desc: `${labTotal} órdenes · ${labPendiente} pendientes` },
                { tab: 'cxc' as TabId,        icon: CreditCard,    title: 'CXC',          desc: `${cxc.length} pendientes · Saldo ${fmt(cxcSaldoTotal)}` },
                { tab: 'cxp' as TabId,        icon: Receipt,       title: 'CXP',          desc: `${cxpPendientes.length} pendientes · Saldo ${fmt(cxpSaldoTotal)}` },
                { tab: 'compras' as TabId,   icon: ShoppingCart,  title: 'Compras',      desc: `${compras.length} compras · Total ${fmt(comprasTotal)}` },
                { tab: 'inventario' as TabId, icon: TrendingUp,   title: 'Inventario',   desc: `${rankingMeds.length} productos movidos` },
                { tab: 'pacientes' as TabId,  icon: Users,         title: 'Pacientes',    desc: `${nuevosPacientes.length} nuevos registros` },
              ].map(card => (
                <button key={card.tab} onClick={() => cambiarTab(card.tab)}
                  className="bg-white border rounded-2xl p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100">
                      <card.icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="font-bold text-gray-800">{card.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500">{card.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {(tabActivo === 'caja' || tabActivo === 'consultas' || tabActivo === 'lab' || tabActivo === 'cxc') && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ══════════ REPORTE CAJA ══════════ */}
        {tabActivo === 'caja' && <div className="bg-white border rounded-2xl overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" /> Cierre de Caja
            </h2>
            <div className="flex gap-2">
              <BtnExport nombre="caja" headers={['Fecha','Tipo','Concepto','Paciente','Forma pago','Monto']}
                rows={movimientos.map(m => [m.fecha, m.tipo, m.concepto, m.paciente_nombre||'', m.forma_pago, m.tipo==='EGRESO'?-m.monto:m.monto])} />
              <button onClick={() => imprimir('Cierre de Caja', refCaja)}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4" ref={refCaja}>
            {/* por forma de pago */}
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Por forma de pago</h3>
            <div className="grid grid-cols-2 gap-2">
              {porForma.map(fp => {
                const info = FORMAS[fp.forma]
                if (!info) return null
                return (
                  <div key={fp.forma} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border">
                    <info.icon className={`w-5 h-5 ${info.color}`} />
                    <div>
                      <p className="text-xs text-gray-500">{info.label}</p>
                      <p className="font-bold text-gray-800">{fmt(fp.total)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* sesiones */}
            {sesiones.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mt-2">Sesiones de caja</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-1.5 text-gray-500">Cajero</th>
                    <th className="text-left py-1.5 text-gray-500">Fecha</th>
                    <th className="text-right py-1.5 text-gray-500">Ingresos</th>
                    <th className="text-right py-1.5 text-gray-500">Egresos</th>
                    <th className="text-center py-1.5 text-gray-500">Estado</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {sesiones.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="py-1.5 text-gray-700">{s.cajero_nombre}</td>
                        <td className="py-1.5 text-gray-500">{s.fecha}</td>
                        <td className="py-1.5 text-right text-green-700 font-medium">{fmt(s.total_ingresos)}</td>
                        <td className="py-1.5 text-right text-red-600">{fmt(s.total_egresos)}</td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                            s.estado === 'ABIERTA' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>{s.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* top conceptos */}
            {porConcepto.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mt-2">Ingresos por concepto</h3>
                <div className="space-y-1.5">
                  {porConcepto.map(([concepto, total]) => {
                    const pct = totalIng > 0 ? (total / totalIng) * 100 : 0
                    return (
                      <div key={concepto}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600 truncate pr-2">{concepto}</span>
                          <span className="font-medium text-gray-800 shrink-0">{fmt(total)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {movimientos.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos en el período</div>
            )}

            {/* tabla completa para impresión */}
            <div style={{ display: 'none' }} className="print-only">
              <h2>Detalle de movimientos</h2>
              <table>
                <thead><tr>
                  <th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Paciente</th>
                  <th>Forma pago</th><th className="right">Monto</th>
                </tr></thead>
                <tbody>
                  {movimientos.map((m, i) => (
                    <tr key={i}>
                      <td>{m.fecha}</td>
                      <td>{m.tipo}</td>
                      <td>{m.concepto}</td>
                      <td>{m.paciente_nombre || '—'}</td>
                      <td>{m.forma_pago}</td>
                      <td className="right">{m.tipo === 'EGRESO' ? '-' : ''}L. {Number(m.monto).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={5} className="bold">TOTAL INGRESOS</td>
                    <td className="right bold">L. {totalIng.toFixed(2)}</td>
                  </tr>
                  <tr className="total-row">
                    <td colSpan={5} className="bold">TOTAL EGRESOS</td>
                    <td className="right bold">L. {totalEgr.toFixed(2)}</td>
                  </tr>
                  <tr className="total-row">
                    <td colSpan={5} className="bold">NETO</td>
                    <td className="right bold">L. {neto.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>}

        {/* ══════════ REPORTE CONSULTAS ══════════ */}
        {tabActivo === 'consultas' && <div className="bg-white border rounded-2xl overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-blue-600" /> Consultas Médicas
            </h2>
            <div className="flex gap-2">
              <BtnExport nombre="consultas" headers={['Fecha','Hora','Paciente','Tipo','Estado']}
                rows={citas.map(c => [c.fecha, c.hora||'', c.paciente?`${c.paciente.nombre} ${c.paciente.apellido1}`:'', c.tipo_consulta||'General', c.estado])} />
              <button onClick={() => imprimir('Reporte de Consultas', refConsultas)}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4" ref={refConsultas}>
            {/* KPIs consultas */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total citas',       value: citas.length,     color: 'text-blue-700',  bg: 'bg-blue-50' },
                { label: 'Atendidas',         value: citasAtendidas,   color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'No asistieron',     value: citasNoAsistio,   color: 'text-red-600',   bg: 'bg-red-50'  },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* por tipo de consulta */}
            {citas.length > 0 && (() => {
              const tipos = Object.entries(
                citas.reduce((acc, c) => {
                  const t = c.tipo_consulta || 'General'
                  acc[t] = (acc[t] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).sort((a, b) => b[1] - a[1])
              return (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase">Por tipo de consulta</h3>
                  <div className="space-y-1.5">
                    {tipos.map(([tipo, cnt]) => (
                      <div key={tipo} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{tipo}</span>
                        <span className="font-bold text-gray-800">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}

            {/* lista citas para impresión */}
            <div style={{ display: 'none' }}>
              <h2>Detalle de consultas</h2>
              <table>
                <thead><tr>
                  <th>Fecha</th><th>Hora</th><th>Paciente</th><th>Tipo</th><th>Estado</th>
                </tr></thead>
                <tbody>
                  {citas.map(c => (
                    <tr key={c.id}>
                      <td>{c.fecha}</td><td>{c.hora || '—'}</td>
                      <td>{c.paciente ? `${c.paciente.nombre} ${c.paciente.apellido1}` : '—'}</td>
                      <td>{c.tipo_consulta || 'General'}</td><td>{c.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {citas.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">Sin consultas en el período</div>
            )}
          </div>
        </div>}

        {/* ══════════ REPORTE LABORATORIO ══════════ */}
        {tabActivo === 'lab' && <div className="bg-white border rounded-2xl overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-600" /> Laboratorio
            </h2>
            <div className="flex gap-2">
              <BtnExport nombre="laboratorio" headers={['#','Paciente','Análisis','Costo','Pagado','Entregado']}
                rows={labOrdenes.map(l => [l.id, l.paciente?`${l.paciente.nombre} ${l.paciente.apellido1}`:'', l.analisis?.nombre||'', l.analisis?.costo||0, l.pagado?'Sí':'No', l.entregado?'Sí':'No'])} />
              <button onClick={() => imprimir('Reporte de Laboratorio', refLab)}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4" ref={refLab}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Órdenes totales',   value: labTotal,      color: 'text-purple-700', bg: 'bg-purple-50' },
                { label: 'Pendientes entrega',value: labPendiente,  color: 'text-amber-700',  bg: 'bg-amber-50'  },
                { label: 'Ingresos estimados',value: fmt(labIngresos), color: 'text-green-700', bg: 'bg-green-50' },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* top pruebas */}
            {labOrdenes.length > 0 && (() => {
              const pruebas = Object.entries(
                labOrdenes.reduce((acc, l) => {
                  const n = l.analisis?.nombre || 'Desconocida'
                  acc[n] = (acc[n] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).sort((a, b) => b[1] - a[1]).slice(0, 8)
              return (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase">Pruebas más solicitadas</h3>
                  <div className="space-y-1.5">
                    {pruebas.map(([nombre, cnt]) => (
                      <div key={nombre} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate pr-2">{nombre}</span>
                        <span className="font-bold text-gray-800">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}

            {/* tabla para impresión */}
            <div style={{ display: 'none' }}>
              <h2>Detalle de órdenes de laboratorio</h2>
              <table>
                <thead><tr>
                  <th>#</th><th>Paciente</th><th>Análisis</th><th>Costo</th><th>Pagado</th><th>Entregado</th>
                </tr></thead>
                <tbody>
                  {labOrdenes.map(l => (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td>{l.paciente ? `${l.paciente.nombre} ${l.paciente.apellido1}` : '—'}</td>
                      <td>{l.analisis?.nombre || '—'}</td>
                      <td className="right">L. {Number(l.analisis?.costo||0).toFixed(2)}</td>
                      <td>{l.pagado ? 'Sí' : 'No'}</td>
                      <td>{l.entregado ? 'Sí' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {labOrdenes.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">Sin órdenes de laboratorio en el período</div>
            )}
          </div>
        </div>}

        {/* ══════════ REPORTE CXC ══════════ */}
        {tabActivo === 'cxc' && <div className="bg-white border rounded-2xl overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-600" /> Cuentas por Cobrar (CXC)
            </h2>
            <div className="flex gap-2">
              <BtnExport nombre="cxc" headers={['Paciente','Concepto','Total','Pagado','Saldo','Estado','Fecha']}
                rows={cxc.map(c => [c.paciente_nombre||'', c.concepto||'', c.monto_total, c.monto_pagado, c.saldo, c.estado, c.fecha])} />
              <button onClick={() => imprimir('Cuentas por Cobrar', refCxc)}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4" ref={refCxc}>
            {/* KPIs CXC */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'CXC pendientes',  value: cxc.filter(c=>c.estado==='PENDIENTE').length,  color: 'text-red-700',   bg: 'bg-red-50'   },
                { label: 'CXC parciales',   value: cxc.filter(c=>c.estado==='PARCIAL').length,    color: 'text-amber-700', bg: 'bg-amber-50' },
                { label: 'Saldo total',     value: fmt(cxc.reduce((s,c)=>s+c.saldo,0)),           color: 'text-red-700',   bg: 'bg-red-50'   },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* lista CXC */}
            {cxc.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-1.5 text-gray-500 font-semibold">Paciente</th>
                    <th className="text-left py-1.5 text-gray-500 font-semibold">Concepto</th>
                    <th className="text-right py-1.5 text-gray-500 font-semibold">Total</th>
                    <th className="text-right py-1.5 text-gray-500 font-semibold">Pagado</th>
                    <th className="text-right py-1.5 text-gray-500 font-semibold">Saldo</th>
                    <th className="text-center py-1.5 text-gray-500 font-semibold">Estado</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {cxc.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="py-1.5 text-gray-700">{c.paciente_nombre || '—'}</td>
                        <td className="py-1.5 text-gray-500 truncate max-w-[120px]">{c.concepto || '—'}</td>
                        <td className="py-1.5 text-right text-gray-700">L. {Number(c.monto_total).toFixed(2)}</td>
                        <td className="py-1.5 text-right text-green-700">L. {Number(c.monto_pagado).toFixed(2)}</td>
                        <td className="py-1.5 text-right font-bold text-red-700">L. {Number(c.saldo).toFixed(2)}</td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                            c.estado==='PENDIENTE'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'
                          }`}>{c.estado}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold text-xs">
                      <td colSpan={4} className="py-2 text-right text-gray-600">SALDO TOTAL PENDIENTE:</td>
                      <td className="py-2 text-right text-red-700">{fmt(cxc.reduce((s,c)=>s+c.saldo,0))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
                Sin cuentas por cobrar pendientes
              </div>
            )}
          </div>
        </div>}

      </div>
      )}

      {/* ══════════ REPORTE FISCAL ══════════ */}
      {tabActivo === 'fiscal' && (
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" /> Reporte Fiscal — Facturas
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Facturas emitidas, anuladas e ISV del período</p>
          </div>
          <div className="flex gap-2">
            <BtnExport nombre="facturas_fiscal" headers={['Número','Fecha','Cliente','RTN','Subtotal','Descuento','ISV','Total','Estado','CAI']}
              rows={facturas.map(f => [f.numero, f.fecha, f.cliente_nombre||'', f.cliente_rtn||'', f.subtotal, f.descuento_monto||0, f.isv_monto, f.total, f.estado, f.cai||''])} />
            <button onClick={() => imprimir('Reporte Fiscal', refFiscal)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4" ref={refFiscal}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Emitidas',     value: factEmitidas.length,              color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'Anuladas',     value: factAnuladas.length,              color: 'text-red-600',   bg: 'bg-red-50'   },
              { label: 'Subtotal',     value: fmt(fiscalSubtotal),              color: 'text-gray-800',  bg: 'bg-gray-50'  },
              { label: 'ISV (15%)',    value: fmt(fiscalISV),                   color: 'text-indigo-700',bg: 'bg-indigo-50'},
              { label: 'Total ventas', value: fmt(fiscalTotal),                 color: 'text-blue-700',  bg: 'bg-blue-50'  },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
          {fiscalDesc > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              Descuentos aplicados en facturas: <strong>{fmt(fiscalDesc)}</strong>
              {fiscalExentas > 0 && ` · ${fiscalExentas} factura(s) exentas de ISV`}
            </p>
          )}
          {facturas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left text-gray-500">Número</th>
                  <th className="px-3 py-2 text-left text-gray-500">Fecha</th>
                  <th className="px-3 py-2 text-left text-gray-500">Cliente</th>
                  <th className="px-3 py-2 text-left text-gray-500">RTN</th>
                  <th className="px-3 py-2 text-right text-gray-500">Subtotal</th>
                  <th className="px-3 py-2 text-right text-gray-500">ISV</th>
                  <th className="px-3 py-2 text-right text-gray-500">Total</th>
                  <th className="px-3 py-2 text-center text-gray-500">Estado</th>
                </tr></thead>
                <tbody className="divide-y">
                  {facturas.map(f => (
                    <tr key={f.id} className={`hover:bg-gray-50 ${f.estado==='ANULADA'?'opacity-60':''}`}>
                      <td className="px-3 py-2 font-mono">{f.numero}</td>
                      <td className="px-3 py-2 text-gray-500">{f.fecha}</td>
                      <td className="px-3 py-2">{f.cliente_nombre || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">{f.cliente_rtn || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmt(f.subtotal)}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmt(f.isv_monto)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmt(f.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                          f.estado==='ANULADA'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'
                        }`}>{f.estado}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-blue-50">
                    <td colSpan={4} className="px-3 py-2 text-right text-gray-600">TOTALES EMITIDAS:</td>
                    <td className="px-3 py-2 text-right">{fmt(fiscalSubtotal)}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{fmt(fiscalISV)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(fiscalTotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">Sin facturas en el período seleccionado</div>
          )}
        </div>
      </div>
      )}

      {/* ══════════ REPORTE CXP ══════════ */}
      {tabActivo === 'cxp' && (
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-600" /> Cuentas por Pagar (CXP)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Deudas a proveedores y abonos del período</p>
          </div>
          <div className="flex gap-2">
            <BtnExport nombre="cxp" headers={['Proveedor','Fecha','Vencimiento','Total','Pagado','Saldo','Estado']}
              rows={cxpLista.map(c => [c.proveedor_nombre||'', c.fecha, c.fecha_vencimiento||'', c.monto_total, c.monto_pagado, c.saldo, c.estado])} />
            <button onClick={() => imprimir('Cuentas por Pagar', refCxp)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4" ref={refCxp}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'CXP generadas',    value: cxpLista.length,        color: 'text-gray-800',  bg: 'bg-gray-50'  },
              { label: 'Pendientes',       value: cxpPendientes.length,   color: 'text-red-700',   bg: 'bg-red-50'   },
              { label: 'Saldo pendiente',  value: fmt(cxpSaldoTotal),     color: 'text-red-700',   bg: 'bg-red-50'   },
              { label: 'Abonado período',  value: fmt(cxpAbonadoPer),     color: 'text-green-700', bg: 'bg-green-50' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
          {cxpLista.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left text-gray-500">Proveedor</th>
                  <th className="px-3 py-2 text-left text-gray-500">Compra</th>
                  <th className="px-3 py-2 text-left text-gray-500">Fecha</th>
                  <th className="px-3 py-2 text-right text-gray-500">Total</th>
                  <th className="px-3 py-2 text-right text-gray-500">Pagado</th>
                  <th className="px-3 py-2 text-right text-gray-500">Saldo</th>
                  <th className="px-3 py-2 text-center text-gray-500">Estado</th>
                </tr></thead>
                <tbody className="divide-y">
                  {cxpLista.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{c.proveedor_nombre || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">{c.numero_compra || c.compra_id || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{c.fecha}</td>
                      <td className="px-3 py-2 text-right">{fmt(c.monto_total)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(c.monto_pagado)}</td>
                      <td className="px-3 py-2 text-right font-bold text-red-700">{fmt(c.saldo)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                          c.estado==='PAGADA'?'bg-green-100 text-green-700':
                          c.estado==='PARCIAL'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'
                        }`}>{c.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">Sin cuentas por pagar en el período</div>
          )}
          {cxpAbonos.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Abonos realizados en el período</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="px-3 py-1.5 text-left text-gray-500">Fecha</th>
                    <th className="px-3 py-1.5 text-left text-gray-500">Proveedor</th>
                    <th className="px-3 py-1.5 text-right text-gray-500">Monto</th>
                    <th className="px-3 py-1.5 text-left text-gray-500">Forma pago</th>
                    <th className="px-3 py-1.5 text-left text-gray-500">Cajero</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {cxpAbonos.map(a => (
                      <tr key={a.id}>
                        <td className="px-3 py-1.5">{a.fecha}</td>
                        <td className="px-3 py-1.5">{a.proveedor_nombre || '—'}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-green-700">{fmt(a.monto)}</td>
                        <td className="px-3 py-1.5">{a.forma_pago || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{a.cajero_nombre || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* ══════════ REPORTE COMPRAS ══════════ */}
      {tabActivo === 'compras' && (
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-teal-600" /> Compras a Proveedores
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Compras registradas en el período</p>
          </div>
          <div className="flex gap-2">
            <BtnExport nombre="compras" headers={['Número','Proveedor','Fecha','Contado','Crédito','Total','Estado']}
              rows={compras.map(c => [c.numero||c.id, c.proveedor_nombre||'', c.fecha, c.contado||0, c.credito||0, c.total, c.estado||''])} />
            <button onClick={() => imprimir('Reporte de Compras', refCompras)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4" ref={refCompras}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Compras',        value: compras.length,       color: 'text-gray-800',  bg: 'bg-gray-50'  },
              { label: 'Total comprado', value: fmt(comprasTotal),    color: 'text-teal-700',  bg: 'bg-teal-50'  },
              { label: 'Al contado',     value: fmt(comprasContado),  color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'A crédito',      value: fmt(comprasCredito),  color: 'text-amber-700', bg: 'bg-amber-50' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
          {compras.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-gray-500">Proveedor</th>
                  <th className="px-3 py-2 text-left text-gray-500">Fecha</th>
                  <th className="px-3 py-2 text-right text-gray-500">Contado</th>
                  <th className="px-3 py-2 text-right text-gray-500">Crédito</th>
                  <th className="px-3 py-2 text-right text-gray-500">Total</th>
                  <th className="px-3 py-2 text-center text-gray-500">Estado</th>
                </tr></thead>
                <tbody className="divide-y">
                  {compras.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono">{c.numero || c.id}</td>
                      <td className="px-3 py-2">{c.proveedor_nombre || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{c.fecha}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(c.contado || 0)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(c.credito || 0)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmt(c.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{c.estado || '—'}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-teal-50">
                    <td colSpan={3} className="px-3 py-2 text-right text-gray-600">TOTALES:</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(comprasContado)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{fmt(comprasCredito)}</td>
                    <td className="px-3 py-2 text-right text-teal-700">{fmt(comprasTotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">Sin compras en el período seleccionado</div>
          )}
        </div>
      </div>
      )}

      {/* ══════════ REPORTE MEDICAMENTOS MÁS MOVIDOS ══════════ */}
      {tabActivo === 'inventario' && <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" /> Medicamentos y Productos Más Movidos
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Salidas, ventas y consumos del período — ordenados por unidades</p>
          </div>
          <div className="flex gap-2">
            <BtnExport nombre="inventario_movimientos" headers={['Código','Nombre','Categoría','Unidades','Movimientos','Costo total','Venta total','Margen']}
              rows={rankingMeds.map(p => [p.codigo, p.nombre, p.categoria, p.totalUnidades, p.movimientos, p.totalCosto, p.totalVenta, p.totalVenta-p.totalCosto])} />
            <button onClick={() => imprimir('Medicamentos más movidos', refMedMovidos)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        <div className="p-5" ref={refMedMovidos}>
          {rankingMeds.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No hay movimientos de inventario en el período seleccionado</p>
              <p className="text-sm mt-1">Registra salidas o ventas en el módulo de Inventario</p>
            </div>
          ) : (
            <>
              {/* tabla de ranking */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                      <th className="px-3 py-2.5 text-left   text-xs font-semibold text-gray-500 uppercase">Código</th>
                      <th className="px-3 py-2.5 text-left   text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                      <th className="px-3 py-2.5 text-left   text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                      <th className="px-3 py-2.5 text-right  text-xs font-semibold text-gray-500 uppercase">Unidades</th>
                      <th className="px-3 py-2.5 text-right  text-xs font-semibold text-gray-500 uppercase">Movimientos</th>
                      <th className="px-3 py-2.5 text-right  text-xs font-semibold text-gray-500 uppercase">Costo total</th>
                      <th className="px-3 py-2.5 text-right  text-xs font-semibold text-gray-500 uppercase">Venta total</th>
                      <th className="px-3 py-2.5 text-right  text-xs font-semibold text-gray-500 uppercase">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rankingMeds.map((p, i) => {
                      const margen = p.totalVenta - p.totalCosto
                      const maxUnid = rankingMeds[0].totalUnidades
                      const pct = maxUnid > 0 ? (p.totalUnidades / maxUnid) * 100 : 0
                      return (
                        <tr key={p.codigo} className="hover:bg-gray-50">
                          {/* posición con medalla para top 3 */}
                          <td className="px-3 py-2.5 text-center">
                            {i === 0 ? <span className="text-base">🥇</span>
                            : i === 1 ? <span className="text-base">🥈</span>
                            : i === 2 ? <span className="text-base">🥉</span>
                            : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{p.codigo}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{p.nombre}</p>
                            {/* barra de progreso */}
                            <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                              <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{p.categoria}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="font-bold text-blue-700 text-base">{p.totalUnidades}</span>
                            <span className="text-xs text-gray-400 ml-1">{p.unidad}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{p.movimientos}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">
                            {p.totalCosto > 0 ? fmt(p.totalCosto) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-green-700">
                            {p.totalVenta > 0 ? fmt(p.totalVenta) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {p.totalVenta > 0 && p.totalCosto > 0
                              ? <span className={`font-bold text-sm ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {fmt(margen)}
                                </span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* fila totales */}
                  {rankingMeds.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-blue-50">
                        <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-gray-700 text-sm">TOTALES</td>
                        <td className="px-3 py-2.5 text-right font-bold text-blue-700">
                          {rankingMeds.reduce((s, p) => s + p.totalUnidades, 0)} uds
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-gray-600">
                          {rankingMeds.reduce((s, p) => s + p.movimientos, 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-gray-700">
                          {fmt(rankingMeds.reduce((s, p) => s + p.totalCosto, 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">
                          {fmt(rankingMeds.reduce((s, p) => s + p.totalVenta, 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">
                          {fmt(rankingMeds.reduce((s, p) => s + (p.totalVenta - p.totalCosto), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* tabla de impresión (diferente formato) */}
              <div style={{ display: 'none' }} className="print-block">
                <h2>Ranking de productos más movidos</h2>
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Código</th><th>Nombre</th><th>Categoría</th>
                      <th className="right">Unidades</th><th className="right">Movimientos</th>
                      <th className="right">Costo total</th><th className="right">Venta total</th><th className="right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingMeds.map((p, i) => (
                      <tr key={p.codigo}>
                        <td>{i+1}</td>
                        <td className="mono">{p.codigo}</td>
                        <td>{p.nombre}</td>
                        <td>{p.categoria}</td>
                        <td className="right bold">{p.totalUnidades} {p.unidad}</td>
                        <td className="right">{p.movimientos}</td>
                        <td className="right">L. {p.totalCosto.toFixed(2)}</td>
                        <td className="right">L. {p.totalVenta.toFixed(2)}</td>
                        <td className="right">L. {(p.totalVenta - p.totalCosto).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan={4} className="bold">TOTALES</td>
                      <td className="right bold">{rankingMeds.reduce((s,p)=>s+p.totalUnidades,0)} uds</td>
                      <td className="right bold">{rankingMeds.reduce((s,p)=>s+p.movimientos,0)}</td>
                      <td className="right bold">L. {rankingMeds.reduce((s,p)=>s+p.totalCosto,0).toFixed(2)}</td>
                      <td className="right bold">L. {rankingMeds.reduce((s,p)=>s+p.totalVenta,0).toFixed(2)}</td>
                      <td className="right bold">L. {rankingMeds.reduce((s,p)=>s+(p.totalVenta-p.totalCosto),0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>}

      {/* ══════════ REPORTE NUEVOS PACIENTES ══════════ */}
      {tabActivo === 'pacientes' && <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> Nuevos Pacientes en el Período
          </h2>
          <div className="flex items-center gap-2">
            <BtnExport nombre="pacientes_nuevos" headers={['Nombre','F. Nacimiento','Sexo','Fecha registro']}
              rows={nuevosPacientes.map(p => [`${p.nombre} ${p.apellido1}`, p.fecha_nacimiento||'', p.sexo||'', new Date(p.created_at).toLocaleDateString('es-HN')])} />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-bold rounded-full">
              {nuevosPacientes.length} registrados
            </span>
          </div>
        </div>
        <div className="p-5">
          {nuevosPacientes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">F. Nacimiento</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Sexo</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nuevosPacientes.map((p, i) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{i+1}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{p.nombre} {p.apellido1}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.fecha_nacimiento || '—'}</td>
                      <td className="px-3 py-2.5">
                        {p.sexo
                          ? <span className={`px-2 py-0.5 rounded-full text-xs ${p.sexo==='M'?'bg-blue-100 text-blue-700':'bg-pink-100 text-pink-700'}`}>{p.sexo==='M'?'Masculino':'Femenino'}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {new Date(p.created_at).toLocaleDateString('es-HN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No se registraron pacientes nuevos en este período</p>
            </div>
          )}
        </div>
      </div>}

      {tabActivo === 'descuentos' && <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total descuentos por edad</p>
            <p className="text-2xl font-black text-amber-700 mt-1 tabular-nums">L {fmt(descEdadTotal)}</p>
            <p className="text-xs text-gray-400 mt-1">{movsDescEdad.length} cobro(s) con descuento</p>
          </div>
          <div className="bg-white border rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase">Tercera edad</p>
            <p className="text-2xl font-black text-gray-800 mt-1 tabular-nums">L {fmt(descEdadTotal3ra)}</p>
            <p className="text-xs text-gray-400 mt-1">{descEdadTercera.length} cobro(s)</p>
          </div>
          <div className="bg-white border rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase">Cuarta edad</p>
            <p className="text-2xl font-black text-gray-800 mt-1 tabular-nums">L {fmt(descEdadTotal4ta)}</p>
            <p className="text-xs text-gray-400 mt-1">{descEdadCuarta.length} cobro(s)</p>
          </div>
        </div>

        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <BadgePercent className="w-5 h-5 text-amber-600" /> Descuentos por edad · resumen mensual
            </h2>
            <BtnExport nombre="descuentos_edad_mensual"
              headers={['Mes','Tercera edad','Cuarta edad','Total','Cobros']}
              rows={descEdadPorMes.map(r => [fmtMes(r.mes), r.t3.toFixed(2), r.t4.toFixed(2), r.total.toFixed(2), r.cuenta])} />
          </div>
          <div className="p-5">
            {descEdadPorMes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Mes</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Tercera edad</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Cuarta edad</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Cobros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {descEdadPorMes.map(r => (
                      <tr key={r.mes} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900 capitalize">{fmtMes(r.mes)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">L {fmt(r.t3)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">L {fmt(r.t4)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-amber-700">L {fmt(r.total)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{r.cuenta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <BadgePercent className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No se aplicaron descuentos por edad en este período</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-gray-600" /> Detalle de cobros con descuento por edad
            </h2>
            <BtnExport nombre="descuentos_edad_detalle"
              headers={['Fecha','Hora','Paciente','Concepto','Motivo','Descuento']}
              rows={movsDescEdad.map(m => [m.fecha, m.hora || '', m.paciente_nombre || '', m.concepto, m.descuento_motivo || '', (m.descuento_monto || 0).toFixed(2)])} />
          </div>
          <div className="p-5">
            {movsDescEdad.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Concepto</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Motivo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Descuento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {movsDescEdad.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{m.fecha} {m.hora?.slice(0,5) || ''}</td>
                        <td className="px-3 py-2.5 text-gray-900">{m.paciente_nombre || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-700">{m.concepto}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            clasifEdad(m.descuento_motivo) === '4ta' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                          }`}>{m.descuento_motivo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-700">L {fmt(m.descuento_monto || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sin cobros con descuento por edad en este período</p>
              </div>
            )}
          </div>
        </div>
      </div>}

      </ModuleContent>
    </ModuleShell>
  )
}
