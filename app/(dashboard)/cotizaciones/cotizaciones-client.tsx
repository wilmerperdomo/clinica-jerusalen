'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardList, Plus, Search, Printer, X, RefreshCw,
  CheckCircle, CheckCircle2, AlertTriangle, Eye, Trash2,
  ArrowRightCircle, Clock, XCircle, Pill, FlaskConical, Stethoscope, DollarSign,
} from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'
import {
  type ItemCotizacion, type SucursalCot, type TipoItemCot,
  fmtCot, calcularTotalesCot, fechaVencimiento,
  estadoEfectivo, siguienteNumeroCot, formatearNumeroCot,
  imprimirCotizacion, VALIDEZ_DIAS_DEFAULT,
  TIPO_ITEM_LABEL, TIPO_ITEM_COLOR,
} from '@/lib/cotizacion-utils'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

/* ══════════════════ TIPOS ════════════════════════════════════ */
interface Sucursal extends SucursalCot {
  cai?: string; fecha_limite?: string
  num_min?: string | number | null; num_max?: string | number | null
  numero_inicial?: string | number | null
}
interface Paciente { id: number; nombre: string; apellido1: string; apellido2?: string; correo?: string }
interface Producto { id: number; codigo: string; nombre: string; precio_venta: number; unidad?: string; categoria?: string; tipo?: string }
interface Servicio { id: number; nombre: string; tipo?: string; precio: number; descripcion?: string }
interface PruebaLab { id: number; nombre: string; costo: number; comision?: number }
interface Correlativo { sucursal_id: number; ultimo_numero: number }

type TabCatalogo = 'medicamentos' | 'laboratorio' | 'servicios'

const TABS_CATALOGO: { id: TabCatalogo; label: string; icon: React.ElementType }[] = [
  { id: 'medicamentos', label: 'Medicamentos', icon: Pill          },
  { id: 'laboratorio',  label: 'Laboratorio',  icon: FlaskConical  },
  { id: 'servicios',    label: 'Servicios',    icon: Stethoscope   },
]

interface Cotizacion {
  id: number; numero: string; fecha: string; hora?: string
  cliente_nombre: string; cliente_rtn?: string; cliente_email?: string
  subtotal: number; por_descuento: number; descuento_monto: number
  isv_monto: number; total: number; estado: string
  nota?: string; validez_dias: number; fecha_vencimiento: string
  factura_id?: number | null; paciente_id?: number | null
  consulta_id?: number | null; sucursal_id: number
  items: ItemCotizacion[]; exento_isv: boolean; cajero_nombre?: string
  sucursal?: { nombre: string } | null
}

interface Props {
  cotizaciones:      Cotizacion[]
  sucursales:        Sucursal[]
  pacientes:         Paciente[]
  productos:         Producto[]
  servicios:         Servicio[]
  pruebasLab:        PruebaLab[]
  cotCorrelativos:   Correlativo[]
  factCorrelativos:  Correlativo[]
  sucursalDefault:   number | null
  cajeroNombre:      string
  hoy:               string
  userId:            string
}

const ESTADO_STYLE: Record<string, string> = {
  PENDIENTE:  'bg-amber-100 text-amber-800',
  ACEPTADA:   'bg-green-100 text-green-800',
  VENCIDA:    'bg-gray-100 text-gray-600',
  POR_COBRAR: 'bg-orange-100 text-orange-800',
  CONVERTIDA: 'bg-blue-100 text-blue-800',
  ANULADA:    'bg-red-100 text-red-700',
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE:  'PENDIENTE',
  ACEPTADA:   'ACEPTADA',
  VENCIDA:    'VENCIDA',
  POR_COBRAR: 'EN CAJA',
  CONVERTIDA: 'CONVERTIDA',
  ANULADA:    'ANULADA',
}

/* ── helpers correlativo fiscal (mismo patrón que facturación) ─ */
function extraerCorrelativo(valor?: string | number | null): number {
  if (valor === undefined || valor === null || valor === '') return 1
  const str = String(valor).trim()
  if (!str) return 1
  if (str.includes('-')) {
    const partes = str.split('-')
    return Number(partes[partes.length - 1]) || 1
  }
  return Number(str) || 1
}

