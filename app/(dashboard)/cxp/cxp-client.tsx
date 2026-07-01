'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { rpcRegistrarAbonoCxp } from '@/lib/finanzas-rpc'
import { useToast } from '@/components/toast'
import {
  CreditCard, Search, DollarSign, AlertTriangle, CheckCircle2,
  Clock, X, Save, Printer, Building2, Truck, History,
  Banknote, ArrowDownCircle, Filter, ChevronRight, RefreshCw,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent } from '@/components/module-layout'

// ── Tipos ────────────────────────────────────────────────────────
interface CXP {
  id:                number
  compra_id:         number
  proveedor_id?:     number
  proveedor_nombre:  string
  fecha:             string
  fecha_vencimiento?: string
  monto_total:       number
  monto_pagado:      number
  saldo:             number
  estado:            string
  notas?:            string
  sucursal_id?:      number
  numero_compra?:    string
}

interface Abono {
  id:               number
  cxp_id:           number
  compra_id?:       number
  proveedor_nombre: string
  monto:            number
  forma_pago:       string
  nota?:            string
  cajero_nombre?:   string
  fecha:            string
  hora:             string
  sucursal_id?:     number
}

interface Proveedor { id: number; nombre: string }
interface Sucursal  { id: number; nombre: string }

interface Props {
  cxpLista:        CXP[]
  abonos:          Abono[]
  proveedores:     Proveedor[]
  sucursales:      Sucursal[]
  sucursalDefault: number | null
  cajeroNombre:    string
  userId:          string
  sesionAbierta:   number | null
  hoy:             string
}

const FORMAS = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'] as const

function fmt(n: number) {
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(n)
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN')
}

