'use client'

import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { generarLineasProduccion } from '@/lib/planilla-utils'
import {
  DollarSign, TrendingUp, TrendingDown, Save, Plus,
  RefreshCw, CreditCard, Banknote, ArrowRightLeft, Clock,
  CheckCircle2, AlertCircle, Receipt, Users, ChevronDown,
  LockKeyhole, Unlock, Wallet, FileText, Printer, FlaskConical,
  Stethoscope, Pill, ClipboardList, BadgeCheck, Gift, type LucideIcon,
} from 'lucide-react'
import {
  calcularDescuentoEdad,
  type LabGrupoCobro,
} from '@/lib/lab-cobro-utils'
import PagoAgradecimientoPanel from '@/components/pago-agradecimiento-panel'
import {
  reservarSiguienteCorrelativo, confirmarCorrelativo, esErrorNumeroDuplicado,
} from '@/lib/factura-correlativo'
import { abrirFacturaTermica, facturaPrintDesdeRegistro } from '@/lib/factura-print'
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
import { Modal } from './components/caja-modal'
import VentaRapidaModal from './components/venta-rapida-modal'
import { useVentaRapida } from './hooks/use-venta-rapida'
import { columnaConsultaDetalle, valorConsultaDetalle } from '@/lib/consulta-detalle-utils'
import { PREFIJOS_CONCEPTO_VENTA } from '@/lib/venta-rapida/constants'
import type { VentaRapidaIngresoOk } from '@/lib/venta-rapida/types'
import {
  acumularPuntosPorFactura,
  canjearPuntosLaboratorio,
  LEMPIRAS_POR_PUNTO,
  maxPuntosCanjeables,
  obtenerSaldoPuntos,
  VALOR_LEMPIRA_POR_PUNTO,
  valorLempirasDePuntos,
} from '@/lib/fidelidad-puntos'

