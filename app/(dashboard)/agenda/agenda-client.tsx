'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Save,
  Search, Clock, Phone, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Edit2, Trash2, CalendarDays,
  Stethoscope, Filter, Sparkles, MapPin, List,
  Printer, MessageCircle, Zap, Building2, LayoutGrid, BellRing, PhoneCall,
} from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'
import ResponsiveModal from '@/components/responsive-modal'
import { BRAND } from '@/lib/brand'
import {
  addDays, lunesDe, fmtFecha, fmtFechaLarga, fmtPrecio,
  celdasMes, fechaDesdeCelda, hayConflicto, linkWhatsApp,
  imprimirAgenda, minutosHastaCita, formatearCountdown,
  necesitaRecordatorio, RECORDATORIO_CFG, type RecordatorioEstado,
} from '@/lib/agenda-utils'

/* ─── tipos ─────────────────────────────────────────────── */
interface Paciente {
  id: number; codigo: string; nombre: string
  apellido1: string; apellido2?: string
  celular?: string; fecha_nac?: string
}
interface Servicio {
  id: number; nombre: string; tipo: string; precio: number
}
interface Cita {
  id: number; paciente_id: number; sucursal_id?: number
  fecha: string; hora: string; nota?: string; estado: string
  servicio_id?: number | null; servicio_nombre?: string | null
  recordatorio_estado?: string | null
  recordatorio_at?: string | null
  recordatorio_nota?: string | null
  paciente?: Paciente
  servicio?: Servicio | null
}
interface Sucursal { id: number; nombre: string }
interface Props {
  citas:           Cita[]
  pacientes:       Paciente[]
  sucursales:      Sucursal[]
  servicios:       Servicio[]
  sucursalUsuario: number | null
  esSuperAdmin:    boolean
  sucursalNombre?: string
  fechaHoy:        string
  semanaInicio:    string
}

type Vista = 'semana' | 'dia' | 'lista'

const DIAS_CORTO = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const HORAS = Array.from({ length: 13 }, (_, i) => `${String(i + 7).padStart(2,'0')}:00`)
const HORA_INICIO = 7
const HORA_FIN = 19
const ALTURA_FRANJA = 56

const ESTADO_CFG: Record<string, {
  label: string; color: string; bg: string; ring: string; dot: string; border: string; icon: React.ElementType
}> = {
  'ACTIVO':     { label: 'Activa',     color: 'text-sky-700',     bg: 'bg-sky-50',     ring: 'ring-sky-200',     dot: 'bg-sky-500',     border: 'border-l-sky-500',     icon: Clock },
  'ASISTIÓ':    { label: 'Asistió',    color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', dot: 'bg-emerald-500', border: 'border-l-emerald-500', icon: CheckCircle2 },
  'ATENDIDO':   { label: 'Atendido',   color: 'text-violet-700',  bg: 'bg-violet-50',  ring: 'ring-violet-200',  dot: 'bg-violet-500',  border: 'border-l-violet-500',  icon: CheckCircle2 },
  'CANCELADO':  { label: 'Cancelada',  color: 'text-rose-700',    bg: 'bg-rose-50',    ring: 'ring-rose-200',    dot: 'bg-rose-500',    border: 'border-l-rose-500',    icon: XCircle },
  'NO ASISTIÓ': { label: 'No asistió', color: 'text-slate-600',   bg: 'bg-slate-50',   ring: 'ring-slate-200',   dot: 'bg-slate-400',   border: 'border-l-slate-400',   icon: AlertCircle },
}

const TIPO_ORDEN = ['Consulta', 'Ultrasonido', 'Procedimiento', 'Inyectable', 'Curación', 'General']
const TIPO_BADGE: Record<string, string> = {
  Consulta: 'bg-blue-100 text-blue-700', Ultrasonido: 'bg-purple-100 text-purple-700',
  Procedimiento: 'bg-amber-100 text-amber-700', Inyectable: 'bg-teal-100 text-teal-700',
  Curación: 'bg-orange-100 text-orange-700', General: 'bg-gray-100 text-gray-700',
}

const CITAS_SELECT = `
  *,
  paciente:pacientes(id, codigo, nombre, apellido1, apellido2, celular, fecha_nac),
  servicio:servicios(id, nombre, tipo, precio)
`


function calcEdad(fn?: string) {
  if (!fn) return ''
  const hoy = new Date()
  const nac = new Date(fn)
  let e = hoy.getFullYear() - nac.getFullYear()
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) e--
  return `${e} años`
}

function iniciales(p?: Paciente) {
  if (!p) return '?'
  return `${p.nombre.charAt(0)}${p.apellido1.charAt(0)}`.toUpperCase()
}

function nombreServicio(c: Cita) {
  return c.servicio?.nombre || c.servicio_nombre || null
}

function tipoServicio(c: Cita) {
  return c.servicio?.tipo || null
}