export default function CxpClient({
  cxpLista: initCxp, abonos: initAbonos, proveedores, sucursales,
  sucursalDefault, cajeroNombre, userId, sesionAbierta, hoy,
}: Props) {
  const supabase = createClient()
  const toast    = useToast()

  const [cxpLista, setCxpLista] = useState<CXP[]>(initCxp)
  const [abonos,   setAbonos]   = useState<Abono[]>(initAbonos)
  const [tab,      setTab]      = useState<'pendientes' | 'pagadas' | 'abonos'>('pendientes')

  const [buscar,       setBuscar]       = useState('')
  const [filtroProv,   setFiltroProv]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroSuc,    setFiltroSuc]    = useState('')

  const [modalAbono, setModalAbono] = useState<CXP | null>(null)
  const [modalDetalle, setModalDetalle] = useState<CXP | null>(null)
  const [formAbono, setFormAbono] = useState({ monto: '', forma_pago: 'EFECTIVO' as string, nota: '', registrarCaja: true })
  const [guardando, setGuardando] = useState(false)

  // ── KPIs ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const pendientes = cxpLista.filter(c => c.estado === 'PENDIENTE')
    const parciales  = cxpLista.filter(c => c.estado === 'PARCIAL')
    const vencidas   = cxpLista.filter(c =>
      (c.estado === 'PENDIENTE' || c.estado === 'PARCIAL') &&
      c.fecha_vencimiento && c.fecha_vencimiento < hoy
    )
    const saldoTotal = cxpLista
      .filter(c => c.estado !== 'PAGADO')
      .reduce((s, c) => s + c.saldo, 0)
    const pagadoMes = abonos
      .filter(a => a.fecha.startsWith(hoy.slice(0, 7)))
      .reduce((s, a) => s + a.monto, 0)
    return {
      pendientes: pendientes.length,
      parciales:  parciales.length,
      vencidas:   vencidas.length,
      saldoTotal,
      pagadoMes,
      abonosHoy:  abonos.filter(a => a.fecha === hoy).length,
    }
  }, [cxpLista, abonos, hoy])

  // ── Filtrado ─────────────────────────────────────────────────
  const lista = useMemo(() => {
    let base = cxpLista
    if (tab === 'pendientes') base = base.filter(c => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL')
    if (tab === 'pagadas')    base = base.filter(c => c.estado === 'PAGADO')

    return base.filter(c => {
      if (filtroProv   && c.proveedor_id !== Number(filtroProv)) return false
      if (filtroEstado && c.estado !== filtroEstado) return false
      if (filtroSuc    && c.sucursal_id !== Number(filtroSuc)) return false
      if (buscar) {
        const q = buscar.toLowerCase()
        return c.proveedor_nombre.toLowerCase().includes(q) ||
          (c.numero_compra ?? '').toLowerCase().includes(q) ||
          String(c.compra_id).includes(q)
      }
      return true
    })
  }, [cxpLista, tab, buscar, filtroProv, filtroEstado, filtroSuc])

  const abonosFiltrados = useMemo(() => {
    if (!buscar) return abonos
    const q = buscar.toLowerCase()
    return abonos.filter(a =>
      a.proveedor_nombre.toLowerCase().includes(q) ||
      (a.nota ?? '').toLowerCase().includes(q)
    )
  }, [abonos, buscar])

  const abonosDeCxp = (cxpId: number) => abonos.filter(a => a.cxp_id === cxpId)

  // ── Abonar ───────────────────────────────────────────────────
  async function confirmarAbono() {
    if (!modalAbono) return
    const monto = parseFloat(formAbono.monto)
    if (isNaN(monto) || monto <= 0) return toast.error('Monto inválido')
    if (monto > modalAbono.saldo)   return toast.error('El abono supera el saldo pendiente')

    setGuardando(true)
    try {
      const hora = new Date().toTimeString().slice(0, 8)

      const res = await rpcRegistrarAbonoCxp(supabase, {
        cxp_id: modalAbono.id,
        monto,
        forma_pago: formAbono.forma_pago,
        nota: formAbono.nota || null,
        cajero_nombre: cajeroNombre,
        sucursal_id: modalAbono.sucursal_id ?? sucursalDefault,
        sesion_id: formAbono.registrarCaja && sesionAbierta ? sesionAbierta : null,
        registrar_caja: !!(formAbono.registrarCaja && sesionAbierta),
        fecha: hoy,
        hora,
      })

      if (!res.ok) {
        toast.error('Error al registrar abono', res.error)
        return
      }

      setCxpLista(prev => prev.map(c =>
        c.id === modalAbono.id
          ? { ...c, monto_pagado: res.data.monto_pagado, saldo: res.data.saldo, estado: res.data.estado }
          : c
      ))

      toast.success('Pago registrado', `${fmt(monto)} a ${modalAbono.proveedor_nombre}`)
      setModalAbono(null)
      setFormAbono({ monto: '', forma_pago: 'EFECTIVO', nota: '', registrarCaja: true })
    } finally {
      setGuardando(false)
    }
  }

  // ── Imprimir comprobante de abono ───────────────────────────
  function imprimirAbono(a: Abono, cxp?: CXP) {
    const w = window.open('', '_blank', 'width=400,height=600')
    if (!w) return
    const suc = sucursales.find(s => s.id === a.sucursal_id)?.nombre ?? ''
    w.document.write(`<!DOCTYPE html><html><head><title>Comprobante CXP</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:monospace;font-size:11px;padding:12px;width:80mm}
        h2{font-size:13px;text-align:center;margin-bottom:4px}
        .sep{border-top:1px dashed #000;margin:8px 0}
        .row{display:flex;justify-content:space-between;margin:2px 0}
        .total{font-size:14px;font-weight:bold;text-align:right;margin-top:8px}
        .center{text-align:center}
      </style></head><body>
      <h2>CLÍNICA MÉDICA JERUSALÉN</h2>
      <p class="center">COMPROBANTE DE PAGO CXP</p>
      <div class="sep"></div>
      <div class="row"><span>Proveedor:</span><span><b>${a.proveedor_nombre}</b></span></div>
      ${cxp?.numero_compra ? `<div class="row"><span>Compra:</span><span>${cxp.numero_compra}</span></div>` : ''}
      <div class="row"><span>Fecha:</span><span>${fmtDate(a.fecha)} ${a.hora?.slice(0,5) ?? ''}</span></div>
      <div class="row"><span>Forma pago:</span><span>${a.forma_pago}</span></div>
      <div class="row"><span>Cajero:</span><span>${a.cajero_nombre ?? '—'}</span></div>
      ${suc ? `<div class="row"><span>Sucursal:</span><span>${suc}</span></div>` : ''}
      <div class="sep"></div>
      <p class="total">MONTO PAGADO: ${fmt(a.monto)}</p>
      ${a.nota ? `<div class="sep"></div><p>Nota: ${a.nota}</p>` : ''}
      <div class="sep"></div>
      <p class="center" style="font-size:9px;margin-top:8px">Documento de control interno</p>
      <script>window.print()</script>
    </body></html>`)
    w.document.close()
  }

  function abrirAbono(c: CXP) {
    setModalAbono(c)
    setFormAbono({ monto: String(c.saldo), forma_pago: 'EFECTIVO', nota: '', registrarCaja: !!sesionAbierta })
  }

  function esVencida(c: CXP) {
    return (c.estado === 'PENDIENTE' || c.estado === 'PARCIAL') &&
      c.fecha_vencimiento && c.fecha_vencimiento < hoy
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <ModuleShell tint="rose">
      <ModuleHero
        title="Cuentas por Pagar"
        subtitle="Pagos a proveedores por compras a crédito"
        badge="CXP Proveedores"
        icon={CreditCard}
        gradient="rose"
        kpis={[
          { label: 'Saldo total', value: fmt(kpis.saldoTotal), icon: DollarSign },
          { label: 'Pendientes', value: kpis.pendientes, icon: Clock },
          { label: 'Parciales', value: kpis.parciales, icon: ArrowDownCircle },
          { label: 'Vencidas', value: kpis.vencidas, icon: AlertTriangle },
          { label: 'Pagado el mes', value: fmt(kpis.pagadoMes), icon: CheckCircle2 },
          { label: 'Abonos hoy', value: kpis.abonosHoy, icon: History },
        ]}
        banner={!sesionAbierta ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-amber-200 bg-amber-500/20 border border-amber-400/30 rounded-xl px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Sin caja abierta — los pagos no se registrarán como egreso
          </div>
        ) : undefined}
      />
      <ModuleContent>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {([
            { key: 'pendientes', label: `Pendientes (${cxpLista.filter(c => c.estado !== 'PAGADO').length})`, icon: AlertTriangle },
            { key: 'pagadas',    label: `Pagadas (${cxpLista.filter(c => c.estado === 'PAGADO').length})`,    icon: CheckCircle2 },
            { key: 'abonos',     label: `Historial de pagos (${abonos.length})`,                                icon: History },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                tab === t.key ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        {tab !== 'abonos' && (
          <div className="p-4 border-b flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={buscar} onChange={e => setBuscar(e.target.value)}
                placeholder="Buscar proveedor, No. compra…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <select value={filtroProv} onChange={e => setFiltroProv(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {tab === 'pendientes' && (
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Todos los estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
              </select>
            )}
            <select value={filtroSuc} onChange={e => setFiltroSuc(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Tabla CXP */}
        {(tab === 'pendientes' || tab === 'pagadas') && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Compra</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Vence</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      {tab === 'pendientes' ? 'No hay deudas pendientes' : 'No hay cuentas pagadas'}
                    </td>
                  </tr>
                ) : lista.map(c => (
                  <tr key={c.id}
                    className={`hover:bg-slate-50 cursor-pointer ${esVencida(c) ? 'bg-red-50/50' : ''}`}
                    onClick={() => setModalDetalle(c)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.proveedor_nombre}</div>
                      {c.sucursal_id && (
                        <div className="text-xs text-slate-400">
                          {sucursales.find(s => s.id === c.sucursal_id)?.nombre}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {c.numero_compra ?? `#${c.compra_id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(c.fecha)}</td>
                    <td className="px-4 py-3">
                      {c.fecha_vencimiento ? (
                        <span className={esVencida(c) ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                          {fmtDate(c.fecha_vencimiento)}
                          {esVencida(c) && <span className="ml-1 text-xs">⚠</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt(c.monto_total)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{fmt(c.monto_pagado)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(c.saldo)}</td>
                    <td className="px-4 py-3 text-center">
                      <EstadoBadge estado={c.estado} />
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {c.estado !== 'PAGADO' && (
                        <button onClick={() => abrirAbono(c)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-semibold transition">
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabla Abonos */}
        {tab === 'abonos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Forma pago</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-left">Cajero</th>
                  <th className="px-4 py-3 text-left">Nota</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {abonosFiltrados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">Sin pagos registrados aún</td></tr>
                ) : abonosFiltrados.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">
                      {fmtDate(a.fecha)} <span className="text-xs">{a.hora?.slice(0,5)}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{a.proveedor_nombre}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs">{a.forma_pago}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(a.monto)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{a.cajero_nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs truncate max-w-[150px]">{a.nota ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => imprimirAbono(a, cxpLista.find(c => c.id === a.cxp_id))}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                        title="Imprimir comprobante">
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Abonar ── */}
      {modalAbono && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-green-600" />
                Registrar pago
              </h2>
              <button onClick={() => setModalAbono(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Proveedor</span>
                  <span className="font-semibold">{modalAbono.proveedor_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Compra</span>
                  <span className="font-mono text-xs">{modalAbono.numero_compra ?? `#${modalAbono.compra_id}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Saldo pendiente</span>
                  <span className="font-bold text-red-600 text-lg">{fmt(modalAbono.saldo)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto a pagar *</label>
                <input type="number" min="0.01" max={modalAbono.saldo} step="0.01"
                  value={formAbono.monto}
                  onChange={e => setFormAbono(f => ({ ...f, monto: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setFormAbono(f => ({ ...f, monto: String(modalAbono.saldo) }))}
                    className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                    Pago total
                  </button>
                  <button onClick={() => setFormAbono(f => ({ ...f, monto: String((modalAbono.saldo / 2).toFixed(2)) }))}
                    className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                    50%
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Forma de pago</label>
                <select value={formAbono.forma_pago}
                  onChange={e => setFormAbono(f => ({ ...f, forma_pago: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nota / Referencia</label>
                <input value={formAbono.nota}
                  onChange={e => setFormAbono(f => ({ ...f, nota: e.target.value }))}
                  placeholder="No. transferencia, cheque, etc."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {sesionAbierta && (
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formAbono.registrarCaja}
                    onChange={e => setFormAbono(f => ({ ...f, registrarCaja: e.target.checked }))}
                    className="rounded" />
                  Registrar como egreso en caja abierta
                </label>
              )}
            </div>

            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={() => setModalAbono(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={confirmarAbono} disabled={guardando}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition">
                {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {guardando ? 'Procesando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel Detalle CXP ── */}
      {modalDetalle && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModalDetalle(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-red-50">
              <div>
                <h3 className="font-semibold text-slate-800">{modalDetalle.proveedor_nombre}</h3>
                <p className="text-xs text-slate-500">{modalDetalle.numero_compra ?? `Compra #${modalDetalle.compra_id}`}</p>
              </div>
              <button onClick={() => setModalDetalle(null)} className="p-1.5 rounded-lg hover:bg-red-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 flex-1">
              <EstadoBadge estado={modalDetalle.estado} large />

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total',   val: fmt(modalDetalle.monto_total),  color: 'text-slate-700' },
                  { label: 'Pagado',  val: fmt(modalDetalle.monto_pagado), color: 'text-green-700' },
                  { label: 'Saldo',   val: fmt(modalDetalle.saldo),        color: 'text-red-600' },
                ].map(k => (
                  <div key={k.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className={`font-bold ${k.color}`}>{k.val}</p>
                    <p className="text-xs text-slate-400">{k.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm">
                <Row label="Fecha compra"  val={fmtDate(modalDetalle.fecha)} />
                <Row label="Vencimiento"   val={modalDetalle.fecha_vencimiento ? fmtDate(modalDetalle.fecha_vencimiento) : '—'} />
                {modalDetalle.sucursal_id && (
                  <Row label="Sucursal" val={sucursales.find(s => s.id === modalDetalle.sucursal_id)?.nombre} />
                )}
                {modalDetalle.notas && <Row label="Notas" val={modalDetalle.notas} />}
              </div>

              {/* Historial abonos de esta CXP */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                  Pagos realizados ({abonosDeCxp(modalDetalle.id).length})
                </h4>
                {abonosDeCxp(modalDetalle.id).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">Sin pagos aún</p>
                ) : (
                  <div className="space-y-2">
                    {abonosDeCxp(modalDetalle.id).map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-green-800">{fmt(a.monto)}</p>
                          <p className="text-xs text-slate-500">{fmtDate(a.fecha)} · {a.forma_pago}</p>
                        </div>
                        <button onClick={() => imprimirAbono(a, modalDetalle)}
                          className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {modalDetalle.estado !== 'PAGADO' && (
              <div className="px-5 py-4 border-t">
                <button onClick={() => { setModalDetalle(null); abrirAbono(modalDetalle) }}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium transition">
                  <Banknote className="w-4 h-4" /> Registrar pago
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────
function EstadoBadge({ estado, large }: { estado: string; large?: boolean }) {
  const map: Record<string, string> = {
    PENDIENTE: 'bg-red-100 text-red-700',
    PARCIAL:   'bg-yellow-100 text-yellow-700',
    PAGADO:    'bg-green-100 text-green-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${map[estado] ?? 'bg-slate-100 text-slate-600'} ${large ? 'text-sm px-3 py-1' : 'text-xs'}`}>
      {estado}
    </span>
  )
}

function Row({ label, val }: { label: string; val?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{val ?? '—'}</span>
    </div>
  )
}
