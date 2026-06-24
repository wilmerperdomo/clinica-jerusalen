'use client'

import { useState, useTransition, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  Calendar, Clock, Stethoscope, Plus, Search,
  CheckCircle2, XCircle, AlertCircle, ClipboardList,
  ChevronRight, Activity, Save, RefreshCw, Pill, Trash2, Printer,
  Wrench, FlaskConical, Sparkles, CalendarDays, FileText,
  ExternalLink, Minus, History, Wallet, Users, ArrowLeftRight, Loader2,
} from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'
import ResponsiveModal from '@/components/responsive-modal'
import BuscarPacienteInput from '@/components/buscar-paciente-input'
import ConsultaDocumentosPanel from '@/components/consulta-documentos-panel'
import ConsultaHistorialPanel from '@/components/consulta-historial-panel'
import { PacientePlanBadge, PacientePlanBanner } from '@/components/paciente-plan-badge'
import { BRAND } from '@/lib/brand'
import { precioLabLista, type MembresiasMap } from '@/lib/membresia-utils'
import {
  PACIENTE_CONSULTA_SELECT, estadoBadgeClase, etiquetaEstadoConsulta,
  tiempoEspera, colorLabClase, validarExamenMedico, fmtFechaLarga,
  nombrePaciente, detallePaciente, textoBusquedaPaciente, esPacienteEmpresa,
  esRolEnfermeria, filtroSucursalColaConsultas, puedeAtenderConsulta,
  type PacienteConsulta,
} from '@/lib/consultas-utils'
import {
  columnaConsultaDetalle,
  filasInsertConsultaDetalle,
  normalizarConsultaDetalle,
  valorConsultaDetalle,
} from '@/lib/consulta-detalle-utils'
import { imprimirRecetaMedica, edadPacientePrint } from '@/lib/consulta-documentos-print'
import { formatearNombreMedico } from '@/lib/medico-utils'

/* ─── tipos locales ─────────────────────────────────────── */
type Paciente = PacienteConsulta & { id: number; codigo: string }
interface SucursalOpt { id: number; nombre: string }

interface Cita {
  id: number; paciente_id: number; fecha: string; hora: string
  nota?: string; estado: string; paciente?: Paciente
  sucursal_id?: number | null
  servicio_id?: number | null
  servicio_nombre?: string | null
  servicio?: Servicio | null
}
interface Consulta {
  id: number; paciente_id: number; tipo_nombre?: string
  sucursal_id?: number | null
  fecha: string; hora: string; estado: string
  presion?: string; temperatura?: string; peso?: string
  sintoma?: string; impresion?: string; tratamiento?: string; dias_reposo?: number
  paciente?: Paciente & { codigo?: string }; tipo?: { nombre: string }
  consulta_valor?: number
  consulta_otros?: number
  consulta_nota?: string
  estado_pago?: string
  cobrado?: boolean
}
interface Producto { id: number; codigo: string; nombre: string; tipo?: string }
interface Servicio  { id: number; nombre: string; tipo: string; precio: number }
interface Prueba    { id: number; nombre: string; costo: number; color?: string; dias?: number }
interface LabItem   { id?: number; prueba_id: number; no_analisis: string; valor: number; cant: number; importe: number; bloqueado?: boolean }
interface ServicioItem {
  servicio_id?: number
  nombre: string
  precio: number
  cantidad: number
}
interface RecetaItem {
  id?: number
  producto_id?: number
  no_producto: string
  indicacion: string
  cant: number
  via: string
}

function esServicioConsulta(s: { tipo?: string }) {
  return (s.tipo ?? '').toLowerCase().trim() === 'consulta'
}

