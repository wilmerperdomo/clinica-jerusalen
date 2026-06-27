'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { abrirFacturaTermica } from '@/lib/factura-print'
import {
  reservarSiguienteCorrelativo, confirmarCorrelativo,
  esErrorNumeroDuplicado, extraerCorrelativo, formatearNumeroFactura,
} from '@/lib/factura-correlativo'
import {
  FileText, Plus, Search, Printer, X, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Hash, Building2,
  User, DollarSign, Trash2, ChevronDown, ChevronUp, Eye,
  ShieldAlert, History, Lock, RotateCcw, KeyRound, Receipt, Copy,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost } from '@/components/module-layout'
import { useConfirm } from '@/components/confirm-dialog'
import { acumularPuntosPorFactura } from '@/lib/fidelidad-puntos'
import { abrirNotaCredito } from '@/lib/nota-credito-print'

/* ══════════════════ TIPOS ════════════════════════════════════ */
interface ItemFactura {
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  isv_pct:         number   // 0 = exento, 15 = ISV estándar
  subtotal:        number
}
interface Sucursal {
  id: number; nombre: string; nombre_corto?: string
  direccion?: string; telefono?: string; email?: string
  rtn?: string; cai?: string; fecha_limite?: string
  num_min?: string | number | null; num_max?: string | number | null; numero_inicial?: string | number | null
  lema?: string; tama?: string; letra?: string
}
interface Paciente { id: number; nombre: string; apellido1: string; apellido2?: string; correo?: string }
interface Correlativo { sucursal_id: number; ultimo_numero: number }
interface Factura {
  id: number; numero: string; fecha: string; hora: string
  cliente_nombre: string; cliente_rtn?: string
  subtotal: number; descuento_monto: number; isv_monto: number; total: number
  estado: string; motivo_anulacion?: string
  cai?: string; rango_inicio?: string; rango_fin?: string
  cajero_nombre?: string; medico_nombre?: string; paciente_id?: number
  sucursal_id: number; items: ItemFactura[]
  exento_isv: boolean; rtn_emisor?: string; correo_emisor?: string; fecha_limite_cai?: string
  monto_devuelto?: number
  sucursal?: { nombre: string } | null
}
interface Auditoria {
  id: number; factura_id: number; numero?: string
  accion: string; motivo: string; usuario_nombre?: string
  fecha: string; datos_antes?: Record<string, unknown>
}
interface DevolucionItem {
  factura_item_idx: number; descripcion: string; cantidad: number
  precio_unitario: number; isv_pct: number; subtotal: number
  producto_id?: number | null; reingresa_stock?: boolean
}
interface Devolucion {
  id: number; numero: string; factura_id: number; factura_numero?: string
  paciente_nombre?: string; sucursal_id: number
  subtotal: number; isv_monto: number; total: number
  motivo?: string; tipo_reembolso: string; es_anulacion: boolean; estado: string
  cajero_nombre?: string; items: DevolucionItem[]; fecha: string; hora?: string
}
interface Producto { id: number; nombre: string; codigo?: string }
interface DevLinea {
  idx: number; descripcion: string; precio_unitario: number; isv_pct: number
  cantOriginal: number; cantDisponible: number
  seleccionada: boolean; cantidad: number
  reingresa: boolean; producto_id: number | ''
}
interface Props {
  facturas:        Factura[]
  sucursales:      Sucursal[]
  pacientes:       Paciente[]
  correlativos:    Correlativo[]
  sucursalDefault: number | null
  cajeroNombre:    string
  hoy:             string
  esSuperAdmin:    boolean
  puedeDevolver:   boolean
  userId:          string
  auditoria:       Auditoria[]
  devoluciones:    Devolucion[]
  productos:       Producto[]
}