function siguienteNumeroFact(suc: Sucursal, correlativos: Correlativo[]): number {
  const cor = correlativos.find(c => c.sucursal_id === suc.id)
  if (cor) return cor.ultimo_numero + 1
  return extraerCorrelativo(suc.numero_inicial ?? suc.num_min)
}

function formatearNumeroFact(num: number, suc: Sucursal): string {
  const correl = String(num).padStart(8, '0')
  const numMin = suc.num_min != null ? String(suc.num_min).trim() : ''
  if (numMin && numMin.includes('-')) {
    const partes = numMin.split('-')
    if (partes.length >= 3) return `${partes.slice(0, 3).join('-')}-${correl}`
  }
  return `001-001-01-${correl}`
}

/* ════════════════════════════════════════════════════════════ */
export default function CotizacionesClient({
  cotizaciones: init, sucursales, pacientes, productos,
  servicios, pruebasLab,
  cotCorrelativos: initCotCorrs, factCorrelativos: initFactCorrs,
  sucursalDefault, cajeroNombre, hoy, userId,
}: Props) {
  const supabase = createClient()
  const confirmDialog = useConfirm()

  const [lista,       setLista]       = useState<Cotizacion[]>(init)
  const [cotCorrs,    setCotCorrs]    = useState<Correlativo[]>(initCotCorrs)
  const [factCorrs,   setFactCorrs]   = useState<Correlativo[]>(initFactCorrs)
  const [buscar,      setBuscar]      = useState('')
  const [filtroEst,   setFiltroEst]   = useState('')
  const [verCot,      setVerCot]      = useState<Cotizacion | null>(null)
  const [modal,       setModal]       = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [loadingConv, setLoadingConv] = useState(false)
  const [error,       setError]       = useState('')
  const [buscarPac,      setBuscarPac]      = useState('')
  const [tabCatalogo,    setTabCatalogo]    = useState<TabCatalogo>('medicamentos')
  const [buscarCatalogo, setBuscarCatalogo] = useState('')

  const sucDefault = sucursalDefault != null
    ? sucursales.find(s => Number(s.id) === Number(sucursalDefault)) ?? null
    : (sucursales.length > 0 ? sucursales[0] : null)
  const sinSucursal = !sucDefault

  const itemVacio: ItemCotizacion = { descripcion: '', cantidad: 1, precio_unitario: 0, isv_pct: 15, subtotal: 0, tipo: 'MANUAL' }

  const [form, setForm] = useState({
    sucursal_id:    sucDefault?.id ?? 0,
    cliente_nombre: 'CLIENTE GENERAL',
    cliente_rtn:    '',
    cliente_email:  '',
    paciente_id:    0,
    exento_isv:     true,
    por_descuento:  0,
    nota:           '',
    validez_dias:   VALIDEZ_DIAS_DEFAULT,
  })
  const [items, setItems] = useState<ItemCotizacion[]>([{ ...itemVacio }])

  /* ── marcar vencidas automáticamente al cargar ── */
  useEffect(() => {
    const ids = init
      .filter(c =>
        (c.estado === 'PENDIENTE' || c.estado === 'ACEPTADA') &&
        c.fecha_vencimiento < hoy
      )
      .map(c => c.id)
    if (ids.length === 0) return
    supabase
      .from('cotizaciones')
      .update({ estado: 'VENCIDA' })
      .in('id', ids)
      .then(() => {
        setLista(prev => prev.map(c =>
          ids.includes(c.id) ? { ...c, estado: 'VENCIDA' } : c
        ))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sucSeleccionada = sucursales.find(s => s.id === form.sucursal_id) ?? sucDefault

  function recalcularItem(idx: number, field: keyof ItemCotizacion, val: string | number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      updated.subtotal = updated.cantidad * updated.precio_unitario
      return updated
    }))
  }

  function agregarDesdeCatalogo(nuevo: ItemCotizacion) {
    setItems(prev => {
      const idx = prev.findIndex(it =>
        (nuevo.producto_id && it.producto_id === nuevo.producto_id) ||
        (nuevo.lab_id      && it.lab_id      === nuevo.lab_id) ||
        (nuevo.servicio_id && it.servicio_id === nuevo.servicio_id)
      )
      if (idx >= 0) {
        return prev.map((it, i) => {
          if (i !== idx) return it
          const cant = it.cantidad + 1
          return { ...it, cantidad: cant, subtotal: cant * it.precio_unitario }
        })
      }
      const sinVacios = prev.filter(it => it.descripcion.trim())
      return [...sinVacios, nuevo]
    })
    setBuscarCatalogo('')
  }

  function agregarProducto(p: Producto) {
    agregarDesdeCatalogo({
      descripcion:     p.nombre,
      cantidad:        1,
      precio_unitario: p.precio_venta,
      isv_pct:         0, // Medicamento exento por ley (Honduras), sin importar el toggle
      subtotal:        p.precio_venta,
      tipo:            'MEDICAMENTO',
      producto_id:     p.id,
    })
  }

  function agregarPruebaLab(p: PruebaLab) {
    const precio = Number(p.costo) || 0
    agregarDesdeCatalogo({
      descripcion:     p.nombre,
      cantidad:        1,
      precio_unitario: precio,
      isv_pct:         form.exento_isv ? 0 : 15,
      subtotal:        precio,
      tipo:            'LABORATORIO',
      lab_id:          p.id,
    })
  }

  function agregarServicio(s: Servicio) {
    const precio = Number(s.precio) || 0
    agregarDesdeCatalogo({
      descripcion:     s.nombre,
      cantidad:        1,
      precio_unitario: precio,
      isv_pct:         form.exento_isv ? 0 : 15,
      subtotal:        precio,
      tipo:            'SERVICIO',
      servicio_id:     s.id,
    })
  }

  const resultadosCatalogo = useMemo(() => {
    const q = buscarCatalogo.toLowerCase().trim()
    if (tabCatalogo === 'medicamentos') {
      return productos.filter(p =>
        !q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
      ).slice(0, 12)
    }
    if (tabCatalogo === 'laboratorio') {
      return pruebasLab.filter(p =>
        !q || p.nombre.toLowerCase().includes(q)
      ).slice(0, 12)
    }
    return servicios.filter(s =>
      !q || s.nombre.toLowerCase().includes(q) || (s.tipo || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [tabCatalogo, buscarCatalogo, productos, pruebasLab, servicios])

  const resumenTipos = useMemo(() => {
    const tipos: TipoItemCot[] = ['SERVICIO', 'LABORATORIO', 'MEDICAMENTO', 'MANUAL']
    return tipos.map(t => ({
      tipo: t,
      count: items.filter(it => (it.tipo || 'MANUAL') === t && it.descripcion.trim()).length,
      total: items.filter(it => (it.tipo || 'MANUAL') === t).reduce((s, it) => s + it.subtotal, 0),
    })).filter(r => r.count > 0)
  }, [items])

  const totales = useMemo(
    () => calcularTotalesCot(items, form.por_descuento, form.exento_isv),
    [items, form.por_descuento, form.exento_isv],
  )

  const listaFiltrada = useMemo(() => lista.filter(c => {
    const q = buscar.toLowerCase()
    const pass = !q || c.numero.toLowerCase().includes(q) || c.cliente_nombre.toLowerCase().includes(q)
    const est = estadoEfectivo(c.estado, c.fecha_vencimiento, hoy)
    const passE = !filtroEst || est === filtroEst
    return pass && passE
  }), [lista, buscar, filtroEst, hoy])

  const stats = useMemo(() => ({
    pendientes: lista.filter(c => estadoEfectivo(c.estado, c.fecha_vencimiento, hoy) === 'PENDIENTE').length,
    aceptadas:  lista.filter(c => estadoEfectivo(c.estado, c.fecha_vencimiento, hoy) === 'ACEPTADA').length,
    vencidas:   lista.filter(c => estadoEfectivo(c.estado, c.fecha_vencimiento, hoy) === 'VENCIDA').length,
    convertidas:lista.filter(c => c.estado === 'CONVERTIDA').length,
    totalMes:   lista.filter(c => c.estado !== 'ANULADA').reduce((s, c) => s + c.total, 0),
  }), [lista, hoy])

  function resetForm() {
    setForm({
      sucursal_id: sucDefault?.id ?? 0, cliente_nombre: 'CLIENTE GENERAL',
      cliente_rtn: '', cliente_email: '', paciente_id: 0,
      exento_isv: true, por_descuento: 0, nota: '', validez_dias: VALIDEZ_DIAS_DEFAULT,
    })
    setItems([{ ...itemVacio }])
    setBuscarPac(''); setBuscarCatalogo('')
    setTabCatalogo('medicamentos')
  }

  /* ════════ GUARDAR COTIZACIÓN (sin stock, sin comisión) ═══════ */
  async function guardarCotizacion() {
    if (!form.cliente_nombre.trim()) return setError('Ingresa el nombre del cliente')
    if (items.every(it => !it.descripcion.trim())) return setError('Agrega al menos un ítem')
    if (totales.total <= 0) return setError('El total debe ser mayor a cero')
    if (!sucSeleccionada) return setError('Selecciona una sucursal')

    setLoading(true); setError('')
    try {
      const numSig = siguienteNumeroCot(form.sucursal_id, cotCorrs)
      const numero = formatearNumeroCot(numSig, form.sucursal_id)
      const itemsLimpios = items.filter(it => it.descripcion.trim() && it.cantidad > 0)
      const vence = fechaVencimiento(hoy, form.validez_dias)

      const payload = {
        numero,
        sucursal_id:     form.sucursal_id,
        fecha:           hoy,
        hora:            new Date().toTimeString().slice(0, 8),
        cliente_nombre:  form.cliente_nombre.trim(),
        cliente_rtn:     form.cliente_rtn.trim() || null,
        cliente_email:   form.cliente_email.trim() || null,
        paciente_id:     form.paciente_id || null,
        items:           itemsLimpios,
        subtotal:        totales.subtotal,
        por_descuento:   form.por_descuento,
        descuento_monto: totales.descuento_monto,
        isv_monto:       totales.isv_monto,
        total:           totales.total,
        exento_isv:      form.exento_isv,
        estado:          'PENDIENTE',
        nota:            form.nota.trim() || null,
        validez_dias:    form.validez_dias,
        fecha_vencimiento: vence,
        usuario_id:      userId,
        cajero_nombre:   cajeroNombre,
      }

      const { data: nc, error: e } = await supabase
        .from('cotizaciones')
        .insert(payload)
        .select(`id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, por_descuento, descuento_monto, isv_monto, total, estado, nota, validez_dias, fecha_vencimiento, factura_id, paciente_id, sucursal_id, items, exento_isv, cajero_nombre`)
        .single()
      if (e) throw new Error(e.message)

      await supabase.from('cotizacion_correlativos').upsert(
        { sucursal_id: form.sucursal_id, ultimo_numero: numSig },
        { onConflict: 'sucursal_id' },
      )

      setCotCorrs(prev => {
        const ex = prev.find(c => c.sucursal_id === form.sucursal_id)
        if (ex) return prev.map(c => c.sucursal_id === form.sucursal_id ? { ...c, ultimo_numero: numSig } : c)
        return [...prev, { sucursal_id: form.sucursal_id, ultimo_numero: numSig }]
      })

      if (nc) {
        setLista(prev => [nc as unknown as Cotizacion, ...prev])
        setVerCot(nc as unknown as Cotizacion)
      }
      setModal(false); resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setLoading(false) }
  }

  /* ════════ MARCAR ACEPTADA ══════════════════════════════════ */
  async function marcarAceptada(cot: Cotizacion) {
    const { confirmed } = await confirmDialog({
      title: 'Marcar como aceptada',
      message: `¿Marcar la cotización ${cot.numero} como ACEPTADA?`,
      variant: 'success',
      confirmLabel: 'Aceptar cotización',
    })
    if (!confirmed) return
    const { error: e } = await supabase
      .from('cotizaciones')
      .update({ estado: 'ACEPTADA' })
      .eq('id', cot.id)
    if (e) return alert('Error: ' + e.message)
    setLista(prev => prev.map(c => c.id === cot.id ? { ...c, estado: 'ACEPTADA' } : c))
    if (verCot?.id === cot.id) setVerCot(p => p ? { ...p, estado: 'ACEPTADA' } : p)
  }

  /* ════════ CONVERTIR EN FACTURA ═════════════════════════════ */
  async function convertirEnFactura(cot: Cotizacion) {
    const est = estadoEfectivo(cot.estado, cot.fecha_vencimiento, hoy)
    if (cot.estado === 'CONVERTIDA') return alert('Esta cotización ya fue convertida en factura.')
    if (cot.estado === 'ANULADA') return alert('No se puede convertir una cotización anulada.')

    if (est === 'VENCIDA') {
      const { confirmed } = await confirmDialog({
        title: 'Cotización vencida',
        message: 'Esta cotización está vencida. ¿Desea enviarla a caja para cobro de todas formas?',
        variant: 'warning',
        confirmLabel: 'Enviar a caja igualmente',
      })
      if (!confirmed) return
    } else {
      const { confirmed } = await confirmDialog({
        title: 'Enviar a caja para cobro',
        message: `¿Enviar la cotización ${cot.numero} a caja? El cajero la cobrará y emitirá la factura fiscal.`,
        variant: 'info',
        confirmLabel: 'Enviar a caja',
        details: [
          { label: 'Cliente', value: cot.cliente_nombre },
          { label: 'Total', value: fmtCot(cot.total) },
        ],
      })
      if (!confirmed) return
    }

    const suc = sucursales.find(s => s.id === cot.sucursal_id)
    if (!suc) return alert('Sucursal no encontrada')

    if (suc.fecha_limite && suc.fecha_limite < hoy) {
      return alert(`El CAI de ${suc.nombre} venció el ${suc.fecha_limite}. Renueva el CAI en Configuración.`)
    }

    setLoadingConv(true)
    try {
      // No se emite factura aquí: se envía a caja. El cajero cobra y
      // genera la factura fiscal con su correlativo (claim-first).
      const { data: enviada, error: e } = await supabase
        .from('cotizaciones')
        .update({ estado: 'POR_COBRAR' })
        .eq('id', cot.id)
        .in('estado', ['PENDIENTE', 'ACEPTADA', 'VENCIDA'])
        .select('id')
      if (e) throw new Error(e.message)
      if (!enviada || enviada.length === 0) {
        throw new Error('La cotización ya fue enviada a caja o cambió de estado. Actualiza la lista.')
      }

      const actualizada = { ...cot, estado: 'POR_COBRAR' }
      setLista(prev => prev.map(c => c.id === cot.id ? actualizada : c))
      if (verCot?.id === cot.id) setVerCot(actualizada)

      alert(`✅ Cotización ${cot.numero} enviada a caja.\n\nEl cajero la cobrará en el módulo de Caja → pestaña "Cotizaciones" y emitirá la factura.`)
    } catch (err: unknown) {
      alert('Error al enviar a caja: ' + (err instanceof Error ? err.message : err))
    } finally { setLoadingConv(false) }
  }

  async function anularCotizacion(cot: Cotizacion) {
    if (cot.estado === 'CONVERTIDA') return alert('No se puede anular una cotización ya convertida.')
    const { confirmed, motivo } = await confirmDialog({
      title: 'Anular cotización',
      message: `¿Está seguro que desea anular la cotización ${cot.numero}?`,
      variant: 'danger',
      confirmLabel: 'Anular',
      pedirMotivo: true,
      motivoLabel: 'Motivo de anulación',
      motivoPlaceholder: 'Opcional…',
    })
    if (!confirmed) return
    const { error: e } = await supabase
      .from('cotizaciones')
      .update({ estado: 'ANULADA', nota: motivo || cot.nota })
      .eq('id', cot.id)
    if (e) return alert('Error: ' + e.message)
    setLista(prev => prev.map(c => c.id === cot.id ? { ...c, estado: 'ANULADA' } : c))
  }

  function imprimir(cot: Cotizacion) {
    const suc = sucursales.find(s => s.id === cot.sucursal_id)
    imprimirCotizacion(cot, suc)
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <ModuleShell tint="emerald">
      <ModuleHero
        title="Cotizaciones"
        subtitle="Cotiza laboratorio, medicamentos y servicios"
        badge="Ventas y presupuestos"
        icon={ClipboardList}
        gradient="emerald"
        kpis={[
          { label: 'Pendientes', value: stats.pendientes, icon: Clock },
          { label: 'Aceptadas', value: stats.aceptadas, icon: CheckCircle2 },
          { label: 'Vencidas', value: stats.vencidas, icon: XCircle },
          { label: 'Convertidas', value: stats.convertidas, icon: ArrowRightCircle },
          { label: 'Total mes', value: fmtCot(stats.totalMes), icon: DollarSign },
        ]}
        actions={
          sinSucursal ? (
            <span className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-300/40 text-red-100 rounded-xl text-sm">
              <AlertTriangle className="w-4 h-4" /> Sin sucursal
            </span>
          ) : (
            <ModuleBtnPrimary onClick={() => { setModal(true); setError(''); resetForm() }}>
              <Plus className="w-4 h-4" /> Nueva Cotización
            </ModuleBtnPrimary>
          )
        }
      />
      <ModuleContent>

      {/* FILTROS */}
      <div className="bg-white border rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por número o cliente…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
        </div>
        <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="ACEPTADA">Aceptada</option>
          <option value="VENCIDA">Vencida</option>
          <option value="CONVERTIDA">Convertida</option>
          <option value="ANULADA">Anulada</option>
        </select>
      </div>

      {/* TABLA */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Número</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Sucursal</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Vence</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listaFiltrada.length === 0 && (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  No hay cotizaciones{buscar ? ' para esta búsqueda' : ' este mes'}
                </td></tr>
              )}
              {listaFiltrada.map(c => {
                const est = estadoEfectivo(c.estado, c.fecha_vencimiento, hoy)
                const puedeConvertir = est !== 'CONVERTIDA' && est !== 'ANULADA' && est !== 'POR_COBRAR'
                return (
                  <tr key={c.id} className={`hover:bg-gray-50 ${est === 'ANULADA' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-teal-700">{c.numero}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.fecha}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.cliente_nombre}</p>
                      {c.cliente_rtn && <p className="text-xs text-gray-400">RTN: {c.cliente_rtn}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.sucursal?.nombre ?? sucursales.find(s => Number(s.id) === Number(c.sucursal_id))?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtCot(c.total)}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{c.fecha_vencimiento}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_STYLE[est] ?? 'bg-gray-100'}`}>
                        {ESTADO_LABEL[est] ?? est}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button onClick={() => setVerCot(c)} title="Ver"
                          className="p-1.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => imprimir(c)} title="Imprimir"
                          className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {est === 'PENDIENTE' && (
                          <button onClick={() => marcarAceptada(c)} title="Marcar aceptada"
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {puedeConvertir && (
                          <button onClick={() => convertirEnFactura(c)} disabled={loadingConv} title="Enviar a caja para cobro"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50">
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                            A caja
                          </button>
                        )}
                        {est === 'POR_COBRAR' && (
                          <span className="text-xs text-orange-600 font-medium">En caja</span>
                        )}
                        {c.estado === 'CONVERTIDA' && c.factura_id && (
                          <span className="text-xs text-blue-600 font-mono">#{c.factura_id}</span>
                        )}
                        {est !== 'CONVERTIDA' && est !== 'ANULADA' && (
                          <button onClick={() => anularCotizacion(c)} title="Anular"
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ MODAL NUEVA COTIZACIÓN ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-teal-600" /> Nueva Cotización
              </h2>
              <button onClick={() => { setModal(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</p>}

              <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 text-xs text-teal-800">
                <strong>Cotiza de todo:</strong> laboratorio, medicamentos y servicios médicos.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Sucursal</label>
                  <select value={form.sucursal_id} onChange={e => setForm(p => ({ ...p, sucursal_id: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Validez (días)</label>
                  <input type="number" min={1} max={90} value={form.validez_dias}
                    onChange={e => setForm(p => ({ ...p, validez_dias: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
              </div>

              {/* cliente */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-600 uppercase block">Datos del Cliente</label>
                <input value={buscarPac} onChange={e => setBuscarPac(e.target.value)}
                  placeholder="Buscar paciente registrado (opcional)…"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200" />
                {buscarPac && (
                  <div className="border rounded-lg overflow-hidden max-h-32 overflow-y-auto bg-white shadow-sm">
                    {pacientes.filter(p => `${p.nombre} ${p.apellido1}`.toLowerCase().includes(buscarPac.toLowerCase())).slice(0, 8).map(p => (
                      <button key={p.id} onClick={() => {
                        setForm(prev => ({ ...prev, paciente_id: p.id, cliente_nombre: `${p.nombre} ${p.apellido1} ${p.apellido2 || ''}`.trim(), cliente_email: p.correo || '' }))
                        setBuscarPac('')
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 border-b last:border-0">
                        {p.nombre} {p.apellido1}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.cliente_nombre} onChange={e => setForm(p => ({ ...p, cliente_nombre: e.target.value }))}
                    placeholder="Nombre / Razón Social *"
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
                  <input value={form.cliente_rtn} onChange={e => setForm(p => ({ ...p, cliente_rtn: e.target.value }))}
                    placeholder="RTN (opcional)"
                    className="border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
              </div>

              {/* catálogo: medicamentos / laboratorio / servicios */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                  Agregar del catálogo
                </label>
                <div className="flex gap-1 mb-2">
                  {TABS_CATALOGO.map(t => (
                    <button key={t.id} type="button" onClick={() => { setTabCatalogo(t.id); setBuscarCatalogo('') }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tabCatalogo === t.id
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      <t.icon className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  ))}
                </div>
                <input value={buscarCatalogo} onChange={e => setBuscarCatalogo(e.target.value)}
                  placeholder={
                    tabCatalogo === 'medicamentos' ? 'Buscar medicamento por nombre o código…' :
                    tabCatalogo === 'laboratorio'  ? 'Buscar prueba de laboratorio…' :
                    'Buscar servicio médico…'
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200" />
                <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto mt-1 shadow-sm">
                  {resultadosCatalogo.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-4">Sin resultados</p>
                  ) : tabCatalogo === 'medicamentos' ? (
                    resultadosCatalogo.map(p => {
                      const prod = p as Producto
                      return (
                        <button key={prod.id} type="button" onClick={() => agregarProducto(prod)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 border-b last:border-0 flex justify-between items-center">
                          <span>
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded mr-1">Med</span>
                            {prod.nombre}
                            <span className="text-gray-400 font-mono text-xs ml-1">{prod.codigo}</span>
                          </span>
                          <span className="text-teal-700 font-medium shrink-0">{fmtCot(prod.precio_venta)}</span>
                        </button>
                      )
                    })
                  ) : tabCatalogo === 'laboratorio' ? (
                    resultadosCatalogo.map(p => {
                      const lab = p as PruebaLab
                      return (
                        <button key={lab.id} type="button" onClick={() => agregarPruebaLab(lab)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0 flex justify-between items-center">
                          <span>
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded mr-1">Lab</span>
                            {lab.nombre}
                          </span>
                          <span className="text-teal-700 font-medium shrink-0">{fmtCot(Number(lab.costo) || 0)}</span>
                        </button>
                      )
                    })
                  ) : (
                    resultadosCatalogo.map(s => {
                      const serv = s as Servicio
                      return (
                        <button key={serv.id} type="button" onClick={() => agregarServicio(serv)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0 flex justify-between items-center">
                          <span>
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded mr-1">Serv</span>
                            {serv.nombre}
                            {serv.tipo && <span className="text-gray-400 text-xs ml-1">({serv.tipo})</span>}
                          </span>
                          <span className="text-teal-700 font-medium shrink-0">{fmtCot(serv.precio)}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* ítems */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Ítems / Servicios</label>
                  <button onClick={() => setItems(p => [...p, { ...itemVacio }])}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Línea manual
                  </button>
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-20">Tipo</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">Descripción</th>
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-14">Cant.</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-24">P. Unit.</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-20">Subtotal</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((it, i) => {
                        const tipo = (it.tipo || 'MANUAL') as TipoItemCot
                        return (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_ITEM_COLOR[tipo]}`}>
                              {TIPO_ITEM_LABEL[tipo].slice(0, 4)}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={it.descripcion} onChange={e => recalcularItem(i, 'descripcion', e.target.value)}
                              placeholder="Descripción…"
                              className="w-full border-0 text-sm focus:outline-none focus:ring-1 focus:ring-teal-300 rounded px-1" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={1} value={it.cantidad}
                              onChange={e => recalcularItem(i, 'cantidad', Number(e.target.value))}
                              className="w-full text-center border-0 text-sm focus:outline-none rounded" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={0} step="0.01" value={it.precio_unitario}
                              onChange={e => recalcularItem(i, 'precio_unitario', Number(e.target.value))}
                              className="w-full text-right border-0 text-sm focus:outline-none rounded" />
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm font-medium">{fmtCot(it.subtotal)}</td>
                          <td className="pr-2">
                            {items.length > 1 && (
                              <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>

                {resumenTipos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {resumenTipos.map(r => (
                      <span key={r.tipo} className={`text-xs px-2 py-1 rounded-full ${TIPO_ITEM_COLOR[r.tipo]}`}>
                        {TIPO_ITEM_LABEL[r.tipo]}: {r.count} · {fmtCot(r.total)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Descuento (%)</label>
                    <input type="number" min={0} max={100} value={form.por_descuento}
                      onChange={e => setForm(p => ({ ...p, por_descuento: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ISV</label>
                    <select value={form.exento_isv ? 'exento' : 'gravado'}
                      onChange={e => setForm(p => ({ ...p, exento_isv: e.target.value === 'exento' }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="exento">Exento de ISV (medicina)</option>
                      <option value="gravado">Gravado (15%)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmtCot(totales.subtotal)}</span></div>
                    {form.por_descuento > 0 && (
                      <div className="flex justify-between text-amber-600"><span>Descuento ({form.por_descuento}%)</span><span>-{fmtCot(totales.descuento_monto)}</span></div>
                    )}
                    <div className="flex justify-between text-gray-600"><span>ISV</span><span>{fmtCot(totales.isv_monto)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t pt-1">
                      <span>TOTAL</span><span className="text-teal-700">{fmtCot(totales.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nota (opcional)</label>
                <textarea value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>

            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => { setModal(false); resetForm() }} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarCotizacion} disabled={loading}
                className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Guardar Cotización
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL VER ══ */}
      {verCot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Cotización {verCot.numero}</h2>
              <div className="flex gap-2">
                <button onClick={() => imprimir(verCot)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                {verCot.estado !== 'CONVERTIDA' && verCot.estado !== 'ANULADA' && verCot.estado !== 'POR_COBRAR' && (
                  <button onClick={() => convertirEnFactura(verCot)} disabled={loadingConv}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
                    <ArrowRightCircle className="w-4 h-4" /> Enviar a caja
                  </button>
                )}
                <button onClick={() => setVerCot(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_STYLE[estadoEfectivo(verCot.estado, verCot.fecha_vencimiento, hoy)]}`}>
                  {ESTADO_LABEL[estadoEfectivo(verCot.estado, verCot.fecha_vencimiento, hoy)] ?? estadoEfectivo(verCot.estado, verCot.fecha_vencimiento, hoy)}
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Vence: {verCot.fecha_vencimiento}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Cliente</p>
                  <p className="font-semibold">{verCot.cliente_nombre}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="font-bold text-teal-700 text-lg">{fmtCot(verCot.total)}</p>
                </div>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b">
                    <th className="px-2 py-2 text-center">Tipo</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-center">Cant</th>
                    <th className="px-2 py-2 text-right">Subtotal</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {verCot.items.map((it, i) => {
                      const tipo = (it.tipo || 'MANUAL') as TipoItemCot
                      return (
                      <tr key={i}>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${TIPO_ITEM_COLOR[tipo]}`}>
                            {TIPO_ITEM_LABEL[tipo]}
                          </span>
                        </td>
                        <td className="px-3 py-2">{it.descripcion}</td>
                        <td className="px-2 py-2 text-center">{it.cantidad}</td>
                        <td className="px-2 py-2 text-right">{fmtCot(it.subtotal)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              {verCot.factura_id && (
                <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  Convertida en factura ID #{verCot.factura_id} — ver en módulo Facturación
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