interface Props {
  citasHoy: Cita[]
  consultasEspera: Consulta[]
  consultasPagadas?: Consulta[]
  pacientes: Paciente[]
  productos: Producto[]
  servicios: Servicio[]
  pruebas: Prueba[]
  fechaHoy: string
  sucursalId?: number | null
  sucursalNombre?: string
  sucursales?: SucursalOpt[]
  esSuperAdmin?: boolean
  esAdmin?: boolean
  rolUsuario?: string
  rolId?: number | null
  rolIdsMedico?: number[]
  puedeAtenderConsulta?: boolean
  puedeCrearConsulta?: boolean
  rolesUsuario?: string[]
  membresiasMap?: MembresiasMap
  listasMap?: Record<number, string>
  labPreciosLista?: Record<number, Record<number, number>>
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/* ─── componente principal ──────────────────────────────── */
export default function ConsultasClient({
  citasHoy: initialCitas,
  consultasEspera: initialEspera,
  consultasPagadas = [],
  pacientes,
  productos,
  servicios,
  pruebas,
  fechaHoy,
  sucursalId,
  sucursalNombre,
  sucursales = [],
  esSuperAdmin = false,
  esAdmin = false,
  rolUsuario = '',
  rolId = null,
  rolIdsMedico = [],
  puedeAtenderConsulta: puedeAtenderInicial = false,
  puedeCrearConsulta = false,
  rolesUsuario = [],
  membresiasMap = {},
  listasMap = {},
  labPreciosLista = {},
}: Props) {
  const confirmDialog = useConfirm()
  const rolesActivos = rolesUsuario.length > 0 ? rolesUsuario : (rolUsuario ? [rolUsuario] : [])
  const puedeAtender =
    puedeAtenderInicial ||
    esSuperAdmin ||
    esAdmin ||
    rolesActivos.some(nombre => puedeAtenderConsulta(nombre, { rolIdsMedico })) ||
    (rolId != null && rolIdsMedico.includes(rolId))
  const esEnfermeria = esRolEnfermeria(rolUsuario)
  const [fechaOperativa, setFechaOperativa] = useState(fechaHoy)
  const [tab, setTab] = useState<'citas' | 'espera'>(() => {
    const hayCola = initialEspera.some(c => c.estado === 'SIGNOS' || c.estado === 'ATENDIENDO')
    return puedeAtender || hayCola ? 'espera' : 'citas'
  })
  const [citas, setCitas]       = useState<Cita[]>(initialCitas)
  const [espera, setEspera]     = useState<Consulta[]>(initialEspera)
  const [pagadas, setPagadas]   = useState<Consulta[]>(consultasPagadas)
  const [busqueda, setBusqueda] = useState('')
  const [filtroSuc, setFiltroSuc] = useState<number | 'todas'>(sucursalId ?? 'todas')
  const [isPending, startTransition] = useTransition()

  const sucursalOperativa = useMemo((): number | null => {
    if (esSuperAdmin) {
      if (filtroSuc !== 'todas') return filtroSuc
      return sucursalId ?? sucursales[0]?.id ?? null
    }
    return sucursalId ?? null
  }, [esSuperAdmin, filtroSuc, sucursalId, sucursales])

  const nombreSucursalVista = useMemo(() => {
    if (!esSuperAdmin) return sucursalNombre ?? 'Consultas médicas'
    if (filtroSuc === 'todas') return 'Todas las sucursales'
    return sucursales.find(s => s.id === filtroSuc)?.nombre ?? sucursalNombre ?? 'Sucursal'
  }, [esSuperAdmin, filtroSuc, sucursales, sucursalNombre])

  const mapaSucursales = useMemo(
    () => Object.fromEntries(sucursales.map(s => [s.id, s.nombre])),
    [sucursales],
  )

  /* modales */
  const [modalCita,     setModalCita]     = useState(false)
  const [modalConsulta, setModalConsulta] = useState(false)
  const [modalSignos,   setModalSignos]   = useState(false)
  const [modalMedico,   setModalMedico]   = useState(false)
  const [modalDocs,     setModalDocs]     = useState(false)
  const [citaActual,    setCitaActual]    = useState<Cita | null>(null)
  const [consultaActual,setConsultaActual]= useState<Consulta | null>(null)

  /* forms */
  const [formCita, setFormCita] = useState({
    paciente_id: '', fecha: fechaHoy, hora: '', nota: '',
    sucursal_id: String(sucursalId ?? ''),
  })
  const [formConsulta, setFormConsulta] = useState({
    paciente_id: '', servicio_id: '', fecha: fechaHoy, hora: '',
    sucursal_id: String(sucursalId ?? ''),
  })

  /** Tipos de consulta = servicios del catálogo con categoría "Consulta" */
  const serviciosConsulta = useMemo(
    () => servicios.filter(esServicioConsulta).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [servicios],
  )
  const [formSignos, setFormSignos] = useState({
    presion: '', frecuencia: '', pulso: '', temperatura: '',
    peso: '', talla: '', perim_cefalico: '',
  })
  const [formMedico, setFormMedico] = useState({
    cabeza: 'NL', cuello: 'NL', ojos: 'NL', orl: 'NL',
    pulmonar: 'NL', abdomen: 'NL', genito: 'NL', extremidades: 'NL',
    sistema: 'NL', oste: 'NL', piel: 'NL',
    sintoma: '', historia: '', impresion: '', tratamiento: '',
    estudios_complementarios: '', dias_reposo: '0', nota: '',
  })

  /* ── Estado receta / medicamentos ── */
  const [recetaItems,  setRecetaItems]  = useState<RecetaItem[]>([])
  const [buscarMed,    setBuscarMed]    = useState('')
  const [medForm,      setMedForm]      = useState<RecetaItem>({
    no_producto: '', indicacion: '', cant: 1, via: 'Oral',
  })

  /* ── Estado servicios durante consulta ── */
  const [servicioItems, setServicioItems] = useState<ServicioItem[]>([])
  const [buscarServ,    setBuscarServ]    = useState('')

  /* ── Estado laboratorio durante consulta ── */
  const [labItems,   setLabItems]   = useState<LabItem[]>([])
  const [buscarLab,  setBuscarLab]  = useState('')

  /* ── Valores de cobro (editables como sistema viejo) ── */
  const [valorConsultaEdit, setValorConsultaEdit] = useState('0')
  const [consultaNotaCobro,  setConsultaNotaCobro]  = useState('')
  const [ultimoAutoguardado, setUltimoAutoguardado] = useState<Date | null>(null)
  const [guardandoBorrador,  setGuardandoBorrador]  = useState(false)
  const [cambiandoConsulta,  setCambiandoConsulta]  = useState(false)
  const [medicoNombre, setMedicoNombre] = useState('')

  const sb = supabase()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await sb.from('perfiles').select('nombre,apellido,genero')
        .eq('id', user.id).maybeSingle()
      if (p) setMedicoNombre(formatearNombreMedico(p.nombre, p.apellido, p.genero))
    })
  }, [sb])

  useEffect(() => {
    startTransition(() => { recargar() })
  }, [fechaOperativa, filtroSuc]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── recargar citas ─ */
  const recargar = useCallback(async () => {
    let cq = sb.from('citas').select(`*,paciente:pacientes(${PACIENTE_CONSULTA_SELECT}),servicio:servicios(id,nombre,tipo,precio)`)
      .eq('fecha', fechaOperativa).order('hora')
    let eq = sb.from('consultas').select(`*,paciente:pacientes(${PACIENTE_CONSULTA_SELECT}),tipo:consulta_tipo(nombre)`)
      .eq('fecha', fechaOperativa).in('estado', ['SIGNOS', 'ATENDIENDO', 'REGISTRO']).order('hora')
    let pq = sb.from('consultas').select(`*,paciente:pacientes(${PACIENTE_CONSULTA_SELECT}),tipo:consulta_tipo(nombre)`)
      .eq('fecha', fechaOperativa).eq('estado', 'FINALIZADO').or('cobrado.eq.true,estado_pago.eq.PAGADO').order('hora')
    const sid = esSuperAdmin
      ? (filtroSuc !== 'todas' ? filtroSuc : null)
      : sucursalId
    if (sid) {
      cq = cq.eq('sucursal_id', sid)
      eq = filtroSucursalColaConsultas(eq, sid, puedeAtender)
      pq = pq.eq('sucursal_id', sid)
    }
    const [{ data: c }, { data: e }, { data: p }] = await Promise.all([cq, eq, pq])
    if (c) setCitas(c)
    if (e) setEspera(e)
    if (p) setPagadas(p)
  }, [sb, fechaOperativa, esSuperAdmin, sucursalId, filtroSuc, puedeAtender])

  /* ── nueva cita ── */
  async function guardarCita() {
    if (!formCita.paciente_id || !formCita.hora) return
    if (esSuperAdmin && !formCita.sucursal_id) {
      alert('Seleccione la sucursal de la cita.')
      return
    }
    const { data: dup } = await sb.from('citas')
      .select('id')
      .eq('paciente_id', Number(formCita.paciente_id))
      .eq('fecha', formCita.fecha)
      .not('estado', 'in', '("CANCELADO","NO ASISTIÓ","NO ASISTIO")')
      .maybeSingle()
    if (dup) {
      alert('Este paciente ya tiene una cita activa en esa fecha.')
      return
    }
    const { error } = await sb.from('citas').insert({
      paciente_id: Number(formCita.paciente_id),
      fecha: formCita.fecha, hora: formCita.hora,
      nota: formCita.nota, estado: 'ACTIVO',
      sucursal_id: esSuperAdmin && formCita.sucursal_id
        ? Number(formCita.sucursal_id)
        : sucursalOperativa,
    })
    if (error) return alert('Error al guardar cita: ' + error.message)
    setModalCita(false)
    setFormCita({ paciente_id: '', fecha: fechaHoy, hora: '', nota: '', sucursal_id: String(sucursalOperativa ?? '') })
    startTransition(() => { recargar() })
  }

  /* ── cambiar estado cita ── */
  async function cambiarEstadoCita(id: number, estado: string) {
    if (['CANCELADO', 'NO ASISTIÓ', 'NO ASISTIO'].includes(estado)) {
      const { confirmed } = await confirmDialog({
        title: estado === 'CANCELADO' ? 'Cancelar cita' : 'Marcar no asistió',
        message: estado === 'CANCELADO'
          ? '¿Está seguro que desea cancelar esta cita?'
          : '¿Está seguro que desea marcar esta cita como "No asistió"?',
        variant: 'warning',
        confirmLabel: 'Sí, confirmar',
      })
      if (!confirmed) return
    }
    const { error } = await sb.from('citas').update({ estado }).eq('id', id)
    if (error) return alert('Error al actualizar cita: ' + error.message)
    startTransition(() => { recargar() })
  }

  /* ── abrir consulta desde cita ── */
  function resolverServicioConsulta(servicioId: string, cita?: Cita) {
    if (servicioId) {
      const s = serviciosConsulta.find(x => x.id === Number(servicioId))
      if (s) return s
    }
    if (cita?.servicio && esServicioConsulta(cita.servicio)) return cita.servicio
    if (cita?.servicio_id) {
      const s = servicios.find(x => x.id === cita.servicio_id)
      if (s && esServicioConsulta(s)) return s
    }
    return serviciosConsulta[0] ?? null
  }

  async function abrirConsultaDesdeCita(cita: Cita, servicioId: string) {
    const servicio = resolverServicioConsulta(servicioId, cita)
    const tipoNombre = servicio?.nombre || cita.servicio_nombre || 'Consulta General'

    // Ver si ya existe una consulta abierta para este paciente hoy
    const { data: exists } = await sb.from('consultas')
      .select('id, paciente_id, estado')
      .eq('paciente_id', cita.paciente_id)
      .eq('fecha', fechaOperativa)
      .in('estado', ['REGISTRO', 'SIGNOS', 'ATENDIENDO'])
      .maybeSingle()

    if (exists) {
      if (puedeAtender && (exists.estado === 'SIGNOS' || exists.estado === 'ATENDIENDO')) {
        setTab('espera')
        await confirmarAtendiendo(exists.id)
        return
      }
      if (puedeAtender && exists.estado === 'REGISTRO') {
        setTab('espera')
        await confirmarAtendiendo(exists.id)
        return
      }
      setConsultaActual({ ...exists } as Consulta)
      setModalSignos(true)
      return
    }

    const tipoValor = servicio?.precio ?? 0

    const payload: Record<string, unknown> = {
      paciente_id:  cita.paciente_id,
      tipo_nombre:  tipoNombre,
      fecha:        fechaOperativa,
      hora:         new Date().toTimeString().slice(0, 8),
      estado:       'REGISTRO',
      estado_pago:  'PENDIENTE',
    }
    const sidCita = sucursalOperativa ?? sucursales[0]?.id ?? sucursalId
    if (sidCita) payload.sucursal_id = sidCita

    let insertData = null
    try {
      payload.consulta_valor = tipoValor
      const { data, error } = await sb.from('consultas').insert(payload).select().single()
      if (error) throw error
      insertData = data
    } catch {
      delete payload.consulta_valor
      const { data, error } = await sb.from('consultas').insert(payload).select().single()
      if (error) { alert('Error: ' + error.message); return }
      insertData = data
    }

    if (insertData) {
      setConsultaActual(insertData)
      setTab('espera')
      if (puedeAtender) {
        await confirmarAtendiendo(insertData.id)
      } else {
        setModalSignos(true)
      }
    }
    await sb.from('citas').update({ estado: 'ASISTIÓ' }).eq('id', cita.id)
    startTransition(() => { recargar() })
  }

  /* ── nueva consulta directa ── */
  async function crearConsulta() {
    if (!puedeCrearConsulta) {
      alert('No tienes permiso para crear consultas. Solicítalo al administrador.')
      return
    }
    if (!formConsulta.paciente_id) return
    if (!formConsulta.servicio_id) {
      alert('Seleccione el tipo de consulta del catálogo de servicios.')
      return
    }
    const sid = esSuperAdmin && formConsulta.sucursal_id
      ? Number(formConsulta.sucursal_id)
      : sucursalOperativa
    if (esSuperAdmin && !sid) {
      alert('Seleccione la sucursal donde se atiende la consulta.')
      return
    }
    const servicio  = serviciosConsulta.find(s => s.id === Number(formConsulta.servicio_id))
    const tipoValor = servicio?.precio ?? 0

    const payload: Record<string, unknown> = {
      paciente_id:  Number(formConsulta.paciente_id),
      tipo_nombre:  servicio?.nombre || 'Consulta General',
      fecha:        formConsulta.fecha,
      hora:         formConsulta.hora || new Date().toTimeString().slice(0, 8),
      estado:       'REGISTRO',
      estado_pago:  'PENDIENTE',
    }
    const sidFinal = sid ?? sucursales[0]?.id ?? sucursalId
    if (sidFinal) payload.sucursal_id = sidFinal

    const { data: dup } = await sb.from('consultas')
      .select('id')
      .eq('paciente_id', Number(formConsulta.paciente_id))
      .eq('fecha', formConsulta.fecha)
      .in('estado', ['REGISTRO', 'SIGNOS', 'ATENDIENDO'])
      .maybeSingle()
    if (dup) {
      alert('Este paciente ya tiene una consulta abierta hoy.')
      return
    }

    try {
      payload.consulta_valor = tipoValor
      const { data, error } = await sb.from('consultas').insert(payload).select().single()
      if (error) throw error
      setModalConsulta(false)
      if (data) {
        setConsultaActual(data)
        setTab('espera')
        if (puedeAtender) await confirmarAtendiendo(data.id)
        else setModalSignos(true)
      }
    } catch {
      delete payload.consulta_valor
      const { data, error } = await sb.from('consultas').insert(payload).select().single()
      if (error) { alert('Error al crear consulta: ' + error.message); return }
      setModalConsulta(false)
      if (data) {
        setConsultaActual(data)
        setTab('espera')
        if (puedeAtender) await confirmarAtendiendo(data.id)
        else setModalSignos(true)
      }
    }
    startTransition(() => { recargar() })
  }

  /* ── guardar signos vitales (enfermería / recepción) ── */
  async function guardarSignos() {
    if (!consultaActual) return
    const { error } = await sb.from('consultas').update({
      ...formSignos,
      peso:   formSignos.peso  ? Number(formSignos.peso)  : null,
      talla:  formSignos.talla ? Number(formSignos.talla) : null,
      estado: 'SIGNOS',
    }).eq('id', consultaActual.id)
    if (error) {
      alert('Error al guardar signos vitales: ' + error.message)
      return
    }
    setModalSignos(false)
    setTab('espera')
    startTransition(() => { recargar() })
  }

  /** Carga en memoria el examen de una consulta (desde BD, incluye borrador guardado). */
  async function cargarExamenConsulta(id: number): Promise<boolean> {
    const { data, error } = await sb.from('consultas')
      .select(`*,paciente:pacientes(${PACIENTE_CONSULTA_SELECT})`)
      .eq('id', id).single()
    if (error || !data) {
      alert(error?.message ?? 'No se pudo cargar la consulta del paciente.')
      return false
    }

    setConsultaActual(data)
    setFormMedico({
      cabeza: data.cabeza || 'NL', cuello: data.cuello || 'NL',
      ojos: data.ojos || 'NL', orl: data.orl || 'NL',
      pulmonar: data.pulmonar || 'NL', abdomen: data.abdomen || 'NL',
      genito: data.genito || 'NL', extremidades: data.extremidades || 'NL',
      sistema: data.sistema || 'NL', oste: data.oste || 'NL',
      piel: data.piel || 'NL',
      sintoma: data.sintoma || '', historia: data.historia || '',
      impresion: data.impresion || '', tratamiento: data.tratamiento || '',
      estudios_complementarios: data.estudios_complementarios || '',
      dias_reposo: String(data.dias_reposo || 0), nota: data.nota || '',
    })

    const { data: detalle } = await sb.from('consulta_detalle').select('*')
      .eq(columnaConsultaDetalle(), valorConsultaDetalle(id))
    setRecetaItems((detalle ?? []).map(r => normalizarConsultaDetalle(r as Record<string, unknown>)))
    setBuscarMed('')
    setMedForm({ no_producto: '', indicacion: '', cant: 1, via: 'Oral' })

    const { data: servExist } = await sb.from('consulta_servicios').select('*').eq('consulta_id', id)
    setServicioItems(servExist ?? [])
    setBuscarServ('')

    const { data: labExist } = await sb
      .from('consulta_analisis')
      .select('id, id_analisis, no_analisis, valor, cant, importe, estado_lab, pagado')
      .eq('id_consulta', String(id))
    setLabItems((labExist ?? []).map(l => ({
      id:          l.id,
      prueba_id:   Number(l.id_analisis),
      no_analisis: l.no_analisis,
      valor:       l.valor,
      cant:        l.cant,
      importe:     l.importe,
      bloqueado:   l.pagado === true || (!!l.estado_lab && l.estado_lab !== 'PENDIENTE_COBRO'),
    })))
    setBuscarLab('')
    setValorConsultaEdit(String(data.consulta_valor ?? 0))
    setConsultaNotaCobro(data.consulta_nota ?? '')
    return true
  }

  /** Guarda el borrador de la consulta abierta antes de cambiar o cerrar. */
  async function guardarBorradorSiHayConsulta(silencioso = true) {
    if (!consultaActual || guardandoBorrador) return
    setGuardandoBorrador(true)
    const ok = await persistirExamenMedico(false, silencioso)
    if (ok) setUltimoAutoguardado(new Date())
    setGuardandoBorrador(false)
  }

  /** Cambia a otra consulta en curso sin perder el borrador de la actual. */
  async function cambiarConsultaEnModal(id: number) {
    if (!consultaActual || consultaActual.id === id || cambiandoConsulta) return
    setCambiandoConsulta(true)
    if (!guardandoBorrador) {
      setGuardandoBorrador(true)
      const ok = await persistirExamenMedico(false, true)
      if (ok) setUltimoAutoguardado(new Date())
      setGuardandoBorrador(false)
    }
    await cargarExamenConsulta(id)
    setCambiandoConsulta(false)
  }

  async function cerrarModalMedico() {
    await guardarBorradorSiHayConsulta(true)
    setModalMedico(false)
  }

  /* ── médico toma paciente → abre examen ── */
  async function confirmarAtendiendo(id: number) {
    setTab('espera')

    if (modalMedico && consultaActual && consultaActual.id !== id) {
      await guardarBorradorSiHayConsulta(true)
    }

    const { data: { user } } = await sb.auth.getUser()
    const { error: errEstado } = await sb.from('consultas').update({
      estado: 'ATENDIENDO',
      ...(user?.id ? { doctor_id: user.id } : {}),
    }).eq('id', id)
    if (errEstado) {
      alert('No se pudo abrir la consulta: ' + errEstado.message)
      return
    }

    const ok = await cargarExamenConsulta(id)
    if (ok) {
      setUltimoAutoguardado(null)
      setModalMedico(true)
    }
    startTransition(() => { recargar() })
  }

  /* ── persistir examen (borrador o finalizar) ── */
  async function persistirExamenMedico(finalizar: boolean, silencioso = false): Promise<boolean> {
    if (!consultaActual) return false
    if (finalizar) {
      const validacion = validarExamenMedico(formMedico)
      if (validacion) {
        if (!silencioso) alert(validacion)
        return false
      }
    }

    const totalServicios = servicioItems.reduce((a, s) => a + s.precio * s.cantidad, 0)
    const payloadConsulta: Record<string, unknown> = {
      ...formMedico,
      dias_reposo: Number(formMedico.dias_reposo),
      consulta_valor: Number(valorConsultaEdit) || 0,
      consulta_otros: totalServicios,
      consulta_nota: consultaNotaCobro.trim() || null,
    }
    if (finalizar) {
      payloadConsulta.estado = 'FINALIZADO'
      payloadConsulta.estado_pago = 'PENDIENTE'
    }

    const { error: errConsulta } = await sb.from('consultas').update(payloadConsulta).eq('id', consultaActual.id)
    if (errConsulta) {
      if (!silencioso) alert('Error al guardar consulta: ' + errConsulta.message)
      return false
    }

    const { error: errDelMed } = await sb.from('consulta_detalle').delete()
      .eq(columnaConsultaDetalle(), valorConsultaDetalle(consultaActual.id))
    if (errDelMed) {
      if (!silencioso) alert('Error al actualizar medicamentos: ' + errDelMed.message)
      return false
    }
    if (recetaItems.length > 0) {
      const { data: { user } } = await sb.auth.getUser()
      const { error: errMed } = await sb.from('consulta_detalle').insert(
        filasInsertConsultaDetalle(consultaActual.id, recetaItems, user?.id),
      )
      if (errMed) {
        if (!silencioso) alert('Error al guardar medicamentos: ' + errMed.message)
        return false
      }
    }

    const { error: errDelServ } = await sb.from('consulta_servicios').delete().eq('consulta_id', consultaActual.id)
    if (errDelServ) {
      if (!silencioso) alert('Error al actualizar servicios: ' + errDelServ.message)
      return false
    }
    if (servicioItems.length > 0) {
      const { error: errServ } = await sb.from('consulta_servicios').insert(
        servicioItems.map(s => ({
          consulta_id: consultaActual.id,
          servicio_id: s.servicio_id ?? null,
          nombre:      s.nombre,
          precio:      s.precio,
          cantidad:    s.cantidad,
        }))
      )
      if (errServ) {
        if (!silencioso) alert('Error al guardar servicios: ' + errServ.message)
        return false
      }
    }

    // ── Sincronización NO destructiva de laboratorio ──
    // Nunca borrar ni resetear órdenes ya cobradas o en proceso/con resultados.
    const { data: ordenesLabDb, error: errLeerLab } = await sb
      .from('consulta_analisis')
      .select('id, estado_lab, pagado')
      .eq('id_consulta', String(consultaActual.id))
    if (errLeerLab) {
      if (!silencioso) alert('Error al leer laboratorio: ' + errLeerLab.message)
      return false
    }

    const ordenesExistentes = ordenesLabDb ?? []
    const esEditable = (o: { estado_lab?: string | null; pagado?: boolean | null }) =>
      o.pagado !== true && (!o.estado_lab || o.estado_lab === 'PENDIENTE_COBRO')
    const idsEditablesDb = new Set(ordenesExistentes.filter(esEditable).map(o => o.id))
    const idsMantenidos = new Set(labItems.filter(l => l.id != null).map(l => l.id as number))

    // Borrar solo las órdenes editables que el usuario quitó (jamás las cobradas/en proceso)
    const idsABorrar = [...idsEditablesDb].filter(id => !idsMantenidos.has(id))
    if (idsABorrar.length > 0) {
      const { error: errDelLab } = await sb
        .from('consulta_analisis')
        .delete()
        .in('id', idsABorrar)
        .eq('estado_lab', 'PENDIENTE_COBRO')
        .eq('pagado', false)
      if (errDelLab) {
        if (!silencioso) alert('Error al actualizar laboratorio: ' + errDelLab.message)
        return false
      }
    }

    // Actualizar cantidades/importe de órdenes editables que el usuario modificó
    const editablesEditados = labItems.filter(l => l.id != null && idsEditablesDb.has(l.id))
    for (const l of editablesEditados) {
      const { error: errUpd } = await sb.from('consulta_analisis')
        .update({ cant: l.cant, valor: l.valor, importe: l.importe })
        .eq('id', l.id as number)
        .eq('estado_lab', 'PENDIENTE_COBRO')
        .eq('pagado', false)
      if (errUpd) {
        if (!silencioso) alert('Error al actualizar laboratorio: ' + errUpd.message)
        return false
      }
    }

    // Insertar solo las pruebas nuevas (las que aún no tienen orden creada)
    const nuevosLab = labItems.filter(l => l.id == null)
    if (nuevosLab.length > 0) {
      const hoy = new Date().toISOString().split('T')[0]
      const hora = new Date().toTimeString().slice(0, 8)
      const { data: insertados, error: errLab } = await sb.from('consulta_analisis').insert(
        nuevosLab.map(l => ({
          id_consulta:   String(consultaActual.id),
          id_cliente:    String(consultaActual.paciente_id),
          paciente_id:   consultaActual.paciente_id,
          id_analisis:   l.prueba_id,
          no_analisis:   l.no_analisis,
          valor:         l.valor,
          cant:          l.cant,
          importe:       l.importe,
          fecha:         hoy,
          hora,
          pagado:        false,
          estado_lab:    'PENDIENTE_COBRO',
          sucursal_id:   consultaActual.sucursal_id ?? null,
        }))
      ).select('id, id_analisis')
      if (errLab) {
        if (!silencioso) alert('Error al guardar laboratorio: ' + errLab.message)
        return false
      }
      // Reasignar IDs en memoria para que el próximo guardado no los reinserte
      if (insertados?.length) {
        setLabItems(prev => {
          const restantes = [...insertados]
          return prev.map(l => {
            if (l.id != null) return l
            const idx = restantes.findIndex(r => Number(r.id_analisis) === l.prueba_id)
            if (idx === -1) return l
            const r = restantes.splice(idx, 1)[0]
            return { ...l, id: r.id }
          })
        })
      }
    }

    return true
  }

  async function guardarBorradorExamen(silencioso = true) {
    await guardarBorradorSiHayConsulta(silencioso)
  }

  async function guardarExamenMedico() {
    if (!consultaActual) return
    const ok = await persistirExamenMedico(true, false)
    if (!ok) return

    setModalMedico(false)
    setRecetaItems([])
    setServicioItems([])
    setLabItems([])
    setUltimoAutoguardado(null)
    startTransition(() => { recargar() })
  }

  /* autoguardado cada 5 s tras cambios en el modal médico */
  useEffect(() => {
    if (!modalMedico || !consultaActual) return
    const t = setTimeout(() => { guardarBorradorExamen(true) }, 5000)
    return () => clearTimeout(t)
  }, [formMedico, recetaItems, servicioItems, labItems, valorConsultaEdit, consultaNotaCobro, modalMedico, consultaActual?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── helpers receta ── */
  function vistaPreviaReceta() {
    if (!consultaActual) return
    const fecha = new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
    imprimirRecetaMedica({
      numero_doc: String(consultaActual.id).padStart(6, '0'),
      fecha,
      paciente_nombre: nombrePaciente(consultaActual.paciente),
      paciente_codigo: consultaActual.paciente?.codigo,
      paciente_edad: edadPacientePrint(consultaActual.paciente?.fecha_nac),
      medico_nombre: medicoNombre,
      items: recetaItems,
      tratamiento: formMedico.tratamiento,
      dias_reposo: Number(formMedico.dias_reposo) || 0,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    })
  }

  function agregarMedicamento() {
    if (!medForm.no_producto.trim()) return
    setRecetaItems(prev => [...prev, { ...medForm }])
    setMedForm({ no_producto: '', indicacion: '', cant: 1, via: 'Oral' })
    setBuscarMed('')
  }

  function quitarMedicamento(idx: number) {
    setRecetaItems(prev => prev.filter((_, i) => i !== idx))
  }

  /* ── helpers servicios ── */
  function agregarServicio(s: Servicio) {
    const existe = servicioItems.findIndex(x => x.servicio_id === s.id)
    if (existe >= 0) {
      setServicioItems(prev => prev.map((x, i) => i === existe ? { ...x, cantidad: x.cantidad + 1 } : x))
    } else {
      setServicioItems(prev => [...prev, { servicio_id: s.id, nombre: s.nombre, precio: s.precio, cantidad: 1 }])
    }
    setBuscarServ('')
  }

  function quitarServicio(idx: number) {
    setServicioItems(prev => prev.filter((_, i) => i !== idx))
  }

  function ajustarCantidadServicio(idx: number, delta: number) {
    setServicioItems(prev => prev.map((s, i) => {
      if (i !== idx) return s
      const cant = Math.max(1, s.cantidad + delta)
      return { ...s, cantidad: cant }
    }))
  }

  const serviciosProcedimiento = useMemo(
    () => servicios.filter(s => s.tipo.toLowerCase() !== 'consulta'),
    [servicios],
  )

  const serviciosFilt = useMemo(() =>
    !buscarServ ? [] : serviciosProcedimiento.filter(s =>
      s.nombre.toLowerCase().includes(buscarServ.toLowerCase()) ||
      s.tipo.toLowerCase().includes(buscarServ.toLowerCase())
    ).slice(0, 10),
    [buscarServ, serviciosProcedimiento]
  )

  /* ── helpers laboratorio ── */
  function listaPacienteActual(p?: Paciente | null) {
    return p?.lista_id ?? consultaActual?.paciente?.lista_id ?? null
  }

  function precioLabParaPaciente(prueba: Prueba, listaId?: number | null) {
    return precioLabLista(prueba.id, listaId, labPreciosLista, Number(prueba.costo))
  }

  function agregarLab(p: Prueba) {
    if (labItems.find(l => l.prueba_id === p.id)) return
    const listaId = listaPacienteActual(consultaActual?.paciente)
    const valor = precioLabParaPaciente(p, listaId)
    setLabItems(prev => [...prev, {
      prueba_id:   p.id,
      no_analisis: p.nombre,
      valor,
      cant:        1,
      importe:     valor,
    }])
    setBuscarLab('')
  }

  function quitarLab(idx: number) {
    setLabItems(prev => {
      if (prev[idx]?.bloqueado) {
        alert('Esta prueba ya fue cobrada o está en proceso en laboratorio; no se puede quitar desde la consulta.')
        return prev
      }
      return prev.filter((_, i) => i !== idx)
    })
  }

  function ajustarCantidadLab(idx: number, delta: number) {
    setLabItems(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (l.bloqueado) return l
      const cant = Math.max(1, l.cant + delta)
      return { ...l, cant, importe: l.valor * cant }
    }))
  }

  const labFilt = useMemo(() =>
    !buscarLab ? [] : pruebas.filter(p =>
      p.nombre.toLowerCase().includes(buscarLab.toLowerCase())
    ).slice(0, 10),
    [buscarLab, pruebas]
  )

  /* ── Resumen de costos en tiempo real ── */
  const totalConsulta = useMemo(() => {
    const base      = Number(valorConsultaEdit) || 0
    const servicios = servicioItems.reduce((a, s) => a + (s.precio * s.cantidad), 0)
    const laborat   = labItems.reduce((a, l) => a + l.importe, 0)
    return { base, servicios, laborat, total: base + servicios + laborat }
  }, [valorConsultaEdit, servicioItems, labItems])

  async function abrirDocumentosConsulta(c: Consulta) {
    const { data: full } = await sb.from('consultas')
      .select(`*,paciente:pacientes(${PACIENTE_CONSULTA_SELECT})`)
      .eq('id', c.id).single()
    const consulta = (full ?? c) as Consulta
    setConsultaActual(consulta)
    setFormMedico(prev => ({
      ...prev,
      tratamiento: consulta.tratamiento || '',
      impresion: consulta.impresion || '',
      dias_reposo: String(consulta.dias_reposo ?? 0),
    }))
    const { data: detalle } = await sb.from('consulta_detalle').select('*')
      .eq(columnaConsultaDetalle(), valorConsultaDetalle(c.id))
    setRecetaItems((detalle ?? []).map(r => normalizarConsultaDetalle(r as Record<string, unknown>)))
    setModalDocs(true)
  }

  /* ── productos filtrados para autocompletar ── */
  const productosFilt = useMemo(() => {
    if (!buscarMed.trim()) return []
    const q = buscarMed.toLowerCase()
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [buscarMed, productos])

  /* ── filtro citas ── */
  const citasFiltradas = citas.filter(c => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return c.paciente ? textoBusquedaPaciente(c.paciente).includes(q) : false
  })

  const statsC = useMemo(() => ({
    total:     citas.length,
    activo:    citas.filter(c => c.estado === 'ACTIVO').length,
    asistio:   citas.filter(c => c.estado === 'ASISTIÓ').length,
    enEspera:  espera.length,
    atendiendo: espera.filter(c => c.estado === 'ATENDIENDO').length,
  }), [citas, espera])

  const listosParaMedico = useMemo(
    () => espera.filter(c => c.estado === 'SIGNOS' || (puedeAtender && c.estado === 'REGISTRO')).length,
    [espera, puedeAtender],
  )

  /** Consultas que el médico tiene abiertas a la vez (estado ATENDIENDO). */
  const consultasAtendiendo = useMemo(() => {
    const list = espera.filter(c => c.estado === 'ATENDIENDO')
    if (consultaActual?.estado === 'ATENDIENDO' && !list.some(c => c.id === consultaActual.id)) {
      return [consultaActual, ...list]
    }
    return list
  }, [espera, consultaActual])

  const esperaOrdenada = useMemo(() =>
    [...espera].sort((a, b) => {
      const prio = (e: string) => (e === 'SIGNOS' ? 0 : e === 'ATENDIENDO' ? 1 : 2)
      const pd = prio(a.estado) - prio(b.estado)
      if (pd !== 0) return pd
      return (a.hora ?? '').localeCompare(b.hora ?? '')
    }),
  [espera])

  const esperaFiltrada = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return esperaOrdenada
    return esperaOrdenada.filter(c =>
      c.paciente ? textoBusquedaPaciente(c.paciente).includes(q) : false,
    )
  }, [esperaOrdenada, busqueda])

  const esHoy = fechaOperativa === fechaHoy
  const mostrarSucursal = esSuperAdmin && filtroSuc === 'todas'

  /* ═══════════════ JSX ═══════════════════════════════════ */
  return (
    <div className="min-h-full min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">

      {/* HERO */}
      <div className="relative overflow-hidden shadow-lg"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)` }}>
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-10 bg-white blur-3xl" />
        <div className="relative px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  {nombreSucursalVista}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <Stethoscope className="w-8 h-8" style={{ color: BRAND.goldLight }} />
                Consultas Médicas
              </h1>
              <p className="text-white/60 text-sm mt-1 capitalize">{fmtFechaLarga(fechaOperativa)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {esSuperAdmin && sucursales.length > 0 && (
                <select
                  value={filtroSuc === 'todas' ? 'todas' : String(filtroSuc)}
                  onChange={e => setFiltroSuc(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
                  className="px-3 py-2 rounded-xl text-sm bg-white/10 text-white border border-white/20 backdrop-blur max-w-[200px]"
                >
                  <option value="todas" className="text-gray-900">Todas las sucursales</option>
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id} className="text-gray-900">{s.nombre}</option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={fechaOperativa}
                onChange={e => setFechaOperativa(e.target.value)}
                className="px-3 py-2 rounded-xl text-sm bg-white/10 text-white border border-white/20 backdrop-blur"
              />
              {!esHoy && (
                <button onClick={() => setFechaOperativa(fechaHoy)}
                  className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Hoy
                </button>
              )}
              <button onClick={() => startTransition(() => recargar())}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} /> Actualizar
              </button>
              <Link href="/agenda"
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Agenda
              </Link>
              <button onClick={() => {
                setFormCita({
                  paciente_id: '', fecha: fechaOperativa, hora: '', nota: '',
                  sucursal_id: String(sucursalOperativa ?? sucursales[0]?.id ?? ''),
                })
                setModalCita(true)
              }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 border border-white/20 text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Agendar
              </button>
              {puedeCrearConsulta && (
                <button onClick={() => {
                  const def = serviciosConsulta[0]
                  setFormConsulta({
                    paciente_id: '', servicio_id: def ? String(def.id) : '',
                    fecha: fechaOperativa, hora: '',
                    sucursal_id: String(sucursalOperativa ?? sucursales[0]?.id ?? ''),
                  })
                  setModalConsulta(true)
                }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition"
                  style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                  <Plus className="w-4 h-4" /> Nueva Consulta
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            {[
              { label: 'Citas', value: statsC.total, icon: Calendar },
              { label: 'Pendientes', value: statsC.activo, icon: Clock },
              { label: 'Asistieron', value: statsC.asistio, icon: CheckCircle2 },
              { label: 'En espera', value: statsC.enEspera, icon: Activity },
              { label: 'Atendiendo', value: statsC.atendiendo, icon: Stethoscope },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl px-3 py-2.5 border border-white/15 flex items-center gap-2">
                <s.icon className="w-4 h-4 text-white/70 flex-shrink-0" />
                <div>
                  <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                  <p className="text-[10px] text-white/55 uppercase tracking-wide">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto w-full">

      {/* guía de flujo */}
      <div className="rounded-2xl border bg-white shadow-sm p-4 sm:p-5">
        <p className="text-sm font-bold text-[#003366] mb-2">Flujo del paciente en consulta</p>
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="px-2.5 py-1 rounded-full bg-slate-100">1. Recepción registra paciente o empresa</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">2. Enfermería toma signos vitales</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-900">3. Médico atiende en cola</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-900">4. Finaliza y envía a caja</span>
        </div>
        {listosParaMedico > 0 && (
          <p className="mt-3 text-sm font-semibold text-violet-800 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {listosParaMedico} paciente{listosParaMedico > 1 ? 's' : ''} en cola — pulse <strong>Atender paciente</strong> para abrir la consulta.
          </p>
        )}
        {esSuperAdmin && (
          <p className="mt-3 text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
            <strong>Super administrador:</strong> puede ver todas las sucursales o filtrar una en el selector superior.
            Al crear consultas elija la sucursal correcta. El resto del personal solo ve su sucursal.
          </p>
        )}
      </div>

      {/* consultas cobradas — documentos clínicos */}
      {pagadas.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-700" />
              <div>
                <p className="text-sm font-bold text-emerald-900">Consultas cobradas hoy</p>
                <p className="text-xs text-emerald-700/80">
                  Constancias y actas de defunción disponibles tras el pago. Recetas e historial de exámenes en cualquier momento.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
              {pagadas.length} paciente{pagadas.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pagadas.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrirDocumentosConsulta(c)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-emerald-200 rounded-xl text-sm hover:bg-emerald-50 transition shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-medium text-gray-900">{nombrePaciente(c.paciente)}</span>
                <span className="text-xs text-gray-400">#{c.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {(['citas', 'espera'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 sm:px-6 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === t
                  ? 'border-[#003366] text-[#003366] bg-sky-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'citas'
                ? `Citas del día (${citas.length})`
                : `Cola de consulta (${espera.length})`}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar paciente, empresa, RTN o código..."
              className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]/25" />
          </div>

          {/* ── TAB CITAS ── */}
          {tab === 'citas' && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Paciente</th>
                    {mostrarSucursal && <th className="px-4 py-3 text-left hidden lg:table-cell">Sucursal</th>}
                    <th className="px-4 py-3 text-left">Hora</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Teléfono</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Observación</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {citasFiltradas.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                      No hay citas para esta fecha
                    </td></tr>
                  )}
                  {citasFiltradas.map(cita => (
                    <CitaRow key={cita.id} cita={cita}
                      serviciosConsulta={serviciosConsulta}
                      mostrarSucursal={mostrarSucursal}
                      nombreSucursal={cita.sucursal_id ? mapaSucursales[cita.sucursal_id] : '—'}
                      membresiasMap={membresiasMap}
                      listasMap={listasMap}
                      onEstado={cambiarEstadoCita}
                      onAbrirConsulta={abrirConsultaDesdeCita} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB ESPERA ── */}
          {tab === 'espera' && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Paciente</th>
                    {mostrarSucursal && <th className="px-4 py-3 text-left hidden lg:table-cell">Sucursal</th>}
                    <th className="px-4 py-3 text-left">Tipo consulta</th>
                    <th className="px-4 py-3 text-left">Hora</th>
                    <th className="px-4 py-3 text-left">Espera</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {esperaFiltrada.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                      {busqueda ? 'Sin resultados en la cola' : 'No hay pacientes en cola de consulta'}
                    </td></tr>
                  )}
                  {esperaFiltrada.map(c => (
                    <tr key={c.id} className={`hover:bg-sky-50/40 ${
                      c.estado === 'SIGNOS' ? 'bg-violet-50/60 ring-1 ring-inset ring-violet-200' : ''
                    }`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {nombrePaciente(c.paciente)}
                          {esPacienteEmpresa(c.paciente) && (
                            <span className="ml-1 text-[10px] font-bold text-violet-600 uppercase">Empresa</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{detallePaciente(c.paciente)}</p>
                        <div className="mt-1">
                          <PacientePlanBadge
                            pacienteId={c.paciente_id}
                            listaId={c.paciente?.lista_id}
                            listaNombre={c.paciente?.lista_id ? listasMap[c.paciente.lista_id] : undefined}
                            membresiasMap={membresiasMap}
                          />
                        </div>
                        {mostrarSucursal && (
                          <p className="text-[10px] text-sky-700 mt-0.5">
                            {c.sucursal_id ? mapaSucursales[c.sucursal_id] ?? `Suc. #${c.sucursal_id}` : 'Sin sucursal'}
                          </p>
                        )}
                        {c.paciente_id && (
                          <Link href={`/expediente/${c.paciente_id}`}
                            className="text-[11px] text-[#003366] hover:underline inline-flex items-center gap-0.5 mt-0.5">
                            <History className="w-3 h-3" /> Historial
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.tipo?.nombre || c.tipo_nombre || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono">{c.hora?.slice(0, 5)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          {esHoy ? tiempoEspera(c.hora, fechaOperativa) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${estadoBadgeClase(c.estado)}`}>
                          {etiquetaEstadoConsulta(c.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-center gap-1">
                          {c.estado === 'REGISTRO' && esEnfermeria && (
                            <button onClick={() => {
                              setConsultaActual(c)
                              setFormSignos({ presion: '', frecuencia: '', pulso: '', temperatura: '', peso: '', talla: '', perim_cefalico: '' })
                              setModalSignos(true)
                            }} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">
                              Signos vitales
                            </button>
                          )}
                          {puedeAtender && (c.estado === 'SIGNOS' || c.estado === 'REGISTRO') && (
                            <button onClick={() => confirmarAtendiendo(c.id)}
                              className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 flex items-center gap-1">
                              <Stethoscope className="w-3.5 h-3.5" /> Atender paciente
                            </button>
                          )}
                          {c.estado === 'ATENDIENDO' && (
                            <button onClick={() => confirmarAtendiendo(c.id)}
                              className="px-3 py-1.5 bg-[#003366] text-white rounded-lg text-xs font-medium hover:bg-[#004080]">
                              Continuar examen
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
      </div>
      </div>

      {/* ══════════ MODAL NUEVA CITA ══════════ */}
      {modalCita && (
        <ResponsiveModal title="Agendar Cita" subtitle="Programar cita del paciente" onClose={() => setModalCita(false)}
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 w-full">
              <button onClick={() => setModalCita(false)} className="px-4 py-2.5 border rounded-xl text-sm">Cancelar</button>
              <button onClick={guardarCita} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: BRAND.navy }}>
                <Calendar className="w-4 h-4 inline mr-1" /> Agendar cita
              </button>
            </div>
          }>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paciente *</label>
              <BuscarPacienteInput
                pacientes={pacientes}
                value={formCita.paciente_id}
                onChange={id => setFormCita(p => ({ ...p, paciente_id: id }))}
                membresiasMap={membresiasMap}
                listasMap={listasMap}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input type="date" value={formCita.fecha}
                  onChange={e => setFormCita(p => ({ ...p, fecha: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora *</label>
                <input type="time" value={formCita.hora}
                  onChange={e => setFormCita(p => ({ ...p, hora: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {esSuperAdmin && sucursales.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal *</label>
                <select
                  value={formCita.sucursal_id}
                  onChange={e => setFormCita(p => ({ ...p, sucursal_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea value={formCita.nota} rows={2}
                onChange={e => setFormCita(p => ({ ...p, nota: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
          </div>
        </ResponsiveModal>
      )}

      {/* ══════════ MODAL NUEVA CONSULTA DIRECTA ══════════ */}
      {modalConsulta && (
        <ResponsiveModal title="Nueva Consulta" subtitle="Iniciar consulta sin cita previa" onClose={() => setModalConsulta(false)}
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 w-full">
              <button onClick={() => setModalConsulta(false)} className="px-4 py-2.5 border rounded-xl text-sm">Cancelar</button>
              <button onClick={crearConsulta} className="px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                <Stethoscope className="w-4 h-4 inline mr-1" /> Iniciar consulta
              </button>
            </div>
          }>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paciente *</label>
              <BuscarPacienteInput
                pacientes={pacientes}
                value={formConsulta.paciente_id}
                onChange={id => setFormConsulta(p => ({ ...p, paciente_id: id }))}
                membresiasMap={membresiasMap}
                listasMap={listasMap}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Consulta * <span className="font-normal text-gray-400">(catálogo de servicios)</span>
              </label>
              {serviciosConsulta.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No hay servicios con categoría &quot;Consulta&quot;. Agréguelos en Configuración → Servicios.
                </p>
              ) : (
                <select value={formConsulta.servicio_id}
                  onChange={e => setFormConsulta(p => ({ ...p, servicio_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="">Seleccionar consulta</option>
                  {serviciosConsulta.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} — L {Number(s.precio).toFixed(2)}</option>
                  ))}
                </select>
              )}
            </div>
            {esSuperAdmin && sucursales.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal donde se atiende *</label>
                <select
                  value={formConsulta.sucursal_id}
                  onChange={e => setFormConsulta(p => ({ ...p, sucursal_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </ResponsiveModal>
      )}

      {/* ══════════ MODAL SIGNOS VITALES ══════════ */}
      {modalSignos && consultaActual && (
        <ResponsiveModal title="Signos Vitales" subtitle="Enfermería / recepción — el paciente pasará a cola médica" onClose={() => setModalSignos(false)} size="lg"
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 w-full">
              <button onClick={() => setModalSignos(false)} className="px-4 py-2.5 border rounded-xl text-sm">Cerrar</button>
              <button onClick={guardarSignos} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold">
                <Save className="w-4 h-4 inline mr-1" /> Guardar y enviar a cola médica
              </button>
            </div>
          }>
          <div className="space-y-4">
            <div className="rounded-xl p-4 text-sm border" style={{ backgroundColor: `${BRAND.navy}08`, borderColor: `${BRAND.navy}20` }}>
              <p className="font-semibold" style={{ color: BRAND.navy }}>
                {nombrePaciente(consultaActual.paciente)}
                {esPacienteEmpresa(consultaActual.paciente) && (
                  <span className="ml-1.5 text-[10px] font-bold text-violet-600 uppercase">Empresa</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{detallePaciente(consultaActual.paciente)}</p>
              <p className="text-gray-600 mt-0.5">{consultaActual.tipo?.nombre || consultaActual.tipo_nombre}</p>
            </div>
            <PacientePlanBanner
              pacienteId={consultaActual.paciente_id}
              listaId={consultaActual.paciente?.lista_id}
              listaNombre={consultaActual.paciente?.lista_id ? listasMap[consultaActual.paciente.lista_id] : undefined}
              membresiasMap={membresiasMap}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { key: 'presion',         label: 'Presión Arterial',    ph: 'ej: 120/80' },
                { key: 'frecuencia',      label: 'Frec. Respiratoria',  ph: 'resp/min' },
                { key: 'pulso',           label: 'Pulso',               ph: 'lat/min' },
                { key: 'temperatura',     label: 'Temperatura (°C)',     ph: '36.5' },
                { key: 'peso',            label: 'Peso (kg)',            ph: '65.0' },
                { key: 'talla',           label: 'Talla (cm)',           ph: '165' },
                { key: 'perim_cefalico',  label: 'Perím. Cefálico',      ph: 'cm' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input value={(formSignos as Record<string, string>)[f.key]}
                    onChange={e => setFormSignos(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>
        </ResponsiveModal>
      )}

      {/* ══════════ MODAL EXAMEN MÉDICO ══════════ */}
      {modalMedico && consultaActual && (
        <ResponsiveModal
          title="Examen Médico"
          subtitle={
            consultasAtendiendo.length > 1
              ? `${nombrePaciente(consultaActual.paciente)} · ${consultasAtendiendo.length} consultas en curso`
              : nombrePaciente(consultaActual.paciente)
          }
          onClose={() => { void cerrarModalMedico() }}
          size="full"
          footer={
            <div className="flex flex-col sm:flex-row justify-between gap-2 w-full">
              <div className="flex gap-2">
                {consultaActual.paciente_id && (
                  <Link href={`/expediente/${consultaActual.paciente_id}`} target="_blank"
                    className="px-3 py-2 border rounded-xl text-xs flex items-center gap-1 text-[#003366] hover:bg-sky-50">
                    <ExternalLink className="w-3.5 h-3.5" /> Expediente
                  </Link>
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button type="button" onClick={() => guardarBorradorExamen(false)}
                  disabled={guardandoBorrador}
                  className="px-4 py-2.5 border rounded-xl text-sm flex items-center justify-center gap-1 text-[#003366] hover:bg-sky-50 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Guardar borrador
                </button>
                <button type="button" onClick={() => { void cerrarModalMedico() }}
                  className="px-4 py-2.5 border rounded-xl text-sm">Cerrar</button>
                <button onClick={guardarExamenMedico}
                  className="px-4 py-2.5 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1"
                  style={{ backgroundColor: BRAND.navy }}>
                  <Wallet className="w-4 h-4" /> Finalizar y enviar a cobro
                </button>
              </div>
            </div>
          }>
          <div className="space-y-5 relative">
            {(cambiandoConsulta || guardandoBorrador) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium text-[#003366] bg-white px-4 py-2 rounded-xl shadow border">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {cambiandoConsulta ? 'Cambiando de paciente…' : 'Guardando borrador…'}
                </div>
              </div>
            )}

            {consultasAtendiendo.length > 1 && (
              <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/80 p-3 sm:p-4">
                <p className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Consultas en curso — el borrador se guarda al cambiar
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                  {consultasAtendiendo.map(c => {
                    const activa = c.id === consultaActual.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { void cambiarConsultaEnModal(c.id) }}
                        disabled={activa || cambiandoConsulta || guardandoBorrador}
                        className={`flex-shrink-0 snap-start flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm border transition min-w-[140px] max-w-[220px]
                          ${activa
                            ? 'bg-[#003366] text-white border-[#003366] shadow-md'
                            : 'bg-white text-gray-800 border-amber-200 hover:border-[#003366]/40 hover:bg-sky-50 disabled:opacity-50'
                          }`}
                      >
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${activa ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>
                          {(c.paciente?.nombre?.[0] ?? '') + (c.paciente?.apellido1?.[0] ?? '')}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">{nombrePaciente(c.paciente)}</span>
                          <span className={`block text-[10px] truncate ${activa ? 'text-white/70' : 'text-gray-500'}`}>
                            #{c.id} · {c.tipo?.nombre || c.tipo_nombre || 'Consulta'}
                          </span>
                        </span>
                        {activa && <ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl p-4 text-sm flex flex-wrap items-center justify-between gap-2 border border-violet-100 bg-violet-50/80">
              <div>
                <p className="font-semibold text-violet-900">
                  {nombrePaciente(consultaActual.paciente)}
                  {esPacienteEmpresa(consultaActual.paciente) && (
                    <span className="ml-1.5 text-[10px] font-bold text-violet-600 uppercase">Empresa</span>
                  )}
                </p>
                <p className="text-xs text-violet-600/80">{detallePaciente(consultaActual.paciente)}</p>
                <p className="text-violet-700">{consultaActual.tipo?.nombre || consultaActual.tipo_nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-mono">Consulta #{consultaActual.id}</p>
                {guardandoBorrador ? (
                  <p className="text-[10px] text-amber-600 mt-0.5">Guardando borrador...</p>
                ) : ultimoAutoguardado ? (
                  <p className="text-[10px] text-emerald-600 mt-0.5">
                    Borrador {ultimoAutoguardado.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-0.5">Autoguardado activo</p>
                )}
              </div>
            </div>

            <PacientePlanBanner
              pacienteId={consultaActual.paciente_id}
              listaId={consultaActual.paciente?.lista_id}
              listaNombre={consultaActual.paciente?.lista_id ? listasMap[consultaActual.paciente.lista_id] : undefined}
              membresiasMap={membresiasMap}
            />

            <ConsultaHistorialPanel
              pacienteId={consultaActual.paciente_id}
              consultaActualId={consultaActual.id}
            />

            {/* examen físico */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Examen Físico (NL = Normal)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {(['cabeza','cuello','ojos','orl','pulmonar','abdomen','genito','extremidades','sistema','oste','piel'] as const).map(k => (
                  <div key={k}>
                    <label className="block text-xs text-gray-500 mb-1 capitalize">{k.replace('_',' ')}</label>
                    <input value={formMedico[k]}
                      onChange={e => setFormMedico(p => ({ ...p, [k]: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* clínico */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {[
                { key: 'sintoma',   label: 'Síntoma Principal *', rows: 3 },
                { key: 'historia',  label: 'Historia *', rows: 4 },
                { key: 'impresion', label: 'Impresión Diagnóstica *', rows: 3 },
                { key: 'tratamiento', label: 'Tratamiento Médico *', rows: 4 },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <textarea rows={f.rows} value={(formMedico as Record<string, string>)[f.key]}
                    onChange={e => setFormMedico(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-y min-h-[4.5rem]" />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estudios Complementarios</label>
              <input value={formMedico.estudios_complementarios}
                onChange={e => setFormMedico(p => ({ ...p, estudios_complementarios: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Días de Reposo</label>
                <input type="number" min="0" value={formMedico.dias_reposo}
                  onChange={e => setFormMedico(p => ({ ...p, dias_reposo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observación General</label>
                <input value={formMedico.nota}
                  onChange={e => setFormMedico(p => ({ ...p, nota: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {/* ══ SECCIÓN SERVICIOS ══ */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-teal-500" /> Servicios Realizados
                  {servicioItems.length > 0 && (
                    <span className="ml-1 bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full">{servicioItems.length}</span>
                  )}
                </p>
                {servicioItems.length > 0 && (
                  <span className="text-xs font-semibold text-teal-700">
                    Total: L {servicioItems.reduce((a, s) => a + s.precio * s.cantidad, 0).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Buscador de servicios */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-300 outline-none"
                  placeholder="Buscar servicio: Inyección, Nebulización, Curación..."
                  value={buscarServ}
                  onChange={e => setBuscarServ(e.target.value)}
                  autoComplete="off"
                />
                {serviciosFilt.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-20 mt-0.5 max-h-40 overflow-y-auto">
                    {serviciosFilt.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => agregarServicio(s)}
                        className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm flex items-center justify-between"
                      >
                        <span>{s.nombre} <span className="text-xs text-gray-400">— {s.tipo}</span></span>
                        <span className="font-semibold text-teal-700">L {Number(s.precio).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de servicios agregados */}
              {servicioItems.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {servicioItems.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                      <Wrench className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      <div className="flex-1 text-sm min-w-0">
                        <p className="font-medium text-gray-900">{s.nombre}</p>
                        <p className="text-xs text-gray-500">L {Number(s.precio).toFixed(2)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1 bg-white rounded-lg border px-1">
                        <button type="button" onClick={() => ajustarCantidadServicio(idx, -1)} className="p-1 hover:bg-gray-100 rounded"><Minus className="w-3 h-3" /></button>
                        <span className="text-xs font-bold w-5 text-center">{s.cantidad}</span>
                        <button type="button" onClick={() => ajustarCantidadServicio(idx, 1)} className="p-1 hover:bg-gray-100 rounded"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-sm font-semibold text-teal-700 w-16 text-right">L {(s.precio * s.cantidad).toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => quitarServicio(idx)}
                        className="p-1 rounded hover:bg-red-100 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ══ SECCIÓN LABORATORIO ══ */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4 text-blue-500" /> Análisis de Laboratorio
                  {labItems.length > 0 && (
                    <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{labItems.length}</span>
                  )}
                </p>
                {labItems.length > 0 && (
                  <span className="text-xs font-semibold text-blue-700">
                    Total: L {labItems.reduce((a, l) => a + l.importe, 0).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Buscador de pruebas */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
                  placeholder="Buscar prueba: Hemograma, Glicemia, Orina..."
                  value={buscarLab}
                  onChange={e => setBuscarLab(e.target.value)}
                  autoComplete="off"
                />
                {labFilt.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-20 mt-0.5 max-h-40 overflow-y-auto">
                    {labFilt.map(p => {
                      const listaId = listaPacienteActual(consultaActual?.paciente)
                      const precio = precioLabParaPaciente(p, listaId)
                      const esLista = listaId && precio !== Number(p.costo)
                      return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => agregarLab(p)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          {p.color && (
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorLabClase(p.color)}`} />
                          )}
                          {p.nombre}
                          {p.dias && <span className="text-xs text-gray-400">{p.dias}d</span>}
                          {esLista && (
                            <span className="text-[10px] text-violet-600 font-semibold">lista</span>
                          )}
                        </span>
                        <span className="font-semibold text-blue-700">L {precio.toFixed(2)}</span>
                      </button>
                    )})}
                  </div>
                )}
              </div>

              {/* Lista de análisis agregados */}
              {labItems.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {labItems.map((l, idx) => (
                    <div key={l.id ?? `nuevo-${idx}`} className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${l.bloqueado ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-100'}`}>
                      <FlaskConical className={`w-4 h-4 flex-shrink-0 ${l.bloqueado ? 'text-emerald-600' : 'text-blue-500'}`} />
                      <div className="flex-1 text-sm min-w-0">
                        <p className="font-medium text-gray-900">
                          {l.no_analisis}
                          {l.bloqueado && (
                            <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Cobrada / en proceso</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">L {Number(l.valor).toFixed(2)} c/u</p>
                      </div>
                      <div className={`flex items-center gap-1 bg-white rounded-lg border px-1 ${l.bloqueado ? 'opacity-50' : ''}`}>
                        <button type="button" disabled={l.bloqueado} onClick={() => ajustarCantidadLab(idx, -1)} className="p-1 hover:bg-gray-100 rounded disabled:cursor-not-allowed"><Minus className="w-3 h-3" /></button>
                        <span className="text-xs font-bold w-5 text-center">{l.cant}</span>
                        <button type="button" disabled={l.bloqueado} onClick={() => ajustarCantidadLab(idx, 1)} className="p-1 hover:bg-gray-100 rounded disabled:cursor-not-allowed"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-sm font-semibold text-blue-700 w-16 text-right">L {Number(l.importe).toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => quitarLab(idx)}
                        disabled={l.bloqueado}
                        title={l.bloqueado ? 'Ya cobrada o en proceso; no se puede quitar' : 'Quitar'}
                        className="p-1 rounded hover:bg-red-100 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ══ CATÁLOGO DE MEDICAMENTOS ══ */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Pill className="w-4 h-4 text-purple-500" /> Catálogo de medicamentos
                  {recetaItems.length > 0 && (
                    <span className="ml-1 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{recetaItems.length}</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={vistaPreviaReceta}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-purple-300 text-purple-800 hover:bg-purple-50"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir receta
                </button>
              </div>

              {/* Buscador de medicamentos */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 outline-none"
                  placeholder="Buscar medicamento por nombre o código..."
                  value={buscarMed}
                  onChange={e => {
                    setBuscarMed(e.target.value)
                    setMedForm(p => ({ ...p, no_producto: e.target.value }))
                  }}
                  autoComplete="off"
                />
                {productosFilt.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-20 mt-0.5 max-h-40 overflow-y-auto">
                    {productosFilt.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setMedForm(prev => ({ ...prev, no_producto: p.nombre, producto_id: p.id }))
                          setBuscarMed(p.nombre)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center justify-between"
                      >
                        <span>{p.nombre}</span>
                        <span className="text-xs text-gray-400">[{p.codigo}]</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campos del medicamento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500">Medicamento *</label>
                  <input
                    className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
                    placeholder="Nombre del medicamento"
                    value={medForm.no_producto}
                    onChange={e => setMedForm(p => ({ ...p, no_producto: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Cantidad</label>
                  <input
                    type="number" min="1"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
                    value={medForm.cant}
                    onChange={e => setMedForm(p => ({ ...p, cant: Number(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Vía</label>
                  <select
                    className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
                    value={medForm.via}
                    onChange={e => setMedForm(p => ({ ...p, via: e.target.value }))}
                  >
                    <option>Oral</option>
                    <option>IV</option>
                    <option>IM</option>
                    <option>SC</option>
                    <option>Tópica</option>
                    <option>Sublingual</option>
                    <option>Inhalatoria</option>
                    <option>Oftálmica</option>
                    <option>Ótica</option>
                    <option>Rectal</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
                  placeholder="Indicaciones / dosis (ej: 1 tableta cada 8 horas por 7 días)"
                  value={medForm.indicacion}
                  onChange={e => setMedForm(p => ({ ...p, indicacion: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={agregarMedicamento}
                  disabled={!medForm.no_producto.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm rounded-lg font-semibold transition"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>

              {/* Lista de medicamentos agregados */}
              {recetaItems.length > 0 && (
                <div className="space-y-1.5">
                  {recetaItems.map((it, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                      <Pill className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-gray-900">{it.no_producto}</p>
                        <p className="text-xs text-gray-500">
                          Cant: {it.cant} · Vía: {it.via}
                          {it.indicacion && ` · ${it.indicacion}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarMedicamento(idx)}
                        className="p-1 rounded hover:bg-red-100 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ══ DOCUMENTOS CLÍNICOS Y EXÁMENES ══ */}
            <ConsultaDocumentosPanel
              consultaId={consultaActual.id}
              pacienteId={consultaActual.paciente_id}
              paciente={consultaActual.paciente}
              sucursalId={consultaActual.sucursal_id ?? sucursalOperativa}
              estadoPago={consultaActual.estado_pago}
              cobrado={consultaActual.cobrado}
              recetaItems={recetaItems}
              tratamiento={formMedico.tratamiento}
              diasReposo={Number(formMedico.dias_reposo) || 0}
              impresionDiagnostica={formMedico.impresion}
              esSuperAdmin={esSuperAdmin}
              fechaConsulta={consultaActual.fecha}
            />
          </div>

          {/* ══ RESUMEN DE COSTOS ══ */}
          <div className="border-t mt-4 pt-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl px-3 sm:px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resumen de costos — envío a caja</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-gray-500">Valor de la consulta (L)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={valorConsultaEdit}
                  onChange={e => setValorConsultaEdit(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-semibold text-indigo-800 bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Nota de cobro (opcional)</label>
                <input
                  value={consultaNotaCobro}
                  onChange={e => setConsultaNotaCobro(e.target.value)}
                  placeholder="Observaciones para caja..."
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
              <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                <p className="text-xs text-gray-500">Consulta</p>
                <p className="text-sm font-bold text-indigo-700">L {totalConsulta.base.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                <p className="text-xs text-gray-500">Servicios ({servicioItems.length})</p>
                <p className="text-sm font-bold text-orange-600">L {totalConsulta.servicios.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                <p className="text-xs text-gray-500">Laboratorio ({labItems.length})</p>
                <p className="text-sm font-bold text-blue-600">L {totalConsulta.laborat.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-600 text-white rounded-lg px-3 sm:px-4 py-2.5 gap-1 sm:gap-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium opacity-90">Total a cobrar al paciente</span>
                {recetaItems.length > 0 && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                    + {recetaItems.length} medicamento{recetaItems.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-2xl sm:text-xl font-extrabold tracking-tight">L {totalConsulta.total.toFixed(2)}</span>
            </div>
          </div>
        </ResponsiveModal>
      )}

      {/* ══════════ MODAL DOCUMENTOS (consultas cobradas) ══════════ */}
      {modalDocs && consultaActual && (
        <ResponsiveModal
          title="Documentos clínicos"
          subtitle={`${nombrePaciente(consultaActual.paciente)} — Consulta #${consultaActual.id}`}
          onClose={() => setModalDocs(false)}
          size="xl"
          footer={
            <div className="flex justify-end w-full">
              <button onClick={() => setModalDocs(false)} className="px-4 py-2.5 border rounded-xl text-sm">
                Cerrar
              </button>
            </div>
          }
        >
          <ConsultaDocumentosPanel
            consultaId={consultaActual.id}
            pacienteId={consultaActual.paciente_id}
            paciente={consultaActual.paciente}
            sucursalId={consultaActual.sucursal_id ?? sucursalOperativa}
            estadoPago={consultaActual.estado_pago}
            cobrado={consultaActual.cobrado}
            recetaItems={recetaItems}
            tratamiento={consultaActual.tratamiento ?? formMedico.tratamiento}
            diasReposo={Number(consultaActual.dias_reposo ?? formMedico.dias_reposo) || 0}
            impresionDiagnostica={consultaActual.impresion ?? formMedico.impresion}
            esSuperAdmin={esSuperAdmin}
            fechaConsulta={consultaActual.fecha}
          />
        </ResponsiveModal>
      )}
    </div>
  )
}

/* ── CitaRow component ── */
function CitaRow({ cita, serviciosConsulta, mostrarSucursal, nombreSucursal, membresiasMap, listasMap, onEstado, onAbrirConsulta }: {
  cita: Cita
  serviciosConsulta: Servicio[]
  mostrarSucursal?: boolean
  nombreSucursal?: string
  membresiasMap?: MembresiasMap
  listasMap?: Record<number, string>
  onEstado: (id: number, estado: string) => void
  onAbrirConsulta: (cita: Cita, servicioId: string) => void
}) {
  const servicioCita = cita.servicio && esServicioConsulta(cita.servicio)
    ? cita.servicio
    : serviciosConsulta.find(s => s.id === cita.servicio_id)
  const [showTipo, setShowTipo] = useState(false)
  const [servicioId, setServicioId] = useState(
    String(servicioCita?.id ?? serviciosConsulta[0]?.id ?? ''),
  )

  const abrirDirecto = () => {
    onAbrirConsulta(cita, servicioId)
    setShowTipo(false)
  }

  return (
    <tr className={`hover:bg-gray-50 ${cita.estado === 'CANCELADO' ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">
          {nombrePaciente(cita.paciente)}
          {esPacienteEmpresa(cita.paciente) && (
            <span className="ml-1 text-[10px] font-bold text-violet-600">EMP</span>
          )}
        </p>
        <p className="text-xs text-gray-400">{detallePaciente(cita.paciente)}</p>
        <div className="mt-1">
          <PacientePlanBadge
            pacienteId={cita.paciente_id}
            listaId={cita.paciente?.lista_id}
            listaNombre={cita.paciente?.lista_id ? listasMap?.[cita.paciente.lista_id] : undefined}
            membresiasMap={membresiasMap}
          />
        </div>
      </td>
      {mostrarSucursal && (
        <td className="px-4 py-3 text-xs text-sky-700 hidden lg:table-cell">{nombreSucursal}</td>
      )}
      <td className="px-4 py-3 text-gray-600">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {cita.hora?.slice(0, 5)}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {cita.paciente?.celular || cita.paciente?.telefono || '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{cita.nota || '—'}</td>
      <td className="px-4 py-3 text-center">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${estadoBadgeClase(cita.estado)}`}>
          {cita.estado}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {cita.estado === 'ACTIVO' && (
            <>
              <button onClick={() => onEstado(cita.id, 'ASISTIÓ')}
                className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200" title="Asistió">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEstado(cita.id, 'NO ASISTIÓ')}
                className="p-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200" title="No asistió">
                <XCircle className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEstado(cita.id, 'CANCELADO')}
                className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200" title="Cancelar">
                <AlertCircle className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Botón principal de consulta — abre directo si hay un solo tipo */}
          {(cita.estado === 'ACTIVO' || cita.estado === 'ASISTIÓ') && (
            serviciosConsulta.length === 0 ? (
              <span className="text-[10px] text-amber-600">Sin tipos en catálogo</span>
            ) : servicioCita || serviciosConsulta.length <= 1 ? (
              <button
                onClick={abrirDirecto}
                className="px-2 py-1 bg-blue-600 text-white rounded text-xs flex items-center gap-1 hover:bg-blue-700">
                <Stethoscope className="w-3 h-3" /> Abrir Consulta
              </button>
            ) : (
              <button onClick={() => setShowTipo(!showTipo)}
                className="px-2 py-1 bg-blue-600 text-white rounded text-xs flex items-center gap-1 hover:bg-blue-700">
                <ClipboardList className="w-3 h-3" />
                {cita.estado === 'ASISTIÓ' ? 'Abrir' : 'Consulta'}
              </button>
            )
          )}
        </div>

        {/* Selector de tipo (solo si hay varios) */}
        {showTipo && serviciosConsulta.length > 1 && (
          <div className="mt-2 flex gap-1">
            <select
              value={servicioId}
              onChange={e => setServicioId(e.target.value)}
              className="flex-1 border rounded text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {serviciosConsulta.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — L {Number(s.precio).toFixed(2)}
                </option>
              ))}
            </select>
            <button
              onClick={abrirDirecto}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

