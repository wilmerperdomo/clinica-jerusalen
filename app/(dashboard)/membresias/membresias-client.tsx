'use client'

import { useState, useMemo, useRef, Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  CreditCard, Plus, Search, RefreshCw, Users, Star,
  ChevronDown, ChevronUp, Printer, CheckCircle, XCircle,
  AlertTriangle, Edit3, Trash2, UserPlus, X, BadgeCheck,
  Camera, IdCard, TrendingUp, DollarSign, Clock, CalendarDays,
  Wallet, BarChart3, ArrowRight, Hash,
} from 'lucide-react'
import CarnetMembresia from './CarnetMembresia'
import { useConfirm } from '@/components/confirm-dialog'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

/* ══════════════════ TIPOS ════════════════════════════════════ */
interface Beneficio   { id: number; descripcion: string; activo: boolean }
interface Tipo        {
  id: number; nombre: string; precio: number
  duracion_dias: number; descripcion?: string; activo: boolean
  consulta_gratis?: boolean
  pct_consulta?: number; pct_laboratorio?: number
  pct_medicamentos?: number; pct_servicios?: number
  membresia_beneficios: Beneficio[]
}
interface Beneficiario { id?: number; nombre: string; parentesco: string; activo: boolean }
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
}

/* ══════════════════ HELPERS ══════════════════════════════════ */
const fmt        = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
const hoyStr     = () => new Date().toISOString().split('T')[0]
const semanaStr  = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] }