/* ══════════════════ HELPERS ══════════════════════════════════ */
const fmt   = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
const ISV   = 0.15

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}&margin=4`
}

function siguienteNumero(suc: Sucursal, correlativos: Correlativo[]): number {
  const cor = correlativos.find(c => c.sucursal_id === suc.id)
  if (cor) return cor.ultimo_numero + 1
  return extraerCorrelativo(suc.numero_inicial ?? suc.num_min)
}

function formatearNumero(num: number, suc: Sucursal): string {
  return formatearNumeroFactura(num, suc)
}

/** Extrae un mensaje legible de cualquier error (Error, PostgrestError, etc.) */
function msgError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    return e.message || e.details || e.hint || e.code || JSON.stringify(err)
  }
  return String(err)
}

/* ════════════════════════════════════════════════════════════ */
export default function FacturacionClient({
  facturas: init, sucursales, pacientes, correlativos,
  sucursalDefault, cajeroNombre, hoy,
  esSuperAdmin, puedeDevolver, userId, auditoria: initAuditoria,
  devoluciones: initDevoluciones, productos,
}: Props) {
  const supabase = createClient()
  const confirmDialog = useConfirm()

  const [facturas,  setFacturas]  = useState<Factura[]>(init)
  const [corrs,     setCorrs]     = useState<Correlativo[]>(correlativos)
  const [buscar,    setBuscar]    = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [verFact,   setVerFact]   = useState<Factura | null>(null)

  /* ── modal nueva factura ── */
  const [modal,    setModal]    = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [buscarPac,setBuscarPac]= useState('')

  const itemVacio: ItemFactura = { descripcion: '', cantidad: 1, precio_unitario: 0, isv_pct: 15, subtotal: 0 }

  // Sucursal del usuario; admin puede usar la primera si no tiene asignada
  const sucDefault = sucursalDefault != null
    ? sucursales.find(s => Number(s.id) === Number(sucursalDefault)) ?? null
    : (esSuperAdmin && sucursales.length > 0 ? sucursales[0] : null)
  const sinSucursal = !sucDefault

  const [form, setForm] = useState({
    sucursal_id:     sucDefault?.id ?? 0,
    cliente_nombre:  'CLIENTE GENERAL',
    cliente_rtn:     '',
    cliente_email:   '',
    paciente_id:     0,
    exento_isv:      true,
  })
  const [items, setItems] = useState<ItemFactura[]>([{ ...itemVacio }])

  /* ── modal eliminar (solo super admin) ── */
  const [eliminarFact,   setEliminarFact]   = useState<Factura | null>(null)
  const [motivoEliminar, setMotivoEliminar] = useState('')
  const [loadingEliminar, setLoadingEliminar] = useState(false)

  /* ── devoluciones / notas de crédito ── */
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>(initDevoluciones)
  const [devFact,      setDevFact]      = useState<Factura | null>(null)
  const [devEsAnula,   setDevEsAnula]   = useState(false)
  const [devLineas,    setDevLineas]    = useState<DevLinea[]>([])
  const [devReembolso, setDevReembolso] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'SALDO_FAVOR'>('EFECTIVO')
  const [devReferencia,setDevReferencia]= useState('')
  const [devMotivo,    setDevMotivo]    = useState('')
  const [devCodigo,    setDevCodigo]    = useState('')
  const [devSesionId,  setDevSesionId]  = useState<number | null>(null)
  const [devSinCaja,   setDevSinCaja]   = useState(false)
  const [loadingDev,   setLoadingDev]   = useState(false)
  const [errorDev,     setErrorDev]     = useState('')

  /* ── generar código (super admin) ── */
  const [codFact,    setCodFact]    = useState<Factura | null>(null)
  const [codGenerado,setCodGenerado]= useState<{ codigo: string; expira: string; max: number } | null>(null)
  const [loadingCod, setLoadingCod] = useState(false)

  /* ── tab auditoría ── */
  const [tabActivo, setTabActivo]   = useState<'facturas' | 'auditoria' | 'notas'>('facturas')
  const [auditoria, setAuditoria]   = useState<Auditoria[]>(initAuditoria)
  const [verAudit,  setVerAudit]    = useState<Auditoria | null>(null)

  const refPrint = useRef<HTMLDivElement>(null)

  /* ════════ CÁLCULOS ══════════════════════════════════════════ */
  const sucSeleccionada = sucursales.find(s => s.id === form.sucursal_id) ?? sucDefault

  // recalcular ítems
  function recalcularItem(idx: number, field: keyof ItemFactura, val: string | number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      updated.subtotal = updated.cantidad * updated.precio_unitario
      return updated
    }))
  }

  const totales = useMemo(() => {
    const subtotal   = items.reduce((s, it) => s + it.subtotal, 0)
    const isv_monto  = form.exento_isv ? 0 : items.reduce((s, it) => s + it.subtotal * (it.isv_pct / 100), 0)
    const total      = subtotal + isv_monto
    return { subtotal, isv_monto, total }
  }, [items, form.exento_isv])

  const factsFiltradas = useMemo(() => {
    return facturas.filter(f => {
      const q = buscar.toLowerCase()
      const pass = !q || f.numero.includes(q) || f.cliente_nombre.toLowerCase().includes(q) || (f.cliente_rtn || '').includes(q)
      const passE = !filtroEst || f.estado === filtroEst
      return pass && passE
    })
  }, [facturas, buscar, filtroEst])

  const stats = useMemo(() => {
    const hoyFacturas  = facturas.filter(f => f.fecha === hoy && f.estado === 'emitida')
    const mesFacturas  = facturas.filter(f => f.estado === 'emitida')
    return {
      hoyCount:   hoyFacturas.length,
      hoyTotal:   hoyFacturas.reduce((s, f) => s + f.total, 0),
      mesCount:   mesFacturas.length,
      mesTotal:   mesFacturas.reduce((s, f) => s + f.total, 0),
      anuladas:   facturas.filter(f => f.estado === 'anulada').length,
    }
  }, [facturas, hoy])

  /* ════════ GUARDAR FACTURA ══════════════════════════════════ */
  async function guardarFactura() {
    if (!form.cliente_nombre.trim()) return setError('Ingresa el nombre del cliente')
    if (items.every(it => !it.descripcion.trim())) return setError('Agrega al menos un ítem')
    if (totales.total <= 0) return setError('El total debe ser mayor a cero')
    if (!sucSeleccionada) return setError('Selecciona una sucursal')

    setLoading(true); setError('')
    try {
      if (sucSeleccionada.fecha_limite && sucSeleccionada.fecha_limite < hoy) {
        throw new Error(`El CAI de esta sucursal venció el ${sucSeleccionada.fecha_limite}. Renueva el CAI en Configuración.`)
      }

      const itemsLimpios = items.filter(it => it.descripcion.trim() && it.cantidad > 0)

      const payloadBase = {
        sucursal_id:     form.sucursal_id,
        fecha:           hoy,
        hora:            new Date().toTimeString().slice(0, 8),
        cliente_nombre:  form.cliente_nombre.trim(),
        cliente_rtn:     form.cliente_rtn.trim() || null,
        cliente_email:   form.cliente_email.trim() || null,
        items:           itemsLimpios,
        subtotal:        totales.subtotal,
        descuento_monto: 0,
        isv_monto:       totales.isv_monto,
        total:           totales.total,
        exento_isv:      form.exento_isv,
        paciente_id:     form.paciente_id || null,
        cajero_nombre:   cajeroNombre,
        cai:             sucSeleccionada.cai  || null,
        rtn_emisor:      sucSeleccionada.rtn  || null,
        rango_inicio:    sucSeleccionada.num_min || null,
        rango_fin:       sucSeleccionada.num_max || null,
        fecha_limite_cai:sucSeleccionada.fecha_limite || null,
      }

      let nf = null
      let numSig = 0
      let ultimoError: string | null = null

      for (let intento = 0; intento < 4; intento++) {
        const reserva = await reservarSiguienteCorrelativo(
          supabase, form.sucursal_id, sucSeleccionada,
          intento > 0 ? numSig + 1 : undefined,
        )
        numSig = reserva.numSig

        if (sucSeleccionada.num_max) {
          const maxNum = extraerCorrelativo(sucSeleccionada.num_max)
          if (numSig > maxNum) {
            throw new Error(`Número ${numSig} excede el rango máximo del CAI (${sucSeleccionada.num_max}). Renueva el CAI en Configuración.`)
          }
        }

        const { data, error: e } = await supabase
          .from('facturas')
          .insert({ ...payloadBase, numero: reserva.numero })
          .select(`id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, descuento_monto, isv_monto, total, estado, cai, rango_inicio, rango_fin, cajero_nombre, medico_nombre, paciente_id, sucursal_id, items, exento_isv, rtn_emisor, fecha_limite_cai, sucursal:sucursales(nombre)`)
          .single()

        if (!e) {
          nf = data
          await confirmarCorrelativo(supabase, form.sucursal_id, numSig)
          break
        }

        ultimoError = e.message
        if (!esErrorNumeroDuplicado(e)) throw new Error(e.message)
        numSig += 1
      }

      if (!nf) throw new Error(ultimoError ?? 'No se pudo reservar un número de factura único')

      if (nf.paciente_id) {
        const resPts = await acumularPuntosPorFactura(supabase, nf.id)
        if (!resPts.ok) console.warn('Puntos fidelidad:', resPts.error)
      }

      setCorrs(prev => {
        const existing = prev.find(c => c.sucursal_id === form.sucursal_id)
        if (existing) return prev.map(c => c.sucursal_id === form.sucursal_id ? { ...c, ultimo_numero: numSig } : c)
        return [...prev, { sucursal_id: form.sucursal_id, ultimo_numero: numSig }]
      })

      setFacturas(prev => [nf as unknown as Factura, ...prev])
      setVerFact(nf as unknown as Factura)
      setModal(false)
      resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar la factura')
    } finally { setLoading(false) }
  }

  function resetForm() {
    setForm({ sucursal_id: sucDefault?.id ?? 0, cliente_nombre: 'CLIENTE GENERAL', cliente_rtn: '', cliente_email: '', paciente_id: 0, exento_isv: true })
    setItems([{ ...itemVacio }])
    setBuscarPac('')
  }

  /* ════════ DEVOLUCIÓN / ANULACIÓN (motor unificado) ═════════ */
  // Cantidad ya devuelta por línea (devoluciones no anuladas)
  function devueltasPorIdx(facturaId: number): Record<number, number> {
    const acc: Record<number, number> = {}
    for (const d of devoluciones) {
      if (d.factura_id !== facturaId || d.estado === 'ANULADA') continue
      const its = Array.isArray(d.items) ? d.items : []
      for (const it of its) {
        const i = Number(it.factura_item_idx)
        acc[i] = (acc[i] ?? 0) + Number(it.cantidad ?? 0)
      }
    }
    return acc
  }

  function sugerirProducto(desc: string): number | '' {
    const limpio = desc.trim().toLowerCase()
    if (!limpio) return ''
    const exacto = productos.find(p => p.nombre.trim().toLowerCase() === limpio)
    if (exacto) return exacto.id
    const parcial = productos.find(p => limpio.includes(p.nombre.trim().toLowerCase()) || p.nombre.trim().toLowerCase().includes(limpio))
    return parcial ? parcial.id : ''
  }

  async function abrirDevolucion(f: Factura, anula: boolean) {
    const items = (f.items as ItemFactura[]) ?? []
    const yaDev = devueltasPorIdx(f.id)
    const lineas: DevLinea[] = items.map((it, idx) => {
      const disp = Math.max(it.cantidad - (yaDev[idx] ?? 0), 0)
      const sug = sugerirProducto(it.descripcion)
      return {
        idx, descripcion: it.descripcion,
        precio_unitario: it.precio_unitario, isv_pct: it.isv_pct,
        cantOriginal: it.cantidad, cantDisponible: disp,
        seleccionada: anula && disp > 0, cantidad: disp,
        reingresa: sug !== '', producto_id: sug,
      }
    })
    setDevFact(f); setDevEsAnula(anula); setDevLineas(lineas)
    setDevReembolso('EFECTIVO'); setDevReferencia(''); setDevMotivo('')
    setDevCodigo(''); setErrorDev(''); setDevSesionId(null); setDevSinCaja(false)

    // Buscar caja abierta de la sucursal de la factura (para reembolso en efectivo)
    const { data: ses } = await supabase
      .from('caja_sesiones')
      .select('id')
      .eq('sucursal_id', f.sucursal_id)
      .eq('estado', 'ABIERTA')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ses?.id) { setDevSesionId(Number(ses.id)); setDevSinCaja(false) }
    else { setDevSesionId(null); setDevSinCaja(true) }
  }

  const devTotal = useMemo(() => {
    const bruto = devLineas.reduce((s, l) => {
      if (!l.seleccionada || l.cantidad <= 0) return s
      const sub = l.cantidad * l.precio_unitario
      return s + sub + sub * (l.isv_pct / 100)
    }, 0)
    // Reparte proporcionalmente el descuento global de la factura
    const base = devFact ? devFact.subtotal + devFact.isv_monto : 0
    const factor = devFact && base > 0 ? Math.min(devFact.total / base, 1) : 1
    return Math.round(bruto * factor * 100) / 100
  }, [devLineas, devFact])

  function setLinea(idx: number, patch: Partial<DevLinea>) {
    setDevLineas(prev => prev.map(l => l.idx === idx ? { ...l, ...patch } : l))
  }

  async function procesarDevolucion() {
    if (!devFact) return
    const seleccion = devLineas.filter(l => l.seleccionada && l.cantidad > 0)
    if (seleccion.length === 0) return setErrorDev('Selecciona al menos una línea a devolver')
    for (const l of seleccion) {
      if (l.cantidad > l.cantDisponible) return setErrorDev(`La línea "${l.descripcion}" supera lo disponible (${l.cantDisponible})`)
    }
    if (!devMotivo.trim()) return setErrorDev('Ingresa el motivo')
    if (devReembolso === 'SALDO_FAVOR' && !devFact.paciente_id) return setErrorDev('La factura no tiene paciente: no se puede dar saldo a favor')
    if (devReembolso !== 'SALDO_FAVOR' && !devSesionId) return setErrorDev('No hay caja abierta en la sucursal. Abre caja o usa "Saldo a favor".')
    if (!esSuperAdmin && !devCodigo.trim()) return setErrorDev('Ingresa el código de autorización del super usuario')

    setLoadingDev(true); setErrorDev('')
    try {
      const pItems = seleccion.map(l => ({
        factura_item_idx: l.idx,
        descripcion:      l.descripcion,
        cantidad:         l.cantidad,
        precio_unitario:  l.precio_unitario,
        isv_pct:          l.isv_pct,
        subtotal:         Number((l.cantidad * l.precio_unitario).toFixed(2)),
        producto_id:      l.reingresa && l.producto_id !== '' ? Number(l.producto_id) : null,
        reingresa_stock:  l.reingresa && l.producto_id !== '',
      }))

      const { data, error: e } = await supabase.rpc('fn_registrar_devolucion', {
        p_factura_id:     devFact.id,
        p_items:          pItems,
        p_motivo:         devMotivo.trim(),
        p_tipo_reembolso: devReembolso,
        p_referencia:     devReferencia.trim() || null,
        p_sesion_id:      devReembolso === 'SALDO_FAVOR' ? null : devSesionId,
        p_codigo:         esSuperAdmin ? null : devCodigo.trim(),
        p_anula:          devEsAnula,
        p_cajero_nombre:  cajeroNombre,
      })
      if (e) throw e
      const dev = (Array.isArray(data) ? data[0] : data) as Devolucion

      // Imprimir nota de crédito
      abrirNotaCredito({
        numero: dev.numero, factura_numero: devFact.numero,
        fecha: dev.fecha, hora: dev.hora,
        cliente_nombre: devFact.cliente_nombre,
        sucursal_nombre: sucursales.find(s => s.id === devFact.sucursal_id)?.nombre ?? null,
        cajero_nombre: cajeroNombre, motivo: devMotivo.trim(),
        tipo_reembolso: devReembolso, es_anulacion: devEsAnula,
        subtotal: dev.subtotal, isv_monto: dev.isv_monto, total: dev.total,
        items: pItems,
      })

      // Refrescar estado local
      setDevoluciones(prev => [dev, ...prev])
      setFacturas(prev => prev.map(f => f.id === devFact.id ? {
        ...f,
        monto_devuelto: (f.monto_devuelto ?? 0) + dev.total,
        estado: devEsAnula ? 'anulada' : f.estado,
        motivo_anulacion: devEsAnula ? devMotivo.trim() : f.motivo_anulacion,
      } : f))
      if (devEsAnula) {
        setAuditoria(prev => [{
          id: Date.now(), factura_id: devFact.id, numero: devFact.numero,
          accion: 'ANULADA', motivo: devMotivo.trim(),
          usuario_nombre: cajeroNombre, fecha: new Date().toISOString(),
        }, ...prev])
      }
      setDevFact(null)
    } catch (err) {
      setErrorDev('Error: ' + msgError(err))
    } finally { setLoadingDev(false) }
  }

  async function anularDevolucion(d: Devolucion) {
    if (!esSuperAdmin) return alert('Solo el super administrador puede anular una nota de crédito')
    const { confirmed } = await confirmDialog({
      title: 'Anular nota de crédito',
      message: `¿Está seguro que desea anular la nota de crédito ${d.numero}? Se revertirá el reembolso, los puntos y el stock reingresado.`,
      variant: 'danger',
      confirmLabel: 'Anular',
      details: [
        { label: 'Factura', value: d.factura_numero ?? '—' },
        { label: 'Total', value: fmt(d.total) },
      ],
    })
    if (!confirmed) return
    try {
      const { data, error: e } = await supabase.rpc('fn_anular_devolucion', { p_id: d.id, p_motivo: 'Anulada desde Facturación' })
      if (e) throw e
      const upd = (Array.isArray(data) ? data[0] : data) as Devolucion
      setDevoluciones(prev => prev.map(x => x.id === d.id ? { ...x, estado: 'ANULADA' } : x))
      setFacturas(prev => prev.map(f => f.id === d.factura_id ? {
        ...f,
        monto_devuelto: Math.max((f.monto_devuelto ?? 0) - d.total, 0),
        estado: d.es_anulacion ? 'emitida' : f.estado,
      } : f))
      void upd
    } catch (err) { alert('Error al anular nota: ' + msgError(err)) }
  }

  /* ════════ GENERAR CÓDIGO (super admin) ═════════════════════ */
  async function generarCodigo(f: Factura, proposito: 'DEVOLUCION' | 'ANULACION') {
    setLoadingCod(true)
    try {
      const { data, error: e } = await supabase.rpc('fn_generar_autorizacion', {
        p_factura_id: f.id, p_proposito: proposito, p_minutos: 60,
      })
      if (e) throw e
      const row = (Array.isArray(data) ? data[0] : data) as { codigo: string; expira_at: string; monto_max: number }
      setCodGenerado({ codigo: row.codigo, expira: row.expira_at, max: Number(row.monto_max) })
    } catch (err) { alert('Error al generar código: ' + msgError(err)) }
    finally { setLoadingCod(false) }
  }

  /* ════════ ELIMINAR FACTURA (solo super admin) ══════════════ */
  async function eliminarFactura() {
    if (!eliminarFact) return
    if (!motivoEliminar.trim()) return alert('Debes ingresar el motivo de eliminación')
    if (!esSuperAdmin) return alert('Solo el Super Administrador puede eliminar facturas')

    setLoadingEliminar(true)
    try {
      // Registrar auditoría ANTES de eliminar
      await supabase.from('facturas_auditoria').insert({
        factura_id:    eliminarFact.id,
        numero:        eliminarFact.numero,
        accion:        'ELIMINADA',
        motivo:        motivoEliminar.trim(),
        datos_antes:   eliminarFact as unknown as Record<string, unknown>,
        usuario_id:    userId,
        usuario_nombre: cajeroNombre,
      })

      const { error: e } = await supabase.from('facturas').delete().eq('id', eliminarFact.id)
      if (e) throw e

      setFacturas(prev => prev.filter(f => f.id !== eliminarFact.id))
      setAuditoria(prev => [{
        id: Date.now(), factura_id: eliminarFact.id, numero: eliminarFact.numero,
        accion: 'ELIMINADA', motivo: motivoEliminar.trim(),
        usuario_nombre: cajeroNombre, fecha: new Date().toISOString(),
      }, ...prev])
      setEliminarFact(null); setMotivoEliminar('')
      if (verFact?.id === eliminarFact.id) setVerFact(null)
    } catch (err) { alert('Error al eliminar: ' + (err instanceof Error ? err.message : err)) }
    finally { setLoadingEliminar(false) }
  }

  /* ════════ IMPRIMIR FACTURA — Formato térmico oficial ═══════ */
  function imprimirFactura(f: Factura) {
    const items = f.items as ItemFactura[]
    const exentoIsv = items.every(it => it.isv_pct === 0)
    abrirFacturaTermica({
      numero: f.numero,
      fecha: f.fecha,
      hora: f.hora,
      cliente_nombre: f.cliente_nombre,
      cliente_rtn: f.cliente_rtn,
      rtn_emisor: f.rtn_emisor,
      correo_emisor: f.correo_emisor ?? undefined,
      subtotal: f.subtotal,
      descuento_monto: f.descuento_monto,
      isv_monto: f.isv_monto,
      total: f.total,
      exento_isv: exentoIsv,
      cai: f.cai,
      rango_inicio: f.rango_inicio,
      rango_fin: f.rango_fin,
      fecha_limite_cai: f.fecha_limite_cai,
      cajero_nombre: f.cajero_nombre,
      medico_nombre: f.medico_nombre,
      items: f.items,
      estado: f.estado,
    })
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Facturación Fiscal"
        subtitle="Control de facturas con CAI, RTN e ISV — Honduras"
        badge={esSuperAdmin ? 'Super Admin · Fiscal' : 'Facturación'}
        icon={FileText}
        kpis={[
          { label: 'Facturas hoy', value: stats.hoyCount, icon: Hash },
          { label: 'Facturas mes', value: stats.mesCount, icon: FileText },
          { label: 'Total mes', value: fmt(stats.mesTotal), icon: DollarSign },
          { label: 'ISV del mes', value: fmt(facturas.filter(f=>f.estado==='emitida').reduce((s,f)=>s+f.isv_monto,0)), icon: Building2 },
          { label: 'Anuladas', value: stats.anuladas, icon: XCircle },
        ]}
        actions={
          <>
            {puedeDevolver && (
              <ModuleBtnGhost onClick={() => setTabActivo(t => t === 'notas' ? 'facturas' : 'notas')}>
                <Receipt className="w-4 h-4" />
                {tabActivo === 'notas' ? 'Ver Facturas' : 'Notas de crédito'}
                {devoluciones.filter(d => d.estado !== 'ANULADA').length > 0 && tabActivo !== 'notas' && (
                  <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">{devoluciones.filter(d => d.estado !== 'ANULADA').length}</span>
                )}
              </ModuleBtnGhost>
            )}
            {esSuperAdmin && (
              <ModuleBtnGhost onClick={() => setTabActivo(t => t === 'auditoria' ? 'facturas' : 'auditoria')}>
                <History className="w-4 h-4" />
                {tabActivo === 'auditoria' ? 'Ver Facturas' : 'Auditoría'}
                {auditoria.length > 0 && tabActivo !== 'auditoria' && (
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">{auditoria.length}</span>
                )}
              </ModuleBtnGhost>
            )}
            {sinSucursal ? (
              <span className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-300/40 text-red-100 rounded-xl text-sm">
                <AlertTriangle className="w-4 h-4"/> Sin sucursal
              </span>
            ) : (
              <ModuleBtnPrimary onClick={() => { setModal(true); setError(''); resetForm() }}>
                <Plus className="w-4 h-4"/> Nueva Factura
              </ModuleBtnPrimary>
            )}
          </>
        }
      />
      <ModuleContent>

      {/* ALERTA CAI */}
      {sucursales.some(s => s.fecha_limite && s.fecha_limite < hoy) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0"/>
          <span>Una o más sucursales tienen el <strong>CAI vencido</strong>. Actualiza los datos fiscales en <strong>Configuración → Sucursales</strong>.</span>
        </div>
      )}

      {/* INFO FISCAL POR SUCURSAL */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sucursales.map(s => {
          const vencido = s.fecha_limite && s.fecha_limite < hoy
          const proxVencer = s.fecha_limite && !vencido && s.fecha_limite <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
          return (
            <div key={s.id} className={`bg-white border rounded-2xl p-4 ${vencido ? 'border-red-300 bg-red-50' : proxVencer ? 'border-amber-300 bg-amber-50' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-500"/> {s.nombre}
                </p>
                {vencido    && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">CAI Vencido</span>}
                {proxVencer && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">CAI por vencer</span>}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">RTN</span>
                  <span className="font-mono">{s.rtn || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">CAI</span>
                  <span className="font-mono text-[10px] truncate max-w-[180px]">{s.cai || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Rango</span>
                  <span className="font-mono text-[10px]">{s.num_min || '—'} → {s.num_max || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha límite</span>
                  <span className={`font-medium ${vencido ? 'text-red-600' : proxVencer ? 'text-amber-600' : ''}`}>
                    {s.fecha_limite || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Próxima factura</span>
                  <span className="font-bold text-blue-600">#{siguienteNumero(s, corrs)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* TABLA FACTURAS */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Número, cliente, RTN…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          </div>
          <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-700">
            <option value="">Todos</option>
            <option value="emitida">Emitidas</option>
            <option value="anulada">Anuladas</option>
          </select>
          <p className="text-sm text-gray-400 ml-auto">{factsFiltradas.length} facturas</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">N° Factura</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sucursal</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">ISV</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {factsFiltradas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                  No hay facturas{buscar ? ' para esta búsqueda' : ' este mes'}
                </td></tr>
              )}
              {factsFiltradas.map(f => (
                <tr key={f.id} className={`hover:bg-gray-50 ${f.estado === 'anulada' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-bold text-blue-700">{f.numero}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{f.fecha} {(f.hora ?? '').slice(0,5)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{f.cliente_nombre}</p>
                    {f.cliente_rtn && <p className="text-xs text-gray-400 font-mono">RTN: {f.cliente_rtn}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{sucursales.find(s => s.id === f.sucursal_id)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(f.subtotal)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{fmt(f.isv_monto)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(f.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.estado === 'emitida' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {f.estado === 'emitida' ? 'Emitida' : 'Anulada'}
                    </span>
                    {f.estado === 'emitida' && (f.monto_devuelto ?? 0) > 0.01 && (
                      <span className="block mt-1 text-[10px] text-orange-600 font-medium">Devuelto {fmt(f.monto_devuelto ?? 0)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setVerFact(f)} title="Ver detalle"
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Eye className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={() => imprimirFactura(f)} title="Imprimir"
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                        <Printer className="w-3.5 h-3.5"/>
                      </button>
                      {/* Generar código de autorización — solo super admin */}
                      {f.estado === 'emitida' && esSuperAdmin && (f.total - (f.monto_devuelto ?? 0)) > 0.01 && (
                        <button onClick={() => { setCodFact(f); setCodGenerado(null) }} title="Generar código de autorización"
                          className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100">
                          <KeyRound className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Devolver — devolución parcial/total */}
                      {f.estado === 'emitida' && puedeDevolver && (f.total - (f.monto_devuelto ?? 0)) > 0.01 && (
                        <button onClick={() => abrirDevolucion(f, false)} title="Devolución / nota de crédito"
                          className="p-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100">
                          <RotateCcw className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Anular — anulación total por el mismo motor */}
                      {f.estado === 'emitida' && puedeDevolver && (
                        <button onClick={() => abrirDevolucion(f, true)} title="Anular factura (reversa total)"
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                          <XCircle className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Eliminar — solo super admin */}
                      {esSuperAdmin && (
                        <button onClick={() => { setEliminarFact(f); setMotivoEliminar('') }} title="Eliminar factura"
                          className="p-1.5 rounded-lg bg-gray-800/10 text-gray-700 hover:bg-red-100 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Candado para usuarios sin permiso */}
                      {!esSuperAdmin && !puedeDevolver && f.estado === 'emitida' && (
                        <span title="No tienes permiso para devolver/anular facturas"
                          className="p-1.5 text-gray-300 cursor-not-allowed">
                          <Lock className="w-3.5 h-3.5"/>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ TAB AUDITORÍA (solo super admin) ══ */}
      {esSuperAdmin && tabActivo === 'auditoria' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-red-50">
            <History className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="font-bold text-gray-900">Historial de Auditoría</h2>
              <p className="text-xs text-gray-500">Registro de todas las anulaciones y eliminaciones de facturas</p>
            </div>
            <span className="ml-auto bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {auditoria.length} registros
            </span>
          </div>
          {auditoria.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Sin registros de auditoría</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">Fecha / Hora</th>
                    <th className="px-4 py-3 text-left">Factura</th>
                    <th className="px-4 py-3 text-center">Acción</th>
                    <th className="px-4 py-3 text-left">Motivo</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditoria.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(a.fecha).toLocaleString('es-HN')}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{a.numero || `#${a.factura_id}`}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          a.accion === 'ELIMINADA'
                            ? 'bg-gray-800 text-white'
                            : a.accion === 'ANULADA'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {a.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{a.motivo}</td>
                      <td className="px-4 py-3 text-gray-600">{a.usuario_nombre || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setVerAudit(a)}
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                          title="Ver datos completos"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB NOTAS DE CRÉDITO ══ */}
      {puedeDevolver && tabActivo === 'notas' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-orange-50">
            <Receipt className="w-5 h-5 text-orange-600" />
            <div>
              <h2 className="font-bold text-gray-900">Notas de crédito (devoluciones y anulaciones)</h2>
              <p className="text-xs text-gray-500">Reversas registradas este mes</p>
            </div>
            <span className="ml-auto bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {devoluciones.length} notas
            </span>
          </div>
          {devoluciones.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Sin notas de crédito este mes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">N° Nota</th>
                    <th className="px-4 py-3 text-left">Factura</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-center">Tipo</th>
                    <th className="px-4 py-3 text-left">Reembolso</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devoluciones.map(d => (
                    <tr key={d.id} className={`hover:bg-gray-50 ${d.estado === 'ANULADA' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-orange-700 font-semibold">{d.numero}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{d.factura_numero || `#${d.factura_id}`}</td>
                      <td className="px-4 py-3 text-gray-700">{d.paciente_nombre || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.es_anulacion ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {d.es_anulacion ? 'Anulación' : 'Devolución'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.tipo_reembolso === 'SALDO_FAVOR' ? 'Saldo a favor' : d.tipo_reembolso}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(d.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.estado === 'ANULADA' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                          {d.estado === 'ANULADA' ? 'Anulada' : 'Emitida'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => abrirNotaCredito({
                            numero: d.numero, factura_numero: d.factura_numero, fecha: d.fecha, hora: d.hora,
                            cliente_nombre: d.paciente_nombre,
                            sucursal_nombre: sucursales.find(s => s.id === d.sucursal_id)?.nombre ?? null,
                            cajero_nombre: d.cajero_nombre, motivo: d.motivo,
                            tipo_reembolso: d.tipo_reembolso, es_anulacion: d.es_anulacion,
                            subtotal: d.subtotal, isv_monto: d.isv_monto, total: d.total, items: d.items,
                          })} title="Imprimir nota"
                            className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                            <Printer className="w-3.5 h-3.5"/>
                          </button>
                          {esSuperAdmin && d.estado !== 'ANULADA' && (
                            <button onClick={() => anularDevolucion(d)} title="Anular nota de crédito"
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                              <XCircle className="w-3.5 h-3.5"/>
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

      {/* ══ MODAL NUEVA FACTURA ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600"/> Nueva Factura
              </h2>
              <button onClick={() => { setModal(false); resetForm() }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</p>}

              {/* info fiscal sucursal seleccionada */}
              {sucSeleccionada && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs space-y-0.5">
                  <p className="font-semibold text-blue-800 text-sm mb-1">{sucSeleccionada.nombre}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                    <span><span className="text-gray-400">RTN:</span> {sucSeleccionada.rtn || '—'}</span>
                    <span><span className="text-gray-400">Próx. N°:</span> <span className="font-bold text-blue-700">#{siguienteNumero(sucSeleccionada, corrs)}</span></span>
                    <span className="col-span-2 truncate"><span className="text-gray-400">CAI:</span> {sucSeleccionada.cai || '—'}</span>
                    <span><span className="text-gray-400">Rango:</span> {sucSeleccionada.num_min} → {sucSeleccionada.num_max}</span>
                    <span><span className="text-gray-400">Límite:</span> <span className={sucSeleccionada.fecha_limite && sucSeleccionada.fecha_limite < hoy ? 'text-red-600 font-bold' : ''}>{sucSeleccionada.fecha_limite || '—'}</span></span>
                  </div>
                </div>
              )}

              {/* sucursal + paciente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Sucursal</label>
                  <select value={form.sucursal_id} onChange={e => setForm(p => ({ ...p, sucursal_id: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">ISV</label>
                  <select value={form.exento_isv ? 'exento' : 'gravado'}
                    onChange={e => setForm(p => ({ ...p, exento_isv: e.target.value === 'exento' }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="exento">Exento de ISV (medicina)</option>
                    <option value="gravado">Gravado (15%)</option>
                  </select>
                </div>
              </div>

              {/* datos del cliente */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-600 uppercase block">Datos del Cliente</label>
                {/* buscar paciente */}
                <input value={buscarPac} onChange={e => setBuscarPac(e.target.value)}
                  placeholder="Buscar paciente registrado (opcional)…"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                {buscarPac && (
                  <div className="border rounded-lg overflow-hidden max-h-32 overflow-y-auto bg-white shadow-sm">
                    {pacientes.filter(p => `${p.nombre} ${p.apellido1}`.toLowerCase().includes(buscarPac.toLowerCase())).slice(0, 8).map(p => (
                      <button key={p.id} onClick={() => {
                        setForm(prev => ({ ...prev, paciente_id: p.id, cliente_nombre: `${p.nombre} ${p.apellido1} ${p.apellido2 || ''}`.trim(), cliente_email: p.correo || '' }))
                        setBuscarPac('')
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0">
                        {p.nombre} {p.apellido1} {p.apellido2 || ''}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Nombre / Razón Social *</label>
                    <input value={form.cliente_nombre} onChange={e => setForm(p => ({ ...p, cliente_nombre: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">RTN del cliente</label>
                    <input value={form.cliente_rtn} onChange={e => setForm(p => ({ ...p, cliente_rtn: e.target.value }))}
                      placeholder="0000-0000-000000"
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                </div>
              </div>

              {/* ítems */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Ítems / Servicios</label>
                  <button onClick={() => setItems(p => [...p, { ...itemVacio }])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Plus className="w-3.5 h-3.5"/> Agregar línea
                  </button>
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left text-xs text-gray-500">Descripción</th>
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-16">Cant.</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-28">P. Unit.</th>
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-20">ISV %</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-24">Subtotal</th>
                        <th className="w-8"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <input value={it.descripcion} onChange={e => recalcularItem(i, 'descripcion', e.target.value)}
                              placeholder="Descripción del servicio…"
                              className="w-full border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={1} value={it.cantidad} onChange={e => recalcularItem(i, 'cantidad', Number(e.target.value))}
                              className="w-full text-center border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={e => recalcularItem(i, 'precio_unitario', Number(e.target.value))}
                              className="w-full text-right border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <select value={it.isv_pct} onChange={e => recalcularItem(i, 'isv_pct', Number(e.target.value))}
                              disabled={form.exento_isv}
                              className="w-full border-0 text-xs text-center focus:outline-none rounded py-0.5 disabled:opacity-50">
                              <option value={0}>0% Exento</option>
                              <option value={15}>15%</option>
                              <option value={18}>18%</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm font-medium text-gray-700">
                            {fmt(it.subtotal)}
                          </td>
                          <td className="pr-2">
                            {items.length > 1 && (
                              <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* totales */}
                <div className="mt-3 flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span><span>{fmt(totales.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>ISV ({form.exento_isv ? 'Exento' : '15%'})</span>
                      <span>{fmt(totales.isv_monto)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 text-lg border-t pt-1">
                      <span>TOTAL</span><span className="text-blue-700">{fmt(totales.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => { setModal(false); resetForm() }} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarFactura} disabled={loading}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                Emitir Factura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL VER / IMPRIMIR ══ */}
      {verFact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Factura {verFact.numero}</h2>
              <div className="flex gap-2">
                <button onClick={() => imprimirFactura(verFact)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">
                  <Printer className="w-4 h-4"/> Imprimir
                </button>
                <button onClick={() => setVerFact(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Cliente</p>
                  <p className="font-semibold">{verFact.cliente_nombre}</p>
                  {verFact.cliente_rtn && <p className="text-xs font-mono text-gray-500">RTN: {verFact.cliente_rtn}</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Fecha / Cajero</p>
                  <p className="font-semibold">{verFact.fecha}</p>
                  <p className="text-xs text-gray-500">{verFact.cajero_nombre}</p>
                </div>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-center">Cant</th>
                    <th className="px-2 py-2 text-right">Subtotal</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {(verFact.items as ItemFactura[]).map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{it.descripcion}</td>
                        <td className="px-2 py-2 text-center">{it.cantidad}</td>
                        <td className="px-2 py-2 text-right">{fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-52 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(verFact.subtotal)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>ISV</span><span>{fmt(verFact.isv_monto)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-1"><span>TOTAL</span><span className="text-blue-700">{fmt(verFact.total)}</span></div>
                </div>
              </div>
              {verFact.cai && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-0.5">
                  <p><span className="font-semibold text-gray-700">CAI:</span> {verFact.cai}</p>
                  <p><span className="font-semibold text-gray-700">Rango:</span> {verFact.rango_inicio} — {verFact.rango_fin}</p>
                  <p><span className="font-semibold text-gray-700">Fecha límite:</span> {verFact.fecha_limite_cai}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DEVOLUCIÓN / ANULACIÓN (motor unificado) ══ */}
      {devFact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className={`flex items-center justify-between px-6 py-4 border-b ${devEsAnula ? 'bg-red-50' : 'bg-orange-50'}`}>
              <h2 className={`font-bold flex items-center gap-2 ${devEsAnula ? 'text-red-700' : 'text-orange-700'}`}>
                {devEsAnula ? <XCircle className="w-5 h-5"/> : <RotateCcw className="w-5 h-5"/>}
                {devEsAnula ? 'Anular' : 'Devolver'} — Factura {devFact.numero}
              </h2>
              <button onClick={() => setDevFact(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {errorDev && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{errorDev}</p>}

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-700">
                  {devEsAnula
                    ? 'La anulación reembolsa el total restante, revierte puntos y, si lo marcas, reingresa inventario. La factura quedará ANULADA.'
                    : 'Selecciona las líneas y cantidades a devolver. Se generará una nota de crédito con el reembolso y los reversos correspondientes.'}
                </p>
              </div>

              {/* líneas */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs text-gray-500">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2 text-left">Descripción</th>
                      <th className="px-2 py-2 text-center w-20">Devolver</th>
                      <th className="px-2 py-2 text-right w-24">P. Unit</th>
                      <th className="px-2 py-2 text-left w-44">Reingresar a stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {devLineas.map(l => (
                      <tr key={l.idx} className={l.cantDisponible <= 0 ? 'opacity-40' : ''}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={l.seleccionada} disabled={devEsAnula || l.cantDisponible <= 0}
                            onChange={e => setLinea(l.idx, { seleccionada: e.target.checked })}/>
                        </td>
                        <td className="px-2 py-2">
                          <p className="text-gray-800">{l.descripcion}</p>
                          <p className="text-[10px] text-gray-400">Disponible: {l.cantDisponible} de {l.cantOriginal}</p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" min={0} max={l.cantDisponible} value={l.cantidad}
                            disabled={devEsAnula || !l.seleccionada || l.cantDisponible <= 0}
                            onChange={e => setLinea(l.idx, { cantidad: Math.min(Number(e.target.value), l.cantDisponible) })}
                            className="w-16 text-center border rounded px-1 py-0.5 text-sm disabled:bg-gray-50"/>
                        </td>
                        <td className="px-2 py-2 text-right text-gray-600">{fmt(l.precio_unitario)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input type="checkbox" checked={l.reingresa} disabled={!l.seleccionada}
                              onChange={e => setLinea(l.idx, { reingresa: e.target.checked })}/>
                            <select value={l.producto_id} disabled={!l.seleccionada || !l.reingresa}
                              onChange={e => setLinea(l.idx, { producto_id: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="flex-1 border rounded px-1 py-0.5 text-xs disabled:bg-gray-50 max-w-[150px]">
                              <option value="">— sin stock —</option>
                              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* reembolso */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Tipo de reembolso</label>
                  <select value={devReembolso} onChange={e => setDevReembolso(e.target.value as typeof devReembolso)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="EFECTIVO">Efectivo (egreso de caja)</option>
                    <option value="TARJETA">Tarjeta (egreso de caja)</option>
                    <option value="TRANSFERENCIA">Transferencia (egreso de caja)</option>
                    <option value="SALDO_FAVOR" disabled={!devFact.paciente_id}>Saldo a favor del paciente</option>
                  </select>
                  {devReembolso !== 'SALDO_FAVOR' && devSinCaja && (
                    <p className="text-[11px] text-red-600 mt-1">No hay caja abierta en esta sucursal. Abre caja o usa saldo a favor.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Referencia (opcional)</label>
                  <input value={devReferencia} onChange={e => setDevReferencia(e.target.value)}
                    placeholder="N° de voucher, transferencia…"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Motivo *</label>
                <textarea value={devMotivo} onChange={e => setDevMotivo(e.target.value)} rows={2}
                  placeholder="Ej: El paciente devuelve el medicamento sin abrir…"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>

              {!esSuperAdmin && (
                <div>
                  <label className="text-xs font-semibold text-violet-700 uppercase mb-1 block flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5"/> Código de autorización del super usuario *
                  </label>
                  <input value={devCodigo} onChange={e => setDevCodigo(e.target.value)} maxLength={6}
                    placeholder="000000"
                    className="w-40 border-2 border-violet-200 rounded-lg px-3 py-2 text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-violet-300"/>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-between">
              <div className="text-sm">
                <span className="text-gray-500">Total a reembolsar: </span>
                <span className={`font-bold text-lg ${devEsAnula ? 'text-red-700' : 'text-orange-700'}`}>{fmt(devTotal)}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDevFact(null)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={procesarDevolucion} disabled={loadingDev || devTotal <= 0}
                  className={`px-5 py-2 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2 ${devEsAnula ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                  {loadingDev ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                  {devEsAnula ? 'Confirmar Anulación' : 'Confirmar Devolución'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL GENERAR CÓDIGO (super admin) ══ */}
      {codFact && esSuperAdmin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-violet-50">
              <h2 className="font-bold text-violet-700 flex items-center gap-2">
                <KeyRound className="w-5 h-5"/> Código de autorización
              </h2>
              <button onClick={() => { setCodFact(null); setCodGenerado(null) }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                Factura <strong>{codFact.numero}</strong> — saldo disponible {fmt(codFact.total - (codFact.monto_devuelto ?? 0))}.
                Genera un código de un solo uso para que el cajero registre la operación.
              </p>
              {!codGenerado ? (
                <div className="flex gap-3">
                  <button onClick={() => generarCodigo(codFact, 'DEVOLUCION')} disabled={loadingCod}
                    className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingCod ? <RefreshCw className="w-4 h-4 animate-spin"/> : <RotateCcw className="w-4 h-4"/>} Para devolución
                  </button>
                  <button onClick={() => generarCodigo(codFact, 'ANULACION')} disabled={loadingCod}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingCod ? <RefreshCw className="w-4 h-4 animate-spin"/> : <XCircle className="w-4 h-4"/>} Para anulación
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-2 bg-violet-50 border border-violet-200 rounded-xl py-5">
                  <p className="text-xs text-violet-600 uppercase font-semibold">Código (válido 60 min · un solo uso)</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-4xl font-mono font-bold tracking-widest text-violet-800">{codGenerado.codigo}</span>
                    <button onClick={() => navigator.clipboard?.writeText(codGenerado.codigo)} title="Copiar"
                      className="p-2 rounded-lg bg-white border text-violet-600 hover:bg-violet-100">
                      <Copy className="w-4 h-4"/>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Monto máximo autorizado: <strong>{fmt(codGenerado.max)}</strong></p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => { setCodFact(null); setCodGenerado(null) }} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ELIMINAR (super admin) ══ */}
      {eliminarFact && esSuperAdmin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border-2 border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-900">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" /> Eliminar Factura {eliminarFact.numero}
              </h2>
              <button onClick={() => setEliminarFact(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">⚠️ Acción IRREVERSIBLE</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    La factura será eliminada permanentemente de la base de datos. Esta operación no se puede deshacer. Solo procede si es absolutamente necesario.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <div><span className="font-medium">Número:</span> {eliminarFact.numero}</div>
                <div><span className="font-medium">Total:</span> {fmt(eliminarFact.total)}</div>
                <div><span className="font-medium">Cliente:</span> {eliminarFact.cliente_nombre}</div>
                <div><span className="font-medium">Estado:</span> {eliminarFact.estado}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-red-700 uppercase mb-1 block">Motivo de eliminación * (quedará en auditoría)</label>
                <textarea value={motivoEliminar} onChange={e => setMotivoEliminar(e.target.value)} rows={3}
                  placeholder="Ej: Factura de prueba, registro duplicado, error de sistema…"
                  className="w-full border-2 border-red-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Esta eliminación quedará registrada con tu usuario: <strong>{cajeroNombre}</strong>
              </p>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setEliminarFact(null)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={eliminarFactura} disabled={loadingEliminar || !motivoEliminar.trim()}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                {loadingEliminar && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>}
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DETALLE AUDITORÍA ══ */}
      {verAudit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-red-600" /> Registro de Auditoría #{verAudit.id}
              </h2>
              <button onClick={() => setVerAudit(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-gray-500 uppercase">Acción</span>
                  <p className={`font-bold mt-0.5 ${verAudit.accion === 'ELIMINADA' ? 'text-gray-800' : 'text-red-700'}`}>{verAudit.accion}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Factura</span>
                  <p className="font-mono font-medium mt-0.5">{verAudit.numero || `#${verAudit.factura_id}`}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Usuario</span>
                  <p className="font-medium mt-0.5">{verAudit.usuario_nombre || '—'}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Fecha y Hora</span>
                  <p className="mt-0.5">{new Date(verAudit.fecha).toLocaleString('es-HN')}</p>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Motivo registrado</span>
                <p className="text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-800">{verAudit.motivo}</p>
              </div>
              {verAudit.datos_antes && (
                <div>
                  <span className="text-xs text-gray-500 uppercase block mb-1">Datos de la factura al momento del evento</span>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 border rounded-lg p-3">
                    {(['numero','cliente_nombre','cliente_rtn','fecha','total','estado','cajero_nombre'] as const).map(k => (
                      (verAudit.datos_antes as Record<string, unknown>)[k] != null && (
                        <div key={k}>
                          <span className="text-gray-400 capitalize">{k.replace('_',' ')}: </span>
                          <span className="font-medium text-gray-700">{String((verAudit.datos_antes as Record<string, unknown>)[k])}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => setVerAudit(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
