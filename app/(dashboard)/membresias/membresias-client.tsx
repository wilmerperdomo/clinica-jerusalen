'use client'

import { useState, useMemo, useRef, Fragment, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  CreditCard, Plus, Search, RefreshCw, Users, Star,
  ChevronDown, ChevronUp, Printer, CheckCircle, XCircle,
  AlertTriangle, Edit3, Trash2, UserPlus, X, BadgeCheck,
  Camera, IdCard, TrendingUp, DollarSign, Clock, CalendarDays,
  Wallet, BarChart3, ArrowRight, Hash, FileText,
} from 'lucide-react'
import CarnetMembresia from './CarnetMembresia'
import { useConfirm } from '@/components/confirm-dialog'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'
import { estadoVisualPlan, etiquetaEstadoPlan, claseEstadoPlan, diasRestantesPlan, numCuotasPlan, prioridadEstadoPlan, bordeFilaEstadoPlan, fondoFilaEstadoPlan } from '@/lib/membresia-estado'
import { calcularRecargoCuota, montoCuotaConRecargo, totalLoteConRecargo } from '@/lib/membresia-mora'
import { urlCobrarCuota, urlCobrarCuotasVencidas } from '@/lib/membresia-cobro-url'
import { imprimirContratoMembresia } from '@/lib/membresia-contrato-print'

/* ══════════════════ TIPOS ════════════════════════════════════ */
interface Beneficio   { id: number; descripcion: string; activo: boolean }
interface Tipo        {
  id: number; nombre: string; precio: number
  duracion_dias: number; descripcion?: string; activo: boolean
  consulta_gratis?: boolean
  pct_consulta?: number; pct_laboratorio?: number
  pct_medicamentos?: number; pct_servicios?: number
  max_beneficiarios?: number
  membresia_beneficios: Beneficio[]
}
interface Beneficiario { id?: number; nombre: string; parentesco: string; activo: boolean; fecha_inicio?: string; fecha_fin?: string }
interface Membresia   {
  id: number; paciente_id: number; tipo_id: number
  fecha_inicio: string; fecha_fin: string
  cuotas_pagadas: number; estado: string; comentarios?: string
  numero_carnet?: string; sucursal_id?: number; created_at: string
  tipo?: { nombre: string; precio: number; duracion_dias: number }
  paciente?: { id: number; nombre: string; apellido1: string; apellido2?: string; telefono?: string; foto_url?: string | null }
  beneficiarios?: Beneficiario[]
  sucursal?: { nombre: string }
}
interface Pago        {
  id: number; membresia_id: number; numero_cuota: number
  fecha_vencimiento: string; monto: number
  estado: string; fecha_pago?: string | null
  forma_pago?: string | null; cajero_nombre?: string | null; notas?: string | null
  membresia?: {
    numero_carnet?: string; tipo_id?: number
    tipo?: { nombre: string } | null
    paciente?: { nombre: string; apellido1: string; telefono?: string; foto_url?: string | null } | null
  }
}
interface Paciente    { id: number; nombre: string; apellido1: string; apellido2?: string; telefono?: string; foto_url?: string | null }
interface Sucursal    { id: number; nombre: string }

interface Props {
  tipos:           Tipo[]
  membresias:      Membresia[]
  pacientes:       Paciente[]
  sucursales:      Sucursal[]
  pagos:           Pago[]
  sucursalDefault: number | null
  hoy:             string
  esSuperAdmin?:   boolean
  esAdmin?:        boolean
  renovarIdInicial?: number | null
  descuentosPlan?: { id: number; fecha: string; paciente_nombre?: string; concepto?: string; descuento_monto: number; descuento_motivo?: string }[]
  cajaAbierta?: boolean
}

/* ══════════════════ HELPERS ══════════════════════════════════ */
const fmt        = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
const hoyStr     = () => new Date().toISOString().split('T')[0]
const semanaStr  = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] }

function diasRestantes(fechaFin: string) {
  return diasRestantesPlan(fechaFin)
}
function cuotasVencidasMem(membresiaId: number, pagosList: Pago[]) {
  const h = hoyStr()
  return pagosList.filter(p => p.membresia_id === membresiaId && p.estado !== 'pagado' && p.fecha_vencimiento < h).length
}
function estadoBadge(m: Membresia, pagosList: Pago[] = []) {
  const ev = estadoVisualPlan({
    estado: m.estado,
    fecha_fin: m.fecha_fin,
    cuotas_vencidas: cuotasVencidasMem(m.id, pagosList),
  })
  const dias = diasRestantesPlan(m.fecha_fin)
  let label = etiquetaEstadoPlan(ev)
  if (ev === 'por_vencer') label = `Por vencer (${dias}d)`
  return { label, color: claseEstadoPlan(ev), ev }
}
function proximaCuotaPendiente(membresiaId: number, pagosList: Pago[]) {
  return pagosList
    .filter(p => p.membresia_id === membresiaId && p.estado !== 'pagado')
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0]
}
function cuotasVencidasPendientes(membresiaId: number, pagosList: Pago[], hoyD: string) {
  return pagosList
    .filter(p => p.membresia_id === membresiaId && p.estado !== 'pagado' && p.fecha_vencimiento < hoyD)
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
}
function respaldoCobroDesdePago(p: Pago): { paciente: string; plan: string; monto: number } {
  const pac = p.membresia?.paciente
  return {
    paciente: pac ? `${pac.nombre} ${pac.apellido1}`.trim() : '',
    plan: p.membresia?.tipo?.nombre || '',
    monto: Number(p.monto) || 0,
  }
}
function respaldoCobroDesdeMembresia(m: Membresia): { paciente: string; plan: string } {
  return {
    paciente: m.paciente ? `${m.paciente.nombre} ${m.paciente.apellido1}`.trim() : '',
    plan: m.tipo?.nombre || '',
  }
}
function descuentosPlanTipo(t: Tipo) {
  const chips: { label: string; cls: string }[] = []
  if (t.consulta_gratis) chips.push({ label: 'Consulta gratis', cls: 'bg-emerald-100 text-emerald-800' })
  if ((t.pct_consulta ?? 0) > 0) chips.push({ label: `${t.pct_consulta}% consulta`, cls: 'bg-blue-100 text-blue-800' })
  if ((t.pct_laboratorio ?? 0) > 0) chips.push({ label: `${t.pct_laboratorio}% laboratorio`, cls: 'bg-violet-100 text-violet-800' })
  if ((t.pct_medicamentos ?? 0) > 0) chips.push({ label: `${t.pct_medicamentos}% medicamentos`, cls: 'bg-amber-100 text-amber-800' })
  if ((t.pct_servicios ?? 0) > 0) chips.push({ label: `${t.pct_servicios}% servicios`, cls: 'bg-teal-100 text-teal-800' })
  return chips
}
function recalcFin(inicio: string, dias: number) {
  if (!inicio || !dias) return ''
  const d = new Date(inicio); d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}
function colorPago(estado: string, vence: string) {
  if (estado === 'pagado')  return 'bg-green-50 border-green-200'
  if (estado === 'vencido' || (estado === 'pendiente' && vence < hoyStr()))
                            return 'bg-red-50 border-red-200'
  if (vence <= semanaStr()) return 'bg-amber-50 border-amber-200'
  return 'bg-white border-gray-200'
}
function badgePago(estado: string, vence: string) {
  if (estado === 'pagado')  return { label: 'Pagado',    cls: 'bg-green-100 text-green-700' }
  if (estado === 'vencido' || (vence < hoyStr()))
                            return { label: 'Vencido',   cls: 'bg-red-100   text-red-700'   }
  if (vence <= semanaStr()) return { label: 'Esta semana',cls: 'bg-amber-100 text-amber-700' }
  return                           { label: 'Pendiente', cls: 'bg-blue-100  text-blue-700'  }
}

function mensajeError(err: unknown) {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    return [e.message, e.details, e.hint, e.code ? `Código: ${e.code}` : null]
      .filter(Boolean)
      .map(String)
      .join(' · ') || 'Error inesperado al guardar'
  }
  return String(err || 'Error inesperado al guardar')
}