function diasRestantes(fechaFin: string) {
  const fin = new Date(fechaFin); const hoyD = new Date(); hoyD.setHours(0,0,0,0)
  return Math.ceil((fin.getTime() - hoyD.getTime()) / 86400000)
}
function estadoBadge(m: Membresia) {
  if (m.estado === 'inactivo') return { label: 'Inactivo', color: 'bg-gray-100 text-gray-600' }
  const d = diasRestantes(m.fecha_fin)
  if (d < 0)   return { label: 'Vencido',      color: 'bg-red-100   text-red-700'   }
  if (d <= 10) return { label: `Vence en ${d}d`,color: 'bg-amber-100 text-amber-700' }
  return               { label: 'Activo',       color: 'bg-green-100 text-green-700' }
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

/* ════════════════════════════════════════════════════════════ */
export default function MembresiasClient({
  tipos, membresias: init, pacientes, sucursales,
  pagos: initPagos, sucursalDefault, hoy,
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
  const [formMem,    setFormMem]    = useState(memVacia)
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [buscarPac,  setBuscarPac]  = useState('')
  const [loadingMem, setLoadingMem] = useState(false)
  const [errorMem,   setErrorMem]   = useState('')

  /* ── modal tipo plan ── */
  const tipoVacio = {
    nombre: '', precio: 0, duracion_dias: 30, descripcion: '', activo: true,
    consulta_gratis: false, pct_consulta: 0, pct_laboratorio: 0, pct_medicamentos: 0, pct_servicios: 0,
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

  /* ════════ CÁLCULOS MEMOIZADOS ════════════════════════════ */
  const tipoSel = tiposList.find(t => t.id === formMem.tipo_id)

  const stats = useMemo(() => {
    const activas    = membresias.filter(m => estadoBadge(m).label === 'Activo').length
    const vencidas   = membresias.filter(m => estadoBadge(m).label === 'Vencido').length
    const porVencer  = membresias.filter(m => estadoBadge(m).label.startsWith('Vence')).length
    // ingresos: suma de cuotas pagadas
    const cobrado    = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0)
    const porCobrar  = pagos.filter(p => p.estado !== 'pagado').reduce((s, p) => s + p.monto, 0)
    const vencPagos  = pagos.filter(p => p.estado === 'vencido').length
    // este mes
    const mesActual  = hoy.slice(0, 7)
    const vendidasMes= membresias.filter(m => m.created_at.slice(0, 7) === mesActual).length
    return { activas, vencidas, porVencer, total: membresias.length, cobrado, porCobrar, vencPagos, vendidasMes }
  }, [membresias, pagos, hoy])

  const memFiltradas = useMemo(() => {
    return membresias.filter(m => {
      const nombre = `${m.paciente?.nombre || ''} ${m.paciente?.apellido1 || ''}`.toLowerCase()
      const passQ  = !buscar || nombre.includes(buscar.toLowerCase()) || (m.tipo?.nombre || '').toLowerCase().includes(buscar.toLowerCase()) || (m.numero_carnet || '').toLowerCase().includes(buscar.toLowerCase())
      const badge  = estadoBadge(m)
      const passE  = !filtroEstado || badge.label.toLowerCase().startsWith(filtroEstado)
      return passQ && passE
    })
  }, [membresias, buscar, filtroEstado])

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
    })
  }, [pagos, cobroFiltro, buscarCobro])

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

  async function guardarMembresia() {
    if (!formMem.paciente_id) return setErrorMem('Selecciona un paciente')
    if (!formMem.tipo_id)     return setErrorMem('Selecciona un plan')
    if (!formMem.fecha_inicio || !formMem.fecha_fin) return setErrorMem('Completa las fechas')
    setLoadingMem(true); setErrorMem('')
    try {
      const { data: newM, error: e } = await supabase
        .from('membresias')
        .insert({
          paciente_id: formMem.paciente_id, tipo_id: formMem.tipo_id,
          fecha_inicio: formMem.fecha_inicio, fecha_fin: formMem.fecha_fin,
          cuotas_pagadas: formMem.cuotas_pagadas, estado: formMem.estado,
          comentarios: formMem.comentarios || null,
          sucursal_id: formMem.sucursal_id || null,
        })
        .select(`id, paciente_id, tipo_id, fecha_inicio, fecha_fin, cuotas_pagadas,
          estado, comentarios, numero_carnet, sucursal_id, created_at,
          tipo:membresia_tipos(nombre, precio, duracion_dias),
          paciente:pacientes(id, nombre, apellido1, apellido2, telefono, foto_url),
          beneficiarios:membresia_beneficiarios(id, nombre, parentesco, activo),
          sucursal:sucursales(nombre)`)
        .single()
      if (e) throw e
      const benefs = beneficiarios.filter(b => b.nombre.trim())
      if (benefs.length && newM?.id) {
        await supabase.from('membresia_beneficiarios').insert(
          benefs.map(b => ({ membresia_id: newM.id, nombre: b.nombre, parentesco: b.parentesco, activo: true }))
        )
      }
      if (newM) {
        setMembresias(prev => [newM as unknown as Membresia, ...prev])
        // recargar pagos generados por trigger
        const { data: np } = await supabase.from('membresia_pagos')
          .select(`id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado, fecha_pago, forma_pago, cajero_nombre, notas,
            membresia:membresias(numero_carnet, tipo_id, paciente_id, tipo:membresia_tipos(nombre), paciente:pacientes(nombre, apellido1, telefono, foto_url))`)
          .eq('membresia_id', newM.id)
        if (np) setPagos(prev => [...prev, ...(np as unknown as Pago[])])
      }
      setModalMem(false); setFormMem(memVacia); setBeneficiarios([])
    } catch (err: unknown) { setErrorMem(err instanceof Error ? err.message : 'Error') }
    finally { setLoadingMem(false) }
  }

  async function renovar(m: Membresia) {
    const nombrePac = `${m.paciente?.nombre ?? ''} ${m.paciente?.apellido1 ?? ''}`.trim()
    const { confirmed } = await confirmDialog({
      title: 'Renovar membresía',
      message: `¿Renovar la membresía de ${nombrePac}? Se creará una nueva y se inactivará la actual.`,
      variant: 'info',
      confirmLabel: 'Renovar',
      details: m.numero_carnet ? [{ label: 'Carnet', value: m.numero_carnet }] : undefined,
    })
    if (!confirmed) return
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
    } catch (err) { alert('Error al renovar: ' + (err instanceof Error ? err.message : err)) }
    finally { setLoading(false) }
  }

  async function guardarTipo() {
    if (!formTipo.nombre.trim()) return setErrorTipo('Ingresa el nombre del plan')
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
          { label: 'Cobrado', value: fmt(stats.cobrado), icon: DollarSign },
          { label: 'Por cobrar', value: fmt(stats.porCobrar), icon: Wallet },
        ]}
        actions={
          <ModuleBtnPrimary onClick={() => { setModalMem(true); setErrorMem(''); setFormMem(memVacia); setBeneficiarios([]) }}>
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
              <option value="activo">Activos</option>
              <option value="vence">Por vencer</option>
              <option value="vencido">Vencidos</option>
              <option value="inactivo">Inactivos</option>
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
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-36">Acciones</th>
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
                  const badge = estadoBadge(m)
                  const dias  = diasRestantes(m.fecha_fin)
                  const open  = expandido === m.id
                  return (
                    <Fragment key={m.id}>
                      <tr className="hover:bg-gray-50">
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
                            <button onClick={() => renovar(m)} title="Renovar"
                              className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><RefreshCw className="w-3.5 h-3.5"/></button>
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
                    <td>{estadoBadge(m).label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: COBROS ══════════════════════════ */}
      {tab === 'cobros' && (
        <div className="space-y-4">
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
                        <span className="font-bold text-blue-700">{fmt(p.monto)}</span>
                      </div>
                    </div>

                    {/* acción */}
                    {p.estado !== 'pagado' && (
                      <Link
                        href="/ventas"
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition"
                      >
                        <Wallet className="w-4 h-4" /> Cobrar en Caja <ArrowRight className="w-3.5 h-3.5 ml-auto"/>
                      </Link>
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
          <div className="flex justify-end">
            <button onClick={() => { setModalTipo(true); setFormTipo(tipoVacio); setBensTipo(['']); setEditTipoId(null); setErrorTipo('') }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Nuevo Plan
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiposList.map(t => {
              const vendidas = membresias.filter(m => m.tipo_id === t.id).length
              return (
                <div key={t.id} className={`bg-white border rounded-2xl overflow-hidden ${!t.activo ? 'opacity-60' : ''}`}>
                  {/* color strip */}
                  <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-700"/>
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                          <Star className="w-4 h-4 text-amber-500"/> {t.nombre}
                        </h3>
                        {t.descripcion && <p className="text-xs text-gray-500 mt-0.5">{t.descripcion}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-700">{fmt(t.precio)}</p>
                        <p className="text-xs text-gray-400">{t.duracion_dias} días</p>
                      </div>
                    </div>
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
              <h2 className="font-bold text-gray-900 text-lg">Nuevo Plan Médico</h2>
              <button onClick={() => setModalMem(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {errorMem && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{errorMem}</p>}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Paciente *</label>
                <input value={buscarPac} onChange={e => setBuscarPac(e.target.value)} placeholder="Escribir nombre para filtrar…"
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <select value={formMem.paciente_id} onChange={e => setFormMem(p => ({ ...p, paciente_id: Number(e.target.value) }))}
                  size={5} className="w-full border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value={0}>— Seleccionar —</option>
                  {pacientes.filter(p => !buscarPac || `${p.nombre} ${p.apellido1}`.toLowerCase().includes(buscarPac.toLowerCase()))
                    .map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido1} {p.apellido2 || ''}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Plan *</label>
                <select value={formMem.tipo_id} onChange={e => {
                    const t = tiposList.find(x => x.id === Number(e.target.value))
                    setFormMem(p => ({ ...p, tipo_id: Number(e.target.value), fecha_fin: recalcFin(p.fecha_inicio, t?.duracion_dias || 0) }))
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value={0}>— Seleccionar —</option>
                  {tiposList.filter(t => t.activo).map(t => (
                    <option key={t.id} value={t.id}>{t.nombre} — {fmt(t.precio)} / {t.duracion_dias}d</option>
                  ))}
                </select>
                {tipoSel && (tipoSel.membresia_beneficios ?? []).filter(b => b.activo).length > 0 && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Cuotas que se generarán: {Math.round(tipoSel.duracion_dias <= 31 ? 1 : tipoSel.duracion_dias <= 93 ? 3 : tipoSel.duracion_dias <= 186 ? 6 : 12)}</p>
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
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input value={b.nombre} placeholder="Nombre completo"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <input value={b.parentesco} placeholder="Parentesco"
                      onChange={e => setBeneficiarios(p => p.map((x, j) => j === i ? { ...x, parentesco: e.target.value } : x))}
                      className="w-28 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={() => setBeneficiarios(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
                {beneficiarios.length === 0 && <p className="text-xs text-gray-400">Sin beneficiarios</p>}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setModalMem(false)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarMembresia} disabled={loadingMem}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loadingMem && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>} Registrar Plan
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
                  <input type="number" step="0.01" min={0} value={formTipo.precio}
                    onChange={e => setFormTipo(p => ({ ...p, precio: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Duración (días)</label>
                  <input type="number" min={1} value={formTipo.duracion_dias}
                    onChange={e => setFormTipo(p => ({ ...p, duracion_dias: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
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
