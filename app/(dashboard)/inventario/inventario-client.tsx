'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useConfirm } from '@/components/confirm-dialog'
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, X,
  Save, Edit2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  CheckCircle2, AlertCircle, Boxes, Truck, Printer,
  Calendar, ClipboardList, History, BarChart3, PackagePlus
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost, ModuleBtnPrimary } from '@/components/module-layout'
import InventarioEjecutivoPanel from '@/components/inventario/inventario-ejecutivo-panel'
import InventarioAlertasPanel from '@/components/inventario/inventario-alertas-panel'
import InventarioReposicionPanel from '@/components/inventario/inventario-reposicion-panel'
import InventarioConteoPanel from '@/components/inventario/inventario-conteo-panel'
import {
  generarAlertasInventario,
  sugerirReposicion,
  type ProductoPro,
  type StockPro,
  type MovimientoInventarioPro,
} from '@/lib/inventario-profesional'

/* ─── tipos ─────────────────────────────────────────────── */
interface Categoria { id: number; nombre: string; tabla: string }
interface Sucursal  { id: number; nombre: string }
interface Proveedor { id: number; nombre: string; telefono1?: string; correo?: string; activo: boolean }

interface Producto {
  id: number; codigo: string; nombre: string; nombre_generico?: string
  laboratorio?: string; categoria?: string; unidad?: string
  tipo: 'Medicamento' | 'Producto' | 'Insumo'
  es_antibiotico: boolean; costo: number; precio_venta: number
  stock_minimo: number; activo: boolean
  precio_minimo?: number; proveedor_preferido_id?: number | null; dias_reposicion?: number
  codigo_barra?: string; principio_activo?: string; concentracion?: string
  presentacion?: string; marca?: string; requiere_receta?: boolean
  es_controlado?: boolean; gravado?: boolean; facturable?: boolean
}

interface StockRow {
  id: number; producto_id: number; sucursal_id: number
  lote?: string; fecha_vencimiento?: string; cantidad: number
  costo_unitario?: number; bloqueado?: boolean
  producto?: { id: number; nombre: string; codigo: string; tipo: string; stock_minimo: number; unidad: string; costo?: number; precio_venta?: number; precio_minimo?: number; proveedor_preferido_id?: number | null; dias_reposicion?: number }
  sucursal?: { id: number; nombre: string }
}

interface Movimiento {
  id: number; producto_id?: number; sucursal_id?: number; tipo: string; cantidad: number; motivo?: string
  lote?: string; fecha_vencimiento?: string; fecha: string; hora?: string
  referencia_tipo?: string; nota?: string; created_at?: string
  producto?: { nombre: string; codigo: string }
  sucursal?: { nombre: string }
}