/* ─── tipos ─────────────────────────────────────────────── */
interface Concepto { id: number; nombre: string; tipo: 'INGRESO' | 'EGRESO'; categoria?: string }
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
  fechaHoy:           string
  cxcPendientes:      CXC[]
  servicios:          Servicio[]
  productos:          ProductoVenta[]
  pruebasLab:         PruebaLab[]
  consultasPorCobrar:      ConsultaPorCobrar[]
  labGruposPorCobrar:      LabGrupoCobro[]
  membresiaPagosPorCobrar: MembresiaPagoCobro[]
  cotizacionesPorCobrar:   CotizacionPorCobrar[]
  correlativos:            Correlativo[]
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
  perfil, userId, esAdmin, fechaHoy, cxcPendientes: initCxc, servicios, productos, pruebasLab,
  consultasPorCobrar: initConsultasPorCobrar,
  labGruposPorCobrar: initLabGruposPorCobrar,
  membresiaPagosPorCobrar: initMembresiaPagosPorCobrar,
  cotizacionesPorCobrar: initCotizacionesPorCobrar,
  correlativos: initCorrelativos,
}: Props) {
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
    forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0',
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
  const [formFactura,    setFormFactura]    = useState({ nombre_cliente: '', rtn_cliente: '', exento: false })
  const [guardandoFact,  setGuardandoFact]  = useState(false)
  const [factImpresa,    setFactImpresa]    = useState<Record<string, unknown> | null>(null)
  const [formCobro, setFormCobro] = useState({
    forma_pago: 'EFECTIVO', referencia: '', nota: '',
    descuento_pct: '0', monto_manual: '',
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
    monto_inicial: '', sucursal_id: sucursalDefault,
  })

  const [modalCierre, setModalCierre] = useState(false)
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
    nombre_cliente: '', rtn_cliente: '', exento: false,
  })
  const [guardandoFactVentaRapida, setGuardandoFactVentaRapida] = useState(false)
  const [factImpresaVentaRapida, setFactImpresaVentaRapida] = useState<Record<string, unknown> | null>(null)

  const supabase = sb()

  function cerrarFlujoFacturaVentaRapida() {
    setVentaRapidaCobro(null)
    setModalFacturaVentaRapida(false)
    setFactImpresaVentaRapida(null)
    setFormFacturaVentaRapida({ nombre_cliente: '', rtn_cliente: '', exento: false })
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
    onIngresoExitoso: (data) => {
      const factInit = datosFacturaDesdePaciente(data.paciente as ConsultaPorCobrar['paciente'])
      setFormFacturaVentaRapida({
        nombre_cliente: factInit.nombre_cliente,
        rtn_cliente: factInit.rtn_cliente,
        exento: false,
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
    if (mp) setMembresiaPorCobrar(mp as MembresiaPagoCobro[])

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

  /* ── apertura de caja ─ */
  async function abrirCaja() {
    setErrorAp('')
    if (!formApertura.sucursal_id) {
      setErrorAp('Debes seleccionar una sucursal')
      return
    }
    setLoadingAp(true)
    const nombre = `${perfil?.nombre || ''} ${perfil?.apellido || ''}`.trim() || 'Enfermero/a'

    const { data, error } = await supabase.from('caja_sesiones').insert({
      sucursal_id:   Number(formApertura.sucursal_id),
      cajero_id:     userId,
      cajero_nombre: nombre,
      fecha:         fechaHoy,
      monto_inicial: Number(formApertura.monto_inicial || 0),
      estado:        'ABIERTA',
    }).select('*, movimientos:caja_movimientos(*)').single()

    setLoadingAp(false)
    if (error) {
      setErrorAp(error.message)
    } else if (data) {
      setSesion(data)
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
      setConsultaCobro(full)
      setFormCobro({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: String(det.pctDesc), monto_manual: '' })
      setFormFactura({ nombre_cliente: factInit.nombre_cliente, rtn_cliente: factInit.rtn_cliente, exento: false })
      setModalCobro(true)
    } finally {
      setLoadingCobro(false)
    }
  }

  /* ── calcular total de una consulta para cobro ─ */
  function calcularTotalConsulta(c: ConsultaPorCobrar): {
    consulta: number; servicios: number; meds: number; lab: number; subtotal: number
    pctDesc: number; valDesc: number; total: number; motivo: string
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
    return { consulta, servicios, meds, lab, subtotal, pctDesc, valDesc, total, motivo }
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
      Number(formCobro.descuento_pct) || detalle.pctDesc,
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
    const base = detalle.subtotal
    const valDesc = base * (pct / 100)
    const total = base - valDesc
    if (total <= 0) {
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

    const movimientos = []
    if (detalle.consulta > 0) {
      movimientos.push({ ...movBase, concepto: `Consulta ${consultaCobro.tipo_nombre || ''}`.trim(), monto: detalle.consulta * (1 - pct/100) })
    }
    if (detalle.servicios > 0) {
      movimientos.push({ ...movBase, concepto: 'Servicios Médicos', monto: detalle.servicios * (1 - pct/100) })
    }
    if (detalle.lab > 0) {
      movimientos.push({ ...movBase, concepto: 'Laboratorio', monto: detalle.lab * (1 - pct/100) })
    }
    if (detalle.meds > 0) {
      movimientos.push({ ...movBase, concepto: 'Medicamentos', monto: detalle.meds * (1 - pct/100) })
    }
    // si todo es 0 (no se capturó nada), registrar un solo movimiento
    if (movimientos.length === 0 && total > 0) {
      movimientos.push({ ...movBase, concepto: `Consulta ${consultaCobro.tipo_nombre || ''}`.trim(), monto: total })
    }

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
  function cerrarModalCobro() {
    setModalCobro(false)
    setConsultaCobro(null)
    setCobroExitoso(null)
    setModalFactura(false)
    setFactImpresa(null)
    setFormCobro({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0', monto_manual: '' })
    setFormFactura({ nombre_cliente: '', rtn_cliente: '', exento: false })
  }

  async function abrirModalCobroLab(grupo: LabGrupoCobro) {
    const det = calcularDescuentoEdad(grupo.paciente?.fecha_nac, grupo.total, sucursalActiva)
    const factInit = datosFacturaDesdePaciente(grupo.paciente as ConsultaPorCobrar['paciente'])
    setLabGrupoCobro(grupo)
    setFormCobroLab({
      forma_pago: 'EFECTIVO',
      referencia: '',
      nota: '',
      descuento_pct: String(det.pctDesc || 0),
    })
    setUsarPuntosLab(false)
    setPuntosCanjearLab('')
    setPuntosFidelidadLab(
      grupo.pacienteId ? await obtenerSaldoPuntos(supabase, grupo.pacienteId) : 0,
    )
    setFormFactura({ nombre_cliente: factInit.nombre_cliente, rtn_cliente: factInit.rtn_cliente, exento: false })
    setLabCobroExitoso(null)
    setLabFacturaCtx(null)
    setModalFacturaLab(false)
    setFactImpresa(null)
    setModalCobroLab(true)
  }

  function cerrarModalCobroLab() {
    setModalCobroLab(false)
    setLabGrupoCobro(null)
    setLabCobroExitoso(null)
    setLabFacturaCtx(null)
    setModalFacturaLab(false)
    setFactImpresa(null)
    setFormCobroLab({ forma_pago: 'EFECTIVO', referencia: '', nota: '', descuento_pct: '0' })
    setFormFactura({ nombre_cliente: '', rtn_cliente: '', exento: false })
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
      Number(formCobroLab.descuento_pct) || detDesc.pctDesc,
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

    const pct = valDescuento.pctAplicar
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
      const maxPt = maxPuntosCanjeables(puntosFidelidadLab, totalDespuesEdad)
      const solicitados = puntosCanjearLab.trim() === ''
        ? maxPt
        : Math.min(maxPt, Math.max(0, Math.floor(Number(puntosCanjearLab) || 0)))
      if (solicitados <= 0) {
        alert('No hay puntos suficientes o el monto a canjear no es válido.')
        setGuardandoCobroLab(false)
        return
      }
      puntosCanje = solicitados
      descPuntos = valorLempirasDePuntos(puntosCanje)
    }

    const total = totalDespuesEdad - descPuntos
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
    const motivoDesc = descPuntos > 0
      ? (detDesc.motivo ? `${detDesc.motivo} + Puntos Fidelidad` : 'Puntos de Fidelidad')
      : (detDesc.motivo || null)

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
    const pct = Number(formCobro.descuento_pct) || det.pctDesc
    const base = det.subtotal
    const valDesc = base * (pct / 100)
    const subtotalConDesc = base - valDesc
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
    abrirFacturaTermica(facturaPrintDesdeRegistro(impresa), { autoPrint: true })
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
    abrirFacturaTermica(facturaPrintDesdeRegistro(impresa), { autoPrint: true })
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
                onChange={e => setFormApertura(p => ({ ...p, sucursal_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">— Seleccionar sucursal —</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
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
                onChange={e => setFormApertura(p => ({ ...p, monto_inicial: e.target.value }))}
                placeholder="0.00"
                className="w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg font-semibold" />
            </div>
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
              <p className="text-xs text-amber-600">Puede facturar ahora o hacerlo después desde el módulo de Facturación.</p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre a facturar</label>
              <input
                value={formFacturaVentaRapida.nombre_cliente}
                onChange={e => setFormFacturaVentaRapida(p => ({ ...p, nombre_cliente: e.target.value }))}
                placeholder="Razón social o nombre del cliente"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RTN del Cliente (opcional)</label>
              <input
                value={formFacturaVentaRapida.rtn_cliente}
                onChange={e => setFormFacturaVentaRapida(p => ({ ...p, rtn_cliente: e.target.value }))}
                placeholder="0000-0000-000000"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv-vr"
                type="checkbox"
                checked={formFacturaVentaRapida.exento}
                onChange={e => setFormFacturaVentaRapida(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv-vr" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV
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
                    <div className="flex justify-between">
                      <span className="text-gray-600">Efectivo con que abrió caja</span>
                      <span className="font-semibold tabular-nums">{fmt(sesion.monto_inicial)}</span>
                    </div>
                    <div className="flex justify-between text-green-700">
                      <span>(+) Ventas en efectivo</span>
                      <span className="font-semibold tabular-nums">{fmt(arqueoSistema.ingEfectivo)}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>(−) Egresos pagados</span>
                      <span className="font-semibold tabular-nums">{fmt(arqueoSistema.totalEgr)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200 font-bold text-blue-900">
                      <span>= Efectivo que debe haber</span>
                      <span className="text-lg tabular-nums">{fmt(arqueoSistema.efectivoEsperado)}</span>
                    </div>
                  </div>
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
                  disabled={guardandoCobroMembresia}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
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
      {modalCobroLab && labGrupoCobro && (() => {
        const det = calcularDescuentoEdad(labGrupoCobro.paciente?.fecha_nac, labGrupoCobro.total, sucursalActiva)
        const detLabDesc = calcularDescuentoEdad(labGrupoCobro.paciente?.fecha_nac, labGrupoCobro.total, sucursalActiva)
        const pctInput = esAdmin
          ? Number(formCobroLab.descuento_pct) || detLabDesc.pctDesc
          : Math.min(Number(formCobroLab.descuento_pct) || detLabDesc.pctDesc, detLabDesc.pctDesc)
        const valDescInput = labGrupoCobro.total * (pctInput / 100)
        const totalDespuesEdad = labGrupoCobro.total - valDescInput
        const maxPtCanje = maxPuntosCanjeables(puntosFidelidadLab, totalDespuesEdad)
        const ptsAplicar = usarPuntosLab && labGrupoCobro.pacienteId
          ? (puntosCanjearLab.trim() === ''
            ? maxPtCanje
            : Math.min(maxPtCanje, Math.max(0, Math.floor(Number(puntosCanjearLab) || 0))))
          : 0
        const descPuntosUI = valorLempirasDePuntos(ptsAplicar)
        const totalFinal = totalDespuesEdad - descPuntosUI
        const pac = labGrupoCobro.paciente
        const puedeUsarPuntos = Boolean(labGrupoCobro.pacienteId) && puntosFidelidadLab > 0
          && formCobroLab.forma_pago !== 'CREDITO'
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
                  disabled={guardandoCobroLab || totalFinal < 0 || !sesion}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {guardandoCobroLab ? 'Procesando...' : totalFinal <= 0
                    ? 'Confirmar cobro (L 0.00)'
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

                <CobroFacturaFields formFactura={formFactura} setFormFactura={setFormFactura} />

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
                <div className={`rounded-xl border p-4 ${det.pctDesc > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-800">Descuento</span>
                    {det.motivo && <span className="text-xs text-amber-700 font-medium">{det.motivo}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {esAdmin ? (
                      <input
                        type="number" min="0" max="100" step="any"
                        value={formCobroLab.descuento_pct}
                        onChange={e => setFormCobroLab(p => ({ ...p, descuento_pct: e.target.value }))}
                        className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-semibold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800">{pctInput}%</span>
                    )}
                    <span className="text-sm text-gray-600">= <strong>L {valDescInput.toFixed(2)}</strong></span>
                  </div>
                  {!esAdmin && (
                    <p className="text-[11px] text-gray-500 mt-2">Solo descuento automático por edad.</p>
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
                          {' '}(equivale a L {valorLempirasDePuntos(puntosFidelidadLab).toFixed(2)} en laboratorio)
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
                              Acumula 1 punto por cada L {LEMPIRAS_POR_PUNTO} en facturas.
                              {' '}1 punto = L {VALOR_LEMPIRA_POR_PUNTO.toFixed(2)} de descuento en laboratorio.
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
                    Sin puntos de fidelidad. Acumule 1 punto por cada L {LEMPIRAS_POR_PUNTO} facturados.
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
              <p className="text-xs text-amber-600">Puede facturar ahora o hacerlo después desde el módulo de Facturación.</p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre a facturar</label>
              <input
                value={formFactura.nombre_cliente}
                onChange={e => setFormFactura(p => ({ ...p, nombre_cliente: e.target.value }))}
                placeholder="Razón social o nombre del cliente"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RTN del Cliente (opcional)</label>
              <input
                value={formFactura.rtn_cliente}
                onChange={e => setFormFactura(p => ({ ...p, rtn_cliente: e.target.value }))}
                placeholder="0000-0000-000000"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv-lab"
                type="checkbox"
                checked={formFactura.exento}
                onChange={e => setFormFactura(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv-lab" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV
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
      {modalCobro && consultaCobro && (() => {
        const det = calcularTotalConsulta(consultaCobro)
        const pctMax = det.pctDesc
        const pctInput = esAdmin
          ? Number(formCobro.descuento_pct) || pctMax
          : Math.min(Number(formCobro.descuento_pct) || pctMax, pctMax)
        const baseAmount = det.subtotal
        const valDescInput = baseAmount * (pctInput / 100)
        const totalFinal = baseAmount - valDescInput
        const subtotalEsCero = det.subtotal === 0
        const pac = consultaCobro.paciente
        return (
          <Modal
            title="Cobro de Consulta"
            subtitle={`${pac?.codigo ?? ''} · ${consultaCobro.fecha} ${consultaCobro.hora?.slice(0, 5) ?? ''}`}
            size="full"
            accent="green"
            icon={Stethoscope}
            onClose={() => { setModalCobro(false); setConsultaCobro(null) }}
            footer={(
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button type="button" onClick={cerrarModalCobro}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={procesarCobro}
                  disabled={guardandoCobro || totalFinal <= 0 || subtotalEsCero}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {guardandoCobro ? 'Procesando...' : `Cobrar L ${totalFinal.toFixed(2)}`}
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

                <CobroFacturaFields formFactura={formFactura} setFormFactura={setFormFactura} />

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
                <div className={`rounded-xl border p-4 ${det.pctDesc > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-800">Descuento</span>
                    {det.pctDesc > 0 && <span className="text-xs text-amber-700 font-medium">{det.motivo}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {esAdmin ? (
                      <input
                        type="number" min="0" max="100" step="any"
                        value={formCobro.descuento_pct}
                        onChange={e => setFormCobro(p => ({ ...p, descuento_pct: e.target.value }))}
                        className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-semibold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800">{pctInput}%</span>
                    )}
                    <span className="text-sm text-gray-600">= <strong>L {valDescInput.toFixed(2)}</strong></span>
                  </div>
                  {!esAdmin && (
                    <p className="text-[11px] text-gray-500 mt-2">Solo el descuento automático por edad. Más descuento requiere administrador.</p>
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
              <p className="text-xs text-amber-600">Puede facturar ahora o hacerlo después desde el módulo de Facturación.</p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre a facturar</label>
              <input
                value={formFactura.nombre_cliente}
                onChange={e => setFormFactura(p => ({ ...p, nombre_cliente: e.target.value }))}
                placeholder="Razón social o nombre del cliente"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RTN del Cliente (opcional)</label>
              <input
                value={formFactura.rtn_cliente}
                onChange={e => setFormFactura(p => ({ ...p, rtn_cliente: e.target.value }))}
                placeholder="0000-0000-000000"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-xl">
              <input
                id="exento-isv"
                type="checkbox"
                checked={formFactura.exento}
                onChange={e => setFormFactura(p => ({ ...p, exento: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="exento-isv" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exento de ISV
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
  formFactura, setFormFactura,
}: {
  formFactura: { nombre_cliente: string; rtn_cliente: string; exento: boolean }
  setFormFactura: React.Dispatch<React.SetStateAction<{ nombre_cliente: string; rtn_cliente: string; exento: boolean }>>
}) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Datos para factura fiscal</p>
      </div>
      <p className="text-[11px] text-indigo-700/90 -mt-1">
        Si el paciente pide factura a nombre de empresa u otro titular, cámbielo aquí antes de cobrar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre a facturar</label>
          <input
            value={formFactura.nombre_cliente}
            onChange={e => setFormFactura(p => ({ ...p, nombre_cliente: e.target.value }))}
            placeholder="Ej: Distribuidora La Fe S. de R.L. o nombre del paciente"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">RTN del cliente (opcional)</label>
          <input
            value={formFactura.rtn_cliente}
            onChange={e => setFormFactura(p => ({ ...p, rtn_cliente: e.target.value }))}
            placeholder="0000-0000-000000 — vacío = consumidor final"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white font-mono"
          />
        </div>
      </div>
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
