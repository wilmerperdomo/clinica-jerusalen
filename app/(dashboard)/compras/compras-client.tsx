'use client'
import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ShoppingCart, Plus, Search, Printer, X, Package, Truck,
  AlertTriangle, ChevronDown, ChevronUp, Check, CreditCard,
  Banknote, FileText, Eye, Trash2, Calendar, DollarSign,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

/* ── Tipos ─────────────────────────────────────────────────────── */
interface Detalle {
  id?: number
  compra_id?: number
  producto_id: number
  codigo_producto: string
  nombre_producto: string
  lote: string
  fecha_vencimiento: string
  precio_costo: number
  cantidad: number
  importe: number
}
interface Compra {
  id: number
  numero: string
  proveedor_id: number | null
  proveedor_nombre: string
  sucursal_id: number
  fecha: string
  hora: string
  numero_factura_proveedor: string | null
  nota: string | null
  contado: number
  credito: number
  total: number
  estado: string
  tipo_costo: string
  cajero_nombre: string | null
  compra_detalles: Detalle[]
}
interface Proveedor { id: number; nombre: string; contacto?: string; telefono?: string; email?: string; dias_credito?: number }
interface Producto  { id: number; codigo: string; nombre: string; costo: number; precio_venta?: number; unidad?: string; categoria?: string; tipo?: string }
interface Sucursal  { id: number; nombre: string }
interface CXP {
  id: number; compra_id: number; proveedor_nombre: string
  monto_total: number; monto_pagado: number; saldo: number; estado: string; fecha: string
}

interface Props {
  compras: Compra[]
  proveedores: Proveedor[]
  productos: Producto[]
  sucursales: Sucursal[]
  cxpPendientes: CXP[]
  sucursalDefault: number | null
  cajeroNombre: string
  hoy: string
}

const fmt = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-HN') : ''

/* ── ESTADO BADGE ───────────────────────────────────────────────── */
function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    completada: 'bg-green-100 text-green-800',
    borrador:   'bg-yellow-100 text-yellow-800',
    anulada:    'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    completada: 'Completada', borrador: 'Borrador', anulada: 'Anulada',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${map[estado] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[estado] ?? estado}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════ */
