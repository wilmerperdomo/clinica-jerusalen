'use client'

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { generarLineasProduccion } from '@/lib/planilla-utils'
import {
  DollarSign, TrendingUp, TrendingDown, Save, Plus,
  RefreshCw, CreditCard, Banknote, ArrowRightLeft, Clock,
  CheckCircle2, AlertCircle, Receipt, Users, ChevronDown,
  LockKeyhole, Unlock, Wallet, FileText, Printer, FlaskConical,
  Stethoscope, Pill, ClipboardList, BadgeCheck, Gift, Tags, Pencil, Power,
  AlertTriangle, type LucideIcon,
} from 'lucide-react'
import {
  calcularDescuentoEdad,
  type LabGrupoCobro,
} from '@/lib/lab-cobro-utils'
import {
  descuentoEfectivo,
  desglosarLineasCobro,
  getMembresiaPaciente,
  tieneBeneficiosMembresia,
  type MembresiasMap,
  type MembresiaPacienteInfo,
} from '@/lib/membresia-utils'
import PagoAgradecimientoPanel from '@/components/pago-agradecimiento-panel'
import {
  reservarSiguienteCorrelativo, confirmarCorrelativo, esErrorNumeroDuplicado,
} from '@/lib/factura-correlativo'
import { abrirFacturaTermica, facturaPrintDesdeRegistro, type FacturaPrintData } from '@/lib/factura-print'
import { generarAccesoPortal } from '@/app/(dashboard)/laboratorio/portal-actions'
import { abrirCierreCajaPrint, type CajaCierrePrintData } from '@/lib/caja-cierre-print'
import { formatearNombreMedico } from '@/lib/medico-utils'
import type { PacienteBusqueda } from '@/components/buscar-paciente-input'
import { nombrePaciente, esPacienteEmpresa } from '@/lib/consultas-utils'
import { BRAND } from '@/lib/brand'
import { FORMAS_PAGO } from '@/lib/caja-constants'
import { fmtCaja as fmt } from '@/lib/caja-format'
import {
  descuentoEdadPaciente,
  validarCreditoConPaciente,
  validarDescuento,
  validarReferenciaPago,
  validarSesionOperacion,
} from '@/lib/caja-seguridad'
import { insertarMovimientoCaja, insertarMovimientosCaja } from '@/lib/caja-movimiento-utils'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost } from '@/components/module-layout'
import { useConfirm } from '@/components/confirm-dialog'
import { Modal } from './components/caja-modal'
import VentaRapidaModal from './components/venta-rapida-modal'
import NombreFacturarProtegido from './components/nombre-facturar-protegido'
import { useVentaRapida } from './hooks/use-venta-rapida'
import { columnaConsultaDetalle, valorConsultaDetalle } from '@/lib/consulta-detalle-utils'
import { PREFIJOS_CONCEPTO_VENTA } from '@/lib/venta-rapida/constants'
import type { VentaRapidaIngresoOk } from '@/lib/venta-rapida/types'
import {
  acumularPuntosPorFactura,
  canjearPuntosLaboratorio,
  descuentoMaximoCanje,
  maxPuntosCanjeables,
  obtenerSaldoPuntos,
  valorLempirasDePuntos,
} from '@/lib/fidelidad-puntos'
import type { FidelidadConfig } from '@/lib/fidelidad-config'

/* ─── tipos ─────────────────────────────────────────────── */
interface Concepto { id: number; nombre: string; tipo: 'INGRESO' | 'EGRESO'; categoria?: string; activo?: boolean }
interface Movimiento {
  id: number; tipo: 'INGRESO' | 'EGRESO'; concepto: string
  monto: number; forma_pago: string; paciente_nombre?: string
  hora?: string; nota?: string; anulado?: boolean
  referencia_pago?: string
}
interface Sesion {
  id: number; monto_inicial: number; hora_apertura: string
  cajero_nombre?: string; sucursal_id?: number
  total_ingresos: number; total_egresos: number
  estado: string; fecha?: string
  hora_cierre?: string
  movimientos?: Movimiento[]
}

type MovimientoConSaldo = Movimiento & { saldoAcum?: number }

interface DiaHistorialCaja {
  fecha: string
  sesion: Sesion
  movimientos: MovimientoConSaldo[]
  totalIng: number
  totalEgr: number
}
type Paciente = PacienteBusqueda
interface Sucursal {
  id: number; nombre: string; direccion?: string; telefono?: string
  rtn?: string; cai?: string; num_min?: string | number | null
  num_max?: string | number | null; numero_inicial?: string | number | null
  fecha_limite?: string; lema?: string
  tercera_edad?: number; cuarta_edad?: number
  por_descuento_tercera?: number; por_descuento_cuarta?: number
  fondo_caja?: number
}
interface Perfil   { nombre?: string; apellido?: string; sucursal_id?: number }
interface CXC {
  id: number; paciente_id?: number; paciente_nombre?: string; concepto?: string
  monto_total: number; monto_pagado: number; saldo: number
  estado: string; fecha: string
  paciente?: { nombre: string; apellido1: string }
}

interface Servicio     { id: number; nombre: string; tipo: string; precio: number }
interface ProductoVenta { id: number; codigo: string; nombre: string; precio_venta: number; tipo?: string }
interface PruebaLab    { id: number; nombre: string; costo: number }
interface Correlativo  { sucursal_id: number; ultimo_numero: number }
interface ConsultaServicio { id: number; nombre: string; precio: number; cantidad: number }
interface ConsultaDetalle  { id: number; no_producto: string; cant: number; precio_venta?: number; producto_id?: number }
interface ConsultaAnalisis { id: number; no_analisis: string; importe: number }
interface ConsultaPorCobrar {
  id: number
  paciente_id: number
  fecha: string
  hora: string
  cobrado: boolean
  doctor_id?: string
  sucursal_id?: number
  tipo_nombre?: string
  consulta_valor?: number
  paciente?: {
    id: number; codigo: string; tipo?: string
    nombre: string; apellido1: string; apellido2?: string
    nombre_empresa?: string | null; rtn_empresa?: string | null; contacto?: string | null
    fecha_nac?: string
    celular?: string; telefono?: string; correo?: string
  }
  consulta_servicios?: ConsultaServicio[]
  consulta_detalle?: ConsultaDetalle[]
  consulta_analisis?: ConsultaAnalisis[]
}

interface MembresiaPagoCobro {
  id: number
  membresia_id: number
  numero_cuota: number
  fecha_vencimiento: string
  monto: number
  estado: string
  membresia?: {
    numero_carnet?: string
    paciente_id?: number
    sucursal_id?: number
    tipo?: { nombre: string }
    paciente?: {
      id: number
      codigo?: string
      nombre: string
      apellido1: string
      apellido2?: string
      telefono?: string
      celular?: string
      correo?: string
    }
  }
}

interface CotizacionPorCobrar {
  id: number
  numero: string
  sucursal_id: number
  cliente_nombre: string
  cliente_rtn?: string | null
  cliente_email?: string | null
  paciente_id?: number | null
  items: unknown
  subtotal: number
  descuento_monto: number
  isv_monto: number
  total: number
  exento_isv: boolean
  fecha: string
}

interface Props {
  sesionActual:       Sesion | null
  conceptos:          Concepto[]
  pacientes:          Paciente[]
  sucursales:         Sucursal[]
  perfil:             Perfil | null
  userId:             string
  esAdmin:            boolean
  esSuperAdmin?:      boolean
  fechaHoy:           string
  cxcPendientes:      CXC[]
  servicios:          Servicio[]
  productos:          ProductoVenta[]
  pruebasLab:         PruebaLab[]
  consultasPorCobrar:      ConsultaPorCobrar[]
  labGruposPorCobrar:      LabGrupoCobro[]
  membresiaPagosPorCobrar: MembresiaPagoCobro[]
  membresiasMap:           MembresiasMap
  cotizacionesPorCobrar:   CotizacionPorCobrar[]
  correlativos:            Correlativo[]
  membresiaPagoPrecarga?:  number | null
  fidelidadConfig:         FidelidadConfig
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/* ═══════════════════════════════════════════════════════ */
export default function CajaClient({
  sesionActual: initSesion, conceptos, pacientes, sucursales,
  perfil, userId, esAdmin, esSuperAdmin = false, fechaHoy, cxcPendientes: initCxc, servicios, productos, pruebasLab,
  consultasPorCobrar: initConsultasPorCobrar,
  labGruposPorCobrar: initLabGruposPorCobrar,
  membresiaPagosPorCobrar: initMembresiaPagosPorCobrar,
  membresiasMap,
  cotizacionesPorCobrar: initCotizacionesPorCobrar,
  correlativos: initCorrelativos,
  membresiaPagoPrecarga = null,
  fidelidadConfig,
}: Props) {
  const confirmDialog = useConfirm()
  const [sesion,   setSesion]   = useState<Sesion | null>(initSesion)
  const [cxc,      setCxc]      = useState<CXC[]>(initCxc)
  const [tab, setTab] = useState<'movimientos' | 'cxc' | 'cobrar' | 'lab_cobrar' | 'membresias_cobrar' | 'cot_cobrar'>('movimientos')
  const [vistaMovs, setVistaMovs] = useState<'hoy' | 'historial'>('hoy')
  const [historialDias, setHistorialDias] = useState<DiaHistorialCaja[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [consultasPorCobrar, setConsultasPorCobrar] = useState<ConsultaPorCobrar[]>(initConsultasPorCobrar ?? [])
  const [labPorCobrar, setLabPorCobrar] = useState<LabGrupoCobro[]>(initLabGruposPorCobrar ?? [])
  const [membresiaPorCobrar, setMembresiaPorCobrar] = useState<MembresiaPagoCobro[]>(initMembresiaPagosPorCobrar ?? [])
  const [cotPorCobrar, setCotPorCobrar] = useState<CotizacionPorCobrar[]>(initCotizacionesPorCobrar ?? [])
  const [cotCobro, setCotCobro] = useState<CotizacionPorCobrar | null>(null)
  const [modalCobroCot, setModalCobroCot] = useState(false)
  const [guardandoCobroCot, setGuardandoCobroCot] = useState(false)
  const [formCobroCot, setFormCobroCot] = useState({
    forma_pago: 'EFECTIVO', referencia: '', nota: '',
  })
  const [modalCobroLab, setModalCobroLab] = useState(false)
  const [modalCobroMembresia, setModalCobroMembresia] = useState(false)
  const [membresiaPagoCobro, setMembresiaPagoCobro] = useState<MembresiaPagoCobro | null>(null)
  const [guardandoCobroMembresia, setGuardandoCobroMembresia] = useState(false)
  const [formCobroMembresia, setFormCobroMembresia] = useState({
    forma_pago: 'EFECTIVO', referencia: '', nota: '',
  })
  const precargaMembresiaRef = useRef(false)
  const [labGrupoCobro, setLabGrupoCobro] = useState<LabGrupoCobro | null>(null)
  const [labCobroExitoso, setLabCobroExitoso] = useState<{
    total: number; pacNombre: string; formaPago: string; puntosCanjeados?: number
    paciente?: { nombre: string; apellido1: string; celular?: string; telefono?: string; correo?: string }
  } | null>(null)
  const [labFacturaCtx, setLabFacturaCtx] = useState<{
    grupo: LabGrupoCobro; subtotal: number; valDesc: number
  } | null>(null)
  const [modalFacturaLab, setModalFacturaLab] = useState(false)
  const [guardandoCobroLab, setGuardandoCobroLab] = useState(false)
  const [formCobroLab, setFormCobroLab] = useState({
    forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0', descuento_confirmado: false,
  })
  const [puntosFidelidadLab, setPuntosFidelidadLab] = useState(0)
  const [usarPuntosLab, setUsarPuntosLab] = useState(false)
  const [puntosCanjearLab, setPuntosCanjearLab] = useState('')
  const [loadingCobro, setLoadingCobro] = useState(false)
  const [modalCobro,     setModalCobro]     = useState(false)
  const [cobroExitoso, setCobroExitoso] = useState<{
    total: number; pacNombre: string; formaPago: string
    paciente?: { nombre: string; apellido1: string; celular?: string; telefono?: string; correo?: string }
  } | null>(null)
  const [consultaCobro,  setConsultaCobro]  = useState<ConsultaPorCobrar | null>(null)
  const [correlativos,   setCorrelativos]   = useState(initCorrelativos)
  const [modalFactura,   setModalFactura]   = useState(false)
  const [formFactura,    setFormFactura]    = useState({ nombre_cliente: '', rtn_cliente: '', exento: true })
  const [titularFacturaRegistrado, setTitularFacturaRegistrado] = useState({ nombre: '', rtn: '' })
  const [guardandoFact,  setGuardandoFact]  = useState(false)
  const [factImpresa,    setFactImpresa]    = useState<Record<string, unknown> | null>(null)
  const [formCobro, setFormCobro] = useState({
    forma_pago: 'EFECTIVO', referencia: '', nota: '',
    descuento_pct: '0', monto_manual: '', descuento_confirmado: false,
  })
  const [guardandoCobro, setGuardandoCobro] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorAp,   setErrorAp]   = useState('')
  const [loadingAp, setLoadingAp] = useState(false)

  // Auto-seleccionar: perfil → sesión abierta → primera sucursal
  const sucursalActivaId = perfil?.sucursal_id ?? sesion?.sucursal_id ?? sucursales[0]?.id
  const sucursalDefault = String(sucursalActivaId || '')
  const sucursalActiva = sucursales.find(s => s.id === sucursalActivaId) ?? sucursales[0]

  /* apertura */
  const [formApertura, setFormApertura] = useState({
    monto_inicial: sucursalActiva?.fondo_caja ? String(sucursalActiva.fondo_caja) : '',
    sucursal_id: sucursalDefault,
  })
  const [fondoMsg, setFondoMsg] = useState<string | null>(null)
  const [guardandoFondo, setGuardandoFondo] = useState(false)

  const [modalCierre, setModalCierre] = useState(false)
  const [modalConceptos, setModalConceptos] = useState(false)
  const [conceptosEgreso, setConceptosEgreso] = useState<Concepto[]>([])
  const [cargandoConceptos, setCargandoConceptos] = useState(false)
  const [formConcepto, setFormConcepto] = useState<{ id: number | null; nombre: string; categoria: string }>({ id: null, nombre: '', categoria: '' })
  const [guardandoConcepto, setGuardandoConcepto] = useState(false)
  const [modalAbono,  setModalAbono]  = useState(false)
  const [guardandoAbono, setGuardandoAbono] = useState(false)
  const [cxcActual,   setCxcActual]   = useState<CXC | null>(null)

  const [formCierre, setFormCierre] = useState({
    efectivo_apertura: '',
    ventas_efectivo: '',
    egresos_contado: '',
    tarjeta_real: '',
    transfer_real: '',
    observacion: '',
  })

  const [formAbono, setFormAbono] = useState({
    monto: '', forma_pago: 'EFECTIVO', referencia: '', nota: '',
  })

  const [ventaRapidaCobro, setVentaRapidaCobro] = useState<VentaRapidaIngresoOk | null>(null)
  const [modalFacturaVentaRapida, setModalFacturaVentaRapida] = useState(false)
  const [formFacturaVentaRapida, setFormFacturaVentaRapida] = useState({
    nombre_cliente: '', rtn_cliente: '', exento: true,
  })
  const [titularFacturaVentaRapida, setTitularFacturaVentaRapida] = useState({ nombre: '', rtn: '' })
  const [guardandoFactVentaRapida, setGuardandoFactVentaRapida] = useState(false)
  const [factImpresaVentaRapida, setFactImpresaVentaRapida] = useState<Record<string, unknown> | null>(null)

  const supabase = sb()

  const MSG_CIERRE_SIN_FACTURA =
    'El cobro ya quedó registrado en caja. Si cierra sin facturar, la venta puede quedar pendiente en el orden cronológico de facturación. Deberá emitir la factura después desde el módulo Facturación.'

  async function confirmarCierreSinFacturar(): Promise<boolean> {
    const { confirmed } = await confirmDialog({
      title: 'Cerrar sin facturar',
      message: MSG_CIERRE_SIN_FACTURA + ' ¿Desea cerrar sin facturar?',
      variant: 'warning',
      confirmLabel: 'Cerrar sin facturar',
    })
    return confirmed
  }

  async function cerrarFlujoFacturaVentaRapida() {
    if (ventaRapidaCobro && !factImpresaVentaRapida && !(await confirmarCierreSinFacturar())) return
    setVentaRapidaCobro(null)
    setModalFacturaVentaRapida(false)
    setFactImpresaVentaRapida(null)
    setFormFacturaVentaRapida({ nombre_cliente: '', rtn_cliente: '', exento: true })
  }

  const ventaRapida = useVentaRapida({
    supabase,
    sesion,
    userId,
    esAdmin,
    fechaHoy,
    perfilSucursalId: perfil?.sucursal_id,
    sucursalActiva,
    pacientesIniciales: pacientes,
    servicios,
    productos,
    pruebasLab,
    conceptos,
    membresiasMap,
    onIngresoExitoso: (data) => {
      const factInit = datosFacturaDesdePaciente(data.paciente as ConsultaPorCobrar['paciente'])
      setTitularFacturaVentaRapida({ nombre: factInit.nombre_cliente, rtn: factInit.rtn_cliente })
      setFormFacturaVentaRapida({
        nombre_cliente: factInit.nombre_cliente,
        rtn_cliente: factInit.rtn_cliente,
        exento: true,
      })
      setVentaRapidaCobro(data)
      startTransition(() => { recargar() })
    },
    onEgresoExitoso: () => startTransition(() => { recargar() }),
  })

  /* ── calcular edad desde fecha_nacimiento ─ */
  function calcularEdad(fechaNac: string): number {
    const hoy  = new Date()
    const nac  = new Date(fechaNac)
    let edad   = hoy.getFullYear() - nac.getFullYear()
    const m    = hoy.getMonth() - nac.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
    return edad
  }

  /* ── formatear fecha de nacimiento para confirmación visible ─ */
  function fmtFechaNac(fecha?: string | null): string {
    if (!fecha) return ''
    const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
    if (Number.isNaN(d.getTime())) return String(fecha)
    return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  /* ── recargar sesión ─ */
  async function recargar() {
    const { data } = await supabase
      .from('caja_sesiones')
      .select('*, movimientos:caja_movimientos(*)')
      .eq('cajero_id', userId)
      .eq('fecha', fechaHoy)
      .eq('estado', 'ABIERTA')
      .maybeSingle()
    setSesion(data)

    const { data: c } = await supabase
      .from('cxc')
      .select('*, paciente:pacientes(nombre, apellido1)')
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('fecha', { ascending: false })
      .limit(50)
    if (c) setCxc(c)

    const { data: mp } = await supabase
      .from('membresia_pagos')
      .select(`
        id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado,
        membresia:membresias(
          numero_carnet, paciente_id, sucursal_id,
          tipo:membresia_tipos(nombre),
          paciente:pacientes(id, codigo, nombre, apellido1, apellido2, telefono, celular, correo)
        )
      `)
      .in('estado', ['pendiente', 'vencido'])
      .order('fecha_vencimiento')
      .limit(100)
    if (mp) {
      let lista = mp as MembresiaPagoCobro[]
      // Misma regla que la carga inicial: cada sucursal cobra sus cuotas y
      // las "General" (sin sucursal) se ven en todas las cajas.
      if (!esSuperAdmin && perfil?.sucursal_id) {
        lista = lista.filter(p => {
          const suc = (p.membresia as { sucursal_id?: number | null } | null)?.sucursal_id
          return suc == null || suc === perfil.sucursal_id
        })
      }
      setMembresiaPorCobrar(lista)
    }

    const cotQuery = supabase
      .from('cotizaciones')
      .select('id, numero, sucursal_id, cliente_nombre, cliente_rtn, cliente_email, paciente_id, items, subtotal, descuento_monto, isv_monto, total, exento_isv, fecha')
      .eq('estado', 'POR_COBRAR')
      .order('fecha', { ascending: false })
      .limit(100)
    const { data: cotRows } = (!esAdmin && perfil?.sucursal_id)
      ? await cotQuery.eq('sucursal_id', perfil.sucursal_id)
      : await cotQuery
    if (cotRows) setCotPorCobrar(cotRows as CotizacionPorCobrar[])
  }

  /* ── guardar fondo sugerido de la sucursal (solo admin) ─ */
  async function guardarFondoSucursal() {
    const sid = Number(formApertura.sucursal_id)
    if (!sid) return
    const fondo = Number(formApertura.monto_inicial || 0)
    if (fondo < 0) { setFondoMsg('Monto inválido'); return }
    setGuardandoFondo(true)
    setFondoMsg(null)
    const { error } = await supabase.from('sucursales').update({ fondo_caja: fondo }).eq('id', sid)
    setGuardandoFondo(false)
    if (error) {
      setFondoMsg(error.message.includes('fondo_caja') ? 'Falta migración (FIX-CAJA-FONDO-SUCURSAL.sql)' : 'No se pudo guardar')
      return
    }
    const suc = sucursales.find(s => s.id === sid)
    if (suc) suc.fondo_caja = fondo
    setFondoMsg('Fondo guardado ✓')
  }

  /* ── catálogo de conceptos de egreso (solo admin) ─ */
  async function abrirModalConceptos() {
    setModalConceptos(true)
    setFormConcepto({ id: null, nombre: '', categoria: '' })
    setCargandoConceptos(true)
    const { data } = await supabase
      .from('caja_conceptos')
      .select('id, nombre, tipo, categoria, activo')
      .eq('tipo', 'EGRESO')
      .order('nombre')
    setConceptosEgreso((data as Concepto[]) || [])
    setCargandoConceptos(false)
  }

  async function guardarConcepto() {
    const nombre = formConcepto.nombre.trim()
    if (!nombre) return alert('Escriba el nombre del concepto')
    setGuardandoConcepto(true)
    const payload = { nombre, categoria: formConcepto.categoria.trim() || null, tipo: 'EGRESO' as const }
    if (formConcepto.id) {
      const { error } = await supabase.from('caja_conceptos').update(payload).eq('id', formConcepto.id)
      if (error) { setGuardandoConcepto(false); return alert('No se pudo guardar: ' + error.message) }
      setConceptosEgreso(prev => prev.map(c => c.id === formConcepto.id ? { ...c, ...payload, categoria: payload.categoria ?? undefined } : c))
    } else {
      const { data, error } = await supabase.from('caja_conceptos').insert({ ...payload, activo: true }).select('id, nombre, tipo, categoria, activo').single()
      if (error) { setGuardandoConcepto(false); return alert('No se pudo crear: ' + error.message) }
      if (data) setConceptosEgreso(prev => [...prev, data as Concepto].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    }
    setFormConcepto({ id: null, nombre: '', categoria: '' })
    setGuardandoConcepto(false)
  }

  async function toggleConceptoActivo(c: Concepto) {
    const nuevo = !(c.activo ?? true)
    const { error } = await supabase.from('caja_conceptos').update({ activo: nuevo }).eq('id', c.id)
    if (error) return alert('No se pudo actualizar: ' + error.message)
    setConceptosEgreso(prev => prev.map(x => x.id === c.id ? { ...x, activo: nuevo } : x))
  }

  function cerrarModalConceptos() {
    setModalConceptos(false)
    startTransition(() => recargar())
  }

  /* ── apertura de caja ─ */
  async function abrirCaja() {
    setErrorAp('')
    // No-admins siempre abren en su sucursal asignada, sin importar el valor del form.
    const sucursalFinal = esAdmin
      ? Number(formApertura.sucursal_id)
      : Number(perfil?.sucursal_id ?? formApertura.sucursal_id)
    if (!sucursalFinal) {
      setErrorAp('Debes seleccionar una sucursal')
      return
    }
    setLoadingAp(true)
    const nombre = `${perfil?.nombre || ''} ${perfil?.apellido || ''}`.trim() || 'Enfermero/a'

    // Reanudar sesión abierta existente del día (evita choque con idx_sesion_unica).
    const sesionAbierta = await supabase
      .from('caja_sesiones')
      .select('*, movimientos:caja_movimientos(*)')
      .eq('cajero_id', userId)
      .eq('fecha', fechaHoy)
      .eq('estado', 'ABIERTA')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sesionAbierta.data) {
      setLoadingAp(false)
      setSesion(sesionAbierta.data)
      return
    }

    const { data, error } = await supabase.from('caja_sesiones').insert({
      sucursal_id:   sucursalFinal,
      cajero_id:     userId,
      cajero_nombre: nombre,
      fecha:         fechaHoy,
      monto_inicial: Number(formApertura.monto_inicial || 0),
      estado:        'ABIERTA',
    }).select('*, movimientos:caja_movimientos(*)').single()

    if (error) {
      // 23505 = unique_violation. Hay una sesión que la carga inicial no detectó.
      const esDuplicado = error.code === '23505' || /idx_sesion_unica|duplicate key/i.test(error.message)
      if (esDuplicado) {
        const existente = await supabase
          .from('caja_sesiones')
          .select('*, movimientos:caja_movimientos(*)')
          .eq('cajero_id', userId)
          .eq('fecha', fechaHoy)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        setLoadingAp(false)
        if (existente.data?.estado === 'ABIERTA') {
          setSesion(existente.data)
          return
        }
        setErrorAp('Ya cerraste la caja hoy con este usuario. No se puede abrir otra sesión el mismo día; conserva el reporte de cierre impreso.')
        return
      }
      setLoadingAp(false)
      setErrorAp(error.message)
    } else if (data) {
      setLoadingAp(false)
      setSesion(data)
    } else {
      setLoadingAp(false)
    }
  }

  function calcularTotalesCaja(lista: Movimiento[], montoInicial: number) {
    const activos = lista.filter(m => !m.anulado)
    const ingEfectivo = activos.filter(m => m.tipo === 'INGRESO' && m.forma_pago === 'EFECTIVO')
      .reduce((s, m) => s + Number(m.monto), 0)
    const ingTarjeta = activos.filter(m => m.tipo === 'INGRESO' && m.forma_pago === 'TARJETA')
      .reduce((s, m) => s + Number(m.monto), 0)
    const ingTransfer = activos.filter(m => m.tipo === 'INGRESO' && m.forma_pago === 'TRANSFERENCIA')
      .reduce((s, m) => s + Number(m.monto), 0)
    const ingCredito = activos.filter(m => m.tipo === 'INGRESO' && m.forma_pago === 'CREDITO')
      .reduce((s, m) => s + Number(m.monto), 0)
    const totalIng = activos.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + Number(m.monto), 0)
    const totalEgr = activos.filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + Number(m.monto), 0)
    const efectivoEsperado = montoInicial + ingEfectivo - totalEgr
    return { ingEfectivo, ingTarjeta, ingTransfer, ingCredito, totalIng, totalEgr, efectivoEsperado }
  }