/* ═══════════════════════════════════════════════════════════ */
export default function AgendaClient({
  citas: initCitas, pacientes, sucursales, servicios,
  sucursalUsuario, esSuperAdmin, sucursalNombre,
  fechaHoy, semanaInicio: initSemana,
}: Props) {
  const sb = createClient()
  const confirmDialog = useConfirm()
  const timelineRef = useRef<HTMLDivElement>(null)
  const [reloj, setReloj] = useState(() => new Date())

  const [citas,         setCitas]         = useState<Cita[]>(initCitas)
  const [semanaBase,    setSemanaBase]    = useState(initSemana)
  const [vistaActiva,   setVistaActiva]   = useState<Vista>('semana')
  const [diaActivo,     setDiaActivo]     = useState(fechaHoy)
  const [loading,       setLoading]       = useState(false)
  const [filtroEstado,  setFiltroEstado]  = useState('todos')
  const [busqueda,      setBusqueda]      = useState('')
  const [filtroSuc,     setFiltroSuc]     = useState<number | 'todas'>(sucursalUsuario ?? 'todas')

  const hoyDate = new Date(fechaHoy + 'T12:00:00')
  const [mesCal, setMesCal] = useState({ anio: hoyDate.getFullYear(), mes: hoyDate.getMonth() })

  const [modal, setModal] = useState(false)
  const [citaEdit, setCitaEdit] = useState<Cita | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [busqPac, setBusqPac] = useState('')
  const [pacSelec, setPacSelec] = useState<Paciente | null>(null)
  const [form, setForm] = useState({
    fecha: fechaHoy, hora: '08:00', nota: '',
    sucursal_id: String(sucursalUsuario ?? ''),
    servicio_id: '', servicio_nombre: '',
  })
  const [citaVer, setCitaVer] = useState<Cita | null>(null)

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (vistaActiva !== 'dia' || diaActivo !== fechaHoy || !timelineRef.current) return
    const mins = reloj.getHours() * 60 + reloj.getMinutes()
    const offset = ((mins - HORA_INICIO * 60) / 60) * ALTURA_FRANJA
    if (offset > 0) timelineRef.current.scrollTop = Math.max(0, offset - 120)
  }, [vistaActiva, diaActivo, fechaHoy, reloj])

  const serviciosPorTipo = useMemo(() => {
    const map: Record<string, Servicio[]> = {}
    servicios.forEach(s => { (map[s.tipo] ??= []).push(s) })
    return map
  }, [servicios])

  const tiposOrdenados = useMemo(() =>
    Object.keys(serviciosPorTipo).sort((a, b) => {
      const ia = TIPO_ORDEN.indexOf(a), ib = TIPO_ORDEN.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    }),
  [serviciosPorTipo])

  const diasSemana = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(semanaBase, i)),
  [semanaBase])

  const cargarSemana = useCallback(async (lunes: string, suc?: number | 'todas') => {
    setLoading(true)
    const fin = addDays(lunes, 6)
    let q = sb.from('citas').select(CITAS_SELECT)
      .gte('fecha', lunes).lte('fecha', fin)
      .order('fecha').order('hora')
    const sid = suc ?? filtroSuc
    if (sid !== 'todas') q = q.eq('sucursal_id', sid)
    const { data } = await q
    setCitas(data ?? [])
    setLoading(false)
  }, [sb, filtroSuc])

  function navSemana(dir: number) {
    const nuevo = addDays(semanaBase, dir * 7)
    setSemanaBase(nuevo)
    cargarSemana(nuevo)
  }

  function irHoy() {
    const lunesStr = lunesDe(fechaHoy)
    setSemanaBase(lunesStr)
    setDiaActivo(fechaHoy)
    setMesCal({ anio: hoyDate.getFullYear(), mes: hoyDate.getMonth() })
    cargarSemana(lunesStr)
  }

  function irADia(fecha: string) {
    setDiaActivo(fecha)
    setSemanaBase(lunesDe(fecha))
    setVistaActiva('dia')
    const d = new Date(fecha + 'T12:00:00')
    setMesCal({ anio: d.getFullYear(), mes: d.getMonth() })
    if (!diasSemana.includes(fecha)) cargarSemana(lunesDe(fecha))
  }

  const citasFiltradas = useMemo(() => {
    let list = citas
    if (filtroEstado !== 'todos') list = list.filter(c => c.estado === filtroEstado)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(c =>
        `${c.paciente?.nombre} ${c.paciente?.apellido1} ${c.paciente?.codigo} ${nombreServicio(c) ?? ''}`
          .toLowerCase().includes(q)
      )
    }
    return list
  }, [citas, filtroEstado, busqueda])

  const citasPorFecha = useMemo(() => {
    const map: Record<string, Cita[]> = {}
    citasFiltradas.forEach(c => { (map[c.fecha] ??= []).push(c) })
    return map
  }, [citasFiltradas])

  const citasHoy = useMemo(() =>
    citas.filter(c => c.fecha === fechaHoy && c.estado === 'ACTIVO').sort((a, b) => a.hora.localeCompare(b.hora)),
  [citas, fechaHoy])

  const proximaCita = useMemo(() => {
    const ahora = reloj
    return citasHoy.find(c => minutosHastaCita(c.fecha, c.hora, ahora) >= 0)
  }, [citasHoy, reloj])

  const colaRecordatorios = useMemo(() =>
    citas
      .filter(c => necesitaRecordatorio(c, fechaHoy, reloj))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)),
  [citas, fechaHoy, reloj])

  const mananaStr = addDays(fechaHoy, 1)

  const ocupacionDia = useMemo(() => {
    const map: Record<string, number> = {}
    diasSemana.forEach(f => {
      const n = (citasPorFecha[f] || []).filter(c => c.estado === 'ACTIVO').length
      map[f] = Math.min(100, Math.round((n / HORAS.length) * 100))
    })
    return map
  }, [diasSemana, citasPorFecha])

  const diasConCitasMes = useMemo(() => {
    const set = new Set<number>()
    citas.forEach(c => {
      const d = new Date(c.fecha + 'T12:00:00')
      if (d.getFullYear() === mesCal.anio && d.getMonth() === mesCal.mes) set.add(d.getDate())
    })
    return set
  }, [citas, mesCal])

  const stats = useMemo(() => ({
    total: citas.length,
    activas: citas.filter(c => c.estado === 'ACTIVO').length,
    asistio: citas.filter(c => c.estado === 'ASISTIÓ' || c.estado === 'ATENDIDO').length,
    cancelado: citas.filter(c => c.estado === 'CANCELADO').length,
    noAsistio: citas.filter(c => c.estado === 'NO ASISTIÓ').length,
  }), [citas])

  const posicionAhora = useMemo(() => {
    if (diaActivo !== fechaHoy) return null
    const mins = reloj.getHours() * 60 + reloj.getMinutes()
    if (mins < HORA_INICIO * 60 || mins > HORA_FIN * 60) return null
    return ((mins - HORA_INICIO * 60) / 60) * ALTURA_FRANJA
  }, [diaActivo, fechaHoy, reloj])

  function abrirNueva(fecha?: string, hora?: string) {
    setCitaEdit(null); setPacSelec(null); setBusqPac(''); setError('')
    const def = servicios.find(s => s.tipo === 'Consulta')
    setForm({
      fecha: fecha ?? fechaHoy, hora: hora ?? '08:00', nota: '',
      sucursal_id: String(sucursalUsuario ?? (filtroSuc !== 'todas' ? filtroSuc : '')),
      servicio_id: def ? String(def.id) : '', servicio_nombre: def?.nombre ?? '',
    })
    setModal(true)
  }

  function abrirEditar(c: Cita) {
    setCitaEdit(c)
    setPacSelec(c.paciente ?? null)
    setBusqPac(c.paciente ? `${c.paciente.nombre} ${c.paciente.apellido1}` : '')
    setForm({
      fecha: c.fecha, hora: c.hora.slice(0, 5), nota: c.nota ?? '',
      sucursal_id: String(c.sucursal_id ?? sucursalUsuario ?? ''),
      servicio_id: c.servicio_id ? String(c.servicio_id) : '',
      servicio_nombre: c.servicio_nombre ?? c.servicio?.nombre ?? '',
    })
    setError(''); setModal(true); setCitaVer(null)
  }

  function onServicioChange(id: string) {
    const s = servicios.find(x => x.id === Number(id))
    setForm(p => ({ ...p, servicio_id: id, servicio_nombre: s?.nombre ?? '' }))
  }

  async function guardarCita() {
    if (!pacSelec) { setError('Selecciona un paciente'); return }
    if (!form.fecha || !form.hora) { setError('Fecha y hora son obligatorias'); return }

    if (hayConflicto(citas, form.fecha, form.hora, citaEdit?.id)) {
      const { confirmed } = await confirmDialog({
        title: 'Horario ocupado',
        message: 'Ya existe una cita activa a esta hora. ¿Desea agendar de todos modos?',
        variant: 'warning', confirmLabel: 'Sí, continuar',
      })
      if (!confirmed) return
    }

    setGuardando(true); setError('')
    const serv = form.servicio_id ? servicios.find(s => s.id === Number(form.servicio_id)) : null
    const payload: Record<string, unknown> = {
      paciente_id: pacSelec.id,
      sucursal_id: form.sucursal_id ? Number(form.sucursal_id) : null,
      fecha: form.fecha, hora: form.hora, nota: form.nota || null,
      servicio_id: form.servicio_id ? Number(form.servicio_id) : null,
      servicio_nombre: serv?.nombre || form.servicio_nombre || null,
    }

    if (citaEdit) {
      const { error: e } = await sb.from('citas').update(payload).eq('id', citaEdit.id)
      if (e) { setError(e.message); setGuardando(false); return }
      setCitas(prev => prev.map(c => c.id === citaEdit.id ? {
        ...c, ...payload, paciente: pacSelec, servicio: serv ?? null,
        sucursal_id: payload.sucursal_id as number | undefined,
        nota: payload.nota as string | undefined,
      } as Cita : c))
    } else {
      const { data, error: e } = await sb.from('citas')
        .insert({ ...payload, estado: 'ACTIVO' }).select(CITAS_SELECT).single()
      if (e) { setError(e.message); setGuardando(false); return }
      setCitas(prev => [...prev, data])
    }
    setGuardando(false); setModal(false)
  }

  async function cambiarEstado(id: number, estado: string) {
    if (['CANCELADO', 'NO ASISTIÓ'].includes(estado)) {
      const { confirmed } = await confirmDialog({
        title: estado === 'CANCELADO' ? 'Cancelar cita' : 'Marcar no asistió',
        message: estado === 'CANCELADO' ? '¿Cancelar esta cita?' : '¿Marcar como no asistió?',
        variant: 'warning', confirmLabel: 'Confirmar',
      })
      if (!confirmed) return
    }
    const { error } = await sb.from('citas').update({ estado }).eq('id', id)
    if (error) return alert(error.message)
    setCitas(prev => prev.map(c => c.id === id ? { ...c, estado } : c))
    setCitaVer(prev => prev?.id === id ? { ...prev, estado } : prev)
  }

  async function eliminarCita(id: number) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar cita', message: 'Esta acción no se puede deshacer.',
      variant: 'danger', confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    const { error } = await sb.from('citas').delete().eq('id', id)
    if (error) return alert(error.message)
    setCitas(prev => prev.filter(c => c.id !== id))
    setCitaVer(null)
  }

  async function marcarRecordatorio(id: number, estado: RecordatorioEstado) {
    const ahora = new Date().toISOString()
    const { error } = await sb.from('citas').update({
      recordatorio_estado: estado,
      recordatorio_at: ahora,
    }).eq('id', id)
    if (error) {
      alert('No se pudo guardar. ¿Ejecutó la migración 033_recordatorio_citas.sql?')
      return
    }
    const patch = { recordatorio_estado: estado, recordatorio_at: ahora }
    setCitas(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    setCitaVer(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const pacsFilt = useMemo(() =>
    !busqPac || pacSelec ? [] : pacientes.filter(p =>
      `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''} ${p.codigo} ${p.celular ?? ''}`
        .toLowerCase().includes(busqPac.toLowerCase())
    ).slice(0, 10),
  [busqPac, pacSelec, pacientes])

  const servicioSeleccionado = servicios.find(s => s.id === Number(form.servicio_id))
  const conflictoForm = hayConflicto(citas, form.fecha, form.hora, citaEdit?.id)

  function imprimir() {
    const rango = vistaActiva === 'dia'
      ? fmtFechaLarga(diaActivo)
      : `${fmtFecha(semanaBase)} — ${fmtFecha(addDays(semanaBase, 6))}`
    const lista = vistaActiva === 'dia'
      ? citasFiltradas.filter(c => c.fecha === diaActivo)
      : citasFiltradas
    imprimirAgenda({
      citas: lista,
      titulo: 'Agenda de Citas',
      subtitulo: `${rango}${sucursalNombre ? ` · ${sucursalNombre}` : ''}`,
    })
  }

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-full min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">

      {/* HERO */}
      <div className="relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)` }}>
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-10 bg-white blur-3xl" />
        <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full opacity-10"
          style={{ backgroundColor: BRAND.gold }} />

        <div className="relative px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  {sucursalNombre ?? 'Todas las sucursales'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <CalendarDays className="w-8 h-8" style={{ color: BRAND.goldLight }} />
                Agenda de Citas
              </h1>
              <p className="text-white/60 text-sm mt-1">
                {pacientes.length} pacientes · {servicios.length} servicios en catálogo
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={irHoy}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <RefreshCw className="w-3.5 h-3.5" /> Hoy
              </button>
              <button onClick={imprimir}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <div className="flex rounded-xl overflow-hidden border border-white/20 bg-white/10 backdrop-blur">
                {(['semana', 'dia', 'lista'] as Vista[]).map(v => (
                  <button key={v} onClick={() => setVistaActiva(v)}
                    className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold capitalize transition ${
                      vistaActiva === v ? 'text-white shadow-inner' : 'text-white/60 hover:text-white'
                    }`}
                    style={vistaActiva === v ? { backgroundColor: BRAND.gold, color: BRAND.navy } : undefined}>
                    {v === 'semana' ? <LayoutGrid className="w-3.5 h-3.5 inline sm:mr-1" /> :
                     v === 'dia' ? <Calendar className="w-3.5 h-3.5 inline sm:mr-1" /> :
                     <List className="w-3.5 h-3.5 inline sm:mr-1" />}
                    <span className="hidden sm:inline">{v === 'lista' ? 'Lista' : v.charAt(0).toUpperCase() + v.slice(1)}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => abrirNueva()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition"
                style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                <Plus className="w-4 h-4" /> Nueva Cita
              </button>
            </div>
          </div>

          {/* Recordatorios pendientes */}
          {colaRecordatorios.length > 0 && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-amber-300/50 bg-amber-500/20 backdrop-blur">
              <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                <BellRing className="w-5 h-5 text-amber-900" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-100 font-bold uppercase tracking-wide">Llamar / confirmar pacientes</p>
                <p className="text-white font-semibold text-sm">
                  {colaRecordatorios.length} cita(s) requieren contacto
                  <span className="text-white/70 font-normal ml-1">
                    — confirme citas de mañana ({fmtFecha(mananaStr)}) hoy mismo
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Próxima cita */}
          {proximaCita && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/20 bg-white/10 backdrop-blur animate-pulse"
              style={{ animationDuration: '3s' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: BRAND.gold }}>
                <Zap className="w-5 h-5" style={{ color: BRAND.navy }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/60 font-medium uppercase tracking-wide">Próxima cita</p>
                <p className="text-white font-bold truncate">
                  {proximaCita.paciente?.nombre} {proximaCita.paciente?.apellido1}
                  <span className="text-white/70 font-normal ml-2">
                    {proximaCita.hora.slice(0, 5)} · {formatearCountdown(minutosHastaCita(proximaCita.fecha, proximaCita.hora, reloj))}
                  </span>
                </p>
              </div>
              <button onClick={() => setCitaVer(proximaCita)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition">
                Ver
              </button>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mt-5">
            {[
              { label: 'Semana', value: stats.total, accent: '#38bdf8' },
              { label: 'Pendientes', value: stats.activas, accent: BRAND.gold },
              { label: 'Asistieron', value: stats.asistio, accent: '#34d399' },
              { label: 'No asistió', value: stats.noAsistio, accent: '#94a3b8' },
              { label: 'Canceladas', value: stats.cancelado, accent: '#fb7185' },
            ].map(k => (
              <button key={k.label} onClick={() => setFiltroEstado(
                k.label === 'Pendientes' ? 'ACTIVO' :
                k.label === 'Asistieron' ? 'ASISTIÓ' :
                k.label === 'Canceladas' ? 'CANCELADO' :
                k.label === 'No asistió' ? 'NO ASISTIÓ' : 'todos'
              )}
                className="rounded-2xl p-3 bg-white/10 backdrop-blur border border-white/15 text-center hover:bg-white/20 transition group">
                <p className="text-2xl sm:text-3xl font-black text-white">{k.value}</p>
                <p className="text-[10px] sm:text-xs text-white/50 mt-0.5 group-hover:text-white/70">{k.label}</p>
                <div className="h-1 w-10 mx-auto mt-2 rounded-full opacity-80" style={{ backgroundColor: k.accent }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">

          {/* PRINCIPAL */}
          <div className="space-y-3">
            {/* Barra herramientas */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar paciente o servicio..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-sky-200 outline-none" />
              </div>
              {esSuperAdmin && (
                <select value={filtroSuc === 'todas' ? 'todas' : String(filtroSuc)}
                  onChange={e => {
                    const v = e.target.value === 'todas' ? 'todas' : Number(e.target.value)
                    setFiltroSuc(v)
                    cargarSemana(semanaBase, v)
                  }}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
                  <option value="todas">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
              <div className="flex items-center gap-1 flex-wrap">
                <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
                {['todos', 'ACTIVO', 'ASISTIÓ', 'ATENDIDO', 'CANCELADO', 'NO ASISTIÓ'].map(est => (
                  <button key={est} onClick={() => setFiltroEstado(est)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                      filtroEstado === est ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}>
                    {est === 'todos' ? 'Todos' : ESTADO_CFG[est]?.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              {/* Nav */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
                <button onClick={() => navSemana(-1)} className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition">
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div className="text-center">
                  {vistaActiva === 'lista' ? (
                    <p className="font-bold text-slate-800">{citasFiltradas.length} citas encontradas</p>
                  ) : vistaActiva === 'semana' ? (
                    <p className="font-bold text-slate-800">{fmtFecha(semanaBase)} — {fmtFecha(addDays(semanaBase, 6))}</p>
                  ) : (
                    <p className="font-bold text-slate-800 capitalize">{fmtFechaLarga(diaActivo)}</p>
                  )}
                  {loading && <span className="text-xs text-sky-500 ml-2">cargando...</span>}
                </div>
                <button onClick={() => navSemana(1)} className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition">
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              {/* VISTA SEMANA */}
              {vistaActiva === 'semana' && (
                <div className="overflow-x-auto">
                  <div className="min-w-[800px]">
                    <div className="grid grid-cols-8 border-b bg-slate-50/80">
                      <div className="py-3 text-[10px] text-slate-400 text-center font-bold uppercase tracking-wider">Hora</div>
                      {diasSemana.map((fecha, i) => {
                        const esHoy = fecha === fechaHoy
                        const cnt = (citasPorFecha[fecha] || []).length
                        const occ = ocupacionDia[fecha] ?? 0
                        return (
                          <div key={fecha} onClick={() => irADia(fecha)}
                            className={`py-3 px-1 text-center border-l cursor-pointer transition group ${esHoy ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                            <p className={`text-[10px] font-bold uppercase ${esHoy ? 'text-sky-600' : 'text-slate-400'}`}>{DIAS_CORTO[i]}</p>
                            <p className={`text-xl font-black ${esHoy ? 'text-sky-700' : 'text-slate-700'}`}>{fecha.split('-')[2]}</p>
                            {esHoy && <span className="text-[9px] font-black text-sky-500 uppercase">Hoy</span>}
                            <div className="mx-2 mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${occ}%`, backgroundColor: esHoy ? BRAND.navy : '#94a3b8' }} />
                            </div>
                            {cnt > 0 && <span className="text-[9px] font-bold text-slate-500 mt-0.5 block">{cnt} citas</span>}
                          </div>
                        )
                      })}
                    </div>

                    <div>
                      {HORAS.map(hora => (
                        <div key={hora} className="grid grid-cols-8 border-b min-h-[56px] hover:bg-slate-50/30 group/row">
                          <div className="py-2 text-[11px] text-slate-400 text-right pr-3 pt-3 border-r font-mono">{hora}</div>
                          {diasSemana.map(fecha => {
                            const franjas = (citasPorFecha[fecha] || []).filter(c => c.hora.slice(0, 2) === hora.slice(0, 2))
                            return (
                              <div key={fecha} className="border-l p-0.5 relative"
                                onClick={() => { if (!franjas.length) abrirNueva(fecha, hora) }}>
                                {franjas.map(c => <CitaPill key={c.id} cita={c} onClick={() => setCitaVer(c)} />)}
                                {!franjas.length && (
                                  <div className="h-full min-h-[48px] flex items-center justify-center opacity-0 group-hover/row:opacity-100">
                                    <Plus className="w-3 h-3 text-slate-300" />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* VISTA DÍA */}
              {vistaActiva === 'dia' && (
                <div ref={timelineRef} className="max-h-[600px] overflow-y-auto relative p-2">
                  {posicionAhora !== null && (
                    <div className="absolute left-16 right-4 z-10 pointer-events-none flex items-center"
                      style={{ top: posicionAhora + 8 }}>
                      <span className="text-[10px] font-bold text-red-500 w-12 text-right pr-2 -ml-16">
                        {reloj.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex-1 border-t-2 border-red-500 relative">
                        <span className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500 shadow-md shadow-red-300" />
                      </div>
                    </div>
                  )}
                  {HORAS.map(hora => {
                    const franjas = (citasPorFecha[diaActivo] || []).filter(c => c.hora.slice(0, 2) === hora.slice(0, 2))
                    return (
                      <div key={hora} className="flex gap-3 px-2 py-0.5 min-h-[56px] group/slot">
                        <div className="w-12 text-[11px] text-slate-400 text-right pt-4 font-mono font-medium flex-shrink-0">{hora}</div>
                        <div className="flex-1 border-l-2 border-slate-100 pl-4 py-1">
                          {!franjas.length ? (
                            <button onClick={() => abrirNueva(diaActivo, hora)}
                              className="mt-2 text-xs text-slate-300 hover:text-sky-500 opacity-0 group-hover/slot:opacity-100 transition flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Agendar
                            </button>
                          ) : franjas.map(c => <CitaCard key={c.id} cita={c} onClick={() => setCitaVer(c)} grande />)}
                        </div>
                      </div>
                    )
                  })}
                  {!citasPorFecha[diaActivo]?.length && (
                    <EmptyState onAgendar={() => abrirNueva(diaActivo)} />
                  )}
                </div>
              )}

              {/* VISTA LISTA */}
              {vistaActiva === 'lista' && (
                <div className="divide-y max-h-[650px] overflow-y-auto">
                  {citasFiltradas.length === 0 ? (
                    <EmptyState onAgendar={() => abrirNueva()} />
                  ) : citasFiltradas
                    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
                    .map(c => (
                      <div key={c.id} onClick={() => setCitaVer(c)}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-sky-50/50 cursor-pointer transition group">
                        <div className="text-center w-14 flex-shrink-0">
                          <p className="text-lg font-black text-slate-800">{c.fecha.split('-')[2]}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{MESES_CORTO[parseInt(c.fecha.split('-')[1]) - 1]}</p>
                        </div>
                        <div className="w-16 text-sm font-mono font-bold text-sky-600 flex-shrink-0">{c.hora.slice(0, 5)}</div>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${ESTADO_CFG[c.estado]?.dot ?? 'bg-slate-400'}`}>
                          {iniciales(c.paciente)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{c.paciente?.nombre} {c.paciente?.apellido1}</p>
                          {nombreServicio(c) && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                              <Stethoscope className="w-3 h-3" /> {nombreServicio(c)}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold hidden sm:inline ${ESTADO_CFG[c.estado]?.color} ${ESTADO_CFG[c.estado]?.bg}`}>
                          {ESTADO_CFG[c.estado]?.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition" />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
            {/* Cola de recordatorios */}
            {colaRecordatorios.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-amber-50">
                  <h2 className="font-black text-amber-900 flex items-center gap-2 text-sm">
                    <PhoneCall className="w-4 h-4" /> Llamar pacientes ({colaRecordatorios.length})
                  </h2>
                  <p className="text-[10px] text-amber-700 mt-0.5">Confirme citas de mañana hoy · hoy antes de la hora</p>
                </div>
                <div className="p-2 space-y-2 max-h-[320px] overflow-y-auto">
                  {colaRecordatorios.map(c => {
                    const esManana = c.fecha === mananaStr
                    const recEst = (c.recordatorio_estado ?? 'pendiente') as RecordatorioEstado
                    const recCfg = RECORDATORIO_CFG[recEst] ?? RECORDATORIO_CFG.pendiente
                    const wa = linkWhatsApp(c)
                    return (
                      <div key={c.id} className="p-2.5 rounded-xl border border-amber-100 bg-amber-50/30">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {c.paciente?.nombre} {c.paciente?.apellido1}
                            </p>
                            <p className="text-xs text-slate-600">
                              {esManana ? '📅 Mañana' : '📅 Hoy'} · {c.hora.slice(0, 5)}
                              {nombreServicio(c) && ` · ${nombreServicio(c)}`}
                            </p>
                            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${recCfg.badge}`}>
                              {recCfg.label}
                            </span>
                          </div>
                          <button onClick={() => setCitaVer(c)} className="text-[10px] text-sky-600 font-bold hover:underline">Ver</button>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {c.paciente?.celular && (
                            <a href={`tel:${c.paciente.celular}`} onClick={() => marcarRecordatorio(c.id, 'llamado')}
                              className="flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-sky-600 text-white text-[10px] font-bold hover:bg-sky-700">
                              <Phone className="w-3 h-3" /> Llamar
                            </a>
                          )}
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer"
                              onClick={() => marcarRecordatorio(c.id, 'whatsapp')}
                              className="flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600">
                              <MessageCircle className="w-3 h-3" /> WA
                            </a>
                          )}
                          <button onClick={() => marcarRecordatorio(c.id, 'confirmado')}
                            className="flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-bold hover:bg-green-700">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </button>
                          <button onClick={() => marcarRecordatorio(c.id, 'no_contacto')}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:bg-slate-50">
                            No contestó
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Mini calendario */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setMesCal(m => m.mes === 0 ? { anio: m.anio - 1, mes: 11 } : { ...m, mes: m.mes - 1 })}
                  className="p-1 rounded-lg hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
                <p className="font-bold text-sm text-slate-800">{MESES_CORTO[mesCal.mes]} {mesCal.anio}</p>
                <button onClick={() => setMesCal(m => m.mes === 11 ? { anio: m.anio + 1, mes: 0 } : { ...m, mes: m.mes + 1 })}
                  className="p-1 rounded-lg hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {DIAS_CORTO.map(d => <span key={d} className="text-[9px] font-bold text-slate-400">{d.charAt(0)}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {celdasMes(mesCal.anio, mesCal.mes).map((dia, i) => {
                  if (!dia) return <div key={`e-${i}`} />
                  const fecha = fechaDesdeCelda(mesCal.anio, mesCal.mes, dia)
                  const esHoy = fecha === fechaHoy
                  const activo = fecha === diaActivo
                  const tiene = diasConCitasMes.has(dia)
                  return (
                    <button key={fecha} onClick={() => irADia(fecha)}
                      className={`aspect-square rounded-lg text-xs font-semibold relative transition ${
                        activo ? 'text-white shadow-md' :
                        esHoy ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-300' :
                        'text-slate-600 hover:bg-slate-100'
                      }`}
                      style={activo ? { backgroundColor: BRAND.navy } : undefined}>
                      {dia}
                      {tiene && !activo && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-500" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Hoy */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden sticky top-4">
              <div className="px-4 py-3 border-b" style={{ background: `linear-gradient(90deg, ${BRAND.navy}12, transparent)` }}>
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" style={{ color: BRAND.navy }} /> Hoy · {citasHoy.length} pendientes
                </h2>
              </div>
              <div className="p-2 space-y-1.5 max-h-[280px] overflow-y-auto">
                {citasHoy.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Sin citas activas</p>
                ) : citasHoy.map(c => {
                  const mins = minutosHastaCita(c.fecha, c.hora, reloj)
                  const urgente = mins >= 0 && mins <= 30
                  return (
                    <button key={c.id} onClick={() => setCitaVer(c)}
                      className={`w-full text-left p-2.5 rounded-xl border transition ${
                        urgente ? 'border-amber-300 bg-amber-50/80' : 'border-slate-100 hover:border-sky-200 hover:bg-sky-50/50'
                      }`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: BRAND.navy }}>{iniciales(c.paciente)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.paciente?.nombre} {c.paciente?.apellido1}</p>
                          <p className="text-xs text-sky-600 font-semibold">{c.hora.slice(0, 5)} · {formatearCountdown(mins)}</p>
                        </div>
                        {urgente && <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="p-2 border-t">
                <button onClick={() => abrirNueva(fechaHoy)}
                  className="w-full py-2 rounded-xl text-xs font-bold border-2 border-dashed border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600 transition flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar hoy
                </button>
              </div>
            </div>

            {/* Catálogo */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" /> Catálogo · {servicios.length}
              </h3>
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {tiposOrdenados.slice(0, 5).map(tipo => (
                  <div key={tipo}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{tipo}</p>
                    <div className="flex flex-wrap gap-1">
                      {serviciosPorTipo[tipo].slice(0, 2).map(s => (
                        <span key={s.id} className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${TIPO_BADGE[tipo] ?? TIPO_BADGE.General}`}>
                          {s.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL FORM */}
      {modal && (
        <ResponsiveModal
          title={citaEdit ? 'Editar Cita' : 'Nueva Cita'}
          subtitle="Paciente + servicio del catálogo"
          onClose={() => setModal(false)}
          footer={
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button onClick={() => setModal(false)}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium min-h-[48px] sm:min-h-0">
                Cancelar
              </button>
              <button onClick={guardarCita} disabled={guardando}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-md min-h-[48px] sm:min-h-0"
                style={{ backgroundColor: BRAND.navy }}>
                <Save className="w-4 h-4" />
                {guardando ? 'Guardando...' : citaEdit ? 'Actualizar' : 'Agendar'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <PacientePicker pacSelec={pacSelec} setPacSelec={setPacSelec} busqPac={busqPac} setBusqPac={setBusqPac} pacsFilt={pacsFilt} />

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                <Stethoscope className="w-4 h-4 inline mr-1 text-slate-400" /> Servicio
              </label>
              <select value={form.servicio_id} onChange={e => onServicioChange(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none">
                <option value="">— Sin servicio —</option>
                {tiposOrdenados.map(tipo => (
                  <optgroup key={tipo} label={tipo}>
                    {serviciosPorTipo[tipo].map(s => (
                      <option key={s.id} value={s.id}>{s.nombre} — {fmtPrecio(s.precio)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {servicioSeleccionado && (
                <div className="mt-2 flex gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${TIPO_BADGE[servicioSeleccionado.tipo] ?? TIPO_BADGE.General}`}>
                    {servicioSeleccionado.tipo}
                  </span>
                  <span className="text-xs font-bold text-slate-600">{fmtPrecio(servicioSeleccionado.precio)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Fecha" required>
                <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                  className={inputCls} />
              </Field>
              <Field label="Hora" required>
                <input type="time" value={form.hora} onChange={e => setForm(p => ({ ...p, hora: e.target.value }))}
                  className={inputCls} />
              </Field>
            </div>

            {conflictoForm && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> Ya hay una cita activa a esta hora
              </div>
            )}

            <Field label="Sucursal" icon={Building2}>
              <select value={form.sucursal_id} onChange={e => setForm(p => ({ ...p, sucursal_id: e.target.value }))} className={inputCls}>
                <option value="">— Seleccionar —</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Field>

            <Field label="Nota adicional">
              <textarea rows={2} value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))}
                placeholder="Recordatorio, preparación..." className={`${inputCls} resize-none`} />
            </Field>

            {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-4 py-2 rounded-xl">{error}</p>}
          </div>
        </ResponsiveModal>
      )}

      {/* MODAL DETALLE */}
      {citaVer && (
        <CitaDetalleModal
          cita={citaVer}
          fechaHoy={fechaHoy}
          reloj={reloj}
          onClose={() => setCitaVer(null)}
          onCambiarEstado={cambiarEstado}
          onMarcarRecordatorio={marcarRecordatorio}
          onEliminar={() => eliminarCita(citaVer.id)}
          onReprogramar={() => abrirEditar(citaVer)}
        />
      )}
    </div>
  )
}

/* ── Sub-componentes ── */
const inputCls = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none'

function CitaPill({ cita, onClick }: { cita: Cita; onClick: () => void }) {
  const cfg = ESTADO_CFG[cita.estado] || ESTADO_CFG['ACTIVO']
  return (
    <div onClick={e => { e.stopPropagation(); onClick() }}
      className={`text-[10px] rounded-lg pl-1 pr-1.5 py-1 mb-0.5 ring-1 cursor-pointer hover:shadow-md transition border-l-[3px] ${cfg.bg} ${cfg.ring} ${cfg.border}`}>
      <span className={`font-black ${cfg.color}`}>{cita.hora.slice(0, 5)}</span>
      <span className={`font-semibold truncate block ${cfg.color}`}>
        {cita.paciente?.nombre} {cita.paciente?.apellido1?.charAt(0)}.
      </span>
      {nombreServicio(cita) && (
        <span className="text-slate-500 truncate block text-[9px]">{nombreServicio(cita)}</span>
      )}
    </div>
  )
}

function CitaCard({ cita, onClick, grande }: { cita: Cita; onClick: () => void; grande?: boolean }) {
  const cfg = ESTADO_CFG[cita.estado] || ESTADO_CFG['ACTIVO']
  const tipo = tipoServicio(cita)
  return (
    <div onClick={onClick}
      className={`flex items-start gap-3 rounded-xl ring-1 mb-2 cursor-pointer hover:shadow-lg transition border-l-4 ${cfg.bg} ${cfg.ring} ${cfg.border} ${grande ? 'p-4' : 'p-3'}`}>
      <div className={`rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${cfg.dot} ${grande ? 'w-11 h-11' : 'w-9 h-9'}`}>
        {iniciales(cita.paciente)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-sm text-slate-900">
            {cita.hora.slice(0, 5)} — {cita.paciente?.nombre} {cita.paciente?.apellido1}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cfg.color} bg-white/70`}>{cfg.label}</span>
        </div>
        {nombreServicio(cita) && (
          <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
            <Stethoscope className="w-3 h-3" /> {nombreServicio(cita)}
            {tipo && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${TIPO_BADGE[tipo]}`}>{tipo}</span>}
          </p>
        )}
        {cita.paciente?.celular && (
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" /> {cita.paciente.celular}</p>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onAgendar }: { onAgendar: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <Calendar className="w-8 h-8 text-slate-300" />
      </div>
      <p className="text-slate-500 font-semibold">Sin citas</p>
      <button onClick={onAgendar} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md"
        style={{ backgroundColor: BRAND.navy }}>
        <Plus className="w-4 h-4 inline mr-1" /> Agendar
      </button>
    </div>
  )
}

function PacientePicker({ pacSelec, setPacSelec, busqPac, setBusqPac, pacsFilt }: {
  pacSelec: Paciente | null; setPacSelec: (p: Paciente | null) => void
  busqPac: string; setBusqPac: (s: string) => void; pacsFilt: Paciente[]
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">Paciente <span className="text-rose-500">*</span></label>
      {pacSelec ? (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 border-2 border-sky-200 bg-sky-50/50">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ backgroundColor: BRAND.navy }}>
            {iniciales(pacSelec)}
          </div>
          <div className="flex-1">
            <p className="font-bold">{pacSelec.nombre} {pacSelec.apellido1}</p>
            <p className="text-xs text-slate-500">{pacSelec.codigo} · {calcEdad(pacSelec.fecha_nac)}</p>
          </div>
          <button onClick={() => { setPacSelec(null); setBusqPac('') }} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className={`${inputCls} pl-10`} placeholder="Nombre, código o teléfono..." value={busqPac}
            onChange={e => setBusqPac(e.target.value)} autoFocus />
          {pacsFilt.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border-2 rounded-xl shadow-2xl z-20 mt-1 max-h-52 overflow-y-auto">
              {pacsFilt.map(p => (
                <button key={p.id} type="button" onClick={() => { setPacSelec(p); setBusqPac(`${p.nombre} ${p.apellido1}`) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-sky-50 flex items-center gap-3 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: BRAND.navyMid }}>
                    {iniciales(p)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{p.nombre} {p.apellido1}</p>
                    <p className="text-xs text-slate-400">{p.codigo}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, required, icon: Icon, children }: {
  label: string; required?: boolean; icon?: React.ElementType; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">
        {Icon && <Icon className="w-4 h-4 inline mr-1 text-slate-400" />}
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 sm:p-4 border border-sky-100 bg-sky-50/50 min-w-0">
      <p className="text-[10px] text-sky-600 font-black uppercase tracking-wide">{label}</p>
      <p className="font-black text-slate-900 text-sm sm:text-base break-words">{value}</p>
    </div>
  )
}

const actionBtn = 'flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition min-h-[48px] sm:min-h-[44px] w-full'

function CitaDetalleModal({ cita, fechaHoy, reloj, onClose, onCambiarEstado, onMarcarRecordatorio, onEliminar, onReprogramar }: {
  cita: Cita
  fechaHoy: string
  reloj: Date
  onClose: () => void
  onCambiarEstado: (id: number, estado: string) => void
  onMarcarRecordatorio: (id: number, estado: RecordatorioEstado) => void
  onEliminar: () => void
  onReprogramar: () => void
}) {
  const wa = linkWhatsApp(cita)
  const cfgEstado = ESTADO_CFG[cita.estado] || ESTADO_CFG['ACTIVO']
  const IconEstado = cfgEstado.icon

  return (
    <ResponsiveModal
      title="Detalle de Cita"
      subtitle={`${fmtFecha(cita.fecha)} · ${cita.hora.slice(0, 5)}`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {cita.paciente?.celular ? (
              <a href={`tel:${cita.paciente.celular}`}
                onClick={() => onMarcarRecordatorio(cita.id, 'llamado')}
                className={`${actionBtn} text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800`}>
                <PhoneCall className="w-4 h-4 flex-shrink-0" />
                <span>Llamar</span>
              </a>
            ) : (
              <div className={`${actionBtn} bg-slate-100 text-slate-400 cursor-not-allowed`}>
                <PhoneCall className="w-4 h-4" /> Sin teléfono
              </div>
            )}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer"
                onClick={() => onMarcarRecordatorio(cita.id, 'whatsapp')}
                className={`${actionBtn} text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700`}>
                <MessageCircle className="w-4 h-4 flex-shrink-0" />
                <span>WhatsApp</span>
              </a>
            ) : (
              <div className={`${actionBtn} bg-slate-100 text-slate-400 cursor-not-allowed`}>
                <MessageCircle className="w-4 h-4" /> Sin WhatsApp
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onReprogramar}
              className={`${actionBtn} text-white`}
              style={{ backgroundColor: BRAND.navy }}>
              <Edit2 className="w-4 h-4 flex-shrink-0" />
              <span>Reprogramar</span>
            </button>
            <button type="button" onClick={onEliminar}
              className={`${actionBtn} border-2 border-rose-200 text-rose-600 bg-white hover:bg-rose-50 active:bg-rose-100`}>
              <Trash2 className="w-4 h-4 flex-shrink-0" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pb-1">
        {/* Paciente */}
        <div className="rounded-2xl p-3 sm:p-4 border border-slate-100 min-w-0"
          style={{ background: `linear-gradient(135deg, ${BRAND.navy}08, transparent)` }}>
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:block">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-base sm:text-lg font-black text-white shadow-md flex-shrink-0"
                style={{ backgroundColor: BRAND.navy }}>
                {iniciales(cita.paciente)}
              </div>
              <div className="sm:hidden min-w-0 flex-1">
                <p className="font-black text-slate-900 text-base leading-snug break-words">
                  {cita.paciente?.nombre} {cita.paciente?.apellido1}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{cita.paciente?.codigo}</p>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="hidden sm:block font-black text-slate-900 text-lg leading-snug break-words">
                {cita.paciente?.nombre} {cita.paciente?.apellido1} {cita.paciente?.apellido2 ?? ''}
              </p>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
                {cita.paciente?.codigo} · {calcEdad(cita.paciente?.fecha_nac)}
              </p>
              {cita.paciente?.celular && (
                <a href={`tel:${cita.paciente.celular}`}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-600 font-semibold mt-2 py-1 min-h-[44px] hover:underline active:text-sky-800">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <span className="break-all">{cita.paciente.celular}</span>
                </a>
              )}
            </div>
            <span className={`self-start flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfgEstado.bg} ${cfgEstado.color} ring-1 ${cfgEstado.ring}`}>
              <IconEstado className="w-3 h-3" /> {cfgEstado.label}
            </span>
          </div>
        </div>

        {/* Fecha / Hora */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <InfoBox label="Fecha" value={fmtFecha(cita.fecha)} />
          <InfoBox label="Hora" value={cita.hora.slice(0, 5)} />
        </div>

        {/* Servicio */}
        {nombreServicio(cita) && (
          <div className="rounded-xl p-3 sm:p-4 border border-violet-100 bg-violet-50/50 min-w-0">
            <p className="text-[10px] text-violet-600 font-black uppercase tracking-wide mb-1">Servicio</p>
            <p className="font-bold text-slate-900 text-sm sm:text-base break-words">{nombreServicio(cita)}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {tipoServicio(cita) && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${TIPO_BADGE[tipoServicio(cita)!] ?? TIPO_BADGE.General}`}>
                  {tipoServicio(cita)}
                </span>
              )}
              {cita.servicio?.precio != null && (
                <span className="text-sm font-bold text-slate-700">{fmtPrecio(cita.servicio.precio)}</span>
              )}
            </div>
          </div>
        )}

        {/* Nota */}
        {cita.nota && (
          <div className="rounded-xl p-3 sm:p-4 border border-amber-100 bg-amber-50/50 min-w-0">
            <p className="text-[10px] text-amber-600 font-black uppercase mb-1">Nota</p>
            <p className="text-sm text-slate-800 break-words whitespace-pre-wrap">{cita.nota}</p>
          </div>
        )}

        {/* Recordatorio */}
        {cita.estado === 'ACTIVO' && (
          <div className="rounded-xl p-3 sm:p-4 border border-amber-200 bg-amber-50/60 min-w-0">
            <p className="text-xs text-amber-800 font-bold mb-2 flex items-center gap-1.5">
              <BellRing className="w-4 h-4 flex-shrink-0" /> Recordatorio al paciente
            </p>
            {necesitaRecordatorio(cita, fechaHoy, reloj) && (
              <p className="text-xs text-amber-900 font-semibold mb-3 p-2 rounded-lg bg-amber-100/80 leading-relaxed">
                Esta cita necesita confirmación. Use Llamar o WhatsApp abajo.
              </p>
            )}
            <div className="modal-chip-scroll sm:flex-wrap sm:overflow-visible">
              {(['pendiente', 'llamado', 'whatsapp', 'confirmado', 'no_contacto'] as RecordatorioEstado[]).map(est => {
                const cfg = RECORDATORIO_CFG[est]
                const activo = (cita.recordatorio_estado ?? 'pendiente') === est
                return (
                  <button key={est} type="button" onClick={() => onMarcarRecordatorio(cita.id, est)}
                    className={`flex-shrink-0 text-xs px-3 py-2 rounded-full font-bold border-2 transition min-h-[40px] ${
                      activo ? `${cfg.badge} border-current shadow-sm` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            {cita.recordatorio_at && (
              <p className="text-[11px] text-slate-500 mt-2">
                Último contacto: {new Date(cita.recordatorio_at).toLocaleString('es-HN')}
              </p>
            )}
          </div>
        )}

        {/* Cambiar estado */}
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700 mb-2">Cambiar estado</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(ESTADO_CFG).map(([key, cfg]) => {
              const Icon = cfg.icon
              const activo = cita.estado === key
              return (
                <button key={key} type="button" onClick={() => onCambiarEstado(cita.id, key)}
                  className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 py-3 sm:py-2.5 rounded-xl border-2 text-xs font-bold transition min-h-[48px] ${
                    activo ? `${cfg.bg} ${cfg.color} border-current shadow-sm` : 'border-slate-100 text-slate-500 bg-white hover:bg-slate-50 active:bg-slate-100'
                  }`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{cfg.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  )
}