export default function ComprasClient({
  compras: comprasInicial, proveedores, productos, sucursales,
  cxpPendientes: cxpInicial, sucursalDefault, cajeroNombre, hoy,
}: Props) {
  const supabase = createClient()

  /* tabs */
  const [tab, setTab] = useState<'compras' | 'cxp'>('compras')

  /* lista local */
  const [compras,      setCompras]      = useState<Compra[]>(comprasInicial)
  const [cxpPendientes,setCxpPendientes]= useState<CXP[]>(cxpInicial)

  /* búsqueda */
  const [buscar, setBuscar] = useState('')

  /* modal Nueva Compra */
  const [modalNueva,   setModalNueva]   = useState(false)
  const [modalDetalle, setModalDetalle] = useState<Compra | null>(null)
  const [modalAbonar,  setModalAbonar]  = useState<CXP | null>(null)

  /* form nueva compra */
  const [provId,       setProvId]       = useState<number | ''>('')
  const [tipoCosto,    setTipoCosto]    = useState<'proveedor'|'defecto'>('proveedor')
  const [sucursalId,   setSucursalId]   = useState<number>(sucursalDefault ?? (sucursales[0]?.id ?? 0))
  const [noFactProv,   setNoFactProv]   = useState('')
  const [nota,         setNota]         = useState('')
  const [items,        setItems]        = useState<Detalle[]>([])
  const [buscarProd,   setBuscarProd]   = useState('')
  const [guardando,    setGuardando]    = useState(false)
  const [msgError,     setMsgError]     = useState('')

  /* modo pago */
  const [pagoContado,  setPagoContado]  = useState(0)
  const [pagoCredito,  setPagoCredito]  = useState(0)

  /* abonar CXP */
  const [montoAbono,   setMontoAbono]   = useState('')
  const [abonando,     setAbonando]     = useState(false)

  const printRef = useRef<HTMLDivElement>(null)

  /* ── Cálculos ─────────────────────────────────────────────────── */
  const totalItems = useMemo(() => items.reduce((s, i) => s + i.importe, 0), [items])
  const diferencia = useMemo(() => totalItems - pagoContado - pagoCredito, [totalItems, pagoContado, pagoCredito])

  const comprasFiltradas = useMemo(() => {
    const q = buscar.toLowerCase()
    return compras.filter(c =>
      c.numero.toLowerCase().includes(q) ||
      c.proveedor_nombre.toLowerCase().includes(q) ||
      c.fecha.includes(q)
    )
  }, [compras, buscar])

  /* KPIs del mes */
  const kpiTotal    = compras.filter(c => c.estado === 'completada').reduce((s,c) => s + c.total, 0)
  const kpiCount    = compras.filter(c => c.estado === 'completada').length
  const kpiCXP      = cxpPendientes.reduce((s,c) => s + c.saldo, 0)

  /* productos filtrados por búsqueda */
  const productosFilt = useMemo(() => {
    if (!buscarProd.trim()) return []
    const q = buscarProd.toLowerCase()
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [buscarProd, productos])

  /* ── Precio costo según modo ──────────────────────────────────── */
  function precioParaProducto(prod: Producto): number {
    return prod.costo ?? 0
  }

  /* ── Agregar ítem ─────────────────────────────────────────────── */
  function agregarItem(prod: Producto) {
    const existe = items.find(i => i.producto_id === prod.id)
    if (existe) {
      setItems(prev => prev.map(i =>
        i.producto_id === prod.id
          ? { ...i, cantidad: i.cantidad + 1, importe: (i.cantidad + 1) * i.precio_costo }
          : i
      ))
    } else {
      const costo = precioParaProducto(prod)
      setItems(prev => [...prev, {
        producto_id:       prod.id,
        codigo_producto:   prod.codigo,
        nombre_producto:   prod.nombre,
        lote:              '',
        fecha_vencimiento: prod.tipo === 'Medicamento' ? '' : 'N/A',
        precio_costo:      costo,
        cantidad:          1,
        importe:           costo,
      }])
    }
    setBuscarProd('')
  }

  /* ── Actualizar ítem ──────────────────────────────────────────── */
  function actualizarItem(idx: number, field: string, value: string | number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: value }
      updated.importe = updated.precio_costo * updated.cantidad
      return updated
    }))
  }

  /* ── Eliminar ítem ────────────────────────────────────────────── */
  function quitarItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  /* ── Resetear form ────────────────────────────────────────────── */
  function resetForm() {
    setProvId(''); setTipoCosto('proveedor'); setNoFactProv(''); setNota('')
    setItems([]); setBuscarProd(''); setPagoContado(0); setPagoCredito(0); setMsgError('')
  }

  /* ── Guardar compra ───────────────────────────────────────────── */
  async function guardarCompra() {
    if (!provId)                  return setMsgError('Seleccione un proveedor')
    if (items.length === 0)       return setMsgError('Agregue al menos un producto')
    if (Math.abs(diferencia) > 0.01) return setMsgError(`El pago no cuadra. Diferencia: L ${diferencia.toFixed(2)}`)

    // Validar lote/fechav para medicamentos
    const sinFecha = items.filter(it => {
      const prod = productos.find(p => p.id === it.producto_id)
      return prod?.tipo === 'Medicamento' && (!it.fecha_vencimiento || it.fecha_vencimiento === '')
    })
    if (sinFecha.length > 0)
      return setMsgError(`Asigne fecha de vencimiento a: ${sinFecha.map(i=>i.nombre_producto).join(', ')}`)

    setGuardando(true)
    setMsgError('')
    try {
      const proveedor = proveedores.find(p => p.id === Number(provId))

      // generar número
      const { data: numData } = await supabase.rpc('fn_numero_compra')
      const numero = numData ?? `OC-${Date.now()}`

      // insertar cabecera
      const { data: compraData, error: errC } = await supabase
        .from('compras')
        .insert({
          numero,
          proveedor_id:             Number(provId),
          proveedor_nombre:         proveedor?.nombre ?? '',
          sucursal_id:              sucursalId,
          numero_factura_proveedor: noFactProv || null,
          nota:                     nota || null,
          contado:                  pagoContado,
          credito:                  pagoCredito,
          total:                    totalItems,
          estado:                   'completada',
          tipo_costo:               tipoCosto,
          cajero_nombre:            cajeroNombre,
        })
        .select('id')
        .single()

      if (errC || !compraData) throw new Error(errC?.message ?? 'Error al registrar compra')
      const compraId = compraData.id

      // insertar detalles
      const detalles = items.map(it => ({
        compra_id:         compraId,
        producto_id:       it.producto_id,
        codigo_producto:   it.codigo_producto,
        nombre_producto:   it.nombre_producto,
        lote:              it.lote || null,
        fecha_vencimiento: (it.fecha_vencimiento && it.fecha_vencimiento !== 'N/A') ? it.fecha_vencimiento : null,
        precio_costo:      it.precio_costo,
        cantidad:          it.cantidad,
        importe:           it.importe,
      }))
      const { error: errD } = await supabase.from('compra_detalles').insert(detalles)
      if (errD) throw new Error(errD.message)

      // actualizar inventario por cada ítem
      for (const it of items) {
        const fechaVenc = (it.fecha_vencimiento && it.fecha_vencimiento !== 'N/A') ? it.fecha_vencimiento : null

        // stock actual
        let query = supabase
          .from('inventario')
          .select('id, cantidad')
          .eq('producto_id', it.producto_id)
          .eq('sucursal_id', sucursalId)
        if (fechaVenc) query = query.eq('fecha_vencimiento', fechaVenc)
        else           query = query.is('fecha_vencimiento', null)

        const { data: stockRow } = await query.maybeSingle()

        const cantidadAntes = stockRow ? Number(stockRow.cantidad) : 0
        const cantidadDespues = cantidadAntes + it.cantidad

        if (stockRow) {
          await supabase
            .from('inventario')
            .update({ cantidad: cantidadDespues })
            .eq('id', stockRow.id)
        } else {
          await supabase.from('inventario').insert({
            producto_id:       it.producto_id,
            sucursal_id:       sucursalId,
            cantidad:          it.cantidad,
            lote:              it.lote || null,
            fecha_vencimiento: fechaVenc,
            costo_unitario:    it.precio_costo,
          })
        }

        // movimiento kardex (columnas según schema: tipo, motivo, referencia_*)
        const { error: errKardex } = await supabase.from('inventario_movimientos').insert({
          producto_id:       it.producto_id,
          sucursal_id:       sucursalId,
          tipo:              'ENTRADA',
          cantidad:          it.cantidad,
          cantidad_antes:    cantidadAntes,
          cantidad_despues:  cantidadDespues,
          motivo:            `Compra ${numero}`,
          referencia_tipo:   'compra',
          referencia_id:     compraId,
          lote:              it.lote || null,
          fecha_vencimiento: fechaVenc,
        })
        if (errKardex) console.warn('Kardex compra:', errKardex.message)
      }

      // CXP si hay crédito
      if (pagoCredito > 0) {
        const diasCredito = proveedor?.dias_credito && proveedor.dias_credito > 0 ? proveedor.dias_credito : 30
        const venc = new Date()
        venc.setDate(venc.getDate() + diasCredito)
        await supabase.from('compra_cxp').insert({
          compra_id:          compraId,
          proveedor_id:       Number(provId),
          proveedor_nombre:   proveedor?.nombre ?? '',
          sucursal_id:        sucursalId,
          numero_compra:      numero,
          fecha_vencimiento:  venc.toISOString().split('T')[0],
          monto_total:        pagoCredito,
          monto_pagado:       0,
          saldo:              pagoCredito,
          estado:             'PENDIENTE',
        })
        // refrescar CXP
        const { data: nuevasCxp } = await supabase
          .from('compra_cxp')
          .select('*')
          .in('estado', ['PENDIENTE','PARCIAL'])
          .order('fecha', { ascending: false })
        if (nuevasCxp) setCxpPendientes(nuevasCxp)
      }

      // refrescar lista de compras del mes
      const mesInicio = `${hoy.slice(0,7)}-01`
      const { data: nuevasCompras } = await supabase
        .from('compras')
        .select(`id,numero,proveedor_id,proveedor_nombre,sucursal_id,fecha,hora,
                 numero_factura_proveedor,nota,contado,credito,total,estado,tipo_costo,cajero_nombre,
                 compra_detalles(id,producto_id,codigo_producto,nombre_producto,lote,fecha_vencimiento,precio_costo,cantidad,importe)`)
        .gte('fecha', mesInicio)
        .order('fecha', { ascending: false })
        .limit(200)
      if (nuevasCompras) setCompras(nuevasCompras as Compra[])

      setModalNueva(false)
      resetForm()
    } catch (e: unknown) {
      setMsgError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  /* ── Abonar a CXP ─────────────────────────────────────────────── */
  async function confirmarAbono() {
    if (!modalAbonar) return
    const monto = parseFloat(montoAbono)
    if (isNaN(monto) || monto <= 0) return alert('Monto inválido')
    if (monto > modalAbonar.saldo)  return alert('El abono supera el saldo')
    setAbonando(true)
    const nuevoMontoPagado = modalAbonar.monto_pagado + monto
    const nuevoSaldo       = modalAbonar.saldo - monto
    const nuevoEstado      = nuevoSaldo <= 0 ? 'PAGADO' : 'PARCIAL'
    const hora = new Date().toTimeString().slice(0, 8)
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('compra_cxp_abonos').insert({
      cxp_id: modalAbonar.id, compra_id: modalAbonar.compra_id,
      proveedor_nombre: modalAbonar.proveedor_nombre, monto,
      forma_pago: 'EFECTIVO', cajero_id: user?.id, cajero_nombre: cajeroNombre,
      sucursal_id: sucursalDefault, fecha: hoy, hora,
    })

    const { error } = await supabase
      .from('compra_cxp')
      .update({ monto_pagado: nuevoMontoPagado, saldo: nuevoSaldo, estado: nuevoEstado })
      .eq('id', modalAbonar.id)
    if (!error) {
      setCxpPendientes(prev =>
        prev.map(c => c.id === modalAbonar.id
          ? { ...c, monto_pagado: nuevoMontoPagado, saldo: nuevoSaldo, estado: nuevoEstado }
          : c
        ).filter(c => c.estado !== 'PAGADO')
      )
      setModalAbonar(null)
      setMontoAbono('')
    }
    setAbonando(false)
  }

  /* ── Imprimir orden ───────────────────────────────────────────── */
  function imprimirOrden(c: Compra) {
    const w = window.open('', '_blank', 'width=400,height=700')
    if (!w) return
    const suc = sucursales.find(s => s.id === c.sucursal_id)?.nombre ?? ''
    w.document.write(`
      <html><head><title>Orden ${c.numero}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:monospace;font-size:11px;padding:10px;width:80mm}
        h2{font-size:14px;text-align:center}
        .sep{border-top:1px dashed #000;margin:6px 0}
        .row{display:flex;justify-content:space-between}
        .total{font-size:13px;font-weight:bold}
        table{width:100%;border-collapse:collapse}
        td{padding:2px 0;vertical-align:top}
        .right{text-align:right}
      </style></head><body>
      <h2>CLÍNICA MÉDICA</h2>
      <p style="text-align:center">ORDEN DE COMPRA</p>
      <div class="sep"></div>
      <p>No.: <b>${c.numero}</b></p>
      <p>Fecha: ${fmtDate(c.fecha)}</p>
      <p>Proveedor: ${c.proveedor_nombre}</p>
      <p>Sucursal: ${suc}</p>
      ${c.numero_factura_proveedor ? `<p>Factura proveedor: ${c.numero_factura_proveedor}</p>` : ''}
      <div class="sep"></div>
      <table>
        <tr><td><b>Producto</b></td><td class="right"><b>Cant</b></td><td class="right"><b>Costo</b></td><td class="right"><b>Total</b></td></tr>
        ${c.compra_detalles.map(d => `
          <tr>
            <td>${d.nombre_producto}${d.lote ? `<br><small>Lote:${d.lote}</small>` : ''}${d.fecha_vencimiento && d.fecha_vencimiento!=='N/A' ? `<br><small>Vence:${fmtDate(d.fecha_vencimiento)}</small>` : ''}</td>
            <td class="right">${d.cantidad}</td>
            <td class="right">${d.precio_costo.toFixed(2)}</td>
            <td class="right">${d.importe.toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
      <div class="sep"></div>
      <div class="row total"><span>TOTAL</span><span>L ${c.total.toFixed(2)}</span></div>
      <div class="sep"></div>
      <div class="row"><span>Contado</span><span>L ${c.contado.toFixed(2)}</span></div>
      <div class="row"><span>Crédito</span><span>L ${c.credito.toFixed(2)}</span></div>
      ${c.nota ? `<div class="sep"></div><p>${c.nota}</p>` : ''}
      <div class="sep"></div>
      <p style="text-align:center">Recibido por: ${c.cajero_nombre ?? ''}</p>
      <script>window.onload=()=>{window.print();window.close()}<\/script>
      </body></html>
    `)
    w.document.close()
  }

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <ModuleShell tint="amber">
      <ModuleHero
        title="Compras"
        subtitle="Órdenes de compra a proveedores"
        badge="Abastecimiento"
        icon={ShoppingCart}
        gradient="amber"
        kpis={[
          { label: 'Compras del mes', value: kpiCount, icon: ShoppingCart },
          { label: 'Total gastado', value: fmt(kpiTotal), icon: DollarSign },
          { label: 'CXP pendiente', value: fmt(kpiCXP), icon: CreditCard },
        ]}
        actions={
          <ModuleBtnPrimary onClick={() => setModalNueva(true)}>
            <Plus className="w-4 h-4" /> Nueva Compra
          </ModuleBtnPrimary>
        }
      />
      <ModuleContent>

      {/* TABS */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex border-b">
          {(['compras','cxp'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition ${tab===t ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'compras' ? `Historial (${compras.length})` : `CXP Proveedores (${cxpPendientes.length})`}
            </button>
          ))}
        </div>

        {/* ── TAB HISTORIAL ───────────────────────────────────────── */}
        {tab === 'compras' && (
          <div>
            <div className="p-4 border-b">
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-300 outline-none"
                  placeholder="Buscar compra..."
                  value={buscar} onChange={e => setBuscar(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">Número</th>
                    <th className="px-4 py-3 text-left">Proveedor</th>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprasFiltradas.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin compras este mes</td></tr>
                  )}
                  {comprasFiltradas.map(c => (
                    <tr key={c.id} className="hover:bg-orange-50 transition">
                      <td className="px-4 py-3 font-mono font-semibold text-orange-700">{c.numero}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.proveedor_nombre}</p>
                        {c.numero_factura_proveedor && <p className="text-xs text-gray-400">Factura: {c.numero_factura_proveedor}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmtDate(c.fecha)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(c.total)}</td>
                      <td className="px-4 py-3 text-center"><EstadoBadge estado={c.estado} /></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setModalDetalle(c)}
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition"
                            title="Ver detalle"
                          ><Eye className="w-4 h-4" /></button>
                          <button
                            onClick={() => imprimirOrden(c)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition"
                            title="Imprimir"
                          ><Printer className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB CXP ─────────────────────────────────────────────── */}
        {tab === 'cxp' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Abonar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cxpPendientes.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay deudas pendientes</td></tr>
                )}
                {cxpPendientes.map(cxp => (
                  <tr key={cxp.id} className="hover:bg-red-50 transition">
                    <td className="px-4 py-3 font-medium">{cxp.proveedor_nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(cxp.fecha)}</td>
                    <td className="px-4 py-3 text-right">{fmt(cxp.monto_total)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{fmt(cxp.monto_pagado)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(cxp.saldo)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cxp.estado==='PENDIENTE' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {cxp.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setModalAbonar(cxp); setMontoAbono(String(cxp.saldo)) }}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-semibold transition"
                      >
                        Abonar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL NUEVA COMPRA
      ══════════════════════════════════════════════════════════════ */}
      {modalNueva && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">

            {/* header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-bold">Nueva Orden de Compra</h2>
              </div>
              <button onClick={() => { setModalNueva(false); resetForm() }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* ── Datos generales ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Proveedor *</label>
                  <select
                    value={provId}
                    onChange={e => setProvId(Number(e.target.value))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  >
                    <option value="">Seleccionar...</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Sucursal</label>
                  <select
                    value={sucursalId}
                    onChange={e => setSucursalId(Number(e.target.value))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  >
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Tipo de Costo</label>
                  <select
                    value={tipoCosto}
                    onChange={e => setTipoCosto(e.target.value as 'proveedor'|'defecto')}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  >
                    <option value="proveedor">Costo del Proveedor</option>
                    <option value="defecto">Costo por Defecto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">No. Factura Proveedor</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                    placeholder="Ej: F-2026-001234"
                    value={noFactProv} onChange={e => setNoFactProv(e.target.value)}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Nota / Observaciones</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                    placeholder="Nota opcional..."
                    value={nota} onChange={e => setNota(e.target.value)}
                  />
                </div>
              </div>

              {/* ── Búsqueda de productos ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Agregar Producto</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-300 outline-none"
                    placeholder="Buscar por nombre o código..."
                    value={buscarProd}
                    onChange={e => setBuscarProd(e.target.value)}
                    autoComplete="off"
                  />
                  {productosFilt.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-10 mt-1 max-h-48 overflow-y-auto">
                      {productosFilt.map(p => (
                        <button
                          key={p.id}
                          onClick={() => agregarItem(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-orange-50 flex items-center justify-between text-sm"
                        >
                          <span>
                            <span className="font-medium">{p.nombre}</span>
                            <span className="text-gray-400 ml-2 text-xs">[{p.codigo}]</span>
                            {p.tipo === 'Medicamento' && <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">Med</span>}
                          </span>
                          <span className="text-gray-500 text-xs">L {p.costo?.toFixed(2) ?? '0.00'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Tabla de ítems ── */}
              {items.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">Ítems ({items.length})</p>
                    <p className="text-sm text-gray-500">Total: <span className="font-bold text-gray-900">{fmt(totalItems)}</span></p>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Lote</th>
                          <th className="px-3 py-2 text-center">F. Vence</th>
                          <th className="px-3 py-2 text-right">Costo</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Importe</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((it, idx) => {
                          const esMed = productos.find(p => p.id === it.producto_id)?.tipo === 'Medicamento'
                          return (
                            <tr key={idx} className="hover:bg-orange-50">
                              <td className="px-3 py-2 font-medium">{it.nombre_producto}</td>
                              <td className="px-3 py-2">
                                {esMed
                                  ? <input
                                      className="w-20 border rounded px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-orange-300"
                                      placeholder="Lote"
                                      value={it.lote}
                                      onChange={e => actualizarItem(idx,'lote',e.target.value)}
                                    />
                                  : <span className="text-gray-400">N/A</span>
                                }
                              </td>
                              <td className="px-3 py-2">
                                {esMed
                                  ? <input
                                      type="date"
                                      className="w-32 border rounded px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-orange-300"
                                      value={it.fecha_vencimiento}
                                      onChange={e => actualizarItem(idx,'fecha_vencimiento',e.target.value)}
                                    />
                                  : <span className="text-gray-400">N/A</span>
                                }
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" min="0" step="0.01"
                                  className="w-20 border rounded px-1.5 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-orange-300"
                                  value={it.precio_costo}
                                  onChange={e => actualizarItem(idx,'precio_costo',parseFloat(e.target.value)||0)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" min="1"
                                  className="w-16 border rounded px-1.5 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-orange-300"
                                  value={it.cantidad}
                                  onChange={e => actualizarItem(idx,'cantidad',parseInt(e.target.value)||1)}
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">L {it.importe.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                <button onClick={() => quitarItem(idx)} className="p-1 rounded hover:bg-red-100 text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Forma de pago ── */}
              {items.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Forma de Pago</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 flex items-center gap-1"><Banknote className="w-3.5 h-3.5"/>Contado</label>
                      <input
                        type="number" min="0" step="0.01"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                        value={pagoContado}
                        onChange={e => {
                          const v = parseFloat(e.target.value)||0
                          setPagoContado(v)
                          setPagoCredito(Math.max(0, totalItems - v))
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5"/>Crédito</label>
                      <input
                        type="number" min="0" step="0.01"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                        value={pagoCredito}
                        onChange={e => {
                          const v = parseFloat(e.target.value)||0
                          setPagoCredito(v)
                          setPagoContado(Math.max(0, totalItems - v))
                        }}
                      />
                    </div>
                  </div>
                  <div className={`mt-3 p-2 rounded-lg text-sm font-semibold flex justify-between ${Math.abs(diferencia) < 0.01 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>Total: {fmt(totalItems)}</span>
                    <span>{Math.abs(diferencia) < 0.01 ? '✓ Cuadra' : `Diferencia: L ${diferencia.toFixed(2)}`}</span>
                  </div>
                </div>
              )}

              {msgError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {msgError}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50">
              <button
                onClick={() => { setModalNueva(false); resetForm() }}
                className="px-5 py-2 border rounded-xl text-sm font-semibold hover:bg-gray-100"
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                onClick={guardarCompra}
                disabled={guardando || items.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition"
              >
                {guardando ? 'Registrando...' : <><Check className="w-4 h-4" />Registrar Compra</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL DETALLE COMPRA
      ══════════════════════════════════════════════════════════════ */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <p className="font-bold text-lg">{modalDetalle.numero}</p>
                <p className="text-sm text-gray-500">{modalDetalle.proveedor_nombre} — {fmtDate(modalDetalle.fecha)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => imprimirOrden(modalDetalle)} className="p-2 rounded-lg hover:bg-gray-100">
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setModalDetalle(null)} className="p-2 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Estado:</span> <EstadoBadge estado={modalDetalle.estado} /></div>
                <div><span className="text-gray-500">Tipo costo:</span> {modalDetalle.tipo_costo === 'proveedor' ? 'Proveedor' : 'Por defecto'}</div>
                {modalDetalle.numero_factura_proveedor && (
                  <div className="col-span-2"><span className="text-gray-500">Factura proveedor:</span> {modalDetalle.numero_factura_proveedor}</div>
                )}
                {modalDetalle.nota && (
                  <div className="col-span-2"><span className="text-gray-500">Nota:</span> {modalDetalle.nota}</div>
                )}
              </div>

              <table className="w-full text-sm border rounded-xl overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-center">Lote</th>
                    <th className="px-3 py-2 text-center">Vence</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {modalDetalle.compra_detalles.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{d.nombre_producto}</td>
                      <td className="px-3 py-2 text-center text-xs">{d.lote || '—'}</td>
                      <td className="px-3 py-2 text-center text-xs">{d.fecha_vencimiento && d.fecha_vencimiento !== 'N/A' ? fmtDate(d.fecha_vencimiento) : '—'}</td>
                      <td className="px-3 py-2 text-right">L {d.precio_costo.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{d.cantidad}</td>
                      <td className="px-3 py-2 text-right font-semibold">L {d.importe.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between text-sm bg-gray-50 rounded-xl p-3">
                <span>Contado: <b>{fmt(modalDetalle.contado)}</b></span>
                <span>Crédito: <b className="text-red-600">{fmt(modalDetalle.credito)}</b></span>
                <span>Total: <b className="text-orange-700">{fmt(modalDetalle.total)}</b></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL ABONAR CXP
      ══════════════════════════════════════════════════════════════ */}
      {modalAbonar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold">Abonar a CXP</h3>
              <button onClick={() => setModalAbonar(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                <p><b>Proveedor:</b> {modalAbonar.proveedor_nombre}</p>
                <p><b>Total:</b> {fmt(modalAbonar.monto_total)}</p>
                <p><b>Ya pagado:</b> {fmt(modalAbonar.monto_pagado)}</p>
                <p className="text-red-700 font-semibold"><b>Saldo:</b> {fmt(modalAbonar.saldo)}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Monto del Abono</label>
                <input
                  type="number" min="0.01" step="0.01" max={modalAbonar.saldo}
                  className="mt-1 w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  value={montoAbono}
                  onChange={e => setMontoAbono(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => setModalAbonar(null)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button
                onClick={confirmarAbono}
                disabled={abonando}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {abonando ? 'Guardando...' : 'Confirmar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