  const arqueoSistema = useMemo(
    () => calcularTotalesCaja(sesion?.movimientos || [], Number(sesion?.monto_inicial || 0)),
    [sesion?.movimientos, sesion?.monto_inicial],
  )

  // Egresos del día (detalle para el cierre y el ticket)
  const egresosDelDia = useMemo(
    () => (sesion?.movimientos || [])
      .filter(m => m.tipo === 'EGRESO' && !m.anulado)
      .map(m => ({
        hora: m.hora,
        concepto: m.concepto,
        monto: Number(m.monto),
        forma_pago: m.forma_pago,
      }))
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || '')),
    [sesion?.movimientos],
  )

  // Resultado del día (lo que se entrega): el fondo inicial NO se cuenta como ingreso
  const efectivoDelDia = useMemo(
    () => parseFloat((arqueoSistema.ingEfectivo - arqueoSistema.totalEgr).toFixed(2)),
    [arqueoSistema.ingEfectivo, arqueoSistema.totalEgr],
  )

  const efectivoContado = useMemo(() => {
    const ap = Number(formCierre.efectivo_apertura) || 0
    const ve = Number(formCierre.ventas_efectivo) || 0
    const eg = Number(formCierre.egresos_contado) || 0
    return parseFloat((ap + ve - eg).toFixed(2))
  }, [formCierre.efectivo_apertura, formCierre.ventas_efectivo, formCierre.egresos_contado])

  const diferenciaArqueo = useMemo(
    () => parseFloat((efectivoContado - arqueoSistema.efectivoEsperado).toFixed(2)),
    [efectivoContado, arqueoSistema.efectivoEsperado],
  )

  const arqueoCuadrado = Math.abs(diferenciaArqueo) < 0.01

  function abrirModalCierre() {
    if (!sesion) return
    setFormCierre({
      efectivo_apertura: String(sesion.monto_inicial ?? ''),
      ventas_efectivo: '',
      egresos_contado: arqueoSistema.totalEgr > 0 ? '' : '0',
      tarjeta_real: String(arqueoSistema.ingTarjeta || ''),
      transfer_real: String(arqueoSistema.ingTransfer || ''),
      observacion: '',
    })
    setModalCierre(true)
  }

  /* ── cierre de caja + impresión de reporte ─ */
  async function cerrarCaja() {
    if (!sesion) return

    if (!formCierre.ventas_efectivo || !formCierre.egresos_contado) {
      alert('Complete el arqueo: ventas en efectivo y egresos pagados.')
      return
    }
    if (!arqueoCuadrado && !formCierre.observacion.trim()) {
      alert('Hay diferencia en el arqueo. Escriba una observación antes de cerrar.')
      return
    }

    const horaCierre = new Date().toTimeString().slice(0, 8)
    const efectReal = efectivoContado
    const diferencia = diferenciaArqueo
    const { totalIng, totalEgr, ingCredito, efectivoEsperado } = arqueoSistema

    const payloadCierre = {
      p_sesion_id: sesion.id,
      p_hora_cierre: horaCierre,
      p_monto_efectivo_real: efectReal,
      p_monto_tarjeta_real: Number(formCierre.tarjeta_real || 0),
      p_monto_transfer_real: Number(formCierre.transfer_real || 0),
      p_total_ingresos: totalIng,
      p_total_egresos: totalEgr,
      p_total_creditos: ingCredito,
      p_saldo_esperado: efectivoEsperado,
      p_diferencia: diferencia,
      p_observacion: formCierre.observacion.trim() || null,
    }

    const { error: errRpc } = await supabase.rpc('fn_cerrar_caja_sesion', payloadCierre)
    if (errRpc) {
      // Fallback si la migración 046 aún no está en Supabase
      const { error: errUpd } = await supabase.from('caja_sesiones').update({
        hora_cierre: horaCierre,
        monto_efectivo_real: efectReal,
        monto_tarjeta_real: Number(formCierre.tarjeta_real || 0),
        monto_transfer_real: Number(formCierre.transfer_real || 0),
        total_ingresos: totalIng,
        total_egresos: totalEgr,
        total_creditos: ingCredito,
        saldo_esperado: efectivoEsperado,
        diferencia,
        observacion: formCierre.observacion || null,
        estado: 'CERRADA',
      }).eq('id', sesion.id)
      if (errUpd) {
        return alert(
          'Error al cerrar caja: ' + (errRpc.message || errUpd.message)
          + '\n\nSi persiste, ejecute scripts/FIX-CAJA-CIERRE-RLS.sql en Supabase.',
        )
      }
    }

    const suc = sucursales.find(s => s.id === sesion.sucursal_id)
    const printData: CajaCierrePrintData = {
      sucursal_nombre: suc?.nombre,
      cajero_nombre: sesion.cajero_nombre,
      fecha: fechaHoy,
      hora_apertura: sesion.hora_apertura,
      hora_cierre: horaCierre,
      monto_inicial: Number(sesion.monto_inicial || 0),
      ingresos_efectivo: arqueoSistema.ingEfectivo,
      ingresos_tarjeta: arqueoSistema.ingTarjeta,
      ingresos_transferencia: arqueoSistema.ingTransfer,
      ingresos_credito: ingCredito,
      total_ingresos: totalIng,
      total_egresos: totalEgr,
      efectivo_esperado: efectivoEsperado,
      efectivo_dia: parseFloat((arqueoSistema.ingEfectivo - totalEgr).toFixed(2)),
      egresos_detalle: egresosDelDia,
      conteo_apertura: Number(formCierre.efectivo_apertura || 0),
      conteo_ventas_efectivo: Number(formCierre.ventas_efectivo || 0),
      conteo_egresos: Number(formCierre.egresos_contado || 0),
      efectivo_contado: efectReal,
      tarjeta_contada: Number(formCierre.tarjeta_real || 0),
      transfer_contada: Number(formCierre.transfer_real || 0),
      diferencia,
      observacion: formCierre.observacion || undefined,
      movimientos: ordenarMovsConSaldo(sesion.movimientos || [], Number(sesion.monto_inicial || 0)).map(m => ({
        hora: m.hora,
        concepto: m.concepto,
        tipo: m.tipo,
        monto: Number(m.monto),
        forma_pago: m.forma_pago,
        paciente_nombre: m.paciente_nombre,
      })),
    }

    setModalCierre(false)
    abrirCierreCajaPrint(printData)
    startTransition(() => { recargar() })
  }

  /* ── abonar CXC ─ */
  async function registrarAbono() {
    if (guardandoAbono) return
    const errSesion = validarSesionOperacion(sesion, userId)
    if (errSesion) return alert(errSesion)
    if (!cxcActual || !formAbono.monto) return
    const montoAbono = Number(formAbono.monto)
    if (montoAbono <= 0) return alert('El monto del abono debe ser mayor a cero')
    if (montoAbono > cxcActual.saldo) return alert('El abono no puede superar el saldo pendiente')

    const errRef = validarReferenciaPago(formAbono.forma_pago, formAbono.referencia)
    if (errRef) return alert(errRef)

    setGuardandoAbono(true)
    const hora = new Date().toTimeString().slice(0, 5)
    const pacNombre = cxcActual.paciente_nombre
      || `${cxcActual.paciente?.nombre || ''} ${cxcActual.paciente?.apellido1 || ''}`.trim()

    const { error: errMov } = await insertarMovimientoCaja(supabase, {
      sesion_id:       sesion.id,
      sucursal_id:     sesion.sucursal_id,
      cajero_id:       userId,
      tipo:            'INGRESO',
      concepto:        `Abono CXC — ${cxcActual.concepto || 'Cuenta por cobrar'}`,
      paciente_id:     cxcActual.paciente_id ?? null,
      paciente_nombre: pacNombre || null,
      monto:           montoAbono,
      forma_pago:      formAbono.forma_pago,
      referencia_pago: formAbono.referencia || null,
      nota:            formAbono.nota || null,
      fecha:           fechaHoy,
      hora,
    })
    if (errMov) { setGuardandoAbono(false); return alert('Error al registrar ingreso en caja: ' + errMov.message) }

    const { error: errSes } = await supabase.from('caja_sesiones').update({
      total_ingresos: (sesion.total_ingresos || 0) + montoAbono,
    }).eq('id', sesion.id)
    if (errSes) console.warn('caja_sesiones total_ingresos:', errSes.message)

    const { error: errAbono } = await supabase.from('cxc_abonos').insert({
      cxc_id:     cxcActual.id,
      sesion_id:  sesion.id,
      monto:      montoAbono,
      forma_pago: formAbono.forma_pago,
      nota:       formAbono.nota || null,
      cajero_id:  userId,
    })
    if (errAbono) { setGuardandoAbono(false); return alert('Error al registrar abono: ' + errAbono.message) }

    const nuevoPagado = cxcActual.monto_pagado + montoAbono
    const nuevoEstado = nuevoPagado >= cxcActual.monto_total ? 'PAGADO' : 'PARCIAL'
    const { error: errCxc } = await supabase.from('cxc').update({
      monto_pagado: nuevoPagado,
      saldo:        cxcActual.monto_total - nuevoPagado,
      estado:       nuevoEstado,
      fecha_pago:   nuevoEstado === 'PAGADO' ? fechaHoy : null,
    }).eq('id', cxcActual.id)
    if (errCxc) { setGuardandoAbono(false); return alert('Error al actualizar CXC: ' + errCxc.message) }

    setModalAbono(false)
    setFormAbono({ monto: '', forma_pago: 'EFECTIVO', referencia: '', nota: '' })
    setGuardandoAbono(false)
    startTransition(() => { recargar() })
  }

  /* ── cálculos ─ */
  const movs = sesion?.movimientos || []
  const totalIng  = movs.filter(m => m.tipo === 'INGRESO' && !m.anulado).reduce((s, m) => s + Number(m.monto), 0)
  const totalEgr  = movs.filter(m => m.tipo === 'EGRESO'  && !m.anulado).reduce((s, m) => s + Number(m.monto), 0)
  const totalCred = movs.filter(m => m.forma_pago === 'CREDITO' && !m.anulado).reduce((s, m) => s + Number(m.monto), 0)
  const saldoEsp  = Number(sesion?.monto_inicial || 0) + totalIng - totalEgr - totalCred

  const byFormaPago = useMemo(() => {
    const r: Record<string, number> = {}
    movs.filter(m => m.tipo === 'INGRESO' && !m.anulado)
      .forEach(m => { r[m.forma_pago] = (r[m.forma_pago] || 0) + Number(m.monto) })
    return r
  }, [movs])

  function ordenarMovsConSaldo(lista: Movimiento[], montoInicial: number): MovimientoConSaldo[] {
    const sorted = [...lista].sort((a, b) => {
      const ha = a.hora ?? '00:00'
      const hb = b.hora ?? '00:00'
      if (ha !== hb) return ha.localeCompare(hb)
      return a.id - b.id
    })
    let saldo = montoInicial
    return sorted.map(m => {
      if (!m.anulado) {
        if (m.tipo === 'INGRESO' && m.forma_pago !== 'CREDITO') saldo += Number(m.monto)
        else if (m.tipo === 'EGRESO') saldo -= Number(m.monto)
      }
      return { ...m, saldoAcum: saldo }
    })
  }

  const movsHoyOrdenados = useMemo(
    () => ordenarMovsConSaldo(movs, Number(sesion?.monto_inicial || 0)),
    [movs, sesion?.monto_inicial],
  )

  const cargarHistorialMovs = useCallback(async () => {
    if (!esAdmin) return
    setCargandoHistorial(true)
    const sbClient = sb()
    const d = new Date(fechaHoy + 'T12:00:00')
    d.setDate(d.getDate() - 14)
    const desde = d.toISOString().split('T')[0]

    const { data } = await sbClient
      .from('caja_sesiones')
      .select('*, movimientos:caja_movimientos(*)')
      .eq('cajero_id', userId)
      .eq('estado', 'CERRADA')
      .gte('fecha', desde)
      .order('fecha', { ascending: false })
      .limit(20)

    const dias: DiaHistorialCaja[] = (data ?? []).map(s => {
      const movimientos = (s.movimientos ?? []) as Movimiento[]
      const activos = movimientos.filter(m => !m.anulado)
      return {
        fecha: String(s.fecha ?? ''),
        sesion: s as Sesion,
        movimientos: ordenarMovsConSaldo(movimientos, Number(s.monto_inicial || 0)),
        totalIng: activos.filter(m => m.tipo === 'INGRESO').reduce((sum, m) => sum + Number(m.monto), 0),
        totalEgr: activos.filter(m => m.tipo === 'EGRESO').reduce((sum, m) => sum + Number(m.monto), 0),
      }
    })
    setHistorialDias(dias)
    setCargandoHistorial(false)
  }, [userId, fechaHoy, esAdmin])

  useEffect(() => {
    if (!esAdmin && vistaMovs === 'historial') setVistaMovs('hoy')
  }, [esAdmin, vistaMovs])

  useEffect(() => {
    if (esAdmin && tab === 'movimientos' && vistaMovs === 'historial') {
      cargarHistorialMovs()
    }
  }, [esAdmin, tab, vistaMovs, cargarHistorialMovs])

  function fmtFechaCaja(f: string) {
    return new Date(f + 'T12:00:00').toLocaleDateString('es-HN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  function badgeFormaPago(fp: string) {
    const cls =
      fp === 'EFECTIVO' ? 'bg-green-100 text-green-700' :
      fp === 'TARJETA' ? 'bg-blue-100 text-blue-700' :
      fp === 'TRANSFERENCIA' ? 'bg-purple-100 text-purple-700' :
      'bg-amber-100 text-amber-700'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{fp}</span>
  }

  function filasMovimientos(lista: MovimientoConSaldo[], mostrarSaldo = true) {
    if (lista.length === 0) {
      return (
        <tr>
          <td colSpan={mostrarSaldo ? 7 : 6} className="text-center py-8 text-gray-400 text-sm">
            Sin movimientos en este período
          </td>
        </tr>
      )
    }
    return lista.map(m => (
      <tr key={m.id} className={`hover:bg-gray-50/80 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
        <td className="px-3 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">{m.hora?.slice(0, 5) ?? '—'}</td>
        <td className="px-3 py-2.5 font-medium text-gray-800">{m.concepto}</td>
        <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[140px] truncate">{m.paciente_nombre || '—'}</td>
        <td className="px-3 py-2.5">{badgeFormaPago(m.forma_pago)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-green-600 tabular-nums">
          {m.tipo === 'INGRESO' ? fmt(m.monto) : ''}
        </td>
        <td className="px-3 py-2.5 text-right font-semibold text-red-500 tabular-nums">
          {m.tipo === 'EGRESO' ? fmt(m.monto) : ''}
        </td>
        {mostrarSaldo && (
          <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums">
            {m.saldoAcum != null ? fmt(m.saldoAcum) : '—'}
          </td>
        )}
      </tr>
    ))
  }

  function datosFacturaDesdePaciente(pac?: ConsultaPorCobrar['paciente']) {
    if (!pac) return { nombre_cliente: '', rtn_cliente: '' }
    return {
      nombre_cliente: nombrePaciente(pac),
      rtn_cliente: esPacienteEmpresa(pac) ? (pac.rtn_empresa ?? '').trim() : '',
    }
  }

  /* ── abrir modal de cobro cargando detalles completos ─ */
  async function abrirModalCobro(c: ConsultaPorCobrar) {
    setLoadingCobro(true)
    try {
      const sb = supabase
      // Cargar paciente
      const { data: pac } = await sb
        .from('pacientes')
        .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, rtn_empresa, contacto, fecha_nac, celular, telefono, correo')
        .eq('id', c.paciente_id)
        .single()

      // Servicios médicos agregados en el examen
      const { data: servs, error: errServs } = await sb
        .from('consulta_servicios')
        .select('id, nombre, precio, cantidad')
        .eq('consulta_id', c.id)
      if (errServs) console.warn('consulta_servicios:', errServs.message)

      // Medicamentos recetados — unir con productos para obtener precio_venta
      const { data: dets } = await sb
        .from('consulta_detalle')
        .select('id, no_producto, cant, id_producto, productos(precio_venta)')
        .eq(columnaConsultaDetalle(), valorConsultaDetalle(c.id))

      // Análisis de laboratorio — id_consulta es TEXT en esa tabla
      const { data: labs, error: errLabs } = await sb
        .from('consulta_analisis')
        .select('id, no_analisis, importe')
        .eq('id_consulta', String(c.id))
      if (errLabs) console.warn('consulta_analisis:', errLabs.message)

      // Cargar tipo_nombre y consulta_valor si existen
      const { data: extra }   = await sb.from('consultas').select('tipo_nombre, consulta_valor, cobrado, doctor_id, sucursal_id').eq('id', c.id).single()

      // aplanar precio_venta del join anidado
      const detsFlat = (dets ?? []).map((d: Record<string, unknown> & {
        productos?: { precio_venta?: number }
      }) => ({
        id:          d.id,
        no_producto: d.no_producto,
        cant:        d.cant,
        producto_id: d.id_producto ?? d.producto_id,
        precio_venta: d.productos?.precio_venta ?? 0,
      }))

      const full: ConsultaPorCobrar = {
        ...c,
        paciente:            pac ?? undefined,
        consulta_servicios:  servs  ?? [],
        consulta_detalle:    detsFlat,
        consulta_analisis:   labs   ?? [],
        tipo_nombre:         extra?.tipo_nombre  ?? c.tipo_nombre,
        consulta_valor:      extra?.consulta_valor ?? c.consulta_valor ?? 0,
        cobrado:             extra?.cobrado ?? false,
        doctor_id:           extra?.doctor_id ?? c.doctor_id,
        sucursal_id:         extra?.sucursal_id ?? c.sucursal_id ?? sesion?.sucursal_id,
      }

      const det = calcularTotalConsulta(full)
      const factInit = datosFacturaDesdePaciente(pac ?? undefined)
      setTitularFacturaRegistrado({ nombre: factInit.nombre_cliente, rtn: factInit.rtn_cliente })
      setConsultaCobro(full)
      setFormCobro({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0', monto_manual: '', descuento_confirmado: false })
      setFormFactura({ nombre_cliente: factInit.nombre_cliente, rtn_cliente: factInit.rtn_cliente, exento: true })
      setModalCobro(true)
    } finally {
      setLoadingCobro(false)
    }
  }

  /* ── calcular total de una consulta para cobro ─ */
  function calcularTotalConsulta(c: ConsultaPorCobrar): {
    consulta: number; servicios: number; meds: number; lab: number; subtotal: number
    pctDesc: number; valDesc: number; total: number; motivo: string
    edad: number; fechaSospechosa: boolean
    membInfo: MembresiaPacienteInfo | null
  } {
    const consulta  = Number(c.consulta_valor || 0)
    const servicios = (c.consulta_servicios || []).reduce((a, s) => a + s.precio * s.cantidad, 0)
    const meds      = (c.consulta_detalle || []).reduce((a, d) => a + Number(d.precio_venta || 0) * d.cant, 0)
    const lab       = (c.consulta_analisis || []).reduce((a, l) => a + Number(l.importe || 0), 0)
    const subtotal  = consulta + servicios + meds + lab

    const sucCobro = sucursales.find(s => s.id === (c.sucursal_id ?? sesion?.sucursal_id ?? sucursalActivaId)) ?? sucursalActiva
    const descEdad = descuentoEdadPaciente(c.paciente?.fecha_nac, sucCobro)
    const pctDesc = descEdad.pct
    const motivo = descEdad.pct > 0 ? `${descEdad.motivo} (${descEdad.edad} años)` : ''
    const valDesc = subtotal * (pctDesc / 100)
    const total   = subtotal - valDesc
    const membInfo = getMembresiaPaciente(c.paciente_id, membresiasMap)
    return {
      consulta, servicios, meds, lab, subtotal, pctDesc, valDesc, total, motivo,
      edad: descEdad.edad, fechaSospechosa: descEdad.fechaSospechosa,
      membInfo,
    }
  }

  /* ── procesar cobro de consulta ─ */
  async function procesarCobro() {
    if (!consultaCobro || !sesion) return
    const errSesion = validarSesionOperacion(sesion, userId)
    if (errSesion) { alert(errSesion); return }

    setGuardandoCobro(true)
    const sb = supabase

    const { data: chk } = await sb.from('consultas')
      .select('cobrado, estado_pago')
      .eq('id', consultaCobro.id)
      .maybeSingle()
    if (chk?.cobrado === true || chk?.estado_pago === 'PAGADO') {
      alert('Esta consulta ya fue cobrada')
      setGuardandoCobro(false)
      return
    }

    const detalle = calcularTotalConsulta(consultaCobro)
    if (detalle.subtotal <= 0) {
      alert('La consulta no tiene montos registrados. Revise el examen antes de cobrar.')
      setGuardandoCobro(false)
      return
    }

    const errRef = validarReferenciaPago(formCobro.forma_pago, formCobro.referencia)
    if (errRef) { alert(errRef); setGuardandoCobro(false); return }
    const errCred = validarCreditoConPaciente(formCobro.forma_pago, consultaCobro.paciente_id)
    if (errCred) { alert(errCred); setGuardandoCobro(false); return }

    const valDescuento = validarDescuento(
      Number(formCobro.descuento_pct) || 0,
      detalle.pctDesc,
      esAdmin,
      formCobro.nota,
    )
    if (!valDescuento.ok) {
      alert(valDescuento.error)
      setGuardandoCobro(false)
      return
    }

    const pct = valDescuento.pctAplicar
    // Desglose por categoría: combina descuento por edad + beneficios de membresía.
    const desglose = desglosarLineasCobro(
      [
        { categoria: 'consulta',     bruto: detalle.consulta },
        { categoria: 'servicios',    bruto: detalle.servicios },
        { categoria: 'laboratorio',  bruto: detalle.lab },
        { categoria: 'medicamentos', bruto: detalle.meds },
      ],
      pct,
      detalle.motivo || 'Descuento',
      detalle.membInfo?.estructurados,
    )
    const total = desglose.total
    // Se permite total 0 solo si la membresía cubre el cobro (ej. consulta gratis).
    if (total <= 0 && !desglose.membAplicada) {
      alert('El monto a cobrar debe ser mayor a cero')
      setGuardandoCobro(false)
      return
    }
    const pac = consultaCobro.paciente
    const pacNombre = pac ? `${pac.nombre} ${pac.apellido1}` : ''
    const hora = new Date().toTimeString().slice(0, 5)
    const fecha = fechaHoy

    const movBase = {
      sesion_id:  sesion.id,
      cajero_id:  userId,
      tipo:       'INGRESO' as const,
      fecha, hora,
      forma_pago: formCobro.forma_pago,
      referencia_pago: formCobro.referencia || null,
      nota:       formCobro.nota || null,
      paciente_id: consultaCobro.paciente_id,
      consulta_id: consultaCobro.id,
    }

    const conceptoCategoria = (cat: string): string =>
      cat === 'consulta' ? `Consulta ${consultaCobro.tipo_nombre || ''}`.trim()
        : cat === 'servicios' ? 'Servicios Médicos'
          : cat === 'laboratorio' ? 'Laboratorio'
            : 'Medicamentos'
    const lineaCobro = (concepto: string, l: { bruto: number; pct: number; descMonto: number; neto: number; motivo: string }) => ({
      ...movBase,
      concepto,
      monto_bruto: l.bruto,
      descuento_pct: l.pct,
      descuento_monto: l.descMonto,
      descuento_motivo: l.motivo || null,
      monto: l.neto,
    })
    const movimientos = desglose.lineas
      .filter(l => l.bruto > 0)
      .map(l => lineaCobro(conceptoCategoria(l.categoria), l))

    // ── 1. RECLAMAR la consulta primero (anti doble-cobro) ──
    // El update condicional solo afecta si aún no estaba cobrada; si otra
    // caja la cobró en paralelo, no devuelve filas y abortamos sin cobrar.
    const { data: reclamada, error: errConsulta } = await sb.from('consultas').update({
      cobrado: true,
      estado_pago: 'PAGADO',
      cobrado_en: new Date().toISOString(),
      cobrado_por: userId,
    }).eq('id', consultaCobro.id).or('cobrado.eq.false,cobrado.is.null').select('id')
    if (errConsulta) {
      alert('Error al marcar consulta cobrada: ' + errConsulta.message)
      setGuardandoCobro(false)
      return
    }
    if (!reclamada || reclamada.length === 0) {
      alert('Esta consulta ya fue cobrada por otra caja. Actualice la lista.')
      setGuardandoCobro(false)
      startTransition(() => recargar())
      return
    }

    // ── 2. Registrar el dinero; si falla, revertir el claim de la consulta ──
    if (movimientos.length > 0) {
      const { error: errMovs } = await insertarMovimientosCaja(sb, movimientos, false)
      if (errMovs) {
        await sb.from('consultas').update({
          cobrado: false, estado_pago: 'PENDIENTE', cobrado_en: null, cobrado_por: null,
        }).eq('id', consultaCobro.id)
        alert('Error al registrar cobro: ' + errMovs.message)
        setGuardandoCobro(false)
        return
      }
      const totalInsertado = movimientos.reduce((a, m) => a + m.monto, 0)
      const { error: errSes } = await sb.from('caja_sesiones').update({
        total_ingresos: (sesion.total_ingresos || 0) + totalInsertado,
      }).eq('id', sesion.id)
      if (errSes) console.warn('caja_sesiones total_ingresos:', errSes.message)
    }

    // Órdenes de laboratorio → cola de lab tras el cobro
    const { error: errLab } = await sb.from('consulta_analisis').update({
      pagado: true,
      estado_lab: 'PAGADO',
      updated_at: new Date().toISOString(),
    }).eq('id_consulta', String(consultaCobro.id))
    if (errLab) console.warn('consulta_analisis pagado:', errLab.message)

    // Registrar producción médica para planilla (no afecta caja)
    const doctorId = consultaCobro.doctor_id
    const sucIdProd = consultaCobro.sucursal_id ?? sesion.sucursal_id ?? perfil?.sucursal_id
    if (doctorId && sucIdProd) {
      const { count: yaRegistrado } = await sb
        .from('produccion_medica')
        .select('id', { count: 'exact', head: true })
        .eq('consulta_id', consultaCobro.id)
      if (!yaRegistrado) {
      const lineas = generarLineasProduccion({
        sucursal_id: sucIdProd,
        consulta_id: consultaCobro.id,
        doctor_id: doctorId,
        fecha: fecha,
        pctDescuento: pct,
        consulta: detalle.consulta,
        servicios: (consultaCobro.consulta_servicios || []).map(s => ({
          nombre: s.nombre, precio: s.precio, cantidad: s.cantidad,
        })),
        medicamentos: detalle.meds,
        laboratorio: detalle.lab,
        labItems: (consultaCobro.consulta_analisis || []).map(l => ({
          nombre: l.no_analisis, importe: Number(l.importe || 0),
        })),
      })
      if (lineas.length > 0) {
        const { error: errProd } = await sb.from('produccion_medica').insert(lineas)
        if (errProd) console.warn('produccion_medica:', errProd.message)
      }
      }
    }

    if (formCobro.forma_pago === 'CREDITO') {
      const { error: errCxc } = await sb.from('cxc').insert({
        paciente_id:    consultaCobro.paciente_id,
        paciente_nombre: pacNombre,
        concepto:       `Consulta #${consultaCobro.id}`,
        monto_total:    total,
        monto_pagado:   0,
        saldo:          total,
        estado:         'PENDIENTE',
        fecha:          fecha,
      })
      if (errCxc) {
        alert('Error al crear CXC: ' + errCxc.message)
        setGuardandoCobro(false)
        return
      }
    }

    // quitar de la lista local
    setConsultasPorCobrar(prev => prev.filter(c => c.id !== consultaCobro.id))
    // mostrar paso "éxito + ¿facturar?"
    setCobroExitoso({
      total,
      pacNombre,
      formaPago: formCobro.forma_pago,
      paciente: pac ? {
        nombre: pac.nombre,
        apellido1: pac.apellido1,
        celular: pac.celular,
        telefono: pac.telefono,
        correo: pac.correo,
      } : consultaCobro.paciente ? {
        nombre: consultaCobro.paciente.nombre,
        apellido1: consultaCobro.paciente.apellido1,
        celular: consultaCobro.paciente.celular,
        telefono: consultaCobro.paciente.telefono,
        correo: consultaCobro.paciente.correo,
      } : undefined,
    })
    setGuardandoCobro(false)
    // recargar sesión en paralelo
    startTransition(async () => {
      const { data: s2 } = await sb.from('caja_sesiones')
        .select('*, movimientos:caja_movimientos(*)')
        .eq('id', sesion.id).maybeSingle()
      if (s2) setSesion(s2)
    })
  }

  /* ── cerrar modal cobro limpiamente ── */
  async function cerrarModalCobro() {
    if (cobroExitoso && !factImpresa && !(await confirmarCierreSinFacturar())) return
    setModalCobro(false)
    setConsultaCobro(null)
    setCobroExitoso(null)
    setModalFactura(false)
    setFactImpresa(null)
    setFormCobro({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0', monto_manual: '', descuento_confirmado: false })
    setFormFactura({ nombre_cliente: '', rtn_cliente: '', exento: true })
  }

  async function abrirModalCobroLab(grupo: LabGrupoCobro) {
    const factInit = datosFacturaDesdePaciente(grupo.paciente as ConsultaPorCobrar['paciente'])
    setTitularFacturaRegistrado({ nombre: factInit.nombre_cliente, rtn: factInit.rtn_cliente })
    setLabGrupoCobro(grupo)
    setFormCobroLab({
      forma_pago: 'EFECTIVO',
      referencia: '',
      nota: '',
      descuento_pct: '0',
      descuento_confirmado: false,
    })
    setUsarPuntosLab(false)
    setPuntosCanjearLab('')
    setPuntosFidelidadLab(
      grupo.pacienteId ? await obtenerSaldoPuntos(supabase, grupo.pacienteId) : 0,
    )
    setFormFactura({ nombre_cliente: factInit.nombre_cliente, rtn_cliente: factInit.rtn_cliente, exento: true })
    setLabCobroExitoso(null)
    setLabFacturaCtx(null)
    setModalFacturaLab(false)
    setFactImpresa(null)
    setModalCobroLab(true)
  }

  async function cerrarModalCobroLab() {
    if (labCobroExitoso && !factImpresa && !(await confirmarCierreSinFacturar())) return
    setModalCobroLab(false)
    setLabGrupoCobro(null)
    setLabCobroExitoso(null)
    setLabFacturaCtx(null)
    setModalFacturaLab(false)
    setFactImpresa(null)
    setFormCobroLab({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0', descuento_confirmado: false })
    setFormFactura({ nombre_cliente: '', rtn_cliente: '', exento: true })
    setPuntosFidelidadLab(0)
    setUsarPuntosLab(false)
    setPuntosCanjearLab('')
  }

  async function procesarCobroLab() {
    if (!labGrupoCobro || !sesion) return
    const errSesion = validarSesionOperacion(sesion, userId)
    if (errSesion) { alert(errSesion); return }

    setGuardandoCobroLab(true)
    const sb = supabase
    const ordenIds = labGrupoCobro.ordenes.map(o => o.id)

    const { data: ordenesDb } = await sb.from('consulta_analisis')
      .select('id, importe, estado_lab, pagado')
      .in('id', ordenIds)

    if (!ordenesDb?.length || ordenesDb.length !== ordenIds.length) {
      alert('No se encontraron las órdenes de laboratorio')
      setGuardandoCobroLab(false)
      return
    }
    const invalida = ordenesDb.find(o => o.estado_lab !== 'PENDIENTE_COBRO' || o.pagado === true)
    if (invalida) {
      alert('Una o más órdenes ya fueron cobradas o no están pendientes')
      setGuardandoCobroLab(false)
      return
    }

    const subtotal = ordenesDb.reduce((s, o) => s + Number(o.importe || 0), 0)
    const detDesc = calcularDescuentoEdad(labGrupoCobro.paciente?.fecha_nac, subtotal, sucursalActiva)
    const valDescuento = validarDescuento(
      Number(formCobroLab.descuento_pct) || 0,
      detDesc.pctDesc,
      esAdmin,
      formCobroLab.nota,
    )
    if (!valDescuento.ok) {
      alert(valDescuento.error)
      setGuardandoCobroLab(false)
      return
    }

    const errRef = validarReferenciaPago(formCobroLab.forma_pago, formCobroLab.referencia)
    if (errRef) { alert(errRef); setGuardandoCobroLab(false); return }
    const errCred = validarCreditoConPaciente(formCobroLab.forma_pago, labGrupoCobro.pacienteId)
    if (errCred) { alert(errCred); setGuardandoCobroLab(false); return }

    // Combina descuento por edad con beneficio de laboratorio de la membresía.
    const membInfoLab = getMembresiaPaciente(labGrupoCobro.pacienteId, membresiasMap)
    const effLab = descuentoEfectivo('laboratorio', valDescuento.pctAplicar, detDesc.motivo || 'Descuento', membInfoLab?.estructurados)
    const pct = effLab.pct
    const motivoLabBase = effLab.motivo
    const valDesc = subtotal * (pct / 100)
    const totalDespuesEdad = subtotal - valDesc

    let puntosCanje = 0
    let descPuntos = 0
    if (usarPuntosLab && labGrupoCobro.pacienteId) {
      if (formCobroLab.forma_pago === 'CREDITO') {
        alert('Los puntos de fidelidad no aplican con forma de pago Crédito.')
        setGuardandoCobroLab(false)
        return
      }
      const maxPt = maxPuntosCanjeables(puntosFidelidadLab, totalDespuesEdad, fidelidadConfig)
      const solicitados = puntosCanjearLab.trim() === ''
        ? maxPt
        : Math.min(maxPt, Math.max(0, Math.floor(Number(puntosCanjearLab) || 0)))
      if (solicitados <= 0) {
        alert('No hay puntos suficientes o el monto a canjear no es válido.')
        setGuardandoCobroLab(false)
        return
      }
      puntosCanje = solicitados
      descPuntos = valorLempirasDePuntos(puntosCanje, fidelidadConfig)
    }

    const total = totalDespuesEdad - descPuntos
    const minCobro = fidelidadConfig.monto_minimo_cobro ?? 1
    if (total < minCobro) {
      alert(
        `El total a cobrar debe ser al menos L ${minCobro.toFixed(2)}. ` +
        `Con la configuración actual solo puede canjear hasta el ${fidelidadConfig.porcentaje_max_canje}% del total ` +
        `(máx. ${maxPuntosCanjeables(puntosFidelidadLab, totalDespuesEdad, fidelidadConfig)} pts).`,
      )
      setGuardandoCobroLab(false)
      return
    }
    if (total < 0) {
      alert('El descuento por puntos excede el total a cobrar')
      setGuardandoCobroLab(false)
      return
    }

    const pac = labGrupoCobro.paciente
    const pacNombre = labGrupoCobro.pacienteNombre
    const hora = new Date().toTimeString().slice(0, 5)

    // ── 1. RECLAMAR las órdenes primero (anti doble-cobro) ──
    // Solo afecta las que siguen PENDIENTE_COBRO; si otra caja ya cobró
    // alguna, el conteo no coincide y se revierte.
    const { data: reclamadas, error: errClaim } = await sb.from('consulta_analisis').update({
      pagado: true,
      estado_lab: 'PAGADO',
      updated_at: new Date().toISOString(),
    }).in('id', ordenIds).eq('estado_lab', 'PENDIENTE_COBRO').eq('pagado', false).select('id')
    if (errClaim) {
      alert('Error al registrar cobro de laboratorio: ' + errClaim.message)
      setGuardandoCobroLab(false)
      return
    }
    const idsReclamados = (reclamadas ?? []).map(r => r.id)
    if (idsReclamados.length !== ordenIds.length) {
      // revertir lo que alcanzamos a reclamar y abortar
      if (idsReclamados.length > 0) {
        await sb.from('consulta_analisis').update({
          pagado: false, estado_lab: 'PENDIENTE_COBRO',
        }).in('id', idsReclamados)
      }
      alert('Una o más órdenes ya fueron cobradas por otra caja. Actualice la lista.')
      setGuardandoCobroLab(false)
      startTransition(() => recargar())
      return
    }

    const revertirClaim = async () => {
      await sb.from('consulta_analisis').update({
        pagado: false, estado_lab: 'PENDIENTE_COBRO',
      }).in('id', idsReclamados)
    }

    const notaPuntos = puntosCanje > 0
      ? `Canje ${puntosCanje} pt fidelidad (L ${descPuntos.toFixed(2)})`
      : null
    const aplicaDescBase = pct > 0 && Boolean(motivoLabBase)
    const motivoDesc = descPuntos > 0
      ? (aplicaDescBase ? `${motivoLabBase} + Puntos` : 'Puntos de Fidelidad')
      : (aplicaDescBase ? motivoLabBase : null)

    // ── 2. Registrar el dinero; si falla, revertir el claim ──
    const { error: errMov } = await insertarMovimientoCaja(sb, {
      sesion_id: sesion.id,
      cajero_id: userId,
      tipo: 'INGRESO',
      concepto: `Laboratorio — ${pacNombre}`,
      monto: total,
      monto_bruto: subtotal,
      descuento_pct: pct,
      descuento_monto: valDesc + descPuntos,
      descuento_motivo: motivoDesc,
      fecha: fechaHoy,
      hora,
      forma_pago: formCobroLab.forma_pago,
      referencia_pago: formCobroLab.referencia || null,
      nota: formCobroLab.nota || notaPuntos,
      paciente_id: labGrupoCobro.pacienteId || null,
    })
    if (errMov) {
      await revertirClaim()
      alert('Error al registrar cobro: ' + errMov.message)
      setGuardandoCobroLab(false)
      return
    }

    const { error: errSes } = await sb.from('caja_sesiones').update({
      total_ingresos: (sesion.total_ingresos || 0) + total,
    }).eq('id', sesion.id)
    if (errSes) console.warn('caja_sesiones total_ingresos:', errSes.message)

    // ── 3. Canjear puntos DESPUÉS de cobrar (irreversible va al final) ──
    if (puntosCanje > 0 && labGrupoCobro.pacienteId) {
      const canje = await canjearPuntosLaboratorio(sb, {
        pacienteId: labGrupoCobro.pacienteId,
        puntos: puntosCanje,
        nota: `Laboratorio directo — ${labGrupoCobro.ordenes.map(o => o.no_analisis).join(', ')}`,
      })
      if (!canje.ok) {
        // El cobro ya quedó registrado; avisar para ajuste manual de puntos
        alert('El cobro se registró, pero no se pudieron descontar los puntos: ' +
          (canje.error ?? 'desconocido') + '. Revise el saldo del paciente.')
      }
    }

    if (formCobroLab.forma_pago === 'CREDITO') {
      const { error: errCxc } = await sb.from('cxc').insert({
        paciente_id: labGrupoCobro.pacienteId || null,
        paciente_nombre: pacNombre,
        concepto: `Laboratorio — ${labGrupoCobro.ordenes.map(o => o.no_analisis).join(', ')}`,
        monto_total: total,
        monto_pagado: 0,
        saldo: total,
        estado: 'PENDIENTE',
        fecha: fechaHoy,
        sucursal_id: sesion.sucursal_id ?? perfil?.sucursal_id ?? null,
      })
      if (errCxc) {
        alert('Error al crear cuenta por cobrar: ' + errCxc.message)
        setGuardandoCobroLab(false)
        return
      }
      startTransition(() => recargar())
    }

    setLabPorCobrar(prev => prev.filter(g => g.grupoId !== labGrupoCobro.grupoId))
    setLabFacturaCtx({ grupo: labGrupoCobro, subtotal, valDesc: valDesc + descPuntos })
    setLabCobroExitoso({
      total,
      pacNombre,
      formaPago: formCobroLab.forma_pago,
      puntosCanjeados: puntosCanje > 0 ? puntosCanje : undefined,
      paciente: pac ? {
        nombre: pac.nombre ?? '',
        apellido1: pac.apellido1 ?? '',
        celular: pac.celular,
        telefono: pac.telefono,
        correo: pac.correo,
      } : undefined,
    })
    setLabGrupoCobro(null)
    setGuardandoCobroLab(false)

    startTransition(async () => {
      const { data: s2 } = await sb.from('caja_sesiones')
        .select('*, movimientos:caja_movimientos(*)')
        .eq('id', sesion.id).maybeSingle()
      if (s2) setSesion(s2)
    })
  }

  function abrirModalCobroMembresia(pago: MembresiaPagoCobro) {
    if (!sesion) {
      alert('Debes abrir la caja del día antes de cobrar cuotas de membresía')
      return
    }
    setMembresiaPagoCobro(pago)
    setFormCobroMembresia({ forma_pago: 'EFECTIVO', referencia: '', nota: '' })
    setModalCobroMembresia(true)
  }

  // Precarga desde Planes Médicos: /ventas?membresia_pago=ID
  // Se abre el modal con el monto SIEMPRE (haya o no caja abierta);
  // si la caja está cerrada el botón "Cobrar" queda deshabilitado con aviso.
  useEffect(() => {
    if (!membresiaPagoPrecarga) return
    setTab('membresias_cobrar')
    if (precargaMembresiaRef.current) return

    const abrir = (pago: MembresiaPagoCobro) => {
      precargaMembresiaRef.current = true
      setMembresiaPagoCobro(pago)
      setFormCobroMembresia({ forma_pago: 'EFECTIVO', referencia: '', nota: '' })
      setModalCobroMembresia(true)
    }

    const enLista = initMembresiaPagosPorCobrar?.find(p => p.id === membresiaPagoPrecarga)
      ?? membresiaPorCobrar.find(p => p.id === membresiaPagoPrecarga)
    if (enLista) {
      abrir(enLista)
      return
    }

    void (async () => {
      const { data } = await supabase
        .from('membresia_pagos')
        .select(`
          id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado,
          membresia:membresias(
            numero_carnet, paciente_id, sucursal_id,
            tipo:membresia_tipos(nombre),
            paciente:pacientes(id, codigo, nombre, apellido1, apellido2, telefono, celular, correo)
          )
        `)
        .eq('id', membresiaPagoPrecarga)
        .maybeSingle()
      if (data && data.estado !== 'pagado') {
        const pago = data as MembresiaPagoCobro
        setMembresiaPorCobrar(prev => prev.some(p => p.id === pago.id) ? prev : [...prev, pago])
        abrir(pago)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membresiaPagoPrecarga, sesion])

  function cerrarModalCobroMembresia() {
    setModalCobroMembresia(false)
    setMembresiaPagoCobro(null)
    setFormCobroMembresia({ forma_pago: 'EFECTIVO', referencia: '', nota: '' })
  }

  async function procesarCobroMembresia() {
    if (!membresiaPagoCobro || !sesion) return
    const errSesion = validarSesionOperacion(sesion, userId)
    if (errSesion) { alert(errSesion); return }

    setGuardandoCobroMembresia(true)
    const sb = supabase
    const pago = membresiaPagoCobro

    const { data: pagoDb } = await sb.from('membresia_pagos')
      .select('id, monto, estado')
      .eq('id', pago.id)
      .maybeSingle()

    if (!pagoDb || pagoDb.estado === 'pagado') {
      alert('Esta cuota ya fue cobrada')
      setGuardandoCobroMembresia(false)
      return
    }

    const total = Number(pagoDb.monto)
    if (total <= 0) {
      alert('El monto a cobrar debe ser mayor a cero')
      setGuardandoCobroMembresia(false)
      return
    }

    const errRef = validarReferenciaPago(formCobroMembresia.forma_pago, formCobroMembresia.referencia)
    if (errRef) { alert(errRef); setGuardandoCobroMembresia(false); return }

    const pac = pago.membresia?.paciente
    const pacNombre = pac ? `${pac.nombre} ${pac.apellido1}` : 'Membresía'
    const planNombre = pago.membresia?.tipo?.nombre || 'Plan médico'
    const carnet = pago.membresia?.numero_carnet || ''
    const hora = new Date().toTimeString().slice(0, 5)
    const cajeroNombre = `${perfil?.nombre || ''} ${perfil?.apellido || ''}`.trim() || 'Enfermero/a'

    // ── 1. RECLAMAR la cuota primero (anti doble-cobro) ──
    const { data: cuotaReclamada, error: errPago } = await sb.from('membresia_pagos').update({
      estado:        'pagado',
      fecha_pago:    fechaHoy,
      forma_pago:    formCobroMembresia.forma_pago,
      cajero_nombre: cajeroNombre,
      notas:         formCobroMembresia.nota || null,
    }).eq('id', pago.id).in('estado', ['pendiente', 'vencido']).select('id')
    if (errPago) {
      alert('Error al actualizar cuota: ' + errPago.message)
      setGuardandoCobroMembresia(false)
      return
    }
    if (!cuotaReclamada || cuotaReclamada.length === 0) {
      alert('Esta cuota ya fue cobrada por otra caja. Actualice la lista.')
      setGuardandoCobroMembresia(false)
      startTransition(() => recargar())
      return
    }

    const revertirCuota = async () => {
      await sb.from('membresia_pagos').update({ estado: 'pendiente', fecha_pago: null }).eq('id', pago.id)
    }

    // ── 2. Registrar el dinero; si falla, revertir el claim de la cuota ──
    const { error: errMov } = await insertarMovimientoCaja(sb, {
      sesion_id:       sesion.id,
      sucursal_id:     sesion.sucursal_id,
      cajero_id:       userId,
      tipo:            'INGRESO',
      concepto:        `Membresía — ${planNombre} · Cuota #${pago.numero_cuota}`,
      paciente_id:     pago.membresia?.paciente_id ?? pac?.id ?? null,
      paciente_nombre: pacNombre,
      monto:           total,
      forma_pago:      formCobroMembresia.forma_pago,
      referencia_pago: formCobroMembresia.referencia || null,
      nota:            formCobroMembresia.nota || `Carnet ${carnet} · pago #${pago.id}`,
      fecha:           fechaHoy,
      hora,
    })
    if (errMov) {
      await revertirCuota()
      alert('Error al registrar cobro: ' + errMov.message)
      setGuardandoCobroMembresia(false)
      return
    }

    const { error: errSes } = await sb.from('caja_sesiones').update({
      total_ingresos: (sesion.total_ingresos || 0) + total,
    }).eq('id', sesion.id)
    if (errSes) console.warn('caja_sesiones total_ingresos:', errSes.message)

    const { data: memb } = await sb.from('membresias')
      .select('cuotas_pagadas')
      .eq('id', pago.membresia_id)
      .maybeSingle()
    if (memb) {
      await sb.from('membresias').update({
        cuotas_pagadas: (memb.cuotas_pagadas || 0) + 1,
      }).eq('id', pago.membresia_id)
    }

    setMembresiaPorCobrar(prev => prev.filter(p => p.id !== pago.id))
    cerrarModalCobroMembresia()
    setGuardandoCobroMembresia(false)

    startTransition(async () => {
      const { data: s2 } = await sb.from('caja_sesiones')
        .select('*, movimientos:caja_movimientos(*)')
        .eq('id', sesion.id).maybeSingle()
      if (s2) setSesion(s2)
    })
  }

  /* ════════ COBRO DE COTIZACIÓN (enviada desde Cotizaciones) ════════ */
  function abrirModalCobroCot(c: CotizacionPorCobrar) {
    if (!sesion) {
      alert('Debes abrir la caja del día antes de cobrar cotizaciones')
      return
    }
    setCotCobro(c)
    setFormCobroCot({ forma_pago: 'EFECTIVO', referencia: '', nota: '' })
    setModalCobroCot(true)
  }

  function cerrarModalCobroCot() {
    setModalCobroCot(false)
    setCotCobro(null)
    setFormCobroCot({ forma_pago: 'EFECTIVO', referencia: '', nota: '' })
  }

  async function procesarCobroCotizacion() {
    if (!cotCobro || !sesion) return
    const errSesion = validarSesionOperacion(sesion, userId)
    if (errSesion) { alert(errSesion); return }

    setGuardandoCobroCot(true)
    const sb2 = supabase
    const cot = cotCobro

    const suc = sucursales.find(s => s.id === cot.sucursal_id) ?? sucursalActiva
    if (!suc) {
      alert('No se encontró la sucursal de la cotización.')
      setGuardandoCobroCot(false)
      return
    }
    if (suc.fecha_limite && suc.fecha_limite < fechaHoy) {
      alert(`El CAI de ${suc.nombre} venció el ${suc.fecha_limite}. Renueva el CAI en Configuración.`)
      setGuardandoCobroCot(false)
      return
    }

    const total = Number(cot.total)
    if (total <= 0) {
      alert('El total de la cotización debe ser mayor a cero')
      setGuardandoCobroCot(false)
      return
    }

    const errRef = validarReferenciaPago(formCobroCot.forma_pago, formCobroCot.referencia)
    if (errRef) { alert(errRef); setGuardandoCobroCot(false); return }
    const errCred = validarCreditoConPaciente(formCobroCot.forma_pago, cot.paciente_id ?? undefined)
    if (errCred) { alert(errCred); setGuardandoCobroCot(false); return }

    // ── 1. RECLAMAR la cotización (anti doble-cobro): POR_COBRAR → CONVERTIDA ──
    const { data: reclamada, error: errClaim } = await sb2.from('cotizaciones').update({
      estado: 'CONVERTIDA',
    }).eq('id', cot.id).eq('estado', 'POR_COBRAR').select('id')
    if (errClaim) {
      alert('Error al cobrar cotización: ' + errClaim.message)
      setGuardandoCobroCot(false)
      return
    }
    if (!reclamada || reclamada.length === 0) {
      alert('Esta cotización ya fue cobrada o cambió de estado. Actualice la lista.')
      setCotPorCobrar(prev => prev.filter(c => c.id !== cot.id))
      cerrarModalCobroCot()
      setGuardandoCobroCot(false)
      return
    }
    const revertirClaim = async () => {
      await sb2.from('cotizaciones').update({ estado: 'POR_COBRAR' }).eq('id', cot.id)
    }

    const hora = new Date().toTimeString().slice(0, 5)
    const cajeroNombre = `${perfil?.nombre || ''} ${perfil?.apellido || ''}`.trim()

    // ── 2. Registrar el dinero; si falla, revertir el claim ──
    const { error: errMov } = await insertarMovimientoCaja(sb2, {
      sesion_id:       sesion.id,
      sucursal_id:     sesion.sucursal_id,
      cajero_id:       userId,
      tipo:            'INGRESO',
      concepto:        `Cotización ${cot.numero} — ${cot.cliente_nombre}`,
      paciente_id:     cot.paciente_id ?? null,
      paciente_nombre: cot.cliente_nombre,
      monto:           total,
      monto_bruto:     Number(cot.subtotal) || total,
      descuento_monto: Number(cot.descuento_monto) || 0,
      forma_pago:      formCobroCot.forma_pago,
      referencia_pago: formCobroCot.referencia || null,
      nota:            formCobroCot.nota || `Cotización ${cot.numero}`,
      fecha:           fechaHoy,
      hora,
    })
    if (errMov) {
      await revertirClaim()
      alert('Error al registrar cobro: ' + errMov.message)
      setGuardandoCobroCot(false)
      return
    }

    const { error: errSes } = await sb2.from('caja_sesiones').update({
      total_ingresos: (sesion.total_ingresos || 0) + total,
    }).eq('id', sesion.id)
    if (errSes) console.warn('caja_sesiones total_ingresos:', errSes.message)

    // ── 3. Crédito → cuenta por cobrar ──
    if (formCobroCot.forma_pago === 'CREDITO') {
      const { error: errCxc } = await sb2.from('cxc').insert({
        paciente_id:     cot.paciente_id ?? null,
        paciente_nombre: cot.cliente_nombre,
        concepto:        `Cotización ${cot.numero}`,
        monto_total:     total,
        monto_pagado:    0,
        saldo:           total,
        estado:          'PENDIENTE',
        fecha:           fechaHoy,
        sucursal_id:     sesion.sucursal_id ?? perfil?.sucursal_id ?? null,
      })
      if (errCxc) console.warn('cxc cotización:', errCxc.message)
    }

    // ── 4. Emitir factura fiscal con correlativo (claim-first del número) ──
    let itemsFactura: unknown = cot.items
    if (typeof itemsFactura === 'string') {
      try { itemsFactura = JSON.parse(itemsFactura) } catch { itemsFactura = [] }
    }

    const payloadBase = {
      fecha:            fechaHoy,
      hora:             new Date().toTimeString().slice(0, 8),
      sucursal_id:      suc.id,
      paciente_id:      cot.paciente_id ?? null,
      cliente_nombre:   cot.cliente_nombre || 'CONSUMIDOR FINAL',
      cliente_rtn:      cot.cliente_rtn || null,
      cliente_email:    cot.cliente_email || null,
      items:            itemsFactura,
      subtotal:         Number(cot.subtotal),
      descuento_monto:  Number(cot.descuento_monto) || 0,
      isv_monto:        Number(cot.isv_monto) || 0,
      total,
      exento_isv:       !!cot.exento_isv,
      cotizacion_id:    cot.id,
      cajero_nombre:    cajeroNombre,
      cai:              suc.cai ?? null,
      rtn_emisor:       suc.rtn ?? null,
      rango_inicio:     suc.num_min ?? null,
      rango_fin:        suc.num_max ?? null,
      fecha_limite_cai: suc.fecha_limite ?? null,
    }

    let fact: Record<string, unknown> | null = null
    let numSig = 0
    let ultimoError: string | null = null
    for (let intento = 0; intento < 4; intento++) {
      const reserva = await reservarSiguienteCorrelativo(sb2, suc.id, suc, intento > 0 ? numSig + 1 : undefined)
      numSig = reserva.numSig
      const { data, error } = await sb2.from('facturas')
        .insert({ ...payloadBase, numero: reserva.numero })
        .select()
        .single()
      if (!error) {
        fact = data
        await confirmarCorrelativo(sb2, suc.id, numSig)
        break
      }
      ultimoError = error.message
      if (!esErrorNumeroDuplicado(error)) break
      numSig += 1
    }

    if (!fact) {
      // El cobro ya quedó registrado y la cotización está CONVERTIDA.
      alert('El cobro se registró, pero no se pudo emitir la factura automáticamente: ' +
        (ultimoError ?? 'número duplicado') + '.\nEmita la factura desde Facturación para esta cotización.')
      setCotPorCobrar(prev => prev.filter(c => c.id !== cot.id))
      cerrarModalCobroCot()
      setGuardandoCobroCot(false)
      startTransition(() => recargar())
      return
    }

    setCorrelativos(prev => {
      const idx = prev.findIndex(c => c.sucursal_id === suc.id)
      if (idx >= 0) {
        const n = [...prev]
        n[idx] = { sucursal_id: suc.id, ultimo_numero: numSig }
        return n
      }
      return [...prev, { sucursal_id: suc.id, ultimo_numero: numSig }]
    })

    await sb2.from('cotizaciones').update({ factura_id: fact.id }).eq('id', cot.id)

    if (fact.paciente_id) {
      const resPts = await acumularPuntosPorFactura(sb2, fact.id as number)
      if (!resPts.ok) console.warn('Puntos fidelidad:', resPts.error)
    }

    setCotPorCobrar(prev => prev.filter(c => c.id !== cot.id))
    cerrarModalCobroCot()
    setGuardandoCobroCot(false)

    abrirFacturaTermica(facturaPrintDesdeRegistro({ ...fact, sucursal: suc }), { autoPrint: true })

    startTransition(async () => {
      const { data: s2 } = await sb2.from('caja_sesiones')
        .select('*, movimientos:caja_movimientos(*)')
        .eq('id', sesion.id).maybeSingle()
      if (s2) setSesion(s2)
    })
  }

  /* ── generar factura después del cobro ── */
  async function generarFactura() {
    if (!consultaCobro || !cobroExitoso) return
    setGuardandoFact(true)
    const sb2 = supabase
    const sucId = perfil?.sucursal_id
    const suc   = sucursales.find(s => s.id === sucId)
    if (!suc) {
      alert('Tu usuario no tiene sucursal asignada. Ve a Configuración → Usuarios y asigna una sucursal.')
      setGuardandoFact(false)
      return
    }

    const det = calcularTotalConsulta(consultaCobro)
    const pct = Number(formCobro.descuento_pct) || 0
    // Mismo desglose que el cobro: combina edad + beneficios de membresía por categoría.
    const desgloseFact = desglosarLineasCobro(
      [
        { categoria: 'consulta',     bruto: det.consulta },
        { categoria: 'servicios',    bruto: det.servicios },
        { categoria: 'laboratorio',  bruto: det.lab },
        { categoria: 'medicamentos', bruto: det.meds },
      ],
      pct,
      det.motivo || 'Descuento',
      det.membInfo?.estructurados,
    )
    const base = desgloseFact.subtotal
    const valDesc = desgloseFact.descTotal
    const subtotalConDesc = desgloseFact.total
    const isv  = formFactura.exento ? 0 : subtotalConDesc * 0.15
    const total = subtotalConDesc + isv

    // items de la factura
    const items = []
    if (det.consulta > 0)   items.push({ descripcion: `Consulta - ${consultaCobro.tipo_nombre || 'General'}`, cantidad: 1, precio_unitario: det.consulta,  isv_pct: formFactura.exento ? 0 : 15, subtotal: det.consulta })
    if (det.servicios > 0)  items.push({ descripcion: 'Servicios Médicos', cantidad: 1, precio_unitario: det.servicios, isv_pct: formFactura.exento ? 0 : 15, subtotal: det.servicios })
    if (det.lab > 0)        items.push({ descripcion: 'Análisis de Laboratorio', cantidad: 1, precio_unitario: det.lab, isv_pct: formFactura.exento ? 0 : 15, subtotal: det.lab })
    if (det.meds > 0)       items.push({ descripcion: 'Medicamentos', cantidad: 1, precio_unitario: det.meds, isv_pct: formFactura.exento ? 0 : 15, subtotal: det.meds })
    if (items.length === 0) items.push({ descripcion: `Consulta - ${consultaCobro.tipo_nombre || 'General'}`, cantidad: 1, precio_unitario: cobroExitoso.total, isv_pct: formFactura.exento ? 0 : 15, subtotal: cobroExitoso.total })

    const pac  = consultaCobro.paciente
    const hora = new Date().toTimeString().slice(0, 8)

    let medicoNombre: string | null = null
    if (consultaCobro.doctor_id) {
      const { data: docPerfil } = await sb2
        .from('perfiles')
        .select('nombre, apellido, genero')
        .eq('id', consultaCobro.doctor_id)
        .maybeSingle()
      if (docPerfil) {
        medicoNombre = formatearNombreMedico(docPerfil.nombre, docPerfil.apellido, docPerfil.genero) || null
      }
    }

    const payloadBase = {
      fecha:             fechaHoy,
      hora,
      sucursal_id:       suc.id,
      paciente_id:       consultaCobro.paciente_id ?? null,
      cliente_nombre:    formFactura.nombre_cliente.trim()
        || (pac ? nombrePaciente(pac) : 'CONSUMIDOR FINAL'),
      cliente_rtn:       formFactura.rtn_cliente.trim() || null,
      items,
      subtotal:          base,
      descuento_monto:   valDesc,
      isv_monto:         isv,
      total,
      estado:            'emitida',
      exento_isv:        formFactura.exento,
      cai:               suc.cai ?? null,
      rtn_emisor:        suc.rtn ?? null,
      rango_inicio:      suc.num_min ? String(suc.num_min) : null,
      rango_fin:         suc.num_max ? String(suc.num_max) : null,
      fecha_limite_cai:  suc.fecha_limite ?? null,
      cajero_nombre:     perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : '',
      medico_nombre:     medicoNombre,
      consulta_id:       consultaCobro.id,
    }

    let fact = null
    let numSig = 0
    let ultimoError: string | null = null

    for (let intento = 0; intento < 4; intento++) {
      const reserva = await reservarSiguienteCorrelativo(
        sb2, suc.id, suc,
        intento > 0 ? numSig + 1 : undefined,
      )
      numSig = reserva.numSig

      const { data, error } = await sb2.from('facturas').insert({
        ...payloadBase,
        numero: reserva.numero,
      }).select().single()

      if (!error) {
        fact = data
        await confirmarCorrelativo(sb2, suc.id, numSig)
        break
      }

      ultimoError = error.message
      if (!esErrorNumeroDuplicado(error)) break
      numSig += 1
    }

    if (!fact) {
      console.error(ultimoError)
      alert('Error al crear factura: ' + (ultimoError ?? 'Número duplicado'))
      setGuardandoFact(false)
      return
    }
    setCorrelativos(prev => {
      const idx = prev.findIndex(c => c.sucursal_id === suc.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = { sucursal_id: suc.id, ultimo_numero: numSig }; return n }
      return [...prev, { sucursal_id: suc.id, ultimo_numero: numSig }]
    })

    if (fact.paciente_id) {
      const resPts = await acumularPuntosPorFactura(sb2, fact.id)
      if (!resPts.ok) console.warn('Puntos fidelidad:', resPts.error)
    }

    const impresa = { ...fact!, sucursal: suc }
    setFactImpresa(impresa)
    setGuardandoFact(false)
    const tieneLab = (consultaCobro?.consulta_analisis?.length ?? 0) > 0
    const printDataCons = await adjuntarPortalSiLab(
      facturaPrintDesdeRegistro(impresa), fact?.paciente_id ?? consultaCobro?.paciente_id ?? null, tieneLab,
    )
    abrirFacturaTermica(printDataCons, { autoPrint: true })
  }

  /* ── generar factura después del cobro de laboratorio directo ── */
  async function generarFacturaLab() {
    if (!labFacturaCtx || !labCobroExitoso) return
    setGuardandoFact(true)
    const sb2 = supabase
    const sucId = perfil?.sucursal_id
    const suc = sucursales.find(s => s.id === sucId)
    if (!suc) {
      alert('Tu usuario no tiene sucursal asignada. Ve a Configuración → Usuarios y asigna una sucursal.')
      setGuardandoFact(false)
      return
    }

    const { grupo, subtotal, valDesc } = labFacturaCtx
    const base = subtotal
    const subtotalConDesc = base - valDesc
    const isv = formFactura.exento ? 0 : subtotalConDesc * 0.15
    const total = subtotalConDesc + isv

    const items = grupo.ordenes.map(o => ({
      descripcion: `Laboratorio — ${o.no_analisis}`,
      cantidad: 1,
      precio_unitario: Number(o.importe || 0),
      isv_pct: formFactura.exento ? 0 : 15,
      subtotal: Number(o.importe || 0),
    }))

    const pac = grupo.paciente
    const hora = new Date().toTimeString().slice(0, 8)

    const payloadBase = {
      fecha: fechaHoy,
      hora,
      sucursal_id: suc.id,
      paciente_id: grupo.pacienteId || null,
      cliente_nombre: formFactura.nombre_cliente.trim()
        || (pac ? nombrePaciente(pac) : grupo.pacienteNombre)
        || 'CONSUMIDOR FINAL',
      cliente_rtn: formFactura.rtn_cliente.trim() || null,
      items,
      subtotal: base,
      descuento_monto: valDesc,
      isv_monto: isv,
      total,
      estado: 'emitida',
      exento_isv: formFactura.exento,
      cai: suc.cai ?? null,
      rtn_emisor: suc.rtn ?? null,
      rango_inicio: suc.num_min ? String(suc.num_min) : null,
      rango_fin: suc.num_max ? String(suc.num_max) : null,
      fecha_limite_cai: suc.fecha_limite ?? null,
      cajero_nombre: perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : '',
      medico_nombre: null,
      consulta_id: null,
    }

    let fact = null
    let numSig = 0
    let ultimoError: string | null = null

    for (let intento = 0; intento < 4; intento++) {
      const reserva = await reservarSiguienteCorrelativo(
        sb2, suc.id, suc,
        intento > 0 ? numSig + 1 : undefined,
      )
      numSig = reserva.numSig

      const { data, error } = await sb2.from('facturas').insert({
        ...payloadBase,
        numero: reserva.numero,
      }).select().single()

      if (!error) {
        fact = data
        await confirmarCorrelativo(sb2, suc.id, numSig)
        break
      }

      ultimoError = error.message
      if (!esErrorNumeroDuplicado(error)) break
      numSig += 1
    }

    if (!fact) {
      console.error(ultimoError)
      alert('Error al crear factura: ' + (ultimoError ?? 'Número duplicado'))
      setGuardandoFact(false)
      return
    }

    setCorrelativos(prev => {
      const idx = prev.findIndex(c => c.sucursal_id === suc.id)
      if (idx >= 0) {
        const n = [...prev]
        n[idx] = { sucursal_id: suc.id, ultimo_numero: numSig }
        return n
      }
      return [...prev, { sucursal_id: suc.id, ultimo_numero: numSig }]
    })

    if (fact.paciente_id) {
      const resPts = await acumularPuntosPorFactura(sb2, fact.id)
      if (!resPts.ok) console.warn('Puntos fidelidad:', resPts.error)
    }

    const impresa = { ...fact!, sucursal: suc }
    setFactImpresa(impresa)
    setGuardandoFact(false)
    const printDataLab = await adjuntarPortalSiLab(
      facturaPrintDesdeRegistro(impresa), grupo.pacienteId || null, true,
    )
    abrirFacturaTermica(printDataLab, { autoPrint: true })
  }

  /* ── portal del paciente (para imprimir credenciales en la factura de lab) ── */
  function portalBaseUrl(): string {
    const env = process.env.NEXT_PUBLIC_APP_URL
    if (env) return env.replace(/\/$/, '') + '/portal'
    if (typeof window !== 'undefined') return window.location.origin + '/portal'
    return '/portal'
  }

  /** Si la factura incluye laboratorio y hay paciente, genera el acceso y lo adjunta al ticket. */
  async function adjuntarPortalSiLab(
    printData: FacturaPrintData,
    pacienteId: number | null | undefined,
    tieneLab: boolean,
  ): Promise<FacturaPrintData> {
    if (!tieneLab) return printData
    if (!pacienteId) {
      alert(
        'La factura se imprimirá, pero el acceso al portal de resultados NO se incluyó ' +
        'porque esta orden de laboratorio no está ligada a un paciente registrado.\n\n' +
        'Para que se genere usuario y contraseña, el paciente debe estar registrado con expediente ' +
        '(búscalo y selecciónalo de la lista al crear la orden de laboratorio).'
      )
      return printData
    }
    try {
      const r = await generarAccesoPortal(pacienteId)
      if (r.ok && r.usuario && r.password) {
        printData.portal = { usuario: r.usuario, password: r.password, url: portalBaseUrl() }
      } else {
        console.warn('Acceso portal:', r.error)
        alert('La factura se imprimirá, pero no se pudo generar el acceso al portal: ' +
          (r.error ?? 'error desconocido') + '.')
      }
    } catch (e) {
      console.warn('Acceso portal:', e)
      alert('La factura se imprimirá, pero no se pudo generar el acceso al portal: ' +
        (e instanceof Error ? e.message : String(e)) + '.')
    }
    return printData
  }

  /* ── imprimir factura generada desde caja ── */
  function imprimirFacturaCaja() {
    if (!factImpresa) return
    abrirFacturaTermica(facturaPrintDesdeRegistro(factImpresa as Record<string, unknown>), { autoPrint: true })
  }

  /* ── generar factura fiscal después de venta rápida ── */
  async function generarFacturaVentaRapida() {
    if (!ventaRapidaCobro) return
    setGuardandoFactVentaRapida(true)
    const sb2 = supabase
    const sucId = perfil?.sucursal_id ?? sesion?.sucursal_id
    const suc = sucursales.find(s => s.id === sucId)
    if (!suc) {
      alert('Tu usuario no tiene sucursal asignada. Ve a Configuración → Usuarios y asigna una sucursal.')
      setGuardandoFactVentaRapida(false)
      return
    }

    const base = ventaRapidaCobro.subtotal
    const valDesc = ventaRapidaCobro.descuentoMonto
    const subtotalConDesc = base - valDesc
    const isv = formFacturaVentaRapida.exento ? 0 : subtotalConDesc * 0.15
    const total = subtotalConDesc + isv

    const items = ventaRapidaCobro.items.map(item => ({
      descripcion: `${PREFIJOS_CONCEPTO_VENTA[item.tipo]} — ${item.nombre}`,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      isv_pct: formFacturaVentaRapida.exento ? 0 : 15,
      subtotal: item.precio * item.cantidad,
    }))

    const pac = ventaRapidaCobro.paciente
    const hora = new Date().toTimeString().slice(0, 8)

    const payloadBase = {
      fecha: fechaHoy,
      hora,
      sucursal_id: suc.id,
      paciente_id: ventaRapidaCobro.pacienteId,
      cliente_nombre: formFacturaVentaRapida.nombre_cliente.trim()
        || ventaRapidaCobro.pacienteNombre
        || (pac ? nombrePaciente(pac) : 'CONSUMIDOR FINAL'),
      cliente_rtn: formFacturaVentaRapida.rtn_cliente.trim() || null,
      items,
      subtotal: base,
      descuento_monto: valDesc,
      isv_monto: isv,
      total,
      estado: 'emitida',
      exento_isv: formFacturaVentaRapida.exento,
      cai: suc.cai ?? null,
      rtn_emisor: suc.rtn ?? null,
      rango_inicio: suc.num_min ? String(suc.num_min) : null,
      rango_fin: suc.num_max ? String(suc.num_max) : null,
      fecha_limite_cai: suc.fecha_limite ?? null,
      cajero_nombre: perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : '',
      medico_nombre: null,
      consulta_id: null,
    }

    let fact = null
    let numSig = 0
    let ultimoError: string | null = null

    for (let intento = 0; intento < 4; intento++) {
      const reserva = await reservarSiguienteCorrelativo(
        sb2, suc.id, suc,
        intento > 0 ? numSig + 1 : undefined,
      )
      numSig = reserva.numSig

      const { data, error } = await sb2.from('facturas').insert({
        ...payloadBase,
        numero: reserva.numero,
      }).select().single()

      if (!error) {
        fact = data
        await confirmarCorrelativo(sb2, suc.id, numSig)
        break
      }

      ultimoError = error.message
      if (!esErrorNumeroDuplicado(error)) break
      numSig += 1
    }

    if (!fact) {
      console.error(ultimoError)
      alert('Error al crear factura: ' + (ultimoError ?? 'Número duplicado'))
      setGuardandoFactVentaRapida(false)
      return
    }

    setCorrelativos(prev => {
      const idx = prev.findIndex(c => c.sucursal_id === suc.id)
      if (idx >= 0) {
        const n = [...prev]
        n[idx] = { sucursal_id: suc.id, ultimo_numero: numSig }
        return n
      }
      return [...prev, { sucursal_id: suc.id, ultimo_numero: numSig }]
    })

    if (fact.paciente_id) {
      const resPts = await acumularPuntosPorFactura(sb2, fact.id)
      if (!resPts.ok) console.warn('Puntos fidelidad:', resPts.error)
    }

    const impresa = { ...fact!, sucursal: suc }
    setFactImpresaVentaRapida(impresa)
    setGuardandoFactVentaRapida(false)
    abrirFacturaTermica(facturaPrintDesdeRegistro(impresa), { autoPrint: true })
  }

  /* ══════════════════ JSX ══════════════════════════════════ */

  /* ── pantalla APERTURA ─ */
  if (!sesion) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
        <div className="px-8 py-6 text-center text-white" style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: `${BRAND.gold}33` }}>
            <Unlock className="w-8 h-8" style={{ color: BRAND.goldLight }} />
          </div>
          <h1 className="text-2xl font-black">Apertura de Caja</h1>
          <p className="text-sm text-white/70 mt-1">
            {new Date(fechaHoy + 'T12:00:00').toLocaleDateString('es-HN', {
              weekday: 'long', day: 'numeric', month: 'long'
            })}
          </p>
          {!esAdmin && (
            <p className="text-xs text-white/60 mt-2 max-w-xs mx-auto">
              Si ya cerró el turno de hoy, conserve el reporte impreso. Los datos del cierre no quedan visibles en el sistema.
            </p>
          )}
        </div>

        <div className="space-y-4 p-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enfermero/a</label>
            <div className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">
              {perfil?.nombre ? `${perfil.nombre} ${perfil.apellido || ''}` : 'Usuario actual'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal *</label>
            {sucursales.length === 0 ? (
              <div className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm bg-red-50 text-red-600">
                No hay sucursales. Ve a Configuración → Sucursales y crea una.
              </div>
            ) : (
              <select value={formApertura.sucursal_id}
                disabled={!esAdmin}
                onChange={e => {
                  if (!esAdmin) return
                  const sid = e.target.value
                  const suc = sucursales.find(s => s.id === Number(sid))
                  setFormApertura(p => ({
                    ...p,
                    sucursal_id: sid,
                    monto_inicial: suc?.fondo_caja ? String(suc.fondo_caja) : p.monto_inicial,
                  }))
                  setFondoMsg(null)
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${!esAdmin ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}>
                <option value="">— Seleccionar sucursal —</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
            {!esAdmin && (
              <p className="text-[11px] text-gray-500 mt-1">
                Tu caja está fijada a tu sucursal asignada. Solo un administrador puede cambiarla.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto inicial en caja (efectivo)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">L.</span>
              <input type="number" min="0" step="0.01"
                value={formApertura.monto_inicial}
                onChange={e => { setFormApertura(p => ({ ...p, monto_inicial: e.target.value })); setFondoMsg(null) }}
                placeholder="0.00"
                className="w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg font-semibold" />
            </div>
            {(() => {
              const sucSel = sucursales.find(s => s.id === Number(formApertura.sucursal_id))
              const fondoSuc = Number(sucSel?.fondo_caja || 0)
              return (
                <p className="text-[11px] text-gray-500 mt-1">
                  {fondoSuc > 0
                    ? `Fondo sugerido de la sucursal: ${fmt(fondoSuc)}. Es la base que se conserva; puede ajustarla.`
                    : 'Este es el fondo base de la caja; se conserva y no cuenta como ingreso del día.'}
                </p>
              )
            })()}
            {esAdmin && formApertura.sucursal_id && (
              <div className="mt-1.5 flex items-center gap-2">
                <button type="button" onClick={guardarFondoSucursal} disabled={guardandoFondo}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                  Guardar este monto como fondo de la sucursal
                </button>
                {fondoMsg && <span className="text-xs text-green-600">{fondoMsg}</span>}
              </div>
            )}
          </div>

          {errorAp && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" /> {errorAp}
            </div>
          )}

          <button onClick={abrirCaja}
            disabled={!formApertura.sucursal_id || loadingAp || sucursales.length === 0}
            className="w-full py-3 rounded-xl font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
            {loadingAp
              ? <><RefreshCw className="w-5 h-5 animate-spin" /> Abriendo...</>
              : <><Unlock className="w-5 h-5" /> Abrir Caja</>
            }
          </button>
        </div>
      </div>
    </div>
  )

  /* ── pantalla CAJA ABIERTA ─ */
  return (
    <ModuleShell tint="emerald">
      <ModuleHero
        title="Caja"
        subtitle={`${sesion.cajero_nombre} · Apertura ${sesion.hora_apertura?.slice(0, 5)} · Inicial ${fmt(sesion.monto_inicial)}`}
        badge="Sesión abierta"
        icon={Wallet}
        gradient="emerald"
        kpis={[
          { label: 'Saldo en caja', value: fmt(saldoEsp), icon: Wallet },
          { label: 'Ingresos', value: fmt(totalIng), icon: TrendingUp },
          { label: 'Egresos', value: fmt(totalEgr), icon: TrendingDown },
          { label: 'A crédito', value: fmt(totalCred), icon: Clock },
        ]}
        actions={
          <>
            <ModuleBtnGhost onClick={() => startTransition(() => recargar())}>
              <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
            </ModuleBtnGhost>
            <ModuleBtnPrimary onClick={() => ventaRapida.abrir('INGRESO')}>
              <Receipt className="w-4 h-4" /> Venta rápida
            </ModuleBtnPrimary>
            {esAdmin && (
              <ModuleBtnGhost onClick={abrirModalConceptos}>
                <Tags className="w-4 h-4" /> Egresos
              </ModuleBtnGhost>
            )}
            <ModuleBtnGhost onClick={abrirModalCierre} className="!bg-red-500/20 !border-red-300/40 !text-red-100">
              <LockKeyhole className="w-4 h-4" /> Cerrar Caja
            </ModuleBtnGhost>
          </>
        }
      />
      <ModuleContent>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3 text-xs text-slate-600">
        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-800">Control anti-fraude activo</p>
          <p className="mt-0.5">
            Cada cobro queda ligado a quien opera caja y su sesión. Venta rápida solo desde catálogo con precios del sistema.
            Descuentos extra solo administrador. Tarjeta/transferencia exigen referencia. Crédito exige paciente.
            Al cerrar, el arqueo debe cuadrar o documentar la diferencia; el reporte impreso es el comprobante del turno.
            Sesiones cerradas solo las consulta administración.
          </p>
        </div>
      </div>

      {/* desglose por forma de pago */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FORMAS_PAGO.map(fp => (
          <div key={fp.key} className="bg-white rounded-xl border p-3 flex items-center gap-3">
            <fp.icon className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">{fp.label}</p>
              <p className="font-semibold text-sm text-gray-800">{fmt(byFormaPago[fp.key] || 0)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="bg-white rounded-xl border">
        <div className="flex border-b">
          {([
            { key: 'movimientos', label: `Movimientos (${movs.length})` },
            { key: 'cobrar', label: `Consultas (${consultasPorCobrar.length})`, alert: consultasPorCobrar.length > 0 },
            { key: 'lab_cobrar', label: `Lab por cobrar (${labPorCobrar.length})`, alert: labPorCobrar.length > 0 },
            { key: 'membresias_cobrar', label: `Membresías (${membresiaPorCobrar.length})`, alert: membresiaPorCobrar.length > 0 },
            { key: 'cot_cobrar', label: `Cotizaciones (${cotPorCobrar.length})`, alert: cotPorCobrar.length > 0 },
            { key: 'cxc', label: `Cuentas por Cobrar (${cxc.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
              {'alert' in t && t.alert && (
                <span className="absolute top-2 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── movimientos ── */}
          {tab === 'movimientos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setVistaMovs('hoy')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition ${
                      vistaMovs === 'hoy' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sesión de hoy
                  </button>
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => setVistaMovs('historial')}
                      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition ${
                        vistaMovs === 'historial' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Historial por día
                    </button>
                  )}
                </div>
                {esAdmin && vistaMovs === 'historial' && (
                  <button
                    type="button"
                    onClick={() => cargarHistorialMovs()}
                    disabled={cargandoHistorial}
                    className="flex items-center justify-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cargandoHistorial ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                )}
              </div>

              {vistaMovs === 'hoy' && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        {fmtFechaCaja(fechaHoy)} — sesión abierta
                      </p>
                      <p className="text-xs text-emerald-700/80 mt-0.5">
                        Apertura {sesion.hora_apertura?.slice(0, 5)} · Inicial {fmt(sesion.monto_inicial)} · {movs.length} movimiento(s)
                      </p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 bg-white/80 px-2.5 py-1 rounded-full border border-emerald-200">
                      En vivo
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 px-1">
                    Orden cronológico del día (mañana → noche). El saldo en caja es acumulado en efectivo/entrada real.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <th className="px-3 py-2.5 text-left">Hora</th>
                          <th className="px-3 py-2.5 text-left">Concepto</th>
                          <th className="px-3 py-2.5 text-left">Paciente</th>
                          <th className="px-3 py-2.5 text-left">Pago</th>
                          <th className="px-3 py-2.5 text-right">Ingreso</th>
                          <th className="px-3 py-2.5 text-right">Egreso</th>
                          <th className="px-3 py-2.5 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filasMovimientos(movsHoyOrdenados)}
                      </tbody>
                      {movs.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-50 font-bold text-sm border-t-2 border-gray-200">
                            <td colSpan={4} className="px-3 py-2.5 text-right text-gray-700">Totales del día:</td>
                            <td className="px-3 py-2.5 text-right text-green-600">{fmt(totalIng)}</td>
                            <td className="px-3 py-2.5 text-right text-red-500">{fmt(totalEgr)}</td>
                            <td className="px-3 py-2.5 text-right text-gray-800">{fmt(saldoEsp)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}

              {esAdmin && vistaMovs === 'historial' && (
                <>
                  <p className="text-xs text-gray-500 px-1">
                    Sesiones cerradas de los últimos 14 días, agrupadas por fecha. Cada día = una apertura y cierre de caja.
                  </p>
                  {cargandoHistorial && historialDias.length === 0 && (
                    <div className="py-16 text-center text-gray-400">
                      <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                      Cargando historial…
                    </div>
                  )}
                  {!cargandoHistorial && historialDias.length === 0 && (
                    <div className="py-16 text-center text-gray-400">
                      <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No hay sesiones cerradas recientes</p>
                      <p className="text-sm mt-1">Al cerrar caja, el día queda guardado aquí</p>
                    </div>
                  )}
                  <div className="space-y-5">
                    {historialDias.map(dia => (
                      <div key={dia.fecha} className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
                          <div>
                            <p className="font-semibold text-gray-900">{fmtFechaCaja(dia.fecha)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {dia.sesion.hora_apertura?.slice(0, 5)} – {dia.sesion.hora_cierre?.slice(0, 5) ?? '—'}
                              {' · '}{dia.movimientos.length} mov. · Inicial {fmt(dia.sesion.monto_inicial)}
                            </p>
                          </div>
                          <div className="flex gap-3 text-xs font-semibold">
                            <span className="text-green-700">+{fmt(dia.totalIng)}</span>
                            <span className="text-red-600">−{fmt(dia.totalEgr)}</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[600px]">
                            <thead>
                              <tr className="bg-white text-gray-400 text-[10px] uppercase">
                                <th className="px-3 py-2 text-left">Hora</th>
                                <th className="px-3 py-2 text-left">Concepto</th>
                                <th className="px-3 py-2 text-left">Paciente</th>
                                <th className="px-3 py-2 text-left">Pago</th>
                                <th className="px-3 py-2 text-right">Ing.</th>
                                <th className="px-3 py-2 text-right">Egr.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {filasMovimientos(dia.movimientos, false)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ TAB POR COBRAR ══ */}
          {tab === 'cobrar' && (
            <div>
              {consultasPorCobrar.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-300" />
                  <p className="font-medium">No hay consultas pendientes de cobro</p>
                  <p className="text-sm mt-1">Todas las consultas finalizadas han sido cobradas</p>
                </div>
              ) : (
                <div className="divide-y">
                  {consultasPorCobrar.map(c => {
                    const pac = c.paciente
                    return (
                      <div key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {pac ? `${pac.nombre} ${pac.apellido1}` : `Paciente #${c.paciente_id}`}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {c.fecha} {c.hora?.slice(0, 5)} · {c.tipo_nombre || 'Consulta'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm text-gray-500">Ver detalles al cobrar</p>
                          <button
                            onClick={() => abrirModalCobro(c)}
                            disabled={loadingCobro}
                            className="mt-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                          >
                            {loadingCobro ? '...' : 'Cobrar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ TAB LAB POR COBRAR ══ */}
          {tab === 'lab_cobrar' && (
            <div>
              {labPorCobrar.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <FlaskConical className="w-10 h-10 mx-auto mb-3 text-cyan-300" />
                  <p className="font-medium">No hay órdenes de laboratorio directas pendientes</p>
                  <p className="text-sm mt-1">Las órdenes creadas en Laboratorio → Nueva Orden aparecen aquí para cobrar</p>
                </div>
              ) : (
                <div className="divide-y">
                  {labPorCobrar.map(g => (
                    <div key={g.grupoId} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                      <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
                        <FlaskConical className="w-5 h-5 text-cyan-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{g.pacienteNombre}</p>
                        <p className="text-xs text-gray-400">
                          {g.pacienteCodigo} · {g.fecha} {g.hora?.slice(0, 5) || ''} · {g.ordenes.length} prueba(s)
                        </p>
                        <p className="text-xs text-cyan-700 mt-0.5 truncate">
                          {g.ordenes.map(o => o.no_analisis).join(' · ')}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{fmt(g.total)}</p>
                        <button
                          type="button"
                          onClick={() => abrirModalCobroLab(g)}
                          disabled={!sesion || guardandoCobroLab}
                          className="mt-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                        >
                          Cobrar lab
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!sesion && labPorCobrar.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                  Abra la caja del día para poder cobrar órdenes de laboratorio.
                </p>
              )}
            </div>
          )}

          {/* ══ TAB MEMBRESÍAS POR COBRAR ══ */}
          {tab === 'membresias_cobrar' && (
            <div>
              {membresiaPorCobrar.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <BadgeCheck className="w-10 h-10 mx-auto mb-3 text-violet-300" />
                  <p className="font-medium">No hay cuotas de membresía pendientes</p>
                  <p className="text-sm mt-1">Las cuotas vencidas o por vencer aparecen aquí para cobrar</p>
                </div>
              ) : (
                <div className="divide-y">
                  {membresiaPorCobrar.map(p => {
                    const pac = p.membresia?.paciente
                    const vencida = p.fecha_vencimiento < fechaHoy && p.estado !== 'pagado'
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                          <BadgeCheck className="w-5 h-5 text-violet-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">
                            {pac ? `${pac.nombre} ${pac.apellido1}` : `Membresía #${p.membresia_id}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {p.membresia?.numero_carnet || '—'} · {p.membresia?.tipo?.nombre || 'Plan'} · Cuota #{p.numero_cuota}
                          </p>
                          <p className={`text-xs mt-0.5 ${vencida ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            Vence {p.fecha_vencimiento}{vencida ? ' · Vencida' : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-900">{fmt(p.monto)}</p>
                          <button
                            type="button"
                            onClick={() => abrirModalCobroMembresia(p)}
                            disabled={!sesion || guardandoCobroMembresia}
                            className="mt-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                          >
                            Cobrar cuota
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {!sesion && membresiaPorCobrar.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                  Abra la caja del día para poder cobrar cuotas de membresía.
                </p>
              )}
            </div>
          )}

          {/* ══ TAB COTIZACIONES POR COBRAR ══ */}
          {tab === 'cot_cobrar' && (
            <div>
              {cotPorCobrar.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-3 text-orange-300" />
                  <p className="font-medium">No hay cotizaciones pendientes de cobro</p>
                  <p className="text-sm mt-1">Las cotizaciones enviadas a caja desde el módulo de Cotizaciones aparecen aquí</p>
                </div>
              ) : (
                <div className="divide-y">
                  {cotPorCobrar.map(c => (
                    <div key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-orange-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{c.cliente_nombre}</p>
                        <p className="text-xs text-gray-400">
                          {c.numero} · {c.fecha}
                          {c.cliente_rtn ? ` · RTN ${c.cliente_rtn}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{fmt(c.total)}</p>
                        <button
                          type="button"
                          onClick={() => abrirModalCobroCot(c)}
                          disabled={!sesion || guardandoCobroCot}
                          className="mt-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                        >
                          Cobrar y facturar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!sesion && cotPorCobrar.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                  Abra la caja del día para poder cobrar cotizaciones.
                </p>
              )}
            </div>
          )}

          {/* ── cuentas por cobrar ── */}
          {tab === 'cxc' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="px-3 py-2 text-left">Paciente</th>
                    <th className="px-3 py-2 text-left">Concepto</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Pagado</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                    <th className="px-3 py-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cxc.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay cuentas por cobrar pendientes</td></tr>
                  )}
                  {cxc.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium">
                        {c.paciente?.nombre} {c.paciente?.apellido1}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{c.concepto}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(c.monto_total)}</td>
                      <td className="px-3 py-2.5 text-right text-green-600">{fmt(c.monto_pagado)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-600">{fmt(c.saldo)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.estado === 'PARCIAL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>{c.estado}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => { setCxcActual(c); setFormAbono({ monto: String(c.saldo), forma_pago: 'EFECTIVO', referencia: '', nota: '' }); setModalAbono(true) }}
                          disabled={!sesion}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                        >
                          Abonar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sesion && cxc.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                  Abra la caja del día para registrar abonos a cuentas por cobrar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <VentaRapidaModal venta={ventaRapida} conceptos={conceptos} esAdmin={esAdmin} />

      {/* ══ VENTA RÁPIDA: COBRO EXITOSO → FACTURA FISCAL ══ */}
      {ventaRapidaCobro && !modalFacturaVentaRapida && !factImpresaVentaRapida && (
        <Modal title="Venta Registrada" onClose={cerrarFlujoFacturaVentaRapida} size="xl" accent="green" icon={CheckCircle2}>
          <div className="space-y-5">
            {ventaRapidaCobro.formaPago !== 'CREDITO' && ventaRapidaCobro.paciente ? (
              <PagoAgradecimientoPanel
                monto={ventaRapidaCobro.totalNeto}
                paciente={ventaRapidaCobro.paciente}
                subtitulo={ventaRapidaCobro.formaPago}
              />
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-9 h-9 text-green-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">¡Venta registrada correctamente!</p>
                <p className="text-2xl font-extrabold text-green-700 mt-1">{fmt(ventaRapidaCobro.totalNeto)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {ventaRapidaCobro.pacienteNombre || 'Sin paciente'} · {ventaRapidaCobro.formaPago}
                  {ventaRapidaCobro.descuentoPct > 0 && ` · ${ventaRapidaCobro.descuentoPct}% dto.`}
                </p>
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">¿Desea emitir factura fiscal?</p>
              <p className="text-xs text-amber-600">
                El cobro ya quedó en caja. Si cierra sin facturar, deberá emitir la factura después desde Facturación para no afectar el orden cronológico.
              </p>
              {sucursalActiva
                ? <p className="text-xs text-amber-700 mt-1 font-medium">📍 Sucursal: {sucursalActiva.nombre}</p>
                : <p className="text-xs text-red-600 mt-1 font-semibold">⚠️ Sin sucursal asignada — no podrá facturar.</p>
              }
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={cerrarFlujoFacturaVentaRapida}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cerrar sin facturar
              </button>
              <button
                onClick={() => setModalFacturaVentaRapida(true)}
                disabled={!sucursalActiva}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Generar Factura Fiscal
              </button>
            </div>
          </div>
        </Modal>
      )}

      {ventaRapidaCobro && modalFacturaVentaRapida && !factImpresaVentaRapida && (
        <Modal title="Factura Fiscal — Venta rápida" onClose={cerrarFlujoFacturaVentaRapida} size="xl" accent="indigo" icon={FileText}>
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold text-indigo-800">
                {formFacturaVentaRapida.nombre_cliente.trim()
                  || ventaRapidaCobro.pacienteNombre
                  || 'CONSUMIDOR FINAL'}
              </p>
              {formFacturaVentaRapida.rtn_cliente.trim() && (
                <p className="text-xs font-mono text-indigo-600">RTN: {formFacturaVentaRapida.rtn_cliente}</p>
              )}
              <p className="text-indigo-600 font-bold text-lg">{fmt(ventaRapidaCobro.totalNeto)}</p>
              <p className="text-xs text-indigo-500">
                {ventaRapidaCobro.items.length} ítem(s)
                {ventaRapidaCobro.descuentoMonto > 0 && ` · Descuento: ${fmt(ventaRapidaCobro.descuentoMonto)}`}
              </p>
            </div>

            <NombreFacturarProtegido
              compact
              formFactura={formFacturaVentaRapida}
              setFormFactura={setFormFacturaVentaRapida}
              nombreRegistrado={titularFacturaVentaRapida.nombre}
              rtnRegistrado={titularFacturaVentaRapida.rtn}
              esSuperAdmin={esSuperAdmin}
              sucursalId={sucursalActivaId}
              supabase={supabase}
              resetKey={`vr-${ventaRapidaCobro?.pacienteId ?? 'fact'}`}
            />

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv-vr"
                type="checkbox"
                checked={formFacturaVentaRapida.exento}
                onChange={e => setFormFacturaVentaRapida(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv-vr" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV (medicina)
              </label>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                onClick={() => setModalFacturaVentaRapida(false)}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm"
              >
                Atrás
              </button>
              <button
                onClick={generarFacturaVentaRapida}
                disabled={guardandoFactVentaRapida}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {guardandoFactVentaRapida ? 'Generando...' : 'Crear e Imprimir Factura'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {ventaRapidaCobro && factImpresaVentaRapida && (
        <Modal title="Factura Generada" onClose={cerrarFlujoFacturaVentaRapida} size="md" accent="indigo" icon={FileText}>
          <div className="space-y-4 text-center">
            <p className="font-bold text-gray-900 text-xl">
              Factura No. {(factImpresaVentaRapida as { numero?: string }).numero}
            </p>
            <p className="text-green-700 font-bold text-2xl">{fmt(ventaRapidaCobro.totalNeto)}</p>
            <button
              onClick={() => abrirFacturaTermica(
                facturaPrintDesdeRegistro(factImpresaVentaRapida as Record<string, unknown>),
                { autoPrint: true },
              )}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir Factura
            </button>
            <button onClick={cerrarFlujoFacturaVentaRapida} className="w-full px-4 py-2 border rounded-lg text-sm">
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL CIERRE DE CAJA — ARQUEO + IMPRESIÓN ══════════ */}
      {modalCierre && sesion && (
        <Modal
          title="Cierre de Caja"
          subtitle={esAdmin
            ? 'Conteo físico de la cajera — el detalle del sistema queda en el reporte impreso'
            : 'Cuente el efectivo del cajón e ingrese los montos. El sistema verifica e imprime el cierre.'}
          size={esAdmin ? 'full' : 'md'}
          accent="green"
          icon={LockKeyhole}
          onClose={() => setModalCierre(false)}
          footer={(
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3">
              <p className="text-xs text-gray-500 self-center">
                {formCierre.ventas_efectivo && formCierre.egresos_contado
                  ? arqueoCuadrado
                    ? '✓ Conteo correcto — puede cerrar e imprimir'
                    : 'Hay diferencia — escriba una observación'
                  : 'Complete los 3 montos del conteo físico'}
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button type="button" onClick={() => setModalCierre(false)}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={cerrarCaja}
                  disabled={!formCierre.ventas_efectivo || formCierre.egresos_contado === ''}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Cerrar caja e imprimir
                </button>
              </div>
            </div>
          )}
        >
          <div className={`grid gap-5 lg:gap-6 ${esAdmin ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-lg mx-auto'}`}>
            {/* Solo administración ve el resumen del sistema */}
            {esAdmin && (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-3">Resumen del sistema (solo admin)</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-green-700">
                      <span>(+) Ventas en efectivo</span>
                      <span className="font-semibold tabular-nums">{fmt(arqueoSistema.ingEfectivo)}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>(−) Egresos pagados</span>
                      <span className="font-semibold tabular-nums">{fmt(arqueoSistema.totalEgr)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200 font-bold text-emerald-700">
                      <span>= Efectivo del día (a entregar)</span>
                      <span className="text-lg tabular-nums">{fmt(efectivoDelDia)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Fondo de caja (se conserva)</span>
                      <span className="font-semibold tabular-nums">{fmt(sesion.monto_inicial)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-900">
                      <span>= Total en cajón (fondo + día)</span>
                      <span className="text-lg tabular-nums">{fmt(arqueoSistema.efectivoEsperado)}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    El fondo de {fmt(sesion.monto_inicial)} no es ingreso del día: queda en el cajón para mañana.
                  </p>
                </div>

                {/* Detalle de egresos del día */}
                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                  <p className="text-xs font-bold text-rose-900 uppercase tracking-wide mb-2">
                    Egresos del día ({egresosDelDia.length})
                  </p>
                  {egresosDelDia.length === 0 ? (
                    <p className="text-xs text-gray-500">No hubo egresos en este turno.</p>
                  ) : (
                    <>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {egresosDelDia.map((e, i) => (
                          <div key={i} className="flex justify-between items-center text-sm gap-2">
                            <span className="text-gray-700 truncate">
                              {e.hora?.slice(0, 5) && <span className="text-gray-400 text-xs mr-1">{e.hora.slice(0, 5)}</span>}
                              {e.concepto}
                              <span className="text-[10px] text-gray-400 ml-1">{e.forma_pago}</span>
                            </span>
                            <span className="font-semibold tabular-nums text-rose-700 shrink-0">−{fmt(e.monto)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between pt-2 mt-2 border-t border-rose-200 font-bold text-rose-900 text-sm">
                        <span>Total egresos</span>
                        <span className="tabular-nums">{fmt(arqueoSistema.totalEgr)}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Otros medios</p>
                  <div className="flex justify-between"><span>Tarjetas</span><span className="font-medium">{fmt(arqueoSistema.ingTarjeta)}</span></div>
                  <div className="flex justify-between"><span>Transferencias</span><span className="font-medium">{fmt(arqueoSistema.ingTransfer)}</span></div>
                  <div className="flex justify-between"><span>A crédito</span><span className="font-medium">{fmt(arqueoSistema.ingCredito)}</span></div>
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total ingresos del día</span><span>{fmt(arqueoSistema.totalIng)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Conteo físico — lo único que ve la enfermera/cajero */}
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-3">Su conteo físico</p>
                <p className="text-xs text-amber-800/90 mb-4">
                  Cuente el dinero en el cajón e ingrese los tres montos. No necesita ver los totales del sistema.
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'efectivo_apertura' as const, label: '1. Efectivo con que abrió caja', hint: 'Mismo monto de la apertura' },
                    { key: 'ventas_efectivo' as const, label: '2. Ventas cobradas en efectivo', hint: 'Solo billetes y monedas de ventas' },
                    { key: 'egresos_contado' as const, label: '3. Egresos pagados en efectivo', hint: 'Gastos o retiros; ponga 0 si no hubo' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-gray-800 mb-0.5">{f.label}</label>
                      <p className="text-[10px] text-gray-500 mb-1">{f.hint}</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">L.</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={formCierre[f.key]}
                          onChange={e => setFormCierre(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-lg font-bold focus:ring-2 focus:ring-amber-400 outline-none bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-amber-200 flex justify-between items-center">
                  <span className="font-semibold text-gray-800">Total efectivo contado</span>
                  <span className="text-2xl font-black text-amber-900 tabular-nums">{fmt(efectivoContado)}</span>
                </div>

                {(() => {
                  const fondo = Number(formCierre.efectivo_apertura) || 0
                  const dia = parseFloat(((Number(formCierre.ventas_efectivo) || 0) - (Number(formCierre.egresos_contado) || 0)).toFixed(2))
                  return (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg bg-white border border-amber-200 p-2">
                        <p className="text-[10px] text-gray-500 uppercase">Dejar en cajón (fondo)</p>
                        <p className="font-bold text-gray-800 tabular-nums">{fmt(fondo)}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-emerald-200 p-2">
                        <p className="text-[10px] text-gray-500 uppercase">Entregar (efectivo del día)</p>
                        <p className="font-bold text-emerald-700 tabular-nums">{fmt(dia)}</p>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {formCierre.ventas_efectivo && formCierre.egresos_contado !== '' && (
                <div className={`rounded-xl p-4 text-center font-bold ${
                  arqueoCuadrado ? 'bg-green-50 border border-green-200 text-green-800' :
                  diferenciaArqueo > 0 ? 'bg-blue-50 border border-blue-200 text-blue-800' :
                  'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {arqueoCuadrado && '✓ Conteo correcto — coincide con el sistema'}
                  {!arqueoCuadrado && diferenciaArqueo > 0 && `Sobrante: ${fmt(diferenciaArqueo)}`}
                  {!arqueoCuadrado && diferenciaArqueo < 0 && `Faltante: ${fmt(Math.abs(diferenciaArqueo))}`}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones {formCierre.ventas_efectivo && !arqueoCuadrado && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={formCierre.observacion}
                  rows={2}
                  placeholder={arqueoCuadrado ? 'Opcional' : 'Explique la diferencia antes de cerrar'}
                  onChange={e => setFormCierre(p => ({ ...p, observacion: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-300 outline-none"
                />
              </div>

              <p className="text-[11px] text-gray-500 text-center">
                El reporte impreso incluye el detalle del sistema y su conteo para archivo de la clínica.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL CATÁLOGO DE EGRESOS (ADMIN) ══════════ */}
      {modalConceptos && (
        <Modal
          title="Conceptos de egreso"
          subtitle="Administre los conceptos disponibles al registrar egresos en caja"
          size="md"
          accent="rose"
          icon={Tags}
          onClose={cerrarModalConceptos}
          footer={(
            <div className="flex justify-end">
              <button type="button" onClick={cerrarModalConceptos}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                Listo
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            {/* Form alta/edición */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                {formConcepto.id ? 'Editar concepto' : 'Nuevo concepto'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input value={formConcepto.nombre}
                    onChange={e => setFormConcepto(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej. Compra de insumos"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-300 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría (opcional)</label>
                  <input value={formConcepto.categoria}
                    onChange={e => setFormConcepto(p => ({ ...p, categoria: e.target.value }))}
                    placeholder="Ej. Operativo"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-300 outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={guardarConcepto} disabled={guardandoConcepto}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                  {formConcepto.id ? <><Save className="w-4 h-4" /> Guardar</> : <><Plus className="w-4 h-4" /> Agregar</>}
                </button>
                {formConcepto.id && (
                  <button type="button" onClick={() => setFormConcepto({ id: null, nombre: '', categoria: '' })}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-white">
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {/* Lista */}
            {cargandoConceptos ? (
              <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
            ) : conceptosEgreso.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No hay conceptos de egreso. Agregue el primero arriba.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {conceptosEgreso.map(c => {
                  const activo = c.activo ?? true
                  return (
                    <div key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.nombre}</p>
                        {c.categoria && <p className="text-[11px] text-gray-400">{c.categoria}</p>}
                      </div>
                      {!activo && <span className="text-[10px] text-gray-400 uppercase font-semibold">Inactivo</span>}
                      <button type="button" title="Editar"
                        onClick={() => setFormConcepto({ id: c.id, nombre: c.nombre, categoria: c.categoria || '' })}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" title={activo ? 'Desactivar' : 'Activar'}
                        onClick={() => toggleConceptoActivo(c)}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 ${activo ? 'text-emerald-600' : 'text-gray-400'}`}>
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              Los conceptos inactivos no aparecen al registrar egresos, pero se conservan en el historial.
            </p>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL ABONO CXC ══════════ */}
      {modalAbono && cxcActual && (
        <Modal title="Registrar Abono" onClose={() => setModalAbono(false)}>
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-lg p-3 text-sm border border-amber-200">
              <p className="font-semibold text-amber-800">
                {cxcActual.paciente?.nombre} {cxcActual.paciente?.apellido1}
              </p>
              <p className="text-amber-600">{cxcActual.concepto}</p>
              <p className="text-amber-700 font-bold mt-1">Saldo pendiente: {fmt(cxcActual.saldo)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto a abonar *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">L.</span>
                <input type="number" min="0" max={cxcActual.saldo} step="0.01"
                  value={formAbono.monto}
                  onChange={e => setFormAbono(p => ({ ...p, monto: e.target.value }))}
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-lg font-bold" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Forma de Pago</label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAS_PAGO.filter(f => f.key !== 'CREDITO').map(fp => (
                  <button key={fp.key}
                    onClick={() => setFormAbono(p => ({ ...p, forma_pago: fp.key }))}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs transition-all ${
                      formAbono.forma_pago === fp.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    <fp.icon className="w-3.5 h-3.5" /> {fp.label}
                  </button>
                ))}
              </div>
            </div>
            {['TARJETA', 'TRANSFERENCIA'].includes(formAbono.forma_pago) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formAbono.forma_pago === 'TARJETA' ? 'Número de voucher *' : 'Referencia de transferencia *'}
                </label>
                <input value={formAbono.referencia}
                  onChange={e => setFormAbono(p => ({ ...p, referencia: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
              <input value={formAbono.nota}
                onChange={e => setFormAbono(p => ({ ...p, nota: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalAbono(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={registrarAbono} disabled={!sesion || guardandoAbono}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4 inline mr-1" /> {guardandoAbono ? 'Procesando...' : 'Registrar Abono'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL COBRO MEMBRESÍA ══════════ */}
      {modalCobroMembresia && membresiaPagoCobro && (() => {
        const pac = membresiaPagoCobro.membresia?.paciente
        const vencida = membresiaPagoCobro.fecha_vencimiento < fechaHoy
        return (
          <Modal
            title="Cobro de Membresía"
            subtitle={`${membresiaPagoCobro.membresia?.numero_carnet || '—'} · Cuota #${membresiaPagoCobro.numero_cuota}`}
            size="lg"
            accent="indigo"
            icon={BadgeCheck}
            onClose={cerrarModalCobroMembresia}
            footer={(
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button type="button" onClick={cerrarModalCobroMembresia}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={procesarCobroMembresia}
                  disabled={guardandoCobroMembresia || !sesion}
                  title={!sesion ? 'Debes abrir la caja del día para cobrar' : undefined}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {guardandoCobroMembresia ? 'Procesando…' : `Cobrar ${fmt(membresiaPagoCobro.monto)}`}
                </button>
              </div>
            )}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 space-y-2 text-sm">
                  <p className="font-semibold text-violet-900">
                    {pac ? `${pac.nombre} ${pac.apellido1}` : 'Paciente'}
                  </p>
                  <p className="text-violet-700">{membresiaPagoCobro.membresia?.tipo?.nombre || 'Plan médico'}</p>
                  <p className="text-xs text-violet-600">
                    Vence {membresiaPagoCobro.fecha_vencimiento}
                    {vencida && <span className="ml-1 font-semibold text-red-600">· Vencida</span>}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Forma de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMAS_PAGO.filter(f => f.key !== 'CREDITO').map(fp => (
                      <button key={fp.key} type="button"
                        onClick={() => setFormCobroMembresia(p => ({ ...p, forma_pago: fp.key }))}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-all ${
                          formCobroMembresia.forma_pago === fp.key
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-gray-200 text-gray-600'
                        }`}>
                        <fp.icon className="w-3.5 h-3.5" /> {fp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Monto a cobrar</p>
                  <p className="text-3xl font-bold text-violet-700 mt-1">{fmt(membresiaPagoCobro.monto)}</p>
                </div>
                {!sesion && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Debes <strong>abrir la caja del día</strong> antes de cobrar esta cuota. El monto ya está cargado; abre la caja y vuelve a presionar Cobrar.</span>
                  </div>
                )}
                {(formCobroMembresia.forma_pago === 'TARJETA' || formCobroMembresia.forma_pago === 'TRANSFERENCIA') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                    <input
                      value={formCobroMembresia.referencia}
                      onChange={e => setFormCobroMembresia(p => ({ ...p, referencia: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="No. voucher / transferencia"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nota</label>
                  <input
                    value={formCobroMembresia.nota}
                    onChange={e => setFormCobroMembresia(p => ({ ...p, nota: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ══════════ MODAL COBRO COTIZACIÓN ══════════ */}
      {modalCobroCot && cotCobro && (
        <Modal
          title="Cobro de Cotización"
          subtitle={`${cotCobro.numero} · ${cotCobro.cliente_nombre}`}
          size="wide"
          accent="amber"
          icon={FileText}
          onClose={cerrarModalCobroCot}
          footer={(
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button type="button" onClick={cerrarModalCobroCot}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                Cancelar
              </button>
              <button
                type="button"
                onClick={procesarCobroCotizacion}
                disabled={guardandoCobroCot}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {guardandoCobroCot ? 'Procesando…' : `Cobrar y facturar ${fmt(cotCobro.total)}`}
              </button>
            </div>
          )}
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4 space-y-1 text-sm">
                <p className="font-semibold text-orange-900">{cotCobro.cliente_nombre}</p>
                <p className="text-orange-700">Cotización {cotCobro.numero}</p>
                {cotCobro.cliente_rtn && <p className="text-xs text-orange-600">RTN {cotCobro.cliente_rtn}</p>}
                <p className="text-xs text-orange-600">Fecha {cotCobro.fecha}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Forma de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAS_PAGO.map(fp => (
                    <button key={fp.key} type="button"
                      onClick={() => setFormCobroCot(p => ({ ...p, forma_pago: fp.key }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-all ${
                        formCobroCot.forma_pago === fp.key
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-600'
                      }`}>
                      <fp.icon className="w-3.5 h-3.5" /> {fp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total a cobrar</p>
                <p className="text-3xl font-bold text-orange-700 mt-1">{fmt(cotCobro.total)}</p>
                {Number(cotCobro.descuento_monto) > 0 && (
                  <p className="text-xs text-gray-500 mt-1">Incluye descuento de {fmt(cotCobro.descuento_monto)}</p>
                )}
              </div>
              {(formCobroCot.forma_pago === 'TARJETA' || formCobroCot.forma_pago === 'TRANSFERENCIA') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                  <input
                    value={formCobroCot.referencia}
                    onChange={e => setFormCobroCot(p => ({ ...p, referencia: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="No. voucher / transferencia"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota</label>
                <input
                  value={formCobroCot.nota}
                  onChange={e => setFormCobroCot(p => ({ ...p, nota: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Opcional"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                Al cobrar se registra el ingreso en caja y se emite la factura fiscal automáticamente.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL COBRO LABORATORIO DIRECTO ══════════ */}
      {modalCobroLab && labGrupoCobro && !labCobroExitoso && !factImpresa && (() => {
        const det = calcularDescuentoEdad(labGrupoCobro.paciente?.fecha_nac, labGrupoCobro.total, sucursalActiva)
        const detLabDesc = det
        const elegibleDescLab = !detLabDesc.fechaSospechosa && detLabDesc.pctDesc > 0
        const descConfirmadoLab = formCobroLab.descuento_confirmado && Number(formCobroLab.descuento_pct) > 0
        const pctInput = esAdmin
          ? (Number(formCobroLab.descuento_pct) || 0)
          : (formCobroLab.descuento_confirmado ? detLabDesc.pctDesc : 0)
        const membInfoLabUI = getMembresiaPaciente(labGrupoCobro.pacienteId, membresiasMap)
        const membLabPct = membInfoLabUI?.estructurados.pctLaboratorio ?? 0
        const effLabUI = descuentoEfectivo('laboratorio', pctInput, detLabDesc.motivo || 'Descuento', membInfoLabUI?.estructurados)
        const pctLabEfectivo = effLabUI.pct
        const valDescInput = labGrupoCobro.total * (pctLabEfectivo / 100)
        const totalDespuesEdad = labGrupoCobro.total - valDescInput
        const maxPtCanje = maxPuntosCanjeables(puntosFidelidadLab, totalDespuesEdad, fidelidadConfig)
        const ptsAplicar = usarPuntosLab && labGrupoCobro.pacienteId
          ? (puntosCanjearLab.trim() === ''
            ? maxPtCanje
            : Math.min(maxPtCanje, Math.max(0, Math.floor(Number(puntosCanjearLab) || 0))))
          : 0
        const descPuntosUI = valorLempirasDePuntos(ptsAplicar, fidelidadConfig)
        const totalFinal = totalDespuesEdad - descPuntosUI
        const minCobro = fidelidadConfig.monto_minimo_cobro ?? 1
        const descMaxCanje = descuentoMaximoCanje(totalDespuesEdad, fidelidadConfig)
        const pac = labGrupoCobro.paciente
        const puedeUsarPuntos = Boolean(labGrupoCobro.pacienteId) && puntosFidelidadLab > 0
          && formCobroLab.forma_pago !== 'CREDITO' && fidelidadConfig.activo
        return (
          <Modal
            title="Cobro de Laboratorio"
            subtitle={`${labGrupoCobro.pacienteCodigo} · Orden ${labGrupoCobro.fecha} · ${labGrupoCobro.ordenes.length} prueba(s)`}
            size="full"
            accent="cyan"
            icon={FlaskConical}
            onClose={cerrarModalCobroLab}
            footer={(
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button type="button" onClick={cerrarModalCobroLab}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={procesarCobroLab}
                  disabled={guardandoCobroLab || totalFinal < minCobro || !sesion}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {guardandoCobroLab ? 'Procesando...' : totalFinal < minCobro
                    ? `Mínimo L ${minCobro.toFixed(2)} (reduzca puntos)`
                    : `Cobrar L ${totalFinal.toFixed(2)}`}
                </button>
              </div>
            )}
          >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-6">
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-white p-4">
                  <p className="font-bold text-gray-900 text-base sm:text-lg">
                    {nombrePaciente(pac) || labGrupoCobro.pacienteNombre}
                  </p>
                  <p className="text-xs text-cyan-700 mt-1 font-medium">Orden directa (sin consulta médica)</p>
                </div>

                <CobroFacturaFields
                  formFactura={formFactura}
                  setFormFactura={setFormFactura}
                  nombreRegistrado={titularFacturaRegistrado.nombre}
                  rtnRegistrado={titularFacturaRegistrado.rtn}
                  esSuperAdmin={esSuperAdmin}
                  sucursalId={sucursalActivaId}
                  supabase={supabase}
                  resetKey={labGrupoCobro?.grupoId}
                />

                <CobroLineaGrupo
                  icon={FlaskConical}
                  titulo="Análisis de laboratorio"
                  total={labGrupoCobro.total}
                  headerClass="bg-cyan-50"
                  iconClass="text-cyan-600"
                >
                  {labGrupoCobro.ordenes.map(o => (
                    <CobroLineaItem
                      key={o.id}
                      nombre={o.no_analisis}
                      monto={Number(o.importe)}
                    />
                  ))}
                </CobroLineaGrupo>

                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  Al cobrar, las pruebas pasan automáticamente a <strong>Cola de laboratorio</strong> (estado Pagado).
                </p>
              </div>

              <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-0 lg:self-start">
                {membInfoLabUI && membLabPct > 0 && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-bold text-emerald-800">Plan {membInfoLabUI.tipo}</span>
                    </div>
                    <p className="text-xs text-emerald-800 mt-1">{membLabPct}% de descuento en laboratorio aplicado automáticamente.</p>
                  </div>
                )}
                <div className={`rounded-xl border p-4 ${
                  detLabDesc.fechaSospechosa ? 'border-red-300 bg-red-50'
                    : descConfirmadoLab ? 'border-amber-300 bg-amber-50'
                      : elegibleDescLab ? 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-800">Descuento</span>
                    {elegibleDescLab && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                        {detLabDesc.motivo} · sugerido
                      </span>
                    )}
                  </div>

                  {detLabDesc.fechaSospechosa && (
                    <p className="text-xs text-red-700 bg-red-100/60 border border-red-200 rounded-lg px-3 py-2 mb-2">
                      ⚠ Fecha de nacimiento inválida o poco creíble
                      {labGrupoCobro.paciente?.fecha_nac ? ` (${fmtFechaNac(labGrupoCobro.paciente.fecha_nac)})` : ''}.
                      No se aplicará descuento por edad — verifique el expediente.
                    </p>
                  )}

                  {elegibleDescLab && (
                    <label className="flex items-start gap-2 cursor-pointer select-none mb-2">
                      <input
                        type="checkbox"
                        checked={formCobroLab.descuento_confirmado}
                        onChange={e => setFormCobroLab(p => ({
                          ...p,
                          descuento_confirmado: e.target.checked,
                          descuento_pct: e.target.checked ? String(detLabDesc.pctDesc) : '0',
                        }))}
                        className="mt-0.5 w-4 h-4 accent-amber-600"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-semibold">Aplicar descuento {detLabDesc.motivo}</span>
                        <span className="block text-xs text-gray-600">
                          Paciente de <b>{detLabDesc.edad} años</b>
                          {labGrupoCobro.paciente?.fecha_nac ? ` · nació el ${fmtFechaNac(labGrupoCobro.paciente.fecha_nac)}` : ''}.
                          Confirmo que verifiqué su identidad.
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {esAdmin ? (
                      <input
                        type="number" min="0" max="100" step="any"
                        value={formCobroLab.descuento_pct}
                        onChange={e => setFormCobroLab(p => ({
                          ...p,
                          descuento_pct: e.target.value,
                          descuento_confirmado: Number(e.target.value) > 0,
                        }))}
                        className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-semibold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800">{pctInput}%</span>
                    )}
                    <span className="text-sm text-gray-600">= <strong>L {valDescInput.toFixed(2)}</strong></span>
                  </div>
                  {!esAdmin && (
                    <p className="text-[11px] text-gray-500 mt-2">El descuento por edad debe confirmarse en caja.</p>
                  )}
                </div>

                {puedeUsarPuntos && (
                  <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                        <Gift className="w-5 h-5 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-violet-900">Programa de Fidelidad</p>
                        <p className="text-xs text-violet-700 mt-0.5">
                          Saldo: <strong>{puntosFidelidadLab} punto{puntosFidelidadLab !== 1 ? 's' : ''}</strong>
                          {' '}(equivale a L {valorLempirasDePuntos(puntosFidelidadLab, fidelidadConfig).toFixed(2)} en laboratorio)
                        </p>
                        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={usarPuntosLab}
                            onChange={e => {
                              setUsarPuntosLab(e.target.checked)
                              if (!e.target.checked) setPuntosCanjearLab('')
                            }}
                            className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                          />
                          <span className="text-sm font-medium text-gray-800">
                            ¿Desea usar sus puntos en este cobro?
                          </span>
                        </label>
                        {usarPuntosLab && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={maxPtCanje}
                                value={puntosCanjearLab}
                                onChange={e => setPuntosCanjearLab(e.target.value)}
                                placeholder={String(maxPtCanje)}
                                className="w-24 border border-violet-200 rounded-lg px-3 py-2 text-sm text-center font-semibold focus:ring-2 focus:ring-violet-300 outline-none"
                              />
                              <span className="text-xs text-gray-600">
                                pts (máx. {maxPtCanje}) = <strong>L {descPuntosUI.toFixed(2)}</strong>
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                              Acumula 1 punto por cada L {fidelidadConfig.lempiras_por_punto} en facturas.
                              {' '}1 punto = L {fidelidadConfig.valor_lempira_por_punto.toFixed(2)} de descuento.
                              {' '}Máx. canje: <strong>{fidelidadConfig.porcentaje_max_canje}%</strong> del total
                              (hasta L {descMaxCanje.toFixed(2)} · {maxPtCanje} pts).
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {labGrupoCobro.pacienteId && puntosFidelidadLab === 0 && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                    <Gift className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                    Sin puntos de fidelidad. Acumule 1 punto por cada L {fidelidadConfig.lempiras_por_punto} facturados.
                  </div>
                )}

                <div className="rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5 text-center shadow-sm">
                  <p className="text-xs font-bold text-cyan-700 uppercase tracking-wider">Total a cobrar</p>
                  <p className="text-4xl sm:text-5xl font-black text-cyan-800 mt-1 tabular-nums">L {totalFinal.toFixed(2)}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Subtotal L {labGrupoCobro.total.toFixed(2)}
                    {valDescInput > 0 && <> · Desc. edad L {valDescInput.toFixed(2)}</>}
                    {descPuntosUI > 0 && <> · Puntos L {descPuntosUI.toFixed(2)}</>}
                  </p>
                </div>

                <CobroFormaPagoPanel
                  accent="cyan"
                  formaPago={formCobroLab.forma_pago}
                  onChange={fp => {
                    setFormCobroLab(p => ({ ...p, forma_pago: fp }))
                    if (fp === 'CREDITO') {
                      setUsarPuntosLab(false)
                      setPuntosCanjearLab('')
                    }
                  }}
                  referencia={formCobroLab.referencia}
                  onReferencia={v => setFormCobroLab(p => ({ ...p, referencia: v }))}
                />

                <input
                  value={formCobroLab.nota}
                  onChange={e => setFormCobroLab(p => ({ ...p, nota: e.target.value }))}
                  placeholder="Observaciones (opcional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
            </div>
          </Modal>
        )
      })()}

      {modalCobroLab && labCobroExitoso && !modalFacturaLab && !factImpresa && (
        <Modal title="Laboratorio Cobrado" onClose={cerrarModalCobroLab} size="xl" accent="cyan" icon={FlaskConical}>
          <div className="space-y-5">
            {labCobroExitoso.formaPago !== 'CREDITO' && labCobroExitoso.paciente ? (
              <PagoAgradecimientoPanel
                monto={labCobroExitoso.total}
                paciente={labCobroExitoso.paciente}
                subtitulo={labCobroExitoso.formaPago}
              />
            ) : (
              <div className="text-center py-4">
                <CheckCircle2 className="w-12 h-12 text-cyan-600 mx-auto mb-2" />
                <p className="text-lg font-bold text-gray-900">¡Cobro de laboratorio registrado!</p>
                <p className="text-2xl font-extrabold text-cyan-700 mt-1">L {labCobroExitoso.total.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">{labCobroExitoso.pacNombre}</p>
                {labCobroExitoso.puntosCanjeados != null && labCobroExitoso.puntosCanjeados > 0 && (
                  <p className="text-xs text-violet-700 mt-2 font-medium">
                    Se canjearon {labCobroExitoso.puntosCanjeados} punto{labCobroExitoso.puntosCanjeados !== 1 ? 's' : ''} de fidelidad
                  </p>
                )}
                {labCobroExitoso.formaPago === 'CREDITO' && (
                  <p className="text-xs text-amber-700 mt-2">Cuenta por cobrar creada. La orden ya está en cola de laboratorio.</p>
                )}
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">¿Desea emitir factura fiscal?</p>
              <p className="text-xs text-amber-600">
                El cobro ya quedó en caja. Si cierra sin facturar, deberá emitir la factura después desde Facturación para no afectar el orden cronológico.
              </p>
              {sucursalActiva
                ? <p className="text-xs text-amber-700 mt-1 font-medium">📍 Sucursal: {sucursalActiva.nombre}</p>
                : <p className="text-xs text-red-600 mt-1 font-semibold">⚠️ Sin sucursal asignada — no podrá facturar. Configura tu sucursal en Configuración → Usuarios.</p>
              }
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={cerrarModalCobroLab}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cerrar sin facturar
              </button>
              <button
                type="button"
                onClick={() => setModalFacturaLab(true)}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Generar Factura Fiscal
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalCobroLab && labCobroExitoso && modalFacturaLab && !factImpresa && labFacturaCtx && (
        <Modal title="Factura Fiscal — Laboratorio" onClose={cerrarModalCobroLab} size="xl" accent="indigo" icon={FileText}>
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold text-indigo-800">
                {formFactura.nombre_cliente.trim() || labCobroExitoso.pacNombre}
              </p>
              {formFactura.rtn_cliente.trim() && (
                <p className="text-xs font-mono text-indigo-600">RTN: {formFactura.rtn_cliente}</p>
              )}
              <p className="text-indigo-600 font-bold text-lg">L {labCobroExitoso.total.toFixed(2)}</p>
              <div className="text-xs text-indigo-700 space-y-0.5 pt-1">
                {labFacturaCtx.grupo.ordenes.map(o => (
                  <p key={o.id}>· {o.no_analisis} — L {Number(o.importe).toFixed(2)}</p>
                ))}
              </div>
              {sucursalActiva
                ? <p className="text-xs text-indigo-500 pt-1">📍 {sucursalActiva.nombre} {sucursalActiva.cai ? '· CAI configurado' : '· ⚠️ Sin CAI'}</p>
                : <p className="text-xs text-red-500 font-semibold">⚠️ Sin sucursal asignada</p>
              }
            </div>

            <NombreFacturarProtegido
              compact
              formFactura={formFactura}
              setFormFactura={setFormFactura}
              nombreRegistrado={titularFacturaRegistrado.nombre}
              rtnRegistrado={titularFacturaRegistrado.rtn}
              esSuperAdmin={esSuperAdmin}
              sucursalId={sucursalActivaId}
              supabase={supabase}
              resetKey={`lab-fact-${labGrupoCobro?.grupoId}`}
            />

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv-lab"
                type="checkbox"
                checked={formFactura.exento}
                onChange={e => setFormFactura(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv-lab" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV (medicina)
              </label>
              {!formFactura.exento && (
                <span className="ml-auto text-xs text-gray-500">ISV 15% = L {(labCobroExitoso.total * 0.15 / 1.15).toFixed(2)} incluido</span>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button type="button" onClick={() => setModalFacturaLab(false)} className="flex-1 px-4 py-2.5 border rounded-lg text-sm">Atrás</button>
              <button
                type="button"
                onClick={generarFacturaLab}
                disabled={guardandoFact}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> {guardandoFact ? 'Generando...' : 'Crear e Imprimir Factura'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalCobroLab && factImpresa && labCobroExitoso && (
        <Modal title="Factura Generada" onClose={cerrarModalCobroLab} size="xl" accent="indigo" icon={FileText}>
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="font-bold text-gray-900 text-xl">Factura No. {(factImpresa as { numero?: string }).numero}</p>
              <p className="text-sm text-gray-500 mt-1">Laboratorio — emitida correctamente</p>
            </div>
            {labCobroExitoso.paciente && labCobroExitoso.formaPago !== 'CREDITO' && (
              <PagoAgradecimientoPanel
                monto={Number((factImpresa as { total?: number }).total) || labCobroExitoso.total}
                paciente={labCobroExitoso.paciente}
                subtitulo="Factura fiscal"
              />
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={cerrarModalCobroLab} className="flex-1 px-4 py-2.5 border rounded-lg text-sm">Cerrar</button>
              <button
                type="button"
                onClick={imprimirFacturaCaja}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimir Factura
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL COBRO DE CONSULTA ══════════ */}
      {modalCobro && consultaCobro && !cobroExitoso && !factImpresa && (() => {
        const det = calcularTotalConsulta(consultaCobro)
        const pctMax = det.pctDesc
        const elegibleDesc = !det.fechaSospechosa && pctMax > 0
        const descConfirmado = formCobro.descuento_confirmado && Number(formCobro.descuento_pct) > 0
        const pctInput = esAdmin
          ? (Number(formCobro.descuento_pct) || 0)
          : (formCobro.descuento_confirmado ? pctMax : 0)
        const membInfo = det.membInfo
        const membActiva = tieneBeneficiosMembresia(membInfo?.estructurados)
        const desgloseUI = desglosarLineasCobro(
          [
            { categoria: 'consulta',     bruto: det.consulta },
            { categoria: 'servicios',    bruto: det.servicios },
            { categoria: 'laboratorio',  bruto: det.lab },
            { categoria: 'medicamentos', bruto: det.meds },
          ],
          pctInput,
          det.motivo || 'Descuento',
          membInfo?.estructurados,
        )
        const baseAmount = det.subtotal
        const valDescInput = desgloseUI.descTotal
        const totalFinal = desgloseUI.total
        const subtotalEsCero = det.subtotal === 0
        const consultaGratisPlan = Boolean(membInfo?.estructurados.consultaGratis)
        const puedeCobrar = !subtotalEsCero && (totalFinal > 0 || desgloseUI.membAplicada)
        const pac = consultaCobro.paciente
        return (
          <Modal
            title="Cobro de Consulta"
            subtitle={`${pac?.codigo ?? ''} · ${consultaCobro.fecha} ${consultaCobro.hora?.slice(0, 5) ?? ''}`}
            size="full"
            accent="green"
            icon={Stethoscope}
            onClose={cerrarModalCobro}
            footer={(
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button type="button" onClick={cerrarModalCobro}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={procesarCobro}
                  disabled={guardandoCobro || !puedeCobrar}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {guardandoCobro ? 'Procesando...'
                    : totalFinal <= 0 && desgloseUI.membAplicada ? 'Confirmar (cubierto por plan · L 0.00)'
                      : `Cobrar L ${totalFinal.toFixed(2)}`}
                </button>
              </div>
            )}
          >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-6">
              {/* Columna izquierda: paciente, factura, desglose */}
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-slate-50 to-white p-4">
                  <p className="font-bold text-gray-900 text-base sm:text-lg">
                    {nombrePaciente(pac)}
                    {esPacienteEmpresa(pac) && (
                      <span className="ml-2 text-[10px] font-bold text-violet-600 uppercase align-middle">Empresa</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Consulta {consultaCobro.tipo_nombre || 'General'}
                    {esPacienteEmpresa(pac) && pac?.rtn_empresa ? ` · RTN ${pac.rtn_empresa}` : ''}
                  </p>
                </div>

                <CobroFacturaFields
                  formFactura={formFactura}
                  setFormFactura={setFormFactura}
                  nombreRegistrado={titularFacturaRegistrado.nombre}
                  rtnRegistrado={titularFacturaRegistrado.rtn}
                  esSuperAdmin={esSuperAdmin}
                  sucursalId={sucursalActivaId}
                  supabase={supabase}
                  resetKey={consultaCobro?.id}
                />

                {subtotalEsCero && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm text-red-800 font-medium">
                      Esta consulta no tiene montos registrados. No se puede cobrar desde caja.
                      Revise el examen médico y registre servicios, medicamentos o laboratorio antes de cobrar.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">Desglose de cobro</p>

                  {det.consulta > 0 && (
                    <CobroLineaGrupo
                      icon={Stethoscope}
                      titulo={`Consulta — ${consultaCobro.tipo_nombre || 'General'}`}
                      total={det.consulta}
                      headerClass="bg-emerald-50"
                      iconClass="text-emerald-600"
                    >
                      <CobroLineaItem nombre="Valor de consulta" monto={det.consulta} />
                    </CobroLineaGrupo>
                  )}

                  {det.servicios > 0 && (
                    <CobroLineaGrupo
                      icon={ClipboardList}
                      titulo="Servicios médicos"
                      total={det.servicios}
                      headerClass="bg-blue-50"
                      iconClass="text-blue-600"
                    >
                      {(consultaCobro.consulta_servicios || []).map((s, i) => (
                        <CobroLineaItem
                          key={i}
                          nombre={s.nombre}
                          detalle={`Cantidad: ${s.cantidad} × L ${s.precio.toFixed(2)}`}
                          monto={s.precio * s.cantidad}
                        />
                      ))}
                    </CobroLineaGrupo>
                  )}

                  {det.lab > 0 && (
                    <CobroLineaGrupo
                      icon={FlaskConical}
                      titulo="Análisis de laboratorio"
                      total={det.lab}
                      headerClass="bg-cyan-50"
                      iconClass="text-cyan-600"
                    >
                      {(consultaCobro.consulta_analisis || []).map((a, i) => (
                        <CobroLineaItem key={i} nombre={a.no_analisis} monto={Number(a.importe)} />
                      ))}
                    </CobroLineaGrupo>
                  )}

                  {det.meds > 0 && (
                    <CobroLineaGrupo
                      icon={Pill}
                      titulo="Medicamentos"
                      total={det.meds}
                      headerClass="bg-violet-50"
                      iconClass="text-violet-600"
                    >
                      {(consultaCobro.consulta_detalle || []).map((d, i) => (
                        <CobroLineaItem
                          key={i}
                          nombre={d.no_producto}
                          detalle={`Cantidad: ${d.cant}`}
                          monto={Number(d.precio_venta || 0) * d.cant}
                        />
                      ))}
                    </CobroLineaGrupo>
                  )}

                  {(consultaCobro.consulta_detalle?.length || 0) > 0 && det.meds === 0 && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
                      Medicamentos recetados ({consultaCobro.consulta_detalle!.length}) sin precio en catálogo
                    </div>
                  )}

                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-100 border border-gray-200 font-bold text-gray-900">
                    <span>Subtotal</span>
                    <span className="text-lg tabular-nums">L {det.subtotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Columna derecha: pago */}
              <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-0 lg:self-start">
                {membActiva && membInfo && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BadgeCheck className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-bold text-emerald-800">Plan activo: {membInfo.tipo}</span>
                    </div>
                    <ul className="text-xs text-emerald-800 space-y-0.5">
                      {consultaGratisPlan && <li>• Consulta médica <b>gratis</b></li>}
                      {!consultaGratisPlan && membInfo.estructurados.pctConsulta > 0 && <li>• {membInfo.estructurados.pctConsulta}% en consulta</li>}
                      {membInfo.estructurados.pctLaboratorio > 0 && <li>• {membInfo.estructurados.pctLaboratorio}% en laboratorio</li>}
                      {membInfo.estructurados.pctMedicamentos > 0 && <li>• {membInfo.estructurados.pctMedicamentos}% en medicamentos</li>}
                      {membInfo.estructurados.pctServicios > 0 && <li>• {membInfo.estructurados.pctServicios}% en servicios</li>}
                    </ul>
                    <p className="text-[11px] text-emerald-700/80 mt-2">Descuento aplicado por Plan Médico — beneficios al total.</p>
                  </div>
                )}
                <div className={`rounded-xl border p-4 ${
                  det.fechaSospechosa ? 'border-red-300 bg-red-50'
                    : descConfirmado ? 'border-amber-300 bg-amber-50'
                      : elegibleDesc ? 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-800">Descuento</span>
                    {elegibleDesc && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                        {det.motivo} {pctMax}% · sugerido
                      </span>
                    )}
                  </div>

                  {det.fechaSospechosa && (
                    <p className="text-xs text-red-700 bg-red-100/60 border border-red-200 rounded-lg px-3 py-2 mb-2">
                      ⚠ Fecha de nacimiento inválida o poco creíble
                      {consultaCobro.paciente?.fecha_nac ? ` (${fmtFechaNac(consultaCobro.paciente.fecha_nac)})` : ''}.
                      No se aplicará descuento por edad — verifique el expediente.
                    </p>
                  )}

                  {elegibleDesc && (
                    <label className="flex items-start gap-2 cursor-pointer select-none mb-2">
                      <input
                        type="checkbox"
                        checked={formCobro.descuento_confirmado}
                        onChange={e => setFormCobro(p => ({
                          ...p,
                          descuento_confirmado: e.target.checked,
                          descuento_pct: e.target.checked ? String(pctMax) : '0',
                        }))}
                        className="mt-0.5 w-4 h-4 accent-amber-600"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-semibold">Aplicar descuento {det.motivo}</span>
                        <span className="block text-xs text-gray-600">
                          Paciente de <b>{det.edad} años</b>
                          {consultaCobro.paciente?.fecha_nac ? ` · nació el ${fmtFechaNac(consultaCobro.paciente.fecha_nac)}` : ''}.
                          Confirmo que verifiqué su identidad.
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {esAdmin ? (
                      <input
                        type="number" min="0" max="100" step="any"
                        value={formCobro.descuento_pct}
                        onChange={e => setFormCobro(p => ({
                          ...p,
                          descuento_pct: e.target.value,
                          descuento_confirmado: Number(e.target.value) > 0,
                        }))}
                        className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-semibold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800">{pctInput}%</span>
                    )}
                    <span className="text-sm text-gray-600">= <strong>L {valDescInput.toFixed(2)}</strong></span>
                  </div>
                  {!esAdmin && (
                    <p className="text-[11px] text-gray-500 mt-2">El descuento por edad debe confirmarse. Más descuento requiere administrador.</p>
                  )}
                </div>

                <div className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-5 text-center shadow-sm">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Total a cobrar</p>
                  <p className="text-4xl sm:text-5xl font-black text-green-800 mt-1 tabular-nums">L {totalFinal.toFixed(2)}</p>
                  {!subtotalEsCero && (
                    <p className="text-xs text-gray-500 mt-2">Subtotal L {det.subtotal.toFixed(2)}</p>
                  )}
                </div>

                <CobroFormaPagoPanel
                  accent="green"
                  formaPago={formCobro.forma_pago}
                  onChange={fp => setFormCobro(p => ({ ...p, forma_pago: fp }))}
                  referencia={formCobro.referencia}
                  onReferencia={v => setFormCobro(p => ({ ...p, referencia: v }))}
                />

                <input
                  value={formCobro.nota}
                  onChange={e => setFormCobro(p => ({ ...p, nota: e.target.value }))}
                  placeholder="Observaciones (opcional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ══ PASO 2: COBRO EXITOSO → ¿GENERAR FACTURA? ══ */}
      {modalCobro && cobroExitoso && !modalFactura && !factImpresa && (
        <Modal title="Cobro Registrado" onClose={cerrarModalCobro} size="xl" accent="green" icon={CheckCircle2}>
          <div className="space-y-5">
            {cobroExitoso.formaPago !== 'CREDITO' && cobroExitoso.paciente ? (
              <PagoAgradecimientoPanel
                monto={cobroExitoso.total}
                paciente={cobroExitoso.paciente}
                subtitulo={cobroExitoso.formaPago}
              />
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-9 h-9 text-green-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">¡Pago registrado correctamente!</p>
                <p className="text-2xl font-extrabold text-green-700 mt-1">L {cobroExitoso.total.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">{cobroExitoso.pacNombre} · {cobroExitoso.formaPago}</p>
                {cobroExitoso.formaPago === 'CREDITO' && (
                  <p className="text-xs text-amber-700 mt-2">Cuenta por cobrar creada. El agradecimiento se envía al recibir el pago.</p>
                )}
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">¿Desea emitir factura fiscal?</p>
              <p className="text-xs text-amber-600">
                El cobro ya quedó en caja. Si cierra sin facturar, deberá emitir la factura después desde Facturación para no afectar el orden cronológico.
              </p>
              {sucursalActiva
                ? <p className="text-xs text-amber-700 mt-1 font-medium">📍 Sucursal: {sucursalActiva.nombre}</p>
                : <p className="text-xs text-red-600 mt-1 font-semibold">⚠️ Sin sucursal asignada — no podrá facturar. Configura tu sucursal en Configuración → Usuarios.</p>
              }
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={cerrarModalCobro}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cerrar sin facturar
              </button>
              <button
                onClick={() => setModalFactura(true)}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Generar Factura Fiscal
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ PASO 3: DATOS DE FACTURA ══ */}
      {modalCobro && cobroExitoso && modalFactura && !factImpresa && consultaCobro && (
        <Modal title="Factura Fiscal" onClose={cerrarModalCobro} size="xl" accent="indigo" icon={FileText}>
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold text-indigo-800">
                {formFactura.nombre_cliente.trim() || nombrePaciente(consultaCobro.paciente)}
              </p>
              {formFactura.rtn_cliente.trim() && (
                <p className="text-xs font-mono text-indigo-600">RTN: {formFactura.rtn_cliente}</p>
              )}
              <p className="text-indigo-600 font-bold text-lg">L {cobroExitoso.total.toFixed(2)}</p>
              {sucursalActiva
                ? <p className="text-xs text-indigo-500">📍 {sucursalActiva.nombre} {sucursalActiva.cai ? `· CAI configurado` : '· ⚠️ Sin CAI'}</p>
                : <p className="text-xs text-red-500 font-semibold">⚠️ Sin sucursal asignada</p>
              }
            </div>

            <NombreFacturarProtegido
              compact
              formFactura={formFactura}
              setFormFactura={setFormFactura}
              nombreRegistrado={titularFacturaRegistrado.nombre}
              rtnRegistrado={titularFacturaRegistrado.rtn}
              esSuperAdmin={esSuperAdmin}
              sucursalId={sucursalActivaId}
              supabase={supabase}
              resetKey={`cons-fact-${consultaCobro?.id}`}
            />

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv"
                type="checkbox"
                checked={formFactura.exento}
                onChange={e => setFormFactura(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV (medicina)
              </label>
              {!formFactura.exento && (
                <span className="ml-auto text-xs text-gray-500">ISV 15% = L {(cobroExitoso.total * 0.15 / 1.15).toFixed(2)} incluido</span>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button onClick={() => setModalFactura(false)} className="flex-1 px-4 py-2.5 border rounded-lg text-sm">Atrás</button>
              <button
                onClick={generarFactura}
                disabled={guardandoFact}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> {guardandoFact ? 'Generando...' : 'Crear e Imprimir Factura'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ PASO 4: FACTURA LISTA → IMPRIMIR ══ */}
      {modalCobro && factImpresa && (
        <Modal title="Factura Generada" onClose={cerrarModalCobro} size="xl" accent="indigo" icon={FileText}>
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="font-bold text-gray-900 text-xl">Factura No. {(factImpresa as { numero?: string }).numero}</p>
              <p className="text-sm text-gray-500 mt-1">Emitida correctamente</p>
            </div>
            {cobroExitoso?.paciente && cobroExitoso.formaPago !== 'CREDITO' && (
              <PagoAgradecimientoPanel
                monto={Number((factImpresa as { total?: number }).total) || cobroExitoso.total}
                paciente={cobroExitoso.paciente}
                subtitulo="Factura fiscal"
              />
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={cerrarModalCobro} className="flex-1 px-4 py-2.5 border rounded-lg text-sm">Cerrar</button>
              <button
                onClick={imprimirFacturaCaja}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimir Factura
              </button>
            </div>
          </div>
        </Modal>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}

function CobroLineaGrupo({
  icon: Icon, titulo, total, headerClass, iconClass, children,
}: {
  icon: LucideIcon
  titulo: string
  total: number
  headerClass: string
  iconClass: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className={`flex items-center justify-between px-4 py-3 ${headerClass}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
          <span className="text-sm font-semibold text-gray-800 truncate">{titulo}</span>
        </div>
        <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0 ml-2">L {total.toFixed(2)}</span>
      </div>
      <div className="divide-y divide-gray-100 bg-white">{children}</div>
    </div>
  )
}

function CobroLineaItem({ nombre, detalle, monto }: { nombre: string; detalle?: string; monto: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50/80">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800">{nombre}</p>
        {detalle && <p className="text-xs text-gray-400 mt-0.5">{detalle}</p>}
      </div>
      <span className="font-semibold text-gray-700 shrink-0 tabular-nums">L {monto.toFixed(2)}</span>
    </div>
  )
}

function CobroFacturaFields({
  formFactura, setFormFactura, nombreRegistrado, rtnRegistrado = '',
  esSuperAdmin, sucursalId, supabase, resetKey,
}: {
  formFactura: { nombre_cliente: string; rtn_cliente: string; exento: boolean }
  setFormFactura: React.Dispatch<React.SetStateAction<{ nombre_cliente: string; rtn_cliente: string; exento: boolean }>>
  nombreRegistrado: string
  rtnRegistrado?: string
  esSuperAdmin: boolean
  sucursalId?: number | null
  supabase: ReturnType<typeof sb>
  resetKey?: string | number
}) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Datos para factura fiscal</p>
      </div>
      <NombreFacturarProtegido
        formFactura={formFactura}
        setFormFactura={setFormFactura}
        nombreRegistrado={nombreRegistrado}
        rtnRegistrado={rtnRegistrado}
        esSuperAdmin={esSuperAdmin}
        sucursalId={sucursalId}
        supabase={supabase}
        resetKey={resetKey}
      />
    </div>
  )
}

function CobroFormaPagoPanel({
  formaPago, onChange, referencia, onReferencia, accent = 'green',
}: {
  formaPago: string
  onChange: (fp: string) => void
  referencia: string
  onReferencia: (v: string) => void
  accent?: 'green' | 'cyan'
}) {
  const active = accent === 'cyan'
    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200'
    : 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-200'

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-800">Forma de pago</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FORMAS_PAGO.map(fp => (
          <button
            key={fp.key}
            type="button"
            onClick={() => onChange(fp.key)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition min-h-[52px] ${
              formaPago === fp.key ? active : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <fp.icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs sm:text-sm">{fp.label}</span>
          </button>
        ))}
      </div>
      {formaPago === 'TRANSFERENCIA' && (
        <input
          value={referencia}
          onChange={e => onReferencia(e.target.value)}
          placeholder="Número de referencia / comprobante"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      )}
    </div>
  )
}