/* ════════════════════════════════════════════════════════════ */
export default function MembresiasClient({
  tipos, membresias: init, pacientes, sucursales,
  pagos: initPagos, sucursalDefault, hoy, esSuperAdmin = false, esAdmin = false,
  renovarIdInicial = null, descuentosPlan = [], cajaAbierta = false,
}: Props) {
  const supabase  = createClient()
  const confirmDialog = useConfirm()

  const [membresias, setMembresias] = useState<Membresia[]>(init)
  const [tiposList, setTiposList]   = useState<Tipo[]>(tipos)
  const [pagos, setPagos]           = useState<Pago[]>(initPagos)
  const [tab, setTab]               = useState<'lista' | 'cobros' | 'analytics' | 'planes'>('lista')

  /* ── búsqueda / filtros lista ── */
  const [buscar,       setBuscar]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [expandido,    setExpandido]    = useState<number | null>(null)

  /* ── búsqueda cobros ── */
  const [cobroFiltro, setCobroFiltro] = useState<'todos' | 'hoy' | 'semana' | 'vencidos'>('hoy')
  const [buscarCobro, setBuscarCobro] = useState('')

  /* ── modal nueva membresía ── */
  const memVacia = {
    paciente_id: 0, tipo_id: 0,
    fecha_inicio: hoy, fecha_fin: '',
    cuotas_pagadas: 0, estado: 'activo',
    comentarios: '', sucursal_id: sucursalDefault || 0,
  }
  const [modalMem,   setModalMem]   = useState(false)
  const [editMemId,  setEditMemId]  = useState<number | null>(null)
  const [formMem,    setFormMem]    = useState(memVacia)
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [buscarPac,  setBuscarPac]  = useState('')
  const [loadingMem, setLoadingMem] = useState(false)
  const [errorMem,   setErrorMem]   = useState('')

  /* ── modal tipo plan ── */
  const tipoVacio = {
    nombre: '', precio: 0, duracion_dias: 30, descripcion: '', activo: true,
    consulta_gratis: false, pct_consulta: 0, pct_laboratorio: 0, pct_medicamentos: 0, pct_servicios: 0,
    max_beneficiarios: 0,
  }
  const [modalTipo,   setModalTipo]   = useState(false)
  const [formTipo,    setFormTipo]    = useState(tipoVacio)
  const [bensTipo,    setBensTipo]    = useState<string[]>([''])
  const [editTipoId,  setEditTipoId]  = useState<number | null>(null)
  const [loadingTipo, setLoadingTipo] = useState(false)
  const [errorTipo,   setErrorTipo]   = useState('')

  /* ── carnet / foto ── */
  const [carnetMem,     setCarnetMem]     = useState<Membresia | null>(null)
  const [uploadingFoto, setUploadingFoto] = useState<number | null>(null)
  const [fotoOk,        setFotoOk]        = useState<number | null>(null)
  const inputFotoRef  = useRef<HTMLInputElement>(null)
  const fotoTargetRef = useRef<Membresia | null>(null)   // ref en lugar de state
  const refPrint      = useRef<HTMLDivElement>(null)

  /* ── loading genérico ── */
  const [loading, setLoading] = useState(false)

  /* ── duplicado / renovación inteligente ── */
  const [planDuplicado, setPlanDuplicado] = useState<Membresia | null>(null)
  const [renovarTarget, setRenovarTarget] = useState<Membresia | null>(null)

  useEffect(() => {
    if (!renovarIdInicial) return
    const m = membresias.find(x => x.id === renovarIdInicial)
    if (m && esAdmin) setRenovarTarget(m)
  }, [renovarIdInicial, membresias, esAdmin])

  const rentabilidad = useMemo(() => {
    const ingresosCuotas = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0)
    const descuentosOtorgados = descuentosPlan.reduce((s, d) => s + Number(d.descuento_monto || 0), 0)
    return { ingresosCuotas, descuentosOtorgados, neto: ingresosCuotas - descuentosOtorgados }
  }, [pagos, descuentosPlan])

  /* ════════ CÁLCULOS MEMOIZADOS ════════════════════════════ */
  const tipoSel = tiposList.find(t => t.id === formMem.tipo_id)

  const stats = useMemo(() => {
    const activas    = membresias.filter(m => estadoBadge(m, pagos).ev === 'activo').length
    const vencidas   = membresias.filter(m => estadoBadge(m, pagos).ev === 'vencido').length
    const porVencer  = membresias.filter(m => estadoBadge(m, pagos).ev === 'por_vencer').length
    const enMora     = membresias.filter(m => estadoBadge(m, pagos).ev === 'mora').length
    const cobrado    = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0)
    const porCobrar  = pagos.filter(p => p.estado !== 'pagado').reduce((s, p) => s + p.monto, 0)
    const vencPagos  = pagos.filter(p => p.estado !== 'pagado' && p.fecha_vencimiento < hoy).length
    const mesActual  = hoy.slice(0, 7)
    const vendidasMes= membresias.filter(m => m.created_at.slice(0, 7) === mesActual).length
    const renovMes   = membresias.filter(m => m.created_at.slice(0, 7) === mesActual && (m.comentarios || '').includes('Renovación')).length
    const ingresosMes= pagos.filter(p => p.estado === 'pagado' && (p.fecha_pago || '').slice(0, 7) === mesActual).reduce((s, p) => s + p.monto, 0)
    return { activas, vencidas, porVencer, enMora, total: membresias.length, cobrado, porCobrar, vencPagos, vendidasMes, renovMes, ingresosMes }
  }, [membresias, pagos, hoy])

  const memFiltradas = useMemo(() => {
    const lista = membresias.filter(m => {
      const nombre = `${m.paciente?.nombre || ''} ${m.paciente?.apellido1 || ''}`.toLowerCase()
      const passQ  = !buscar || nombre.includes(buscar.toLowerCase()) || (m.tipo?.nombre || '').toLowerCase().includes(buscar.toLowerCase()) || (m.numero_carnet || '').toLowerCase().includes(buscar.toLowerCase())
      const badge  = estadoBadge(m, pagos)
      const passE  = !filtroEstado
        || badge.ev === filtroEstado
        || (filtroEstado === 'vence' && badge.ev === 'por_vencer')
      return passQ && passE
    })
    return lista.sort((a, b) => {
      const pa = prioridadEstadoPlan(estadoBadge(a, pagos).ev)
      const pb = prioridadEstadoPlan(estadoBadge(b, pagos).ev)
      if (pa !== pb) return pa - pb
      return diasRestantesPlan(a.fecha_fin) - diasRestantesPlan(b.fecha_fin)
    })
  }, [membresias, buscar, filtroEstado, pagos])

  const planesPrecioCero = useMemo(
    () => tiposList.filter(t => t.activo && (t.precio ?? 0) <= 0),
    [tiposList],
  )

  const cuotasMontoCero = useMemo(
    () => pagos.filter(p => p.estado !== 'pagado' && Number(p.monto) <= 0),
    [pagos],
  )

  const cobrosFiltrados = useMemo(() => {
    const hoyD   = hoyStr()
    const semD   = semanaStr()
    return pagos.filter(p => {
      if (p.estado === 'pagado') return false
      const vence = p.fecha_vencimiento
      if (cobroFiltro === 'hoy')      return vence === hoyD
      if (cobroFiltro === 'semana')   return vence >= hoyD && vence <= semD
      if (cobroFiltro === 'vencidos') return vence < hoyD
      return true
    }).filter(p => {
      if (!buscarCobro) return true
      const q   = buscarCobro.toLowerCase()
      const nom = `${p.membresia?.paciente?.nombre || ''} ${p.membresia?.paciente?.apellido1 || ''}`.toLowerCase()
      return nom.includes(q) || (p.membresia?.numero_carnet || '').toLowerCase().includes(q)
    }).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
  }, [pagos, cobroFiltro, buscarCobro])

  const lotesVencidosPorMembresia = useMemo(() => {
    const hoyD = hoyStr()
    const map = new Map<number, Pago[]>()
    for (const p of pagos) {
      if (p.estado === 'pagado' || p.fecha_vencimiento >= hoyD) continue
      const list = map.get(p.membresia_id) ?? []
      list.push(p)
      map.set(p.membresia_id, list)
    }
    return Array.from(map.entries())
      .map(([membresiaId, cuotas]) => ({
        membresiaId,
        cuotas: cuotas.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
      }))
      .filter(l => l.cuotas.length > 0)
  }, [pagos])

  /* ranking de planes vendidos */
  const rankingPlanes = useMemo(() => {
    const mapa = new Map<number, { nombre: string; count: number; ingresos: number }>()
    for (const m of membresias) {
      if (!m.tipo) continue
      if (!mapa.has(m.tipo_id)) mapa.set(m.tipo_id, { nombre: m.tipo.nombre, count: 0, ingresos: 0 })
      const e = mapa.get(m.tipo_id)!
      e.count++
      e.ingresos += m.tipo.precio
    }
    return Array.from(mapa.values()).sort((a, b) => b.count - a.count)
  }, [membresias])

  /* ════════ ACCIONES ════════════════════════════════════════ */

  function abrirNuevaMembresia() {
    setEditMemId(null)
    setFormMem(memVacia)
    setBeneficiarios([])
    setBuscarPac('')
    setErrorMem('')
    setModalMem(true)
  }

  function abrirEditarMembresia(m: Membresia) {
    setEditMemId(m.id)
    setFormMem({
      paciente_id: m.paciente_id,
      tipo_id: m.tipo_id,
      fecha_inicio: m.fecha_inicio,
      fecha_fin: m.fecha_fin,
      cuotas_pagadas: m.cuotas_pagadas,
      estado: m.estado,
      comentarios: m.comentarios || '',
      sucursal_id: m.sucursal_id || 0,
    })
    setBeneficiarios((m.beneficiarios || []).map(b => ({
      nombre: b.nombre,
      parentesco: b.parentesco,
      activo: b.activo,
    })))
    setBuscarPac('')
    setErrorMem('')
    setModalMem(true)
  }

  function cerrarModalMem() {
    setModalMem(false)
    setEditMemId(null)
    setFormMem(memVacia)
    setBeneficiarios([])
    setErrorMem('')
  }

  async function eliminarMembresia(m: Membresia) {
    const nombrePac = `${m.paciente?.nombre ?? ''} ${m.paciente?.apellido1 ?? ''}`.trim()

    // Regla de caja: todo lo enviado a cobro se cobra sí o sí.
    // No se puede borrar un plan con cuotas cobradas (registro financiero)
    // ni con cuotas pendientes/vencidas (ya están en caja para cobrar).
    const { data: cuotasDb, error: eCheck } = await supabase
      .from('membresia_pagos')
      .select('estado')
      .eq('membresia_id', m.id)
    if (eCheck) { alert('No se pudo verificar cuotas: ' + mensajeError(eCheck)); return }

    const pagadas    = (cuotasDb ?? []).filter(c => c.estado === 'pagado').length
    const pendientes = (cuotasDb ?? []).filter(c => c.estado !== 'pagado').length

    if (pagadas > 0) {
      alert(
        `No se puede eliminar: este plan tiene ${pagadas} cuota(s) ya cobrada(s) en caja.\n\n` +
        `Los cobros registrados no se pueden borrar. Si el plan ya no aplica, cámbielo a estado "Cancelado".`
      )
      return
    }
    if (pendientes > 0) {
      alert(
        `No se puede eliminar: este plan tiene ${pendientes} cuota(s) pendiente(s) enviada(s) a caja.\n\n` +
        `Todo lo enviado a caja debe cobrarse. Cobre las cuotas en Caja o, si el plan ya no aplica, cámbielo a estado "Cancelado".`
      )
      return
    }

    const { confirmed } = await confirmDialog({
      title: 'Eliminar plan médico',
      message: `¿Eliminar el plan de ${nombrePac}? Este plan no tiene cuotas y se borrarán sus beneficiarios.`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
      details: [
        ...(m.numero_carnet ? [{ label: 'Carnet', value: m.numero_carnet }] : []),
        { label: 'Plan', value: m.tipo?.nombre || '—' },
      ],
    })
    if (!confirmed) return
    setLoading(true)
    try {
      const { error } = await supabase.from('membresias').delete().eq('id', m.id)
      if (error) throw error
      setMembresias(prev => prev.filter(x => x.id !== m.id))
      setPagos(prev => prev.filter(p => p.membresia_id !== m.id))
      if (expandido === m.id) setExpandido(null)
      if (carnetMem?.id === m.id) setCarnetMem(null)
    } catch (err) {
      alert('No se pudo eliminar: ' + mensajeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function eliminarTipo(t: Tipo) {
    const vendidas = membresias.filter(m => m.tipo_id === t.id).length
    if (vendidas > 0) {
      alert(`No se puede eliminar: hay ${vendidas} plan${vendidas !== 1 ? 'es' : ''} registrado${vendidas !== 1 ? 's' : ''} con este tipo. Desactívalo en su lugar.`)
      return
    }
    const { confirmed } = await confirmDialog({
      title: 'Eliminar tipo de plan',
      message: `¿Eliminar permanentemente el plan "${t.nombre}"?`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    setLoading(true)
    try {
      const { error } = await supabase.from('membresia_tipos').delete().eq('id', t.id)
      if (error) throw error
      setTiposList(prev => prev.filter(x => x.id !== t.id))
    } catch (err) {
      alert('No se pudo eliminar: ' + mensajeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function guardarMembresia(reemplazarId?: number) {
    if (!formMem.paciente_id) return setErrorMem('Selecciona un paciente')
    if (!formMem.tipo_id)     return setErrorMem('Selecciona un plan')
    if (!formMem.fecha_inicio || !formMem.fecha_fin) return setErrorMem('Completa las fechas')

    const tipoActualPre = tiposList.find(t => t.id === formMem.tipo_id)
    if (!tipoActualPre || (tipoActualPre.precio ?? 0) <= 0) {
      return setErrorMem('El plan seleccionado no tiene precio válido. Configure el precio del plan antes de asignarlo.')
    }
    const maxBen = tipoActualPre?.max_beneficiarios ?? 0
    const benCount = beneficiarios.filter(b => b.nombre.trim()).length
    if (maxBen > 0 && benCount > maxBen) {
      return setErrorMem(`Este plan permite máximo ${maxBen} beneficiario(s). Tiene ${benCount}.`)
    }

    const idReemplazo = reemplazarId

    if (!editMemId && !idReemplazo) {
      const activo = membresias.find(m =>
        m.paciente_id === formMem.paciente_id &&
        m.estado === 'activo' &&
        m.fecha_fin >= hoyStr()
      )
      if (activo) {
        setPlanDuplicado(activo)
        return
      }
    }

    setLoadingMem(true); setErrorMem('')
    try {
      if (idReemplazo) {
        await supabase.from('membresias').update({ estado: 'inactivo' }).eq('id', idReemplazo)
        setMembresias(prev => prev.map(x => x.id === idReemplazo ? { ...x, estado: 'inactivo' } : x))
      }

      const tipoActual = tiposList.find(t => t.id === formMem.tipo_id)
      const pacienteActual = pacientes.find(p => p.id === formMem.paciente_id)
        ?? membresias.find(m => m.id === editMemId)?.paciente
      const sucursalActual = sucursales.find(s => s.id === formMem.sucursal_id)
      const payload = {
        tipo_id: formMem.tipo_id,
        fecha_inicio: formMem.fecha_inicio,
        fecha_fin: formMem.fecha_fin,
        cuotas_pagadas: formMem.cuotas_pagadas,
        estado: formMem.estado,
        comentarios: formMem.comentarios || null,
        sucursal_id: formMem.sucursal_id || null,
      }

      let savedM: Membresia | null = null

      if (editMemId) {
        const prev = membresias.find(m => m.id === editMemId)
        const { data: updated, error: e } = await supabase
          .from('membresias')
          .update(payload)
          .eq('id', editMemId)
          .select('id, paciente_id, tipo_id, fecha_inicio, fecha_fin, cuotas_pagadas, estado, comentarios, numero_carnet, sucursal_id, created_at')
          .single()
        if (e) throw e

        const { error: eDelBen } = await supabase.from('membresia_beneficiarios').delete().eq('membresia_id', editMemId)
        if (eDelBen) throw eDelBen

        const benefs = beneficiarios.filter(b => b.nombre.trim())
        let benefRows: Beneficiario[] = []
        if (benefs.length) {
          const { data: insertedBenefs, error: eBenefs } = await supabase.from('membresia_beneficiarios').insert(
            benefs.map(b => ({
              membresia_id: editMemId,
              nombre: b.nombre,
              parentesco: b.parentesco,
              activo: true,
              fecha_inicio: b.fecha_inicio || formMem.fecha_inicio,
              fecha_fin: b.fecha_fin || formMem.fecha_fin,
            }))
          ).select('id, nombre, parentesco, activo, fecha_inicio, fecha_fin')
          if (eBenefs) throw eBenefs
          benefRows = (insertedBenefs ?? []) as Beneficiario[]
        }

        savedM = {
          ...(updated as unknown as Membresia),
          tipo: tipoActual
            ? { nombre: tipoActual.nombre, precio: tipoActual.precio, duracion_dias: tipoActual.duracion_dias }
            : prev?.tipo,
          paciente: pacienteActual,
          beneficiarios: benefRows,
          sucursal: sucursalActual ? { nombre: sucursalActual.nombre } : prev?.sucursal,
        }
        setMembresias(prev => prev.map(m => m.id === editMemId ? savedM! : m))
      } else {
        const { data: newM, error: e } = await supabase
          .from('membresias')
          .insert({
            paciente_id: formMem.paciente_id,
            ...payload,
          })
          .select('id, paciente_id, tipo_id, fecha_inicio, fecha_fin, cuotas_pagadas, estado, comentarios, numero_carnet, sucursal_id, created_at')
          .single()
        if (e) throw e

        const benefs = beneficiarios.filter(b => b.nombre.trim())
        let benefRows: Beneficiario[] = []
        if (benefs.length && newM?.id) {
          const { data: insertedBenefs, error: eBenefs } = await supabase.from('membresia_beneficiarios').insert(
            benefs.map(b => ({
              membresia_id: newM.id,
              nombre: b.nombre,
              parentesco: b.parentesco,
              activo: true,
              fecha_inicio: b.fecha_inicio || formMem.fecha_inicio,
              fecha_fin: b.fecha_fin || formMem.fecha_fin,
            }))
          ).select('id, nombre, parentesco, activo, fecha_inicio, fecha_fin')
          if (eBenefs) throw eBenefs
          benefRows = (insertedBenefs ?? []) as Beneficiario[]
        }
        if (newM) {
          savedM = {
            ...(newM as unknown as Membresia),
            tipo: tipoActual
              ? { nombre: tipoActual.nombre, precio: tipoActual.precio, duracion_dias: tipoActual.duracion_dias }
              : undefined,
            paciente: pacienteActual,
            beneficiarios: benefRows,
            sucursal: sucursalActual ? { nombre: sucursalActual.nombre } : undefined,
          }
          setMembresias(prev => [savedM!, ...prev])

          const { data: np, error: ePagos } = await supabase.from('membresia_pagos')
            .select('id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado, fecha_pago, forma_pago, cajero_nombre, notas')
            .eq('membresia_id', newM.id)
          if (ePagos) throw ePagos
          if (np) {
            const pagosNuevos = (np as unknown as Pago[]).map(p => ({
              ...p,
              membresia: {
                numero_carnet: savedM!.numero_carnet,
                tipo_id: savedM!.tipo_id,
                tipo: tipoActual ? { nombre: tipoActual.nombre } : null,
                paciente: pacienteActual
                  ? {
                      nombre: pacienteActual.nombre,
                      apellido1: pacienteActual.apellido1,
                      telefono: pacienteActual.telefono,
                      foto_url: pacienteActual.foto_url,
                    }
                  : null,
              },
            }))
            setPagos(prev => [...prev, ...pagosNuevos])
          }
        }
      }
      setPlanDuplicado(null)
      cerrarModalMem()
    } catch (err: unknown) { setErrorMem(mensajeError(err)) }
    finally { setLoadingMem(false) }
  }

  function abrirRenovar(m: Membresia) {
    if (!esAdmin) {
      alert('Solo administradores pueden renovar planes médicos.')
      return
    }
    setRenovarTarget(m)
  }

  async function confirmarRenovar() {
    const m = renovarTarget
    if (!m) return
    setRenovarTarget(null)
    setLoading(true)
    try {
      const dias = m.tipo?.duracion_dias || 30
      const hoyD = hoyStr()
      const inicioC = new Date(m.fecha_fin); inicioC.setDate(inicioC.getDate() + 1)
      const inicio  = inicioC.toISOString().split('T')[0] > hoyD ? inicioC.toISOString().split('T')[0] : hoyD
      const finD    = new Date(inicio); finD.setDate(finD.getDate() + dias)
      const fin     = finD.toISOString().split('T')[0]
      await supabase.from('membresias').update({ estado: 'inactivo' }).eq('paciente_id', m.paciente_id).eq('estado', 'activo')
      const { data: newM } = await supabase.from('membresias')
        .insert({ paciente_id: m.paciente_id, tipo_id: m.tipo_id, fecha_inicio: inicio, fecha_fin: fin, cuotas_pagadas: 0, estado: 'activo', comentarios: `Renovación de ${m.numero_carnet}`, sucursal_id: m.sucursal_id })
        .select(`id, paciente_id, tipo_id, fecha_inicio, fecha_fin, cuotas_pagadas, estado, comentarios, numero_carnet, sucursal_id, created_at,
          tipo:membresia_tipos(nombre, precio, duracion_dias),
          paciente:pacientes(id, nombre, apellido1, apellido2, telefono, foto_url),
          beneficiarios:membresia_beneficiarios(id, nombre, parentesco, activo),
          sucursal:sucursales(nombre)`)
        .single()
      const benAct = (m.beneficiarios || []).filter(b => b.activo)
      if (benAct.length && newM?.id)
        await supabase.from('membresia_beneficiarios').insert(benAct.map(b => ({ membresia_id: newM.id, nombre: b.nombre, parentesco: b.parentesco, activo: true })))
      setMembresias(prev => prev.map(x => x.paciente_id === m.paciente_id && x.estado === 'activo' ? { ...x, estado: 'inactivo' } : x).concat(newM ? [newM as unknown as Membresia] : []))
      const { data: np } = await supabase.from('membresia_pagos')
        .select('id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado, fecha_pago, forma_pago, cajero_nombre, notas')
        .eq('membresia_id', newM?.id)
      if (np && newM) {
        setPagos(prev => [...prev, ...(np as Pago[]).map(p => ({
          ...p,
          membresia: {
            numero_carnet: newM.numero_carnet,
            tipo: m.tipo ? { nombre: m.tipo.nombre } : null,
            paciente: m.paciente ? { nombre: m.paciente.nombre, apellido1: m.paciente.apellido1, telefono: m.paciente.telefono, foto_url: m.paciente.foto_url } : null,
          },
        }))])
      }
    } catch (err) { alert('Error al renovar: ' + (err instanceof Error ? err.message : err)) }
    finally { setLoading(false) }
  }

  function imprimirContrato(m: Membresia) {
    const tipoFull = tiposList.find(t => t.id === m.tipo_id)
    imprimirContratoMembresia({
      paciente: {
        nombre: m.paciente?.nombre || '',
        apellido1: m.paciente?.apellido1 || '',
        apellido2: m.paciente?.apellido2,
        telefono: m.paciente?.telefono,
      },
      membresia: {
        numero_carnet: m.numero_carnet,
        fecha_inicio: m.fecha_inicio,
        fecha_fin: m.fecha_fin,
        comentarios: m.comentarios,
        tipo: tipoFull ? {
          nombre: tipoFull.nombre,
          precio: tipoFull.precio,
          duracion_dias: tipoFull.duracion_dias,
          descripcion: tipoFull.descripcion,
          consulta_gratis: tipoFull.consulta_gratis,
          pct_consulta: tipoFull.pct_consulta,
          pct_laboratorio: tipoFull.pct_laboratorio,
          pct_medicamentos: tipoFull.pct_medicamentos,
          pct_servicios: tipoFull.pct_servicios,
        } : m.tipo ? { nombre: m.tipo.nombre, precio: m.tipo.precio, duracion_dias: m.tipo.duracion_dias } : undefined,
        beneficiarios: (m.beneficiarios || []).filter(b => b.activo).map(b => ({ nombre: b.nombre, parentesco: b.parentesco })),
        sucursal: m.sucursal,
      },
    })
  }

  async function guardarTipo() {
    if (!formTipo.nombre.trim()) return setErrorTipo('Ingresa el nombre del plan')
    if (formTipo.precio <= 0)  return setErrorTipo('El precio debe ser mayor a cero (L 0.00 genera cuotas inválidas)')
    if (formTipo.precio < 0)     return setErrorTipo('El precio no puede ser negativo')
    if (formTipo.duracion_dias < 1) return setErrorTipo('La duración debe ser al menos 1 día')
    setLoadingTipo(true); setErrorTipo('')
    try {
      const bens = bensTipo.filter(b => b.trim())

      if (editTipoId) {
        // actualizar datos del plan
        const { error: eUpd } = await supabase
          .from('membresia_tipos')
          .update({
            nombre:           formTipo.nombre,
            precio:           formTipo.precio,
            duracion_dias:    formTipo.duracion_dias,
            descripcion:      formTipo.descripcion || null,
            activo:           formTipo.activo,
            consulta_gratis:  formTipo.consulta_gratis,
            pct_consulta:     formTipo.pct_consulta,
            pct_laboratorio:  formTipo.pct_laboratorio,
            pct_medicamentos: formTipo.pct_medicamentos,
            pct_servicios:    formTipo.pct_servicios,
            max_beneficiarios: formTipo.max_beneficiarios || 0,
          })
          .eq('id', editTipoId)
        if (eUpd) throw new Error(eUpd.message)

        // reemplazar beneficios: borrar todos y volver a insertar
        const { error: eDel } = await supabase.from('membresia_beneficios').delete().eq('tipo_id', editTipoId)
        if (eDel) throw new Error(eDel.message)
        if (bens.length) {
          const { error: eB } = await supabase.from('membresia_beneficios')
            .insert(bens.map(b => ({ tipo_id: editTipoId, descripcion: b, activo: true })))
          if (eB) throw new Error(eB.message)
        }

        setTiposList(prev => prev.map(t => t.id === editTipoId
          ? { ...t, ...formTipo, membresia_beneficios: bens.map((b, i) => ({ id: i, descripcion: b, activo: true })) }
          : t))

      } else {
        // crear nuevo plan
        const { data: nt, error: eIns } = await supabase
          .from('membresia_tipos')
          .insert({
            nombre:           formTipo.nombre,
            precio:           formTipo.precio,
            duracion_dias:    formTipo.duracion_dias,
            descripcion:      formTipo.descripcion || null,
            consulta_gratis:  formTipo.consulta_gratis,
            pct_consulta:     formTipo.pct_consulta,
            pct_laboratorio:  formTipo.pct_laboratorio,
            pct_medicamentos: formTipo.pct_medicamentos,
            pct_servicios:    formTipo.pct_servicios,
            max_beneficiarios: formTipo.max_beneficiarios || 0,
          })
          .select('*')
          .single()
        if (eIns) throw new Error(eIns.message)
        if (!nt)  throw new Error('No se pudo crear el plan')

        if (bens.length) {
          const { error: eB } = await supabase.from('membresia_beneficios')
            .insert(bens.map(b => ({ tipo_id: nt.id, descripcion: b, activo: true })))
          if (eB) throw new Error(eB.message)
        }

        setTiposList(prev => [...prev, {
          ...nt,
          membresia_beneficios: bens.map((b, i) => ({ id: i, descripcion: b, activo: true })),
        }])
      }

      setModalTipo(false)
      setFormTipo(tipoVacio)
      setBensTipo([''])
      setEditTipoId(null)

    } catch (err: unknown) {
      setErrorTipo(err instanceof Error ? err.message : 'Error al guardar el plan')
    } finally {
      setLoadingTipo(false)
    }
  }

  async function subirFoto(file: File, mem: Membresia) {
    setUploadingFoto(mem.id)
    setFotoOk(null)
    try {
      const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `paciente-${mem.paciente_id}/foto-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('pacientes-fotos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw new Error(`Error al subir archivo: ${upErr.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('pacientes-fotos')
        .getPublicUrl(path)

      const { error: dbErr } = await supabase
        .from('pacientes')
        .update({ foto_url: publicUrl })
        .eq('id', mem.paciente_id)
      if (dbErr) throw new Error(`Error al guardar en BD: ${dbErr.message}`)

      setMembresias(prev => prev.map(m =>
        m.paciente_id === mem.paciente_id && m.paciente
          ? { ...m, paciente: { ...m.paciente, foto_url: publicUrl } }
          : m
      ))
      setFotoOk(mem.paciente_id)
      setTimeout(() => setFotoOk(null), 3000)
    } catch (err) {
      alert('Error al subir foto:\n' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setUploadingFoto(null)
      fotoTargetRef.current = null
    }
  }

  function imprimirLista() {
    const w = window.open('', '_blank', 'width=900,height=650')
    if (!w || !refPrint.current) return
    w.document.write(`<html><head><title>Membresías</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
      h2{text-align:center}table{width:100%;border-collapse:collapse}
      th{background:#f0f0f0;padding:5px 7px;font-size:10px;border-bottom:2px solid #ccc;text-align:left}
      td{padding:4px 7px;border-bottom:1px solid #eee}
      @media print{body{margin:5mm}}
    </style></head><body><h2>Listado de Membresías</h2>
    <p style="text-align:center;color:#666">Impreso: ${new Date().toLocaleString('es-HN')}</p>
    ${refPrint.current.innerHTML}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close() }, 500)
  }

  /* ════════════════ RENDER ═════════════════════════════════ */
  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Planes Médicos"
        subtitle="Control inteligente de planes, cobros y carnets"
        badge="Membresías"
        icon={CreditCard}
        gradient="violet"
        kpis={[
          { label: 'Total planes', value: stats.total, icon: CreditCard },
          { label: 'Activos', value: stats.activas, icon: CheckCircle },
          { label: 'Por vencer', value: stats.porVencer, icon: AlertTriangle },
          { label: 'Vencidos', value: stats.vencidas, icon: XCircle },
          { label: 'Vendidos / mes', value: stats.vendidasMes, icon: TrendingUp },
          { label: 'Cuotas vencidas', value: stats.vencPagos, icon: AlertTriangle },
          { label: 'Ingresos / mes', value: fmt(stats.ingresosMes), icon: DollarSign },
          { label: 'Renovaciones / mes', value: stats.renovMes, icon: RefreshCw },
        ]}
        actions={
          <ModuleBtnPrimary onClick={abrirNuevaMembresia}>
            <Plus className="w-4 h-4" /> Nuevo Plan Médico
          </ModuleBtnPrimary>
        }
      />
      <ModuleContent>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {([
          { id: 'lista',     icon: <CreditCard   className="w-3.5 h-3.5"/>, label: 'Planes Activos' },
          { id: 'cobros',    icon: <Wallet       className="w-3.5 h-3.5"/>, label: `Cobros${stats.vencPagos > 0 ? ` · ${stats.vencPagos} vencidos` : ''}` },
          { id: 'analytics', icon: <BarChart3    className="w-3.5 h-3.5"/>, label: 'Analytics'  },
          { id: 'planes',    icon: <Star         className="w-3.5 h-3.5"/>, label: 'Planes'     },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: LISTA ═══════════════════════════ */}
      {tab === 'lista' && (
        <div className="space-y-3">
          {!cajaAbierta && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold">Caja del día cerrada</p>
                <p className="text-amber-800 mt-0.5">
                  Abra la caja en <Link href="/ventas" className="underline font-medium">Ventas / Caja</Link> antes de cobrar cuotas.
                  Puede preparar el cobro desde aquí, pero el registro del ingreso requiere caja abierta.
                </p>
              </div>
            </div>
          )}
          {(planesPrecioCero.length > 0 || cuotasMontoCero.length > 0) && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-900 rounded-2xl px-4 py-3 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-1">
                {planesPrecioCero.length > 0 && (
                  <p>
                    <strong>{planesPrecioCero.length} plan(es) con precio L 0.00:</strong>{' '}
                    {planesPrecioCero.map(t => t.nombre).join(', ')} — corrija el precio en la pestaña Planes.
                  </p>
                )}
                {cuotasMontoCero.length > 0 && (
                  <p>
                    <strong>{cuotasMontoCero.length} cuota(s) con monto L 0.00</strong> — no se pueden cobrar en caja hasta corregir el plan.
                  </p>
                )}
              </div>
            </div>
          )}
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={buscar} onChange={e => setBuscar(e.target.value)}
                placeholder="Nombre, código MEM, plan…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm text-gray-700">
              <option value="">Todos los estados</option>
              <option value="activo">Al día</option>
              <option value="por_vencer">Por vencer</option>
              <option value="cuota_vencida">Cuota vencida</option>
              <option value="vencido">Vencidos</option>
              <option value="mora">Suspendido por mora</option>
              <option value="inactivo">Inactivos</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <button onClick={imprimirLista}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    <Hash className="w-3 h-3 inline mr-0.5"/>Carnet
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Vigencia</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Beneficiarios</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-44">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {memFiltradas.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No hay planes médicos{buscar ? ' para esta búsqueda' : ''}
                  </td></tr>
                )}
                {memFiltradas.map(m => {
                  const badge = estadoBadge(m, pagos)
                  const dias  = diasRestantes(m.fecha_fin)
                  const open  = expandido === m.id
                  const cuota = proximaCuotaPendiente(m.id, pagos)
                  const vencidas = cuotasVencidasPendientes(m.id, pagos, hoy)
                  const respaldo = respaldoCobroDesdeMembresia(m)
                  const totalVencidas = totalLoteConRecargo(vencidas, hoy)
                  return (
                    <Fragment key={m.id}>
                      <tr className={`hover:bg-gray-50/80 ${bordeFilaEstadoPlan(badge.ev)} ${fondoFilaEstadoPlan(badge.ev)}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {m.paciente?.foto_url ? (
                              <img src={m.paciente.foto_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-gray-200 shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {(m.paciente?.nombre?.[0] ?? '') + (m.paciente?.apellido1?.[0] ?? '')}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{m.paciente?.nombre} {m.paciente?.apellido1}</p>
                              <p className="text-xs text-gray-400">{m.paciente?.telefono}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg border border-blue-100 whitespace-nowrap">
                            {m.numero_carnet || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{m.tipo?.nombre}</p>
                          <p className="text-xs text-gray-400">{fmt(m.tipo?.precio || 0)}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <p className="text-xs text-gray-500">{m.fecha_inicio} →</p>
                          <p className={`text-xs font-medium ${dias < 0 ? 'text-red-600' : dias <= 10 ? 'text-amber-600' : 'text-gray-700'}`}>{m.fecha_fin}</p>
                          {dias >= 0 && <p className="text-[10px] text-gray-400">{dias === 0 ? 'Hoy' : `${dias}d restantes`}</p>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                          {cuota && (
                            <div className="mt-1.5 space-y-1">
                              {Number(cuota.monto) <= 0 ? (
                                <p className="text-[10px] text-red-600 font-semibold">Cuota #{cuota.numero_cuota} · L 0.00 — corrija el plan</p>
                              ) : (
                                <>
                                  {(() => {
                                    const det = montoCuotaConRecargo(cuota.monto, cuota.fecha_vencimiento, hoy, cuota.estado)
                                    return (
                                      <p className="text-[10px] text-gray-500">
                                        Cuota #{cuota.numero_cuota} · {fmt(det.total)}
                                        {det.recargo > 0 && (
                                          <span className="text-red-600"> (+{fmt(det.recargo)} recargo)</span>
                                        )}
                                      </p>
                                    )
                                  })()}
                                  <Link
                                    href={urlCobrarCuota(cuota.id, {
                                      ...respaldo,
                                      monto: montoCuotaConRecargo(cuota.monto, cuota.fecha_vencimiento, hoy, cuota.estado).total,
                                    })}
                                    className={`inline-flex items-center gap-0.5 text-[10px] font-semibold mt-0.5 hover:underline ${cajaAbierta ? 'text-violet-700' : 'text-amber-700'}`}
                                  >
                                    <Wallet className="w-3 h-3" />
                                    {cajaAbierta ? 'Cobrar ahora' : 'Ir a cobrar (abrir caja)'}
                                  </Link>
                                </>
                              )}
                              {vencidas.length > 1 && (
                                <Link
                                  href={urlCobrarCuotasVencidas(
                                    vencidas.map(v => v.id),
                                    { ...respaldo, monto: totalVencidas.total },
                                  )}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-700 hover:underline"
                                >
                                  <Wallet className="w-3 h-3" />
                                  Cobrar {vencidas.length} vencidas ({fmt(totalVencidas.total)})
                                </Link>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {(m.beneficiarios || []).filter(b => b.activo).length > 0
                            ? <button onClick={() => setExpandido(open ? null : m.id)}
                                className="flex items-center gap-1 mx-auto text-blue-600 text-xs hover:underline">
                                <Users className="w-3.5 h-3.5" />
                                {(m.beneficiarios || []).filter(b => b.activo).length}
                                {open ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                              </button>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setCarnetMem(m)} title="Ver carnet"
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><IdCard className="w-3.5 h-3.5"/></button>
                            <button onClick={() => { fotoTargetRef.current = m; inputFotoRef.current?.click() }} title="Subir foto del paciente"
                              className={`p-1.5 rounded-lg hover:bg-purple-100 ${fotoOk === m.paciente_id ? 'bg-green-100 text-green-600' : 'bg-purple-50 text-purple-600'}`}>
                              {uploadingFoto === m.id
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
                                : fotoOk === m.paciente_id
                                  ? <CheckCircle className="w-3.5 h-3.5"/>
                                  : <Camera className="w-3.5 h-3.5"/>}
                            </button>
                            <button onClick={() => imprimirContrato(m)} title="Contrato / comprobante"
                              className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100"><FileText className="w-3.5 h-3.5"/></button>
                            {esAdmin && (
                              <button onClick={() => abrirRenovar(m)} title="Renovar"
                                className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><RefreshCw className="w-3.5 h-3.5"/></button>
                            )}
                            {esSuperAdmin && (
                              <>
                                <button onClick={() => abrirEditarMembresia(m)} title="Editar"
                                  className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100"><Edit3 className="w-3.5 h-3.5"/></button>
                                <button onClick={() => { void eliminarMembresia(m) }} title="Eliminar"
                                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5"/></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-blue-50">
                          <td colSpan={7} className="px-8 py-3">
                            <p className="font-semibold text-xs text-blue-700 mb-1.5 uppercase">Beneficiarios</p>
                            <div className="flex flex-wrap gap-2">
                              {(m.beneficiarios || []).filter(b => b.activo).map((b, i) => (
                                <span key={i} className="px-3 py-1 bg-white border border-blue-200 rounded-full text-xs text-gray-700">
                                  <span className="font-medium">{b.nombre}</span>
                                  {b.parentesco && <span className="text-gray-400 ml-1">({b.parentesco})</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* tabla oculta impresión */}
          <div style={{ display: 'none' }} ref={refPrint}>
            <table>
              <thead><tr><th>Carnet</th><th>Paciente</th><th>Plan</th><th>Inicio</th><th>Vence</th><th>Estado</th></tr></thead>
              <tbody>
                {memFiltradas.map(m => (
                  <tr key={m.id}>
                    <td>{m.numero_carnet}</td>
                    <td>{m.paciente?.nombre} {m.paciente?.apellido1}</td>
                    <td>{m.tipo?.nombre}</td>
                    <td>{m.fecha_inicio}</td>
                    <td>{m.fecha_fin}</td>
                    <td>{estadoBadge(m, pagos).label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* ══════════════ TAB: COBROS ══════════════════════════ */}
      {tab === 'cobros' && (
        <div className="space-y-4">
          {!cajaAbierta && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <p>
                <strong>Caja cerrada.</strong> Abra la caja en{' '}
                <Link href="/ventas" className="underline font-medium">Ventas / Caja</Link>{' '}
                antes de registrar cobros de cuotas.
              </p>
            </div>
          )}
          <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-violet-800">
              Los cobros de cuotas se registran en <strong>Caja / Ventas</strong> para reflejar el ingreso en la sesión del día.
            </p>
            <Link
              href="/ventas"
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition"
            >
              <Wallet className="w-4 h-4" /> Ir a Caja
            </Link>
          </div>
          {/* filtros cobros */}
          <div className="bg-white border rounded-2xl p-4 flex flex-wrap gap-3 items-center">
            <div className="flex bg-gray-100 rounded-xl p-1 text-xs font-medium">
              {([['hoy','Hoy'],['semana','Esta semana'],['vencidos','Vencidos'],['todos','Todos']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setCobroFiltro(v)}
                  className={`px-3 py-1.5 rounded-lg transition ${cobroFiltro === v ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {l} {v === 'vencidos' && stats.vencPagos > 0 && <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{stats.vencPagos}</span>}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={buscarCobro} onChange={e => setBuscarCobro(e.target.value)}
                placeholder="Buscar paciente o carnet…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <p className="text-sm text-gray-500 ml-auto">{cobrosFiltrados.length} cobros</p>
          </div>

          {cobroFiltro === 'vencidos' && lotesVencidosPorMembresia.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-orange-900">Cobro masivo — cuotas vencidas por paciente</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {lotesVencidosPorMembresia.map(({ membresiaId, cuotas }) => {
                  const pac = cuotas[0]?.membresia?.paciente
                  const respaldo = respaldoCobroDesdePago(cuotas[0])
                  const totales = totalLoteConRecargo(cuotas, hoy)
                  const ids = cuotas.map(c => c.id)
                  const montoInvalido = cuotas.some(c => Number(c.monto) <= 0)
                  return (
                    <div key={membresiaId} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-orange-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {pac ? `${pac.nombre} ${pac.apellido1}` : `Membresía #${membresiaId}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {cuotas.length} cuota(s) vencida(s)
                          {totales.recargo > 0 && ` · recargo ${fmt(totales.recargo)}`}
                        </p>
                      </div>
                      {montoInvalido ? (
                        <span className="text-xs text-red-600 font-medium shrink-0">Monto L 0.00</span>
                      ) : (
                        <Link
                          href={urlCobrarCuotasVencidas(ids, { ...respaldo, monto: totales.total })}
                          className="shrink-0 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg"
                        >
                          Cobrar {fmt(totales.total)}
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {cobrosFiltrados.length === 0 ? (
            <div className="bg-white border rounded-2xl py-16 text-center text-gray-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30 text-green-500" />
              <p className="font-medium">No hay cobros pendientes para este filtro</p>
              <p className="text-sm mt-1">¡Todo al día! 🎉</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cobrosFiltrados.map(p => {
                const badge = badgePago(p.estado, p.fecha_vencimiento)
                const pac   = p.membresia?.paciente
                const det   = montoCuotaConRecargo(p.monto, p.fecha_vencimiento, hoy, p.estado)
                const respaldo = respaldoCobroDesdePago(p)
                const montoInvalido = Number(p.monto) <= 0
                return (
                  <div key={p.id} className={`border rounded-2xl p-4 flex flex-col gap-3 ${colorPago(p.estado, p.fecha_vencimiento)}`}>
                    {/* header tarjeta pago */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        {pac?.foto_url ? (
                          <img src={pac.foto_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"/>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                            {(pac?.nombre?.[0] ?? '') + (pac?.apellido1?.[0] ?? '')}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{pac?.nombre} {pac?.apellido1}</p>
                          <p className="text-xs text-gray-400">{pac?.telefono}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                    </div>

                    {/* detalles */}
                    <div className="bg-white/70 rounded-xl px-3 py-2.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Plan</span>
                        <span className="text-xs font-semibold text-gray-800">{p.membresia?.tipo?.nombre ?? '—'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Carnet</span>
                        <span className="font-mono text-xs text-blue-700">{p.membresia?.numero_carnet ?? '—'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Cuota</span>
                        <span className="text-xs text-gray-700">#{p.numero_cuota}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Vence</span>
                        <span className={`text-xs font-medium ${p.fecha_vencimiento < hoyStr() && p.estado !== 'pagado' ? 'text-red-600' : 'text-gray-700'}`}>
                          {p.fecha_vencimiento}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-1.5">
                        <span className="text-xs font-semibold text-gray-600">MONTO</span>
                        <div className="text-right">
                          <span className="font-bold text-blue-700">{fmt(det.total)}</span>
                          {det.recargo > 0 && (
                            <p className="text-[10px] text-red-600">+{fmt(det.recargo)} recargo mora</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {p.estado !== 'pagado' && (
                      montoInvalido ? (
                        <p className="text-xs text-red-600 text-center py-1 font-medium">Cuota L 0.00 — corrija el plan</p>
                      ) : (
                        <Link
                          href={urlCobrarCuota(p.id, { ...respaldo, monto: det.total })}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                            cajaAbierta
                              ? 'bg-violet-600 hover:bg-violet-700 text-white'
                              : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                          }`}
                        >
                          <Wallet className="w-4 h-4" />
                          {cajaAbierta ? 'Cobrar ahora' : 'Ir a caja (abrir sesión)'}
                          <ArrowRight className="w-3.5 h-3.5 ml-auto"/>
                        </Link>
                      )
                    )}
                    {p.estado === 'pagado' && (
                      <div className="flex items-center gap-1.5 text-green-600 text-xs justify-center py-1">
                        <CheckCircle className="w-4 h-4"/> Pagado el {p.fecha_pago} · {p.cajero_nombre}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: ANALYTICS ═══════════════════════ */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Ingresos planes (mes)', valor: fmt(stats.ingresosMes), cls: 'bg-green-50 border-green-200 text-green-800' },
              { label: 'Cuotas vencidas', valor: String(stats.vencPagos), cls: 'bg-red-50 border-red-200 text-red-800' },
              { label: 'Planes nuevos (mes)', valor: String(stats.vendidasMes), cls: 'bg-blue-50 border-blue-200 text-blue-800' },
              { label: 'Renovaciones (mes)', valor: String(stats.renovMes), cls: 'bg-violet-50 border-violet-200 text-violet-800' },
            ].map(k => (
              <div key={k.label} className={`rounded-xl border p-4 ${k.cls}`}>
                <p className="text-xs font-medium opacity-80">{k.label}</p>
                <p className="text-2xl font-bold mt-1">{k.valor}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border rounded-2xl p-5">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" /> Rentabilidad del módulo (90 días)
            </h3>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-green-50 border border-green-100 p-3">
                <p className="text-xs text-green-700">Ingresos por cuotas</p>
                <p className="text-xl font-bold text-green-800">{fmt(rentabilidad.ingresosCuotas)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs text-amber-700">Descuentos otorgados en caja</p>
                <p className="text-xl font-bold text-amber-800">{fmt(rentabilidad.descuentosOtorgados)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border p-3">
                <p className="text-xs text-slate-600">Balance estimado</p>
                <p className={`text-xl font-bold ${rentabilidad.neto >= 0 ? 'text-slate-800' : 'text-red-700'}`}>
                  {fmt(rentabilidad.neto)}
                </p>
              </div>
            </div>
            {descuentosPlan.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead><tr className="text-gray-500 border-b">
                    <th className="text-left py-1">Fecha</th>
                    <th className="text-left py-1">Paciente</th>
                    <th className="text-right py-1">Descuento</th>
                  </tr></thead>
                  <tbody>
                    {descuentosPlan.slice(0, 15).map(d => (
                      <tr key={d.id} className="border-b border-gray-50">
                        <td className="py-1">{d.fecha}</td>
                        <td className="py-1">{d.paciente_nombre || '—'}</td>
                        <td className="py-1 text-right font-medium text-amber-700">{fmt(Number(d.descuento_monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            {/* ranking de planes */}
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600"/> Ranking de Planes Vendidos
              </h3>
              {rankingPlanes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sin datos</p>
              ) : rankingPlanes.map((p, i) => {
                const pct = rankingPlanes[0].count > 0 ? (p.count / rankingPlanes[0].count) * 100 : 0
                return (
                  <div key={p.nombre} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} {p.nombre}
                      </span>
                      <span className="text-gray-500">{p.count} vendidas · {fmt(p.ingresos)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* estado de cobros */}
            <div className="bg-white border rounded-2xl p-5">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-green-600"/> Estado de Cobros
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Cobrado', valor: pagos.filter(p => p.estado === 'pagado').reduce((s,p) => s+p.monto, 0), count: pagos.filter(p => p.estado === 'pagado').length, box: 'bg-green-50 border-green-100', text: 'text-green-700' },
                  { label: 'Por cobrar', valor: pagos.filter(p => p.estado === 'pendiente').reduce((s,p) => s+p.monto, 0), count: pagos.filter(p => p.estado === 'pendiente').length, box: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
                  { label: 'Vencido sin pagar', valor: pagos.filter(p => p.estado === 'vencido').reduce((s,p) => s+p.monto, 0), count: pagos.filter(p => p.estado === 'vencido').length, box: 'bg-red-50 border-red-100', text: 'text-red-700' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between p-3 rounded-xl border ${r.box}`}>
                    <div>
                      <p className={`text-sm font-semibold ${r.text}`}>{r.label}</p>
                      <p className="text-xs text-gray-400">{r.count} cuota{r.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className={`text-lg font-bold ${r.text}`}>{fmt(r.valor)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* próximos vencimientos de membresías */}
            <div className="bg-white border rounded-2xl p-5 md:col-span-2">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-amber-600"/> Membresías por vencer (próximos 30 días)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Paciente</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Carnet</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Plan</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Vence</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Días</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {membresias
                      .filter(m => { const d = diasRestantes(m.fecha_fin); return m.estado === 'activo' && d >= 0 && d <= 30 })
                      .sort((a, b) => diasRestantes(a.fecha_fin) - diasRestantes(b.fecha_fin))
                      .map(m => {
                        const d = diasRestantes(m.fecha_fin)
                        return (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium">{m.paciente?.nombre} {m.paciente?.apellido1}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{m.numero_carnet}</td>
                            <td className="px-3 py-2.5 text-gray-600">{m.tipo?.nombre}</td>
                            <td className="px-3 py-2.5 text-center text-gray-600">{m.fecha_fin}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${d <= 5 ? 'bg-red-100 text-red-700' : d <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                                {d === 0 ? 'HOY' : `${d}d`}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {membresias.filter(m => { const d = diasRestantes(m.fecha_fin); return m.estado === 'activo' && d >= 0 && d <= 30 }).length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-6">No hay membresías por vencer en los próximos 30 días</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: PLANES ══════════════════════════ */}
      {tab === 'planes' && (
        <div className="space-y-4">
          {esSuperAdmin && (
            <div className="flex justify-end">
              <button onClick={() => { setModalTipo(true); setFormTipo(tipoVacio); setBensTipo(['']); setEditTipoId(null); setErrorTipo('') }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Nuevo Plan
              </button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiposList.map(t => {
              const vendidas = membresias.filter(m => m.tipo_id === t.id).length
              return (
                <div key={t.id} className={`bg-white border rounded-2xl overflow-hidden ${!t.activo ? 'opacity-60' : ''} ${(t.precio ?? 0) <= 0 ? 'border-red-300 ring-1 ring-red-200' : ''}`}>
                  {/* color strip */}
                  <div className={`h-1.5 ${(t.precio ?? 0) <= 0 ? 'bg-gradient-to-r from-red-500 to-red-700' : 'bg-gradient-to-r from-blue-500 to-blue-700'}`}/>
                  <div className="p-5 space-y-3">
                    {(t.precio ?? 0) <= 0 && (
                      <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Precio L 0.00 — las cuotas no se podrán cobrar en caja
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                          <Star className="w-4 h-4 text-amber-500"/> {t.nombre}
                        </h3>
                        {t.descripcion && <p className="text-xs text-gray-500 mt-0.5">{t.descripcion}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-700">{fmt(t.precio)}</p>
                        <p className="text-xs text-gray-400">{t.duracion_dias} días · {numCuotasPlan(t.duracion_dias)} cuota{numCuotasPlan(t.duracion_dias) !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {descuentosPlanTipo(t).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {descuentosPlanTipo(t).map(c => (
                          <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.cls}`}>{c.label}</span>
                        ))}
                      </div>
                    )}
                    {(t.membresia_beneficios ?? []).filter(b => b.activo).length > 0 && (
                      <ul className="space-y-1">
                        {(t.membresia_beneficios ?? []).filter(b => b.activo).map(b => (
                          <li key={b.id} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <BadgeCheck className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0"/> {b.descripcion}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.activo ? 'Activo' : 'Inactivo'}
                        </span>
                        <span className="text-xs text-gray-400">{vendidas} vendida{vendidas !== 1 ? 's' : ''}</span>
                      </div>
                      {esSuperAdmin && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                            setEditTipoId(t.id)
                            setFormTipo({
                              nombre: t.nombre, precio: t.precio, duracion_dias: t.duracion_dias,
                              descripcion: t.descripcion || '', activo: t.activo,
                              consulta_gratis: t.consulta_gratis ?? false,
                              pct_consulta: t.pct_consulta ?? 0,
                              pct_laboratorio: t.pct_laboratorio ?? 0,
                              pct_medicamentos: t.pct_medicamentos ?? 0,
                              pct_servicios: t.pct_servicios ?? 0,
                            })
                            setBensTipo((t.membresia_beneficios ?? []).filter(b => b.activo).map(b => b.descripcion))
                            setModalTipo(true); setErrorTipo('')
                          }} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <Edit3 className="w-3.5 h-3.5"/> Editar
                          </button>
                          <button onClick={() => { void eliminarTipo(t) }}
                            className="flex items-center gap-1 text-xs text-red-600 hover:underline">
                            <Trash2 className="w-3.5 h-3.5"/> Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════ MODALES ═══════════════════════════════════ */}

      {/* input foto oculto */}
      <input ref={inputFotoRef} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f && fotoTargetRef.current) subirFoto(f, fotoTargetRef.current)
          e.target.value = ''
        }} />

      {/* modal carnet */}
      {carnetMem && <CarnetMembresia membresia={carnetMem} onClose={() => setCarnetMem(null)} />}

      {/* ── MODAL NUEVA MEMBRESÍA ── */}
      {modalMem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 text-lg">{editMemId ? 'Editar Plan Médico' : 'Nuevo Plan Médico'}</h2>
              <button onClick={cerrarModalMem} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {errorMem && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{errorMem}</p>}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Paciente *</label>
                {editMemId ? (
                  <div className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                    {pacientes.find(p => p.id === formMem.paciente_id)?.nombre
                      ?? membresias.find(m => m.id === editMemId)?.paciente?.nombre
                      ?? 'Paciente'} {pacientes.find(p => p.id === formMem.paciente_id)?.apellido1
                      ?? membresias.find(m => m.id === editMemId)?.paciente?.apellido1
                      ?? ''}
                  </div>
                ) : (
                  <>
                    <input value={buscarPac} onChange={e => setBuscarPac(e.target.value)} placeholder="Escribir nombre para filtrar…"
                      className="w-full border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <select value={formMem.paciente_id} onChange={e => setFormMem(p => ({ ...p, paciente_id: Number(e.target.value) }))}
                      size={5} className="w-full border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <option value={0}>— Seleccionar —</option>
                      {pacientes.filter(p => !buscarPac || `${p.nombre} ${p.apellido1}`.toLowerCase().includes(buscarPac.toLowerCase()))
                        .map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido1} {p.apellido2 || ''}</option>)}
                    </select>
                  </>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Plan *</label>
                <select value={formMem.tipo_id} onChange={e => {
                    const t = tiposList.find(x => x.id === Number(e.target.value))
                    setFormMem(p => ({ ...p, tipo_id: Number(e.target.value), fecha_fin: recalcFin(p.fecha_inicio, t?.duracion_dias || 0) }))
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value={0}>— Seleccionar —</option>
                  {tiposList.filter(t => t.activo || t.id === formMem.tipo_id).map(t => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={!editMemId && (t.precio ?? 0) <= 0}
                    >
                      {t.nombre} — {fmt(t.precio)} / {t.duracion_dias}d
                      {(t.precio ?? 0) <= 0 ? ' (sin precio — no asignable)' : ''}
                    </option>
                  ))}
                </select>
                {!editMemId && tipoSel && (tipoSel.membresia_beneficios ?? []).filter(b => b.activo).length > 0 && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Cuotas que se generarán: {tipoSel ? numCuotasPlan(tipoSel.duracion_dias) : 1}</p>
                    {(tipoSel.membresia_beneficios ?? []).filter(b => b.activo).map(b => (
                      <p key={b.id} className="text-xs text-blue-700 flex items-center gap-1"><BadgeCheck className="w-3 h-3"/>{b.descripcion}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Fecha inicio *</label>
                  <input type="date" value={formMem.fecha_inicio}
                    onChange={e => { const fin = recalcFin(e.target.value, tipoSel?.duracion_dias || 0); setFormMem(p => ({ ...p, fecha_inicio: e.target.value, fecha_fin: fin })) }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Fecha fin *</label>
                  <input type="date" value={formMem.fecha_fin} onChange={e => setFormMem(p => ({ ...p, fecha_fin: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Cuotas ya pagadas</label>
                  <input type="number" min={0} value={formMem.cuotas_pagadas}
                    onChange={e => setFormMem(p => ({ ...p, cuotas_pagadas: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Sucursal</label>
                  <select value={formMem.sucursal_id} onChange={e => setFormMem(p => ({ ...p, sucursal_id: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value={0}>— General —</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>

              {editMemId && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Estado</label>
                  <select value={formMem.estado} onChange={e => setFormMem(p => ({ ...p, estado: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="vencido">Vencido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Comentarios</label>
                <textarea value={formMem.comentarios} rows={2}
                  onChange={e => setFormMem(p => ({ ...p, comentarios: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Beneficiarios</label>
                  <button onClick={() => setBeneficiarios(p => [...p, { nombre: '', parentesco: '', activo: true }])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <UserPlus className="w-3.5 h-3.5"/> Agregar
                  </button>
                </div>
                {beneficiarios.map((b, i) => (
                  <div key={i} className="flex flex-wrap gap-2 mb-2 items-center">
                    <input value={b.nombre} placeholder="Nombre completo"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                      className="flex-1 min-w-[120px] border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <input value={b.parentesco} placeholder="Parentesco"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, parentesco: e.target.value } : x))}
                      className="w-24 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <input type="date" value={b.fecha_inicio || formMem.fecha_inicio} title="Vigencia desde"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, fecha_inicio: e.target.value } : x))}
                      className="w-32 border rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <input type="date" value={b.fecha_fin || formMem.fecha_fin} title="Vigencia hasta"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, fecha_fin: e.target.value } : x))}
                      className="w-32 border rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={() => setBeneficiarios(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
                {beneficiarios.length === 0 && <p className="text-xs text-gray-400">Sin beneficiarios</p>}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={cerrarModalMem} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarMembresia} disabled={loadingMem}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loadingMem && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>} {editMemId ? 'Guardar cambios' : 'Registrar Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL TIPO PLAN ── */}
      {modalTipo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 text-lg">{editTipoId ? 'Editar Plan' : 'Nuevo Plan'}</h2>
              <button onClick={() => setModalTipo(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {errorTipo && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{errorTipo}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Nombre del plan *</label>
                  <input value={formTipo.nombre} onChange={e => setFormTipo(p => ({ ...p, nombre: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Precio (L.)</label>
                  <input type="number" step="0.01" min={0.01} value={formTipo.precio || ''}
                    onChange={e => setFormTipo(p => ({ ...p, precio: Number(e.target.value) }))}
                    placeholder="Ej. 500.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <p className="text-[10px] text-gray-400 mt-1">Mínimo L 0.01 — L 0.00 bloquea el cobro en caja</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Duración (días)</label>
                  <input type="number" min={1} value={formTipo.duracion_dias}
                    onChange={e => setFormTipo(p => ({ ...p, duracion_dias: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Máx. beneficiarios</label>
                  <input type="number" min={0} value={formTipo.max_beneficiarios ?? 0}
                    onChange={e => setFormTipo(p => ({ ...p, max_beneficiarios: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    title="0 = sin límite" />
                  <p className="text-[10px] text-gray-400 mt-0.5">0 = sin límite</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Descripción</label>
                  <input value={formTipo.descripcion} onChange={e => setFormTipo(p => ({ ...p, descripcion: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                {editTipoId && (
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="activoTipo" checked={formTipo.activo}
                      onChange={e => setFormTipo(p => ({ ...p, activo: e.target.checked }))} />
                    <label htmlFor="activoTipo" className="text-sm text-gray-700">Plan activo</label>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
                <p className="text-xs font-semibold text-emerald-800 uppercase">Beneficios automáticos en caja</p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={formTipo.consulta_gratis}
                    onChange={e => setFormTipo(p => ({ ...p, consulta_gratis: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-600" />
                  <span className="text-sm text-gray-800 font-medium">Consulta médica gratis</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className={formTipo.consulta_gratis ? 'opacity-40 pointer-events-none' : ''}>
                    <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1 block">% Consulta</label>
                    <input type="number" min={0} max={100} step="0.01" value={formTipo.pct_consulta}
                      onChange={e => setFormTipo(p => ({ ...p, pct_consulta: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1 block">% Laboratorio</label>
                    <input type="number" min={0} max={100} step="0.01" value={formTipo.pct_laboratorio}
                      onChange={e => setFormTipo(p => ({ ...p, pct_laboratorio: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1 block">% Medicamentos</label>
                    <input type="number" min={0} max={100} step="0.01" value={formTipo.pct_medicamentos}
                      onChange={e => setFormTipo(p => ({ ...p, pct_medicamentos: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 uppercase mb-1 block">% Servicios</label>
                    <input type="number" min={0} max={100} step="0.01" value={formTipo.pct_servicios}
                      onChange={e => setFormTipo(p => ({ ...p, pct_servicios: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700/80">
                  Estos valores se aplican solos al cobrar en caja cuando el paciente tiene este plan activo.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Beneficios incluidos (descripción)</label>
                  <button onClick={() => setBensTipo(p => [...p, ''])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Plus className="w-3.5 h-3.5"/> Agregar</button>
                </div>
                {bensTipo.map((b, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input value={b} placeholder={`Beneficio ${i+1}…`}
                      onChange={e => setBensTipo(p => p.map((x, j) => j === i ? e.target.value : x))}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={() => setBensTipo(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setModalTipo(false)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarTipo} disabled={loadingTipo}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loadingTipo && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: plan activo duplicado ── */}
      {planDuplicado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Plan activo existente
            </h3>
            <p className="text-sm text-gray-600">
              Este paciente ya tiene <strong>{planDuplicado.tipo?.nombre}</strong> activo hasta{' '}
              <strong>{planDuplicado.fecha_fin}</strong> (carnet {planDuplicado.numero_carnet || '—'}).
            </p>
            <p className="text-sm text-gray-500">¿Qué desea hacer?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const m = planDuplicado
                  setPlanDuplicado(null)
                  cerrarModalMem()
                  abrirRenovar(m)
                }}
                className="w-full px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
              >
                Renovar plan actual
              </button>
              <button
                onClick={() => {
                  const id = planDuplicado.id
                  setPlanDuplicado(null)
                  void guardarMembresia(id)
                }}
                className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700"
              >
                Reemplazar (inactivar el anterior)
              </button>
              <button
                onClick={() => setPlanDuplicado(null)}
                className="w-full px-4 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: renovación inteligente ── */}
      {renovarTarget && (() => {
        const m = renovarTarget
        const dias = m.tipo?.duracion_dias || 30
        const hoyD = hoyStr()
        const inicioC = new Date(m.fecha_fin); inicioC.setDate(inicioC.getDate() + 1)
        const inicio = inicioC.toISOString().split('T')[0] > hoyD ? inicioC.toISOString().split('T')[0] : hoyD
        const finD = new Date(inicio); finD.setDate(finD.getDate() + dias)
        const fin = finD.toISOString().split('T')[0]
        const cuotas = numCuotasPlan(dias)
        const montoCuota = (m.tipo?.precio || 0) / cuotas
        const benAct = (m.beneficiarios || []).filter(b => b.activo)
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="font-bold text-gray-900 text-lg">Renovación inteligente</h3>
              <p className="text-sm text-gray-600">
                {m.paciente?.nombre} {m.paciente?.apellido1} · {m.tipo?.nombre}
              </p>
              <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
                <p><span className="text-gray-500">Plan sugerido:</span> <strong>{m.tipo?.nombre}</strong> (mismo plan)</p>
                <p><span className="text-gray-500">Nueva vigencia:</span> <strong>{inicio}</strong> → <strong>{fin}</strong></p>
                <p><span className="text-gray-500">Costo total:</span> <strong>{fmt(m.tipo?.precio || 0)}</strong></p>
                <p><span className="text-gray-500">Cuotas nuevas:</span> <strong>{cuotas} × {fmt(montoCuota)}</strong></p>
                {benAct.length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-1">Beneficiarios a conservar:</p>
                    <div className="flex flex-wrap gap-1">
                      {benAct.map((b, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-white border rounded-full">{b.nombre}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setRenovarTarget(null)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={() => void confirmarRenovar()} className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                  Confirmar renovación
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {loading && (
        <div className="fixed inset-0 bg-black/20 z-40 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-5 flex items-center gap-3 shadow-xl">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin"/>
            <span className="text-sm font-medium text-gray-700">Procesando…</span>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