interface Props {
  productos:       Producto[]
  inventario:      StockRow[]
  movimientos:     Movimiento[]
  sucursales:      Sucursal[]
  proveedores:     Proveedor[]
  categorias:      Categoria[]
  userId:          string
  sucursalUsuario: number | null
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function hoy() { return new Date().toISOString().split('T')[0] }

/* badge de vencimiento */
function badgeVenc(fecha?: string) {
  if (!fecha) return null
  const dias = Math.floor((new Date(fecha).getTime() - new Date().getTime()) / 86400000)
  if (dias < 0)  return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Vencido</span>
  if (dias <= 30) return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Vence en {dias}d</span>
  if (dias <= 90) return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Vence en {dias}d</span>
  return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{fecha}</span>
}

/* ═══════════════════════════════════════════════════════ */
export default function InventarioClient({
  productos: initProd, inventario: initInv, movimientos: initMovs,
  sucursales, proveedores: initProvs, categorias, userId, sucursalUsuario,
}: Props) {
  const supabase = sb()
  const confirmDialog = useConfirm()
  const [tab, setTab]       = useState<'ejecutivo' | 'stock' | 'alertas' | 'reposicion' | 'conteo' | 'vencer' | 'kardex' | 'productos' | 'proveedores'>('ejecutivo')
  const [isPending, start]  = useTransition()

  /* filtros stock */
  const [busq,      setBusq]      = useState('')
  const [filtroSuc, setFiltroSuc] = useState(sucursalUsuario ? String(sucursalUsuario) : '')
  const [soloAlertas, setSoloAlertas] = useState(false)

  /* datos en estado */
  const [productos,   setProductos]   = useState<Producto[]>(initProd)
  const [inventario,  setInventario]  = useState<StockRow[]>(initInv)
  const [movimientos, setMovimientos] = useState<Movimiento[]>(initMovs)
  const [proveedores, setProveedores] = useState<Proveedor[]>(initProvs)

  /* modales */
  const [modalProd,    setModalProd]    = useState(false)
  const [modalMov,     setModalMov]     = useState(false)
  const [modalProv,    setModalProv]    = useState(false)
  const [modalTransf,  setModalTransf]  = useState(false)
  const [prodActual,   setProdActual]   = useState<Producto | null>(null)
  const [provActual,   setProvActual]   = useState<Proveedor | null>(null)
  const [errorMsg,     setErrorMsg]     = useState('')
  const [loadingForm,  setLoadingForm]  = useState(false)

  /* formulario producto */
  const prodVacio = {
    codigo: '', nombre: '', nombre_generico: '', laboratorio: '',
    categoria: 'Medicamentos', unidad: 'Unidad', tipo: 'Medicamento' as const,
    es_antibiotico: false, costo: '', precio_venta: '', stock_minimo: '5', activo: true,
  }
  const [formProd, setFormProd] = useState(prodVacio)

  /* formulario movimiento (entrada / salida / ajuste) */
  const movVacio = {
    tipo: 'ENTRADA' as 'ENTRADA' | 'SALIDA' | 'AJUSTE',
    producto_id: '', sucursal_id: String(sucursalUsuario || ''),
    cantidad: '', lote: '', fecha_vencimiento: '',
    motivo: '', nota: '',
  }
  const [formMov, setFormMov] = useState(movVacio)

  /* stock actual del producto seleccionado en el modal */
  const [stockActualMov, setStockActualMov] = useState<number | null>(null)
  const [cargandoStock,  setCargandoStock]  = useState(false)

  /* ref para imprimir */
  const printRef = useRef<HTMLDivElement>(null)

  /* formulario transferencia */
  const transfVacio = {
    producto_id: '', sucursal_origen: String(sucursalUsuario || ''),
    sucursal_destino: '', cantidad: '', lote: '', nota: '',
  }
  const [formTransf, setFormTransf] = useState(transfVacio)

  /* formulario proveedor */
  const provVacio = { nombre: '', codigo: '', direccion: '', telefono1: '', telefono2: '', correo: '', vendedor: '', rtn: '', nota: '', activo: true }
  const [formProv, setFormProv] = useState(provVacio)

  /* ── consultar stock actual cuando cambia producto o sucursal en el modal ─ */
  async function consultarStockActual(productoId: string, sucursalId: string) {
    if (!productoId || !sucursalId) { setStockActualMov(null); return }
    setCargandoStock(true)
    const { data } = await supabase
      .from('inventario')
      .select('cantidad')
      .eq('producto_id', Number(productoId))
      .eq('sucursal_id', Number(sucursalId))
    const total = (data || []).reduce((s, r) => s + (r.cantidad || 0), 0)
    setStockActualMov(total)
    setCargandoStock(false)
  }

  /* ── imprimir inventario ─ */
  function imprimirInventario() {
    const contenido = printRef.current
    if (!contenido) return
    const ventana = window.open('', '_blank', 'width=900,height=700')
    if (!ventana) return
    const fecha = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })
    ventana.document.write(`
      <html><head><title>Inventario — ${fecha}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
        h1  { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        p.sub { font-size: 11px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        tr:nth-child(even) td { background: #f9fafb; }
        .ok   { color: #16a34a; font-weight: bold; }
        .warn { color: #d97706; font-weight: bold; }
        .red  { color: #dc2626; font-weight: bold; }
        .right { text-align: right; }
        .mono { font-family: monospace; }
        .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; }
        @page { size: Letter landscape; margin: 1.5cm; }
      </style></head><body>
      <h1>📦 Reporte de Inventario</h1>
      <p class="sub">Generado el ${fecha} · Sistema Clínica Jerusalén</p>
      ${contenido.innerHTML}
      <p class="footer">Impreso desde el Sistema de Clínica Jerusalén v2.0</p>
      </body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 400)
  }

  /* ── recargar todo ─ */
  async function recargar() {
    const [{ data: p }, { data: i }, { data: m }, { data: pr }] = await Promise.all([
      supabase.from('productos').select('*').order('nombre'),
      supabase.from('inventario').select('*, producto:productos(id,nombre,codigo,tipo,stock_minimo,unidad,costo,precio_venta,precio_minimo,proveedor_preferido_id,dias_reposicion), sucursal:sucursales(id,nombre)').order('fecha_vencimiento'),
      supabase.from('inventario_movimientos').select('*, producto:productos(nombre,codigo), sucursal:sucursales(nombre)').order('created_at', { ascending: false }).limit(100),
      supabase.from('proveedores').select('*').order('nombre'),
    ])
    if (p)  setProductos(p)
    if (i)  setInventario(i)
    if (m)  setMovimientos(m)
    if (pr) setProveedores(pr)
  }

  /* ── stock consolidado por producto + sucursal ─ */
  const stockConsolidado = useMemo(() => {
    const mapa = new Map<string, {
      producto: StockRow['producto']; sucursal: StockRow['sucursal']
      totalCantidad: number; lotes: StockRow[]
    }>()
    for (const row of inventario) {
      const key = `${row.producto_id}-${row.sucursal_id}`
      if (!mapa.has(key)) {
        mapa.set(key, { producto: row.producto, sucursal: row.sucursal, totalCantidad: 0, lotes: [] })
      }
      const entry = mapa.get(key)!
      entry.totalCantidad += row.cantidad
      entry.lotes.push(row)
    }
    return Array.from(mapa.values())
  }, [inventario])

  /* ── filtrar stock ─ */
  const stockFiltrado = useMemo(() => {
    return stockConsolidado.filter(r => {
      if (filtroSuc && String(r.sucursal?.id) !== filtroSuc) return false
      if (busq && !r.producto?.nombre.toLowerCase().includes(busq.toLowerCase()) &&
          !r.producto?.codigo.toLowerCase().includes(busq.toLowerCase())) return false
      if (soloAlertas && r.totalCantidad > (r.producto?.stock_minimo ?? 5)) return false
      return true
    })
  }, [stockConsolidado, filtroSuc, busq, soloAlertas])

  const [diasAlerta,   setDiasAlerta]   = useState(90)   // umbral configurable
  const [filtroVencSuc, setFiltroVencSuc] = useState('')
  const printVencRef = useRef<HTMLDivElement>(null)

  /* ── alertas ─ */
  const totalAlertas = useMemo(() =>
    stockConsolidado.filter(r => r.totalCantidad <= (r.producto?.stock_minimo ?? 5)).length
  , [stockConsolidado])

  const alertasProfesionales = useMemo(() => generarAlertasInventario({
    stock: inventario as StockPro[],
    productos: productos as ProductoPro[],
    movimientos: movimientos as MovimientoInventarioPro[],
    diasVencimiento: diasAlerta,
    diasSinMovimiento: 60,
  }), [inventario, productos, movimientos, diasAlerta])

  const reposicionSugerida = useMemo(() => sugerirReposicion({
    stock: inventario as StockPro[],
    productos: productos as ProductoPro[],
    movimientos: movimientos as MovimientoInventarioPro[],
    sucursalId: filtroSuc ? Number(filtroSuc) : null,
  }), [inventario, productos, movimientos, filtroSuc])

  /* ── guardar producto ─ */
  async function guardarProducto() {
    setErrorMsg('')
    if (!formProd.nombre.trim() || !formProd.codigo.trim()) {
      setErrorMsg('Código y nombre son obligatorios'); return
    }
    setLoadingForm(true)
    const payload = {
      codigo: formProd.codigo.trim(), nombre: formProd.nombre.trim(),
      nombre_generico: formProd.nombre_generico || null,
      laboratorio: formProd.laboratorio || null,
      categoria: formProd.categoria, unidad: formProd.unidad,
      tipo: formProd.tipo, es_antibiotico: formProd.es_antibiotico,
      costo: Number(formProd.costo || 0), precio_venta: Number(formProd.precio_venta || 0),
      stock_minimo: Number(formProd.stock_minimo || 5), activo: formProd.activo,
    }
    let error
    if (prodActual) {
      ({ error } = await supabase.from('productos').update(payload).eq('id', prodActual.id))
    } else {
      ({ error } = await supabase.from('productos').insert(payload))
    }
    setLoadingForm(false)
    if (error) { setErrorMsg(error.message); return }
    setModalProd(false); setProdActual(null); setFormProd(prodVacio)
    start(() => { recargar() })
  }

  /* ── registrar movimiento (entrada/salida/ajuste) ─ */
  async function registrarMovimiento() {
    setErrorMsg('')
    if (!formMov.producto_id || !formMov.sucursal_id || !formMov.cantidad) {
      setErrorMsg('Producto, sucursal y cantidad son obligatorios'); return
    }
    const cant    = Number(formMov.cantidad)
    const prodId  = Number(formMov.producto_id)
    const sucId   = Number(formMov.sucursal_id)
    const lote    = formMov.lote.trim() || ''
    const fechaV  = formMov.fecha_vencimiento || null
    const prod    = productos.find(p => p.id === prodId)

    if (formMov.tipo === 'SALIDA') {
      const { confirmed } = await confirmDialog({
        title: 'Registrar salida',
        message: `¿Registrar salida de ${cant} unidades del inventario?`,
        variant: 'warning',
        confirmLabel: 'Registrar salida',
        details: prod ? [{ label: 'Producto', value: prod.nombre }] : undefined,
      })
      if (!confirmed) return
    }

    setLoadingForm(true)

    // 1. Buscar o crear fila de inventario
    const { data: existing } = await supabase
      .from('inventario')
      .select('id, cantidad')
      .eq('producto_id', prodId)
      .eq('sucursal_id', sucId)
      .eq('lote', lote)
      .is('fecha_vencimiento', fechaV ? null : null)   // ver abajo
      .maybeSingle()

    // workaround: query directa sin .is() por campo nullable
    const { data: rows } = await supabase
      .from('inventario')
      .select('id, cantidad')
      .eq('producto_id', prodId)
      .eq('sucursal_id', sucId)
      .eq('lote', lote)

    const match = rows?.find(r => {
      if (fechaV) return (r as unknown as StockRow).fecha_vencimiento === fechaV
      return !(r as unknown as StockRow).fecha_vencimiento
    }) as (typeof rows extends Array<infer T> ? T : never) & { cantidad: number } | undefined

    const cantAntes   = match?.cantidad ?? 0
    let   cantDespues = cantAntes

    if (formMov.tipo === 'ENTRADA') cantDespues = cantAntes + cant
    else if (formMov.tipo === 'SALIDA') {
      if (cant > cantAntes) { setErrorMsg(`Stock insuficiente. Disponible: ${cantAntes}`); setLoadingForm(false); return }
      cantDespues = cantAntes - cant
    } else {
      cantDespues = cant  // AJUSTE = valor absoluto
    }

    // 2. Upsert inventario
    if (match) {
      const { error: errInv } = await supabase.from('inventario').update({ cantidad: cantDespues }).eq('id', (match as { id: number }).id)
      if (errInv) { setErrorMsg(errInv.message); setLoadingForm(false); return }
    } else {
      const { error: errInv } = await supabase.from('inventario').insert({
        producto_id: prodId, sucursal_id: sucId,
        lote, fecha_vencimiento: fechaV, cantidad: cantDespues,
      })
      if (errInv) { setErrorMsg(errInv.message); setLoadingForm(false); return }
    }

    // 3. Registrar en kardex
    const { error: errKardex } = await supabase.from('inventario_movimientos').insert({
      producto_id: prodId, sucursal_id: sucId,
      tipo: formMov.tipo,
      cantidad: formMov.tipo === 'SALIDA' ? -cant : cant,
      cantidad_antes: cantAntes, cantidad_despues: cantDespues,
      lote: lote || null, fecha_vencimiento: fechaV,
      motivo: formMov.motivo || formMov.tipo,
      nota: formMov.nota || null,
      usuario_id: userId, fecha: hoy(),
    })
    if (errKardex) { setErrorMsg(errKardex.message); setLoadingForm(false); return }

    setLoadingForm(false)
    setModalMov(false); setFormMov(movVacio)
    start(() => { recargar() })
  }

  /* ── transferencia entre sucursales ─ */
  async function registrarTransferencia() {
    setErrorMsg('')
    const { producto_id, sucursal_origen, sucursal_destino, cantidad, lote, nota } = formTransf
    if (!producto_id || !sucursal_origen || !sucursal_destino || !cantidad) {
      setErrorMsg('Todos los campos obligatorios'); return
    }
    if (sucursal_origen === sucursal_destino) {
      setErrorMsg('Origen y destino no pueden ser la misma sucursal'); return
    }
    const cant   = Number(cantidad)
    const prodId = Number(producto_id)
    const srcId  = Number(sucursal_origen)
    const dstId  = Number(sucursal_destino)
    const prod   = productos.find(p => p.id === prodId)
    const sucOr  = sucursales.find(s => s.id === srcId)
    const sucDe  = sucursales.find(s => s.id === dstId)

    const { confirmed } = await confirmDialog({
      title: 'Transferir inventario',
      message: `¿Está seguro que desea transferir ${cant} unidades de "${prod?.nombre ?? 'este producto'}" a la sucursal ${sucDe?.nombre ?? dstId}?`,
      variant: 'warning',
      confirmLabel: 'Transferir',
      details: [
        { label: 'Producto', value: prod?.nombre ?? String(prodId) },
        { label: 'Origen', value: sucOr?.nombre ?? String(srcId) },
        { label: 'Destino', value: sucDe?.nombre ?? String(dstId) },
        { label: 'Cantidad', value: String(cant) },
      ],
    })
    if (!confirmed) return

    setLoadingForm(true)

    const loteVal = lote || null

    // Stock origen (lote vacío == NULL en inventario)
    let origenQ = supabase
      .from('inventario').select('id, cantidad, fecha_vencimiento')
      .eq('producto_id', prodId).eq('sucursal_id', srcId)
    origenQ = loteVal ? origenQ.eq('lote', loteVal) : origenQ.is('lote', null)
    const { data: origenRows } = await origenQ

    const origenRow = origenRows?.[0] as (StockRow & { id: number }) | undefined
    if (!origenRow || origenRow.cantidad < cant) {
      setErrorMsg(`Stock insuficiente en origen. Disponible: ${origenRow?.cantidad ?? 0}`)
      setLoadingForm(false); return
    }

    // Descontar origen
    await supabase.from('inventario').update({ cantidad: origenRow.cantidad - cant }).eq('id', origenRow.id)

    // Sumar destino
    let destQ = supabase
      .from('inventario').select('id, cantidad')
      .eq('producto_id', prodId).eq('sucursal_id', dstId)
    destQ = loteVal ? destQ.eq('lote', loteVal) : destQ.is('lote', null)
    const { data: destRows } = await destQ
    const destRow = destRows?.[0] as (StockRow & { id: number }) | undefined
    if (destRow) {
      await supabase.from('inventario').update({ cantidad: destRow.cantidad + cant }).eq('id', destRow.id)
    } else {
      await supabase.from('inventario').insert({
        producto_id: prodId, sucursal_id: dstId, lote: loteVal,
        fecha_vencimiento: origenRow.fecha_vencimiento, cantidad: cant,
      })
    }

    // Kardex doble (salida origen / entrada destino)
    await supabase.from('inventario_movimientos').insert([
      { producto_id: prodId, sucursal_id: srcId, tipo: 'TRANSFERENCIA', cantidad: -cant,
        cantidad_antes: origenRow.cantidad, cantidad_despues: origenRow.cantidad - cant,
        lote: lote || null, motivo: `Transferencia a sucursal ${dstId}`,
        sucursal_destino: dstId, nota: nota || null, usuario_id: userId, fecha: hoy() },
      { producto_id: prodId, sucursal_id: dstId, tipo: 'TRANSFERENCIA', cantidad: cant,
        cantidad_antes: destRow?.cantidad ?? 0, cantidad_despues: (destRow?.cantidad ?? 0) + cant,
        lote: lote || null, motivo: `Transferencia desde sucursal ${srcId}`,
        sucursal_destino: dstId, nota: nota || null, usuario_id: userId, fecha: hoy() },
    ])

    setLoadingForm(false)
    setModalTransf(false); setFormTransf(transfVacio)
    start(() => { recargar() })
  }

  /* ── guardar proveedor ─ */
  async function guardarProveedor() {
    setErrorMsg('')
    if (!formProv.nombre.trim()) { setErrorMsg('El nombre es obligatorio'); return }
    setLoadingForm(true)
    const payload = { ...formProv }
    let error
    if (provActual) {
      ({ error } = await supabase.from('proveedores').update(payload).eq('id', provActual.id))
    } else {
      ({ error } = await supabase.from('proveedores').insert(payload))
    }
    setLoadingForm(false)
    if (error) { setErrorMsg(error.message); return }
    setModalProv(false); setProvActual(null); setFormProv(provVacio)
    start(() => { recargar() })
  }

  /* ── helpers ─ */
  const cats      = categorias.filter(c => c.tabla === 'categoria')
  const unidades  = categorias.filter(c => c.tabla === 'unidad')
  const prodActivos = productos.filter(p => p.activo)
  const nombreSucursal = (id?: number) => sucursales.find(s => s.id === id)?.nombre ?? (id ? `Sucursal #${id}` : '—')
  const nombreProveedor = (id?: number | null) => proveedores.find(p => p.id === id)?.nombre ?? (id ? `Proveedor #${id}` : '—')

  const tipoColor = (tipo: string) => ({
    ENTRADA:       'bg-green-100 text-green-700',
    SALIDA:        'bg-red-100 text-red-700',
    AJUSTE:        'bg-blue-100 text-blue-700',
    TRANSFERENCIA: 'bg-purple-100 text-purple-700',
    VENTA:         'bg-orange-100 text-orange-700',
    CONSUMO:       'bg-gray-100 text-gray-600',
  }[tipo] || 'bg-gray-100 text-gray-600')

  /* ── vencimientos ─ */
  const vencimientos = useMemo(() => {
    const hoyTs = new Date().getTime()
    return inventario
      .filter(r => r.fecha_vencimiento && r.cantidad > 0)
      .map(r => {
        const dias = Math.floor((new Date(r.fecha_vencimiento!).getTime() - hoyTs) / 86400000)
        return { ...r, dias }
      })
      .filter(r => r.dias <= diasAlerta)
      .sort((a, b) => a.dias - b.dias)
  }, [inventario, diasAlerta])

  const vencimientosFiltrados = useMemo(() =>
    filtroVencSuc
      ? vencimientos.filter(r => String(r.sucursal?.id) === filtroVencSuc)
      : vencimientos
  , [vencimientos, filtroVencSuc])

  // Agrupados por sucursal para mostrar secciones
  const vencPorSucursal = useMemo(() => {
    const mapa = new Map<string, typeof vencimientos>()
    for (const r of vencimientosFiltrados) {
      const key = r.sucursal?.nombre || 'Sin sucursal'
      if (!mapa.has(key)) mapa.set(key, [])
      mapa.get(key)!.push(r)
    }
    return Array.from(mapa.entries())
  }, [vencimientosFiltrados])

  function colorDias(dias: number) {
    if (dias < 0)   return { fila: 'bg-red-50',    badge: 'bg-red-100 text-red-800',    texto: 'Vencido' }
    if (dias <= 30) return { fila: 'bg-red-50',    badge: 'bg-red-100 text-red-700',    texto: `Vence en ${dias}d` }
    if (dias <= 60) return { fila: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', texto: `Vence en ${dias}d` }
    return              { fila: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700', texto: `Vence en ${dias}d` }
  }

  function imprimirVencimientos() {
    const contenido = printVencRef.current
    if (!contenido) return
    const ventana = window.open('', '_blank', 'width=900,height=700')
    if (!ventana) return
    const fecha = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })
    ventana.document.write(`
      <html><head><title>Medicamentos por Vencer — ${fecha}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box }
        body { font-family:Arial,sans-serif; font-size:12px; color:#111; padding:20px }
        h1   { font-size:18px; font-weight:bold; margin-bottom:4px }
        h2   { font-size:13px; font-weight:bold; background:#1e3a5f; color:#fff; padding:5px 8px; margin:14px 0 4px }
        p.sub { font-size:11px; color:#555; margin-bottom:12px }
        table { width:100%; border-collapse:collapse }
        th { background:#374151; color:#fff; padding:5px 8px; text-align:left; font-size:11px }
        td { padding:5px 8px; border-bottom:1px solid #e5e7eb; font-size:11px }
        tr:nth-child(even) td { background:#f9fafb }
        .vencido { color:#dc2626; font-weight:bold }
        .pronto  { color:#ea580c; font-weight:bold }
        .alerta  { color:#d97706; font-weight:bold }
        .right   { text-align:right }
        .mono    { font-family:monospace }
        .footer  { margin-top:20px; font-size:10px; color:#9ca3af }
        @page { size:Letter landscape; margin:1.5cm }
      </style></head><body>
      <h1>⚠️ Medicamentos y Productos por Vencer</h1>
      <p class="sub">Próximos ${diasAlerta} días · Generado el ${fecha} · Sistema Clínica Jerusalén</p>
      ${contenido.innerHTML}
      <p class="footer">Impreso desde el Sistema de Clínica Jerusalén v2.0</p>
      </body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 400)
  }

  const TABS = [
    { key: 'ejecutivo',  label: 'Ejecutivo',       icon: BarChart3 },
    { key: 'stock',       label: 'Stock Actual',   icon: Boxes },
    { key: 'alertas',     label: 'Alertas',        icon: AlertTriangle },
    { key: 'reposicion',  label: 'Reposición',     icon: PackagePlus },
    { key: 'conteo',      label: 'Conteo Físico',  icon: ClipboardList },
    { key: 'vencer',      label: 'Por Vencer',     icon: Calendar },
    { key: 'kardex',      label: 'Kardex',          icon: History },
    { key: 'productos',   label: 'Catálogo',        icon: ClipboardList },
    { key: 'proveedores', label: 'Proveedores',     icon: Truck },
  ] as const

  /* ═══════════════ JSX ════════════════════════════════════ */
  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Inventario"
        subtitle="Medicamentos, productos e insumos"
        badge="Almacén y stock"
        icon={Package}
        kpis={[
          { label: 'Productos activos', value: productos.filter(p=>p.activo).length, icon: Boxes, onClick: () => setTab('productos') },
          { label: 'Lotes en stock', value: inventario.filter(r=>r.cantidad>0).length, icon: Package, onClick: () => setTab('stock') },
          { label: 'Stock bajo', value: totalAlertas, icon: AlertTriangle, onClick: () => { setSoloAlertas(true); setTab('stock') } },
          { label: `Por vencer (≤${diasAlerta}d)`, value: vencimientos.length, icon: Calendar, onClick: () => setTab('vencer') },
        ]}
        actions={
          <>
            <ModuleBtnGhost onClick={() => start(() => recargar())}>
              <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
            </ModuleBtnGhost>
            {tab === 'stock' && (
              <>
                <ModuleBtnPrimary onClick={() => { setFormMov(movVacio); setStockActualMov(null); setErrorMsg(''); setModalMov(true) }}>
                  <ArrowDownToLine className="w-4 h-4" /> Entrada
                </ModuleBtnPrimary>
                <ModuleBtnGhost onClick={() => { setFormMov({ ...movVacio, tipo: 'SALIDA' }); setStockActualMov(null); setErrorMsg(''); setModalMov(true) }}>
                  <ArrowUpFromLine className="w-4 h-4" /> Salida
                </ModuleBtnGhost>
              </>
            )}
            {tab === 'productos' && (
              <ModuleBtnPrimary onClick={() => { setProdActual(null); setFormProd(prodVacio); setErrorMsg(''); setModalProd(true) }}>
                <Plus className="w-4 h-4" /> Nuevo Producto
              </ModuleBtnPrimary>
            )}
          </>
        }
      />
      <ModuleContent>

      {/* tabs */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.key === 'stock' && totalAlertas > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                  {totalAlertas}
                </span>
              )}
              {t.key === 'alertas' && alertasProfesionales.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                  {alertasProfesionales.filter(a => a.prioridad === 'alta').length || alertasProfesionales.length}
                </span>
              )}
              {t.key === 'reposicion' && reposicionSugerida.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-semibold">
                  {reposicionSugerida.length}
                </span>
              )}
              {t.key === 'vencer' && vencimientos.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold">
                  {vencimientos.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ══ TAB EJECUTIVO ══ */}
          {tab === 'ejecutivo' && (
            <InventarioEjecutivoPanel
              productos={productos as ProductoPro[]}
              inventario={inventario as StockPro[]}
              movimientos={movimientos as MovimientoInventarioPro[]}
              alertas={alertasProfesionales}
              reposicion={reposicionSugerida}
              onIrAlertas={() => setTab('alertas')}
              onIrReposicion={() => setTab('reposicion')}
            />
          )}

          {/* ══ TAB ALERTAS ══ */}
          {tab === 'alertas' && (
            <InventarioAlertasPanel
              alertas={alertasProfesionales}
              onIrStockBajo={() => { setSoloAlertas(true); setTab('stock') }}
            />
          )}

          {/* ══ TAB REPOSICIÓN ══ */}
          {tab === 'reposicion' && (
            <InventarioReposicionPanel
              sugerencias={reposicionSugerida}
              sucursalNombre={nombreSucursal}
              proveedorNombre={nombreProveedor}
              onRecargar={recargar}
            />
          )}

          {/* ══ TAB CONTEO FÍSICO ══ */}
          {tab === 'conteo' && (
            <InventarioConteoPanel
              inventario={inventario as StockPro[]}
              sucursales={sucursales}
              sucursalUsuario={sucursalUsuario}
              userId={userId}
              onRecargar={recargar}
            />
          )}

          {/* ══ TAB STOCK ACTUAL ══ */}
          {tab === 'stock' && (
            <div className="space-y-4">
              {/* filtros */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={busq} onChange={e => setBusq(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={filtroSuc} onChange={e => setFiltroSuc(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button onClick={() => setSoloAlertas(!soloAlertas)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    soloAlertas ? 'bg-red-50 border-red-300 text-red-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <AlertTriangle className="w-4 h-4" />
                  Solo alertas {soloAlertas && `(${totalAlertas})`}
                </button>
                <button onClick={() => { setFormTransf(transfVacio); setErrorMsg(''); setModalTransf(true) }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-sm text-indigo-700 font-medium hover:bg-indigo-100">
                  <ArrowLeftRight className="w-4 h-4" /> Trasladar
                </button>
                <button onClick={imprimirInventario}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>

              {/* tabla oculta para impresión */}
              <div ref={printRef} style={{ display: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th>Categoría</th>
                      <th>Sucursal</th>
                      <th className="right">En existencia</th>
                      <th className="right">Mínimo</th>
                      <th>Lote</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockFiltrado.map((r, i) => {
                      const alerta  = r.totalCantidad <= (r.producto?.stock_minimo ?? 5)
                      const agotado = r.totalCantidad === 0
                      const estadoCls = agotado ? 'red' : alerta ? 'warn' : 'ok'
                      const estadoTxt = agotado ? 'AGOTADO' : alerta ? 'STOCK BAJO' : 'OK'
                      return (
                        <tr key={i}>
                          <td className="mono">{r.producto?.codigo}</td>
                          <td>{r.producto?.nombre}</td>
                          <td>{r.producto?.tipo}</td>
                          <td>{r.producto?.categoria ?? '—'}</td>
                          <td>{r.sucursal?.nombre}</td>
                          <td className={`right ${estadoCls}`}>{r.totalCantidad} {r.producto?.unidad}</td>
                          <td className="right">{r.producto?.stock_minimo}</td>
                          <td className="mono">{r.lotes.map(l => l.lote).filter(Boolean).join(', ') || '—'}</td>
                          <td>{r.lotes.map(l => l.fecha_vencimiento).filter(Boolean).join(', ') || '—'}</td>
                          <td className={estadoCls}>{estadoTxt}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {stockFiltrado.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Sin resultados</p>
                  <p className="text-sm mt-1">Registra entradas de productos para ver el stock</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Sucursal</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Stock</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Mínimo</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Lotes / Venc.</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stockFiltrado.map((r, i) => {
                        const alerta = r.totalCantidad <= (r.producto?.stock_minimo ?? 5)
                        const agotado = r.totalCantidad === 0
                        return (
                          <tr key={i} className={`hover:bg-gray-50 ${agotado ? 'bg-red-50/50' : alerta ? 'bg-amber-50/50' : ''}`}>
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.producto?.codigo}</td>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-gray-900">{r.producto?.nombre}</p>
                              <p className="text-xs text-gray-400">{r.producto?.tipo} · {r.producto?.unidad}</p>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">{r.sucursal?.nombre}</td>
                            <td className={`px-3 py-2.5 text-right font-bold text-base ${agotado ? 'text-red-700' : alerta ? 'text-amber-700' : 'text-green-700'}`}>
                              {r.totalCantidad}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400">{r.producto?.stock_minimo}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {r.lotes.filter(l => l.cantidad > 0).map(l => (
                                  <span key={l.id} className="text-xs text-gray-500">
                                    {l.lote && `Lote ${l.lote} `}{badgeVenc(l.fecha_vencimiento)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {agotado
                                ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">Agotado</span>
                                : alerta
                                  ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-semibold">Stock bajo</span>
                                  : <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">OK</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB POR VENCER ══ */}
          {tab === 'vencer' && (
            <div className="space-y-4">

              {/* controles */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Alertar si vencen en menos de</label>
                  <select value={diasAlerta} onChange={e => setDiasAlerta(Number(e.target.value))}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                    <option value={30}>30 días</option>
                    <option value={60}>60 días</option>
                    <option value={90}>90 días</option>
                    <option value={180}>180 días</option>
                    <option value={365}>1 año</option>
                  </select>
                </div>
                <select value={filtroVencSuc} onChange={e => setFiltroVencSuc(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                  <option value="">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button onClick={imprimirVencimientos}
                  className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 ml-auto">
                  <Printer className="w-4 h-4" /> Imprimir reporte
                </button>
              </div>

              {/* leyenda */}
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span> Vencido o &lt;30 días</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block"></span> 30–60 días</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span> 60–90 días</span>
              </div>

              {/* div oculto para impresión */}
              <div ref={printVencRef} style={{ display: 'none' }}>
                {vencPorSucursal.map(([suc, rows]) => (
                  <div key={suc}>
                    <h2>{suc}</h2>
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th><th>Producto</th><th>Tipo</th>
                          <th className="right">Cantidad</th><th>Lote</th>
                          <th>Fecha vencimiento</th><th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const cls = r.dias < 0 ? 'vencido' : r.dias <= 30 ? 'vencido' : r.dias <= 60 ? 'pronto' : 'alerta'
                          return (
                            <tr key={r.id}>
                              <td className="mono">{r.producto?.codigo}</td>
                              <td>{r.producto?.nombre}</td>
                              <td>{r.producto?.tipo}</td>
                              <td className="right">{r.cantidad} {r.producto?.unidad}</td>
                              <td className="mono">{r.lote || '—'}</td>
                              <td>{r.fecha_vencimiento}</td>
                              <td className={cls}>{r.dias < 0 ? 'VENCIDO' : `Vence en ${r.dias} días`}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
                {vencPorSucursal.length === 0 && <p>No hay productos por vencer en los próximos {diasAlerta} días.</p>}
              </div>

              {/* contenido visual */}
              {vencPorSucursal.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-green-400" />
                  <p className="font-semibold text-gray-600">¡Todo bien!</p>
                  <p className="text-sm mt-1">No hay productos que venzan en los próximos {diasAlerta} días</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {vencPorSucursal.map(([sucNombre, rows]) => (
                    <div key={sucNombre}>
                      {/* cabecera sucursal */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
                        <h3 className="font-bold text-gray-800 text-base">{sucNombre}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {rows.length} {rows.length === 1 ? 'producto' : 'productos'}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Lote</th>
                              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Cantidad</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha vencimiento</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rows.map(r => {
                              const c = colorDias(r.dias)
                              return (
                                <tr key={r.id} className={c.fila}>
                                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.producto?.codigo}</td>
                                  <td className="px-3 py-2.5">
                                    <p className="font-medium text-gray-900">{r.producto?.nombre}</p>
                                    <p className="text-xs text-gray-400">{r.producto?.tipo}</p>
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.lote || '—'}</td>
                                  <td className="px-3 py-2.5 text-right font-bold text-gray-800">
                                    {r.cantidad} <span className="text-xs font-normal text-gray-400">{r.producto?.unidad}</span>
                                  </td>
                                  <td className="px-3 py-2.5 font-medium text-gray-700">{r.fecha_vencimiento}</td>
                                  <td className="px-3 py-2.5">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.badge}`}>
                                      {r.dias < 0 ? '⛔ VENCIDO' : `⚠ ${c.texto}`}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ TAB KARDEX ══ */}
          {tab === 'kardex' && (
            <div className="space-y-3">
              {movimientos.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Sin movimientos registrados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Producto</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Sucursal</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Cantidad</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Antes</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Después</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {movimientos.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{m.fecha}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tipoColor(m.tipo)}`}>{m.tipo}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{m.producto?.nombre}</p>
                            <p className="text-xs text-gray-400 font-mono">{m.producto?.codigo}</p>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{m.sucursal?.nombre}</td>
                          <td className={`px-3 py-2.5 text-right font-bold ${m.cantidad >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {m.cantidad >= 0 ? '+' : ''}{m.cantidad}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{m.cantidad_antes ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600 font-medium">{m.cantidad_despues ?? '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">{m.motivo || m.nota || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB CATÁLOGO ══ */}
          {tab === 'productos' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Costo</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Precio V.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Mín.</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {productos.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{p.codigo}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-gray-900">{p.nombre}</p>
                          {p.nombre_generico && <p className="text-xs text-gray-400">{p.nombre_generico}</p>}
                          {p.es_antibiotico && <span className="text-xs text-orange-600 font-medium">★ Antibiótico</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            p.tipo === 'Medicamento' ? 'bg-blue-100 text-blue-700' :
                            p.tipo === 'Producto'    ? 'bg-green-100 text-green-700' :
                                                       'bg-gray-100 text-gray-600'
                          }`}>{p.tipo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">{p.categoria}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">L. {Number(p.costo).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-800">L. {Number(p.precio_venta).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-400">{p.stock_minimo}</td>
                        <td className="px-3 py-2.5 text-center">
                          {p.activo
                            ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Activo</span>
                            : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inactivo</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => {
                            setProdActual(p)
                            setFormProd({
                              codigo: p.codigo, nombre: p.nombre,
                              nombre_generico: p.nombre_generico || '',
                              laboratorio: p.laboratorio || '',
                              categoria: p.categoria || 'Medicamentos',
                              unidad: p.unidad || 'Unidad', tipo: p.tipo,
                              es_antibiotico: p.es_antibiotico,
                              costo: String(p.costo), precio_venta: String(p.precio_venta),
                              stock_minimo: String(p.stock_minimo), activo: p.activo,
                            })
                            setErrorMsg(''); setModalProd(true)
                          }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {productos.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay productos registrados</p>
                    <p className="text-sm mt-1">Haz clic en "Nuevo Producto" para agregar</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TAB PROVEEDORES ══ */}
          {tab === 'proveedores' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {proveedores.map(p => (
                <div key={p.id} className={`border rounded-xl p-4 ${!p.activo ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{p.nombre}</p>
                      {p.telefono1 && <p className="text-sm text-gray-500 mt-0.5">{p.telefono1}</p>}
                      {p.correo    && <p className="text-xs text-blue-600 mt-0.5">{p.correo}</p>}
                    </div>
                    <button onClick={() => {
                      setProvActual(p)
                      setFormProv({
                        nombre: p.nombre, codigo: p.codigo || '',
                        direccion: '', telefono1: p.telefono1 || '',
                        telefono2: '', correo: p.correo || '',
                        vendedor: '', rtn: '', nota: '', activo: p.activo,
                      })
                      setErrorMsg(''); setModalProv(true)
                    }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-2">
                    {p.activo
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Activo</span>
                      : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inactivo</span>}
                  </div>
                </div>
              ))}
              {proveedores.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-400">
                  <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay proveedores registrados</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════ MODAL PRODUCTO ══════════ */}
      {modalProd && (
        <Modal title={prodActual ? 'Editar Producto' : 'Nuevo Producto'} onClose={() => setModalProd(false)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Código *</label>
                <input value={formProd.codigo} onChange={e => setFormProd(p => ({...p, codigo: e.target.value}))}
                  placeholder="MED001" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
                <select value={formProd.tipo} onChange={e => setFormProd(p => ({...p, tipo: e.target.value as 'Medicamento'|'Producto'|'Insumo'}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option>Medicamento</option><option>Producto</option><option>Insumo</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre comercial *</label>
              <input value={formProd.nombre} onChange={e => setFormProd(p => ({...p, nombre: e.target.value}))}
                placeholder="Amoxicilina 500mg" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre genérico</label>
              <input value={formProd.nombre_generico} onChange={e => setFormProd(p => ({...p, nombre_generico: e.target.value}))}
                placeholder="Amoxicilina" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Laboratorio</label>
                <input value={formProd.laboratorio} onChange={e => setFormProd(p => ({...p, laboratorio: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Unidad</label>
                <select value={formProd.unidad} onChange={e => setFormProd(p => ({...p, unidad: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {unidades.map(u => <option key={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría</label>
              <select value={formProd.categoria} onChange={e => setFormProd(p => ({...p, categoria: e.target.value}))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                {cats.map(c => <option key={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Costo (L.)</label>
                <input type="number" min="0" step="0.01" value={formProd.costo}
                  onChange={e => setFormProd(p => ({...p, costo: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Precio venta (L.)</label>
                <input type="number" min="0" step="0.01" value={formProd.precio_venta}
                  onChange={e => setFormProd(p => ({...p, precio_venta: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock mínimo</label>
                <input type="number" min="0" value={formProd.stock_minimo}
                  onChange={e => setFormProd(p => ({...p, stock_minimo: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={formProd.es_antibiotico}
                  onChange={e => setFormProd(p => ({...p, es_antibiotico: e.target.checked}))} className="rounded" />
                Antibiótico (requiere receta)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={formProd.activo}
                  onChange={e => setFormProd(p => ({...p, activo: e.target.checked}))} className="rounded" />
                Activo
              </label>
            </div>
            {errorMsg && <ErrMsg msg={errorMsg} />}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalProd(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarProducto} disabled={loadingForm}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
                {loadingForm ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> {prodActual ? 'Actualizar' : 'Crear'}</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL MOVIMIENTO ══════════ */}
      {modalMov && (
        <Modal title={
          formMov.tipo === 'ENTRADA' ? 'Entrada de Inventario' :
          formMov.tipo === 'SALIDA'  ? 'Salida de Inventario'  : 'Ajuste de Inventario'
        } onClose={() => { setModalMov(false); setStockActualMov(null) }}>
          <div className="space-y-4">
            {/* tipo */}
            <div className="grid grid-cols-3 gap-2">
              {(['ENTRADA','SALIDA','AJUSTE'] as const).map(t => (
                <button key={t} onClick={() => setFormMov(p => ({...p, tipo: t}))}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    formMov.tipo === t
                      ? t==='ENTRADA' ? 'border-green-500 bg-green-50 text-green-700'
                        : t==='SALIDA' ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500'
                  }`}>
                  {t==='ENTRADA' ? '↓ Entrada' : t==='SALIDA' ? '↑ Salida' : '⟳ Ajuste'}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
              <select value={formMov.producto_id} onChange={e => {
                const v = e.target.value
                setFormMov(p => ({...p, producto_id: v}))
                consultarStockActual(v, formMov.sucursal_id)
              }} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Seleccionar producto —</option>
                {prodActivos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal *</label>
              <select value={formMov.sucursal_id} onChange={e => {
                const v = e.target.value
                setFormMov(p => ({...p, sucursal_id: v}))
                consultarStockActual(formMov.producto_id, v)
              }} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Seleccionar sucursal —</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>

            {/* resumen en tiempo real */}
            {formMov.producto_id && formMov.sucursal_id && (
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
                {cargandoStock ? (
                  <p className="text-sm text-blue-500 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Consultando stock...
                  </p>
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">En existencia</p>
                      <p className="text-2xl font-bold text-gray-700">{stockActualMov ?? 0}</p>
                    </div>
                    <div className="text-2xl text-gray-300">
                      {formMov.tipo === 'ENTRADA' ? '+' : formMov.tipo === 'SALIDA' ? '−' : '='}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">
                        {formMov.tipo === 'ENTRADA' ? 'Ingresando' : formMov.tipo === 'SALIDA' ? 'Retirando' : 'Ajustando a'}
                      </p>
                      <p className={`text-2xl font-bold ${formMov.cantidad ? 'text-blue-700' : 'text-gray-300'}`}>
                        {formMov.cantidad || '0'}
                      </p>
                    </div>
                    <div className="text-2xl text-gray-300">=</div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Quedarán</p>
                      <p className={`text-2xl font-bold ${
                        (() => {
                          const cant = Number(formMov.cantidad || 0)
                          const actual = stockActualMov ?? 0
                          const resultado = formMov.tipo === 'ENTRADA' ? actual + cant
                            : formMov.tipo === 'SALIDA' ? actual - cant : cant
                          return resultado < 0 ? 'text-red-600' : resultado === 0 ? 'text-amber-600' : 'text-green-700'
                        })()
                      }`}>
                        {(() => {
                          const cant = Number(formMov.cantidad || 0)
                          const actual = stockActualMov ?? 0
                          if (formMov.tipo === 'ENTRADA') return actual + cant
                          if (formMov.tipo === 'SALIDA')  return actual - cant
                          return cant  // AJUSTE
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formMov.tipo === 'AJUSTE' ? 'Nueva cantidad total' : 'Cantidad'} *
                </label>
                <input type="number" min="1" value={formMov.cantidad}
                  onChange={e => setFormMov(p => ({...p, cantidad: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg font-bold" />
                {formMov.tipo === 'AJUSTE' && <p className="text-xs text-gray-400 mt-1">Se establecerá como el stock total</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
                <input value={formMov.lote} onChange={e => setFormMov(p => ({...p, lote: e.target.value}))}
                  placeholder="Ej: L-2025-001"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" /> Fecha de vencimiento
              </label>
              <input type="date" value={formMov.fecha_vencimiento}
                onChange={e => setFormMov(p => ({...p, fecha_vencimiento: e.target.value}))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
              <input value={formMov.motivo} onChange={e => setFormMov(p => ({...p, motivo: e.target.value}))}
                placeholder="Ej: Compra a proveedor, Donación, Vencimiento..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            {errorMsg && <ErrMsg msg={errorMsg} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalMov(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={registrarMovimiento} disabled={loadingForm}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2 ${
                  formMov.tipo === 'ENTRADA' ? 'bg-green-600 hover:bg-green-700' :
                  formMov.tipo === 'SALIDA'  ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                {loadingForm ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Registrar</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL TRANSFERENCIA ══════════ */}
      {modalTransf && (
        <Modal title="Traslado entre Sucursales" onClose={() => setModalTransf(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
              <select value={formTransf.producto_id} onChange={e => setFormTransf(p => ({...p, producto_id: e.target.value}))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Seleccionar producto —</option>
                {prodActivos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal origen *</label>
                <select value={formTransf.sucursal_origen} onChange={e => setFormTransf(p => ({...p, sucursal_origen: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">— Origen —</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal destino *</label>
                <select value={formTransf.sucursal_destino} onChange={e => setFormTransf(p => ({...p, sucursal_destino: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">— Destino —</option>
                  {sucursales.filter(s => String(s.id) !== formTransf.sucursal_origen).map(s =>
                    <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
                <input type="number" min="1" value={formTransf.cantidad}
                  onChange={e => setFormTransf(p => ({...p, cantidad: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
                <input value={formTransf.lote} onChange={e => setFormTransf(p => ({...p, lote: e.target.value}))}
                  placeholder="Opcional"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota</label>
              <input value={formTransf.nota} onChange={e => setFormTransf(p => ({...p, nota: e.target.value}))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            {errorMsg && <ErrMsg msg={errorMsg} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalTransf(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={registrarTransferencia} disabled={loadingForm}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
                {loadingForm ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</> : <><ArrowLeftRight className="w-4 h-4" /> Trasladar</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL PROVEEDOR ══════════ */}
      {modalProv && (
        <Modal title={provActual ? 'Editar Proveedor' : 'Nuevo Proveedor'} onClose={() => setModalProv(false)}>
          <div className="space-y-3">
            {[
              { key: 'nombre',    label: 'Nombre *',    ph: 'Distribuidora Médica HN' },
              { key: 'codigo',    label: 'Código',      ph: 'PROV001' },
              { key: 'rtn',       label: 'RTN',         ph: '08011999000000' },
              { key: 'telefono1', label: 'Teléfono 1',  ph: '2200-0000' },
              { key: 'telefono2', label: 'Teléfono 2',  ph: 'Opcional' },
              { key: 'correo',    label: 'Correo',      ph: 'proveedor@ejemplo.com' },
              { key: 'vendedor',  label: 'Vendedor',    ph: 'Nombre del agente' },
              { key: 'direccion', label: 'Dirección',   ph: 'Colonia...' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                <input value={(formProv as Record<string,string|boolean>)[f.key] as string}
                  onChange={e => setFormProv(p => ({...p, [f.key]: e.target.value}))}
                  placeholder={f.ph}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notas</label>
              <textarea value={formProv.nota} onChange={e => setFormProv(p => ({...p, nota: e.target.value}))}
                rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={formProv.activo}
                onChange={e => setFormProv(p => ({...p, activo: e.target.checked}))} className="rounded" />
              Proveedor activo
            </label>
            {errorMsg && <ErrMsg msg={errorMsg} />}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalProv(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarProveedor} disabled={loadingForm}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
                {loadingForm ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> {provActual ? 'Actualizar' : 'Crear'}</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}

/* ── Modal wrapper ── */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* ── Mensaje de error ── */
function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
      <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
    </div>
  )
}
