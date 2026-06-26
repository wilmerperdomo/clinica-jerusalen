'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Megaphone, Plus, Image as ImageIcon, Calendar, Send, Users,
  MessageCircle, Mail, Sparkles, Trash2, Pencil, Play, Clock,
  CheckCircle2, ChevronRight, ChevronLeft, RefreshCw,
  AlertCircle, Target, Zap, BookUser, Phone, AtSign, Search,
  FileText, BarChart3, Cake, Reply, Copy, Download, SkipForward, ClipboardList,
} from 'lucide-react'
import PromocionesPlantillasPanel from './promociones-plantillas-panel'
import PromocionesReportesPanel from './promociones-reportes-panel'
import PromocionesAutomatizacionesPanel from './promociones-automatizaciones-panel'
import { type PromocionPlantilla } from '@/lib/promociones-plantillas'
import ResponsiveModal from '@/components/responsive-modal'
import BuscarPacienteInput from '@/components/buscar-paciente-input'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'
import { nombrePaciente } from '@/lib/consultas-utils'
import { buscarPacientesActivos, type PacienteBusquedaRow } from '@/lib/buscar-pacientes'
import {
  subirImagenPromocion, resolverDestinatarios, resumenCanales,
  canalesParaDestinatario, tieneWhatsApp, tieneCorreo,
} from '@/lib/promocion-audiencia'
import {
  AUDIENCIA_OPCIONES, CANAL_CFG, CATEGORIAS_SERVICIO_PROMO, ESTADO_CAMPANA_CFG,
  campanaVencidaProgramacion, cfgCategoriaServicio, cfgProveedorEnvio, claveDestinatario,
  destinatarioAContacto, esEncuesta, fmtVigencia, linkEnvioPromocion, mensajePromocion,
  PROVEEDOR_ENVIO_OPCIONES, serviciosParaCategoria, TIPO_CONTENIDO_CFG,
  type Campana, type CanalCampana, type CategoriaServicioPromo, type DestinatarioPromo,
  type EnvioRegistro, type FiltroAudiencia, type Promocion, type PromocionContacto,
  type ProveedorEnvio, type ServicioPromo, type TipoAudiencia,
} from '@/lib/promociones-utils'

interface SucursalOpt { id: number; nombre: string }
interface Stats { totalActivos: number; conWhatsApp: number; conCorreo: number; totalContactos?: number }

const CONTACTO_VACIO: Omit<PromocionContacto, 'id' | 'created_at'> = {
  nombre: '', celular: '', correo: '', notas: '', activo: true, sucursal_id: null,
}

interface Props {
  promocionesIniciales: Promocion[]
  campanasIniciales: Campana[]
  sucursales: SucursalOpt[]
  servicios: ServicioPromo[]
  esSuperAdmin?: boolean
  sucursalId?: number | null
  sucursalNombre?: string | null
  stats: Stats
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string; code?: string }
    return [o.message, o.details, o.hint, o.code ? `(código ${o.code})` : '']
      .filter(Boolean)
      .join(' · ') || 'desconocido'
  }
  return typeof e === 'string' ? e : 'desconocido'
}

async function copiarImagenPortapapeles(url: string): Promise<void> {
  const res = await fetch(url, { mode: 'cors' })
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0)
  const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!pngBlob) throw new Error('No se pudo convertir la imagen')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

async function descargarImagen(url: string, nombre: string): Promise<void> {
  const res = await fetch(url, { mode: 'cors' })
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  const ext = blob.type.split('/')[1] || 'jpg'
  a.download = `${nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
}

const ENCUESTA_URL_DEFAULT = process.env.NEXT_PUBLIC_ENCUESTA_URL ?? ''

const PROMO_VACIA: Omit<Promocion, 'id' | 'created_at'> = {
  titulo: '', subtitulo: '', descripcion: '', imagen_url: null, encuesta_url: null,
  tipo_contenido: 'mixto', categoria_servicio: 'general', servicio_id: null,
  descuento_pct: null, precio_promocional: null,
  vigencia_desde: null, vigencia_hasta: null,
  activa: true, sucursal_id: null,
}

export default function PromocionesClient({
  promocionesIniciales, campanasIniciales, sucursales, servicios,
  esSuperAdmin = false, sucursalId, sucursalNombre, stats,
}: Props) {
  const sb = supabase()
  const [tab, setTab] = useState<'promociones' | 'campanas' | 'contactos' | 'plantillas' | 'reportes' | 'auto'>('promociones')
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaServicioPromo | 'todas'>('todas')
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'promocion' | 'encuesta'>('todas')
  const [promociones, setPromociones] = useState(promocionesIniciales)
  const [campanas, setCampanas] = useState(campanasIniciales)
  const [cargando, setCargando] = useState(false)
  const [procesandoAuto, setProcesandoAuto] = useState(false)
  const [envioConfig, setEnvioConfig] = useState<{
    whatsapp: boolean
    evolution: boolean
    evolutionConnected: boolean
    evolutionState?: string
    evolutionInstance?: string
    resend: boolean
    sendgrid: boolean
    evolutionBatchSize: number
    evolutionDelayMs: number
  } | null>(null)

  const [modalPromo, setModalPromo] = useState(false)
  const [promoEdit, setPromoEdit] = useState<Promocion | null>(null)
  const [formPromo, setFormPromo] = useState({ ...PROMO_VACIA })
  const [archivoImg, setArchivoImg] = useState<File | null>(null)
  const [guardandoPromo, setGuardandoPromo] = useState(false)

  const [modalCampana, setModalCampana] = useState(false)
  const [promoCampana, setPromoCampana] = useState<Promocion | null>(null)
  const [pasoCampana, setPasoCampana] = useState(1)
  const [formCampana, setFormCampana] = useState({
    nombre: '', canal: 'ambos' as CanalCampana,
    audiencia: 'todos' as TipoAudiencia,
    programado: false,
    proveedor_envio: 'asistido' as ProveedorEnvio,
    programado_para: '',
    mensaje_personalizado: '',
    plantilla_id: null as number | null,
    sucursal_filtro: sucursalId ?? null as number | null,
    meses_historial: 24,
  })
  const [pacientesManual, setPacientesManual] = useState<PacienteBusquedaRow[]>([])
  const [contactosManual, setContactosManual] = useState<PromocionContacto[]>([])
  const [contactosElegidos, setContactosElegidos] = useState<Set<number>>(new Set())
  const [buscarContactoCampana, setBuscarContactoCampana] = useState('')
  const [buscarPacManual, setBuscarPacManual] = useState('')
  const [destinatariosPreview, setDestinatariosPreview] = useState<DestinatarioPromo[]>([])
  const [seleccionDestinatarios, setSeleccionDestinatarios] = useState<Set<string>>(new Set())
  const [resumenPreview, setResumenPreview] = useState<{ whatsapp: number; email: number; sinContacto: number; enviables: number } | null>(null)
  const [cargandoPreview, setCargandoPreview] = useState(false)
  const [creandoCampana, setCreandoCampana] = useState(false)

  const [contactos, setContactos] = useState<PromocionContacto[]>([])
  const [plantillas, setPlantillas] = useState<PromocionPlantilla[]>([])
  const [buscarContacto, setBuscarContacto] = useState('')
  const [modalContacto, setModalContacto] = useState(false)
  const [contactoEdit, setContactoEdit] = useState<PromocionContacto | null>(null)
  const [formContacto, setFormContacto] = useState({ ...CONTACTO_VACIO })
  const [guardandoContacto, setGuardandoContacto] = useState(false)

  const [modalEnvio, setModalEnvio] = useState(false)
  const [campanaEnvio, setCampanaEnvio] = useState<Campana | null>(null)
  const [estadoImagen, setEstadoImagen] = useState<'idle' | 'copiando' | 'copiado' | 'error'>('idle')
  const [envios, setEnvios] = useState<EnvioRegistro[]>([])
  const [indiceEnvio, setIndiceEnvio] = useState(0)

  const mapaSucursales = useMemo(
    () => Object.fromEntries(sucursales.map(s => [s.id, s.nombre])),
    [sucursales],
  )

  const campanasListas = useMemo(
    () => campanas.filter(c => c.estado === 'lista_envio' || c.estado === 'en_proceso'),
    [campanas],
  )

  const promocionesFiltradas = useMemo(() => {
    let lista = promociones
    if (filtroTipo === 'encuesta') lista = lista.filter(p => esEncuesta(p))
    else if (filtroTipo === 'promocion') lista = lista.filter(p => !esEncuesta(p))
    if (filtroCategoria === 'todas') return lista
    return lista.filter(p => (p.categoria_servicio ?? 'general') === filtroCategoria)
  }, [promociones, filtroCategoria, filtroTipo])

  const totalEncuestas = useMemo(() => promociones.filter(p => esEncuesta(p)).length, [promociones])
  const totalPromos = promociones.length - totalEncuestas

  const serviciosFormPromo = useMemo(
    () => serviciosParaCategoria(servicios, formPromo.categoria_servicio ?? 'general'),
    [servicios, formPromo.categoria_servicio],
  )

  const contactosCampanaFiltrados = useMemo(() => {
    const activos = contactos.filter(c => c.activo)
    const q = buscarContactoCampana.trim().toLowerCase()
    if (!q) return activos
    return activos.filter(c =>
      c.nombre.toLowerCase().includes(q)
      || c.celular?.includes(q)
      || c.correo?.toLowerCase().includes(q),
    )
  }, [contactos, buscarContactoCampana])

  const contactosADestinatarios = useCallback((ids: Set<number>): DestinatarioPromo[] =>
    contactos
      .filter(c => c.activo && ids.has(c.id))
      .map(c => ({
        tipo: 'contacto' as const,
        id: c.id,
        nombre: c.nombre,
        celular: c.celular,
        correo: c.correo,
      })),
  [contactos])

  useEffect(() => {
    if (!modalCampana || formCampana.audiencia !== 'contactos') return
    const lista = contactosADestinatarios(contactosElegidos)
    setDestinatariosPreview(lista)
    setSeleccionDestinatarios(new Set(lista.map(claveDestinatario)))
    setResumenPreview(lista.length > 0 ? resumenCanales(lista, formCampana.canal) : null)
  }, [modalCampana, formCampana.audiencia, formCampana.canal, contactosElegidos, contactosADestinatarios])

  const audienciaOpcionesCampana = useMemo(() => {
    const cat = promoCampana?.categoria_servicio ?? 'general'
    return AUDIENCIA_OPCIONES.filter(a => {
      if (a.soloServicio && cat === 'general' && !promoCampana?.servicio_id) return false
      return true
    })
  }, [promoCampana])

  function seleccionarContactosCampana(ids: Set<number>) {
    setContactosElegidos(ids)
  }

  function toggleContactoElegido(id: number) {
    setContactosElegidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      let pq = sb.from('promociones').select('*, servicio:servicios(id, nombre, tipo, precio)').order('created_at', { ascending: false }).limit(200)
      let cq = sb.from('promocion_campanas').select('*, promocion:promociones(*)').order('created_at', { ascending: false }).limit(100)
      let ctq = sb.from('promocion_contactos').select('*').order('nombre').limit(5000)
      let plq = sb.from('promocion_plantillas').select('*').eq('activa', true).order('nombre')
      if (!esSuperAdmin && sucursalId) {
        pq = pq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
        cq = cq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
        ctq = ctq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
        plq = plq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
      }
      const [{ data: p }, { data: c }, { data: ct }, { data: pl }] = await Promise.all([pq, cq, ctq, plq])
      if (p) setPromociones(p as Promocion[])
      if (c) setCampanas(c as Campana[])
      if (ct) setContactos(ct as PromocionContacto[])
      if (pl) setPlantillas(pl as PromocionPlantilla[])
    } finally {
      setCargando(false)
    }
  }, [sb, esSuperAdmin, sucursalId])

  const activarProgramadas = useCallback(async () => {
    const vencidas = campanas.filter(c => campanaVencidaProgramacion(c) && c.modo_envio !== 'automatico')
    if (vencidas.length === 0) return
    for (const c of vencidas) {
      await sb.from('promocion_campanas').update({ estado: 'lista_envio' }).eq('id', c.id)
    }
    await recargar()
  }, [campanas, sb, recargar])

  useEffect(() => { void activarProgramadas() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetch('/api/promociones/config')
      .then(r => r.json())
      .then(data => { if (data?.config) setEnvioConfig(data.config) })
      .catch(() => {})
  }, [])

  const recargarConfigEnvio = useCallback(async () => {
    try {
      const res = await fetch('/api/promociones/config')
      const data = await res.json()
      if (data?.config) setEnvioConfig(data.config)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void (async () => {
      let ctq = sb.from('promocion_contactos').select('*').order('nombre').limit(5000)
      if (!esSuperAdmin && sucursalId) {
        ctq = ctq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
      }
      const { data } = await ctq
      if (data) setContactos(data as PromocionContacto[])
    })()
  }, [sb, esSuperAdmin, sucursalId])

  const contactosFiltrados = useMemo(() => {
    const q = buscarContacto.trim().toLowerCase()
    if (!q) return contactos
    return contactos.filter(c =>
      c.nombre.toLowerCase().includes(q)
      || c.celular?.includes(q)
      || c.correo?.toLowerCase().includes(q),
    )
  }, [contactos, buscarContacto])

  function abrirNuevoContacto() {
    setContactoEdit(null)
    setFormContacto({ ...CONTACTO_VACIO, sucursal_id: esSuperAdmin ? null : sucursalId ?? null })
    setModalContacto(true)
  }

  function abrirEditarContacto(c: PromocionContacto) {
    setContactoEdit(c)
    setFormContacto({ ...c })
    setModalContacto(true)
  }

  async function guardarContacto() {
    if (!formContacto.nombre.trim()) { alert('El nombre es obligatorio.'); return }
    if (!formContacto.celular?.trim() && !formContacto.correo?.trim()) {
      alert('Agregue al menos un WhatsApp o un correo.')
      return
    }
    setGuardandoContacto(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      const payload = {
        nombre: formContacto.nombre.trim(),
        celular: formContacto.celular?.trim() || null,
        correo: formContacto.correo?.trim() || null,
        notas: formContacto.notas?.trim() || null,
        activo: formContacto.activo,
        sucursal_id: formContacto.sucursal_id,
        ...(contactoEdit ? {} : { creado_por: user?.id ?? null }),
      }
      if (contactoEdit) {
        const { error } = await sb.from('promocion_contactos').update(payload).eq('id', contactoEdit.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('promocion_contactos').insert(payload)
        if (error) throw error
      }
      setModalContacto(false)
      await recargar()
    } catch (e) {
      alert('Error al guardar contacto: ' + mensajeError(e))
    } finally {
      setGuardandoContacto(false)
    }
  }

  async function eliminarContacto(id: number) {
    if (!confirm('¿Eliminar este contacto de la agenda?')) return
    const { error } = await sb.from('promocion_contactos').delete().eq('id', id)
    if (error) return alert(error.message)
    await recargar()
  }

  function filtroCampanaActual(): FiltroAudiencia {
    const cat = promoCampana?.categoria_servicio ?? 'general'
    return {
      tipo: formCampana.audiencia,
      sucursal_id: formCampana.sucursal_filtro,
      paciente_ids: formCampana.audiencia === 'manual' ? pacientesManual.map(p => p.id) : undefined,
      contacto_ids: formCampana.audiencia === 'contactos'
        ? [...contactosElegidos]
        : formCampana.audiencia === 'manual'
          ? contactosManual.map(c => c.id)
          : undefined,
      categoria_servicio: formCampana.audiencia === 'por_servicio' ? cat : undefined,
      servicio_id: formCampana.audiencia === 'por_servicio' ? (promoCampana?.servicio_id ?? null) : undefined,
      meses_historial: formCampana.audiencia === 'por_servicio' ? formCampana.meses_historial : undefined,
    }
  }

  async function cargarPreviewAudiencia() {
    setCargandoPreview(true)
    try {
      const filtro = filtroCampanaActual()
      if (filtro.tipo === 'manual' && !filtro.paciente_ids?.length && !filtro.contacto_ids?.length) {
        setDestinatariosPreview([])
        setSeleccionDestinatarios(new Set())
        setResumenPreview({ whatsapp: 0, email: 0, sinContacto: 0, enviables: 0 })
        return
      }
      const lista = await resolverDestinatarios(sb, filtro, { sucursalId, esSuperAdmin })
      setDestinatariosPreview(lista)
      setSeleccionDestinatarios(new Set(lista.map(claveDestinatario)))
      setResumenPreview(resumenCanales(lista, formCampana.canal))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al calcular audiencia')
    } finally {
      setCargandoPreview(false)
    }
  }

  function toggleDestinatario(clave: string) {
    setSeleccionDestinatarios(prev => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      const seleccionados = destinatariosPreview.filter(d => next.has(claveDestinatario(d)))
      setResumenPreview(resumenCanales(seleccionados, formCampana.canal))
      return next
    })
  }

  function seleccionarTodosDestinatarios(seleccionar: boolean) {
    if (seleccionar) {
      setSeleccionDestinatarios(new Set(destinatariosPreview.map(claveDestinatario)))
      setResumenPreview(resumenCanales(destinatariosPreview, formCampana.canal))
    } else {
      setSeleccionDestinatarios(new Set())
      setResumenPreview({ whatsapp: 0, email: 0, sinContacto: 0, enviables: 0 })
    }
  }

  function abrirNuevaPromo() {
    setPromoEdit(null)
    setFormPromo({ ...PROMO_VACIA, tipo_contenido: 'mixto', sucursal_id: esSuperAdmin ? null : sucursalId ?? null })
    setArchivoImg(null)
    setModalPromo(true)
  }

  function abrirNuevaEncuesta() {
    setPromoEdit(null)
    setFormPromo({
      ...PROMO_VACIA,
      tipo_contenido: 'encuesta',
      titulo: 'Encuesta de satisfacción',
      subtitulo: 'Su opinión nos ayuda a mejorar',
      descripcion: 'Nos gustaría conocer su experiencia con la atención recibida. Solo toma 1 minuto.',
      encuesta_url: ENCUESTA_URL_DEFAULT || null,
      sucursal_id: esSuperAdmin ? null : sucursalId ?? null,
    })
    setArchivoImg(null)
    setModalPromo(true)
  }

  function abrirEditarPromo(p: Promocion) {
    setPromoEdit(p)
    setFormPromo({ ...p })
    setArchivoImg(null)
    setModalPromo(true)
  }

  async function guardarPromo() {
    if (!formPromo.titulo.trim()) { alert('El título es obligatorio.'); return }
    if (formPromo.tipo_contenido === 'encuesta' && !formPromo.encuesta_url?.trim()) {
      alert('Indique el enlace de la encuesta (Google Forms, Microsoft Forms, etc.).')
      return
    }
    setGuardandoPromo(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      let imagenUrl = formPromo.imagen_url
      if (archivoImg) imagenUrl = await subirImagenPromocion(sb, archivoImg)

      const payload = {
        titulo: formPromo.titulo.trim(),
        subtitulo: formPromo.subtitulo?.trim() || null,
        descripcion: formPromo.descripcion?.trim() || null,
        imagen_url: formPromo.tipo_contenido === 'encuesta' ? null : imagenUrl,
        encuesta_url: formPromo.tipo_contenido === 'encuesta' ? formPromo.encuesta_url?.trim() || null : null,
        tipo_contenido: formPromo.tipo_contenido,
        categoria_servicio: formPromo.categoria_servicio ?? 'general',
        servicio_id: formPromo.servicio_id || null,
        descuento_pct: formPromo.descuento_pct ? Number(formPromo.descuento_pct) : null,
        precio_promocional: formPromo.precio_promocional ? Number(formPromo.precio_promocional) : null,
        vigencia_desde: formPromo.vigencia_desde || null,
        vigencia_hasta: formPromo.vigencia_hasta || null,
        activa: formPromo.activa,
        sucursal_id: formPromo.sucursal_id,
        ...(promoEdit ? {} : { creado_por: user?.id ?? null }),
      }

      if (promoEdit) {
        const { error } = await sb.from('promociones').update(payload).eq('id', promoEdit.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('promociones').insert(payload)
        if (error) throw error
      }
      setModalPromo(false)
      await recargar()
    } catch (e) {
      alert('Error al guardar: ' + mensajeError(e))
    } finally {
      setGuardandoPromo(false)
    }
  }

  async function eliminarPromo(id: number) {
    if (!confirm('¿Eliminar esta promoción? Las campañas asociadas también se eliminarán.')) return
    const { error } = await sb.from('promociones').delete().eq('id', id)
    if (error) return alert(error.message)
    await recargar()
  }

  function abrirCampana(promo: Promocion) {
    const cat = promo.categoria_servicio ?? 'general'
    const audienciaDefault: TipoAudiencia = (cat !== 'general' || promo.servicio_id) ? 'por_servicio' : 'todos'
    setPromoCampana(promo)
    setPasoCampana(1)
    setFormCampana({
      nombre: esEncuesta(promo) ? `Encuesta — ${promo.titulo}` : `Campaña — ${promo.titulo}`,
      canal: 'ambos',
      audiencia: audienciaDefault,
      programado: false,
      proveedor_envio: 'asistido' as ProveedorEnvio,
      programado_para: '',
      mensaje_personalizado: '',
      plantilla_id: null,
      sucursal_filtro: esSuperAdmin ? null : sucursalId ?? null,
      meses_historial: 24,
    })
    setPacientesManual([])
    setContactosManual([])
    setContactosElegidos(new Set())
    setBuscarContactoCampana('')
    setDestinatariosPreview([])
    setSeleccionDestinatarios(new Set())
    setResumenPreview(null)
    setModalCampana(true)
  }

  async function crearCampana(iniciarAhora: boolean) {
    if (!promoCampana) return
    if (!formCampana.nombre.trim()) { alert('Nombre de campaña obligatorio.'); return }
    if (formCampana.programado && !formCampana.programado_para) {
      alert('Indique fecha y hora de programación.')
      return
    }
    if (formCampana.audiencia === 'manual' && pacientesManual.length === 0 && contactosManual.length === 0) {
      alert('Agregue al menos un paciente o contacto.')
      return
    }
    if (formCampana.audiencia === 'contactos' && contactosElegidos.size === 0) {
      alert('Seleccione al menos un contacto de la lista.')
      return
    }
    const proveedor = formCampana.proveedor_envio
    const automatico = proveedor !== 'asistido'
    if (automatico) {
      const canal = formCampana.canal
      const necesitaWhatsApp = canal === 'whatsapp' || canal === 'ambos'
      const necesitaEmail = canal === 'email' || canal === 'ambos'
      if (envioConfig) {
        if (necesitaWhatsApp && proveedor === 'meta' && !envioConfig.whatsapp) {
          alert('WhatsApp oficial (Meta) requiere WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Vercel.\n\nUse "Asistido gratis" o configure Evolution API en su servidor.')
          return
        }
        if (necesitaWhatsApp && proveedor === 'evolution') {
          if (!envioConfig.evolution) {
            alert('Evolution API no está configurada. Agregue EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE_NAME en Vercel.')
            return
          }
          if (!envioConfig.evolutionConnected) {
            alert('WhatsApp Web no está conectado en Evolution. Escanee el código QR en su servidor antes de enviar.')
            return
          }
        }
        if (necesitaEmail && !envioConfig.resend && !envioConfig.sendgrid) {
          alert('El envío automático por correo requiere RESEND_API_KEY o SENDGRID_API_KEY en Vercel.')
          return
        }
      }
    }

    setCreandoCampana(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      const filtro = filtroCampanaActual()
      let audiencia = destinatariosPreview.length > 0
        ? destinatariosPreview
        : await resolverDestinatarios(sb, filtro, { sucursalId, esSuperAdmin })

      if (destinatariosPreview.length > 0) {
        audiencia = audiencia.filter(d => seleccionDestinatarios.has(claveDestinatario(d)))
      }

      const filasEnvio: {
        campana_id: number
        paciente_id: number | null
        contacto_id: number | null
        canal: string
        estado: string
      }[] = []

      for (const d of audiencia) {
        for (const canal of canalesParaDestinatario(d, formCampana.canal)) {
          if (d.tipo === 'paciente') {
            filasEnvio.push({ campana_id: 0, paciente_id: d.id, contacto_id: null, canal, estado: 'pendiente' })
          } else {
            filasEnvio.push({ campana_id: 0, paciente_id: null, contacto_id: d.id, canal, estado: 'pendiente' })
          }
        }
      }

      if (filasEnvio.length === 0) {
        alert('No hay destinatarios con contacto válido para el canal seleccionado.')
        return
      }

      const modoEnvio = automatico
        ? 'automatico'
        : (formCampana.programado ? 'programado' : 'asistido')
      const estado = formCampana.programado
        ? 'programada'
        : (iniciarAhora ? 'en_proceso' : 'lista_envio')

      const { data: campana, error: errC } = await sb.from('promocion_campanas').insert({
        promocion_id: promoCampana.id,
        nombre: formCampana.nombre.trim(),
        canal: formCampana.canal,
        modo_envio: modoEnvio,
        proveedor_envio: proveedor,
        programado_para: formCampana.programado ? new Date(formCampana.programado_para).toISOString() : null,
        estado,
        filtro_audiencia: filtro,
        mensaje_personalizado: formCampana.mensaje_personalizado.trim() || null,
        plantilla_id: formCampana.plantilla_id,
        total_destinatarios: filasEnvio.length,
        sucursal_id: esSuperAdmin ? formCampana.sucursal_filtro : sucursalId,
        creado_por: user?.id ?? null,
        iniciada_at: iniciarAhora ? new Date().toISOString() : null,
      }).select('*, promocion:promociones(*)').single()

      if (errC || !campana) throw errC ?? new Error('No se creó la campaña')

      const inserts = filasEnvio.map(f => ({ ...f, campana_id: campana.id }))
      const { error: errE } = await sb.from('promocion_envios').insert(inserts)
      if (errE) throw errE

      setModalCampana(false)
      await recargar()

      if (iniciarAhora && automatico) {
        await procesarAutomaticas()
      } else if (iniciarAhora && !formCampana.programado) {
        await abrirEnvio(campana as Campana)
      } else if (formCampana.programado) {
        alert(`Campaña programada para ${new Date(formCampana.programado_para).toLocaleString('es-HN')}`)
      } else {
        alert(`Campaña creada con ${filasEnvio.length} envíos pendientes.`)
      }
    } catch (e) {
      alert('Error al crear campaña: ' + mensajeError(e))
    } finally {
      setCreandoCampana(false)
    }
  }

  async function abrirEnvio(campana: Campana) {
    const { data, error } = await sb
      .from('promocion_envios')
      .select('*, paciente:pacientes(id, codigo, nombre, apellido1, celular, telefono, correo), contacto:promocion_contactos(id, nombre, celular, correo)')
      .eq('campana_id', campana.id)
      .order('id')
    if (error) return alert(error.message)

    const lista = (data ?? []) as EnvioRegistro[]
    const pendiente = lista.findIndex(e => e.estado === 'pendiente')
    setCampanaEnvio(campana)
    setEnvios(lista)
    setIndiceEnvio(pendiente >= 0 ? pendiente : 0)
    setModalEnvio(true)

    if (campana.estado !== 'en_proceso' && campana.estado !== 'completada') {
      await sb.from('promocion_campanas').update({
        estado: 'en_proceso', iniciada_at: new Date().toISOString(),
      }).eq('id', campana.id)
    }
  }

  async function procesarAutomaticas() {
    setProcesandoAuto(true)
    try {
      const res = await fetch('/api/promociones/cron', { method: 'POST' })
      const data = await res.json()
      if (!res.ok && !data?.ok) {
        alert(data?.error || 'No se pudieron procesar las campañas automáticas.')
        return
      }
      await recargar()
      alert(
        `Automatización ejecutada.\n` +
        `Reglas: ${data.reglasCampanas ?? 0} campaña(s) · ${data.reglasDestinatarios ?? 0} destinatario(s)\n` +
        `Envíos API: ${data.enviados ?? 0} ok · ${data.fallidos ?? 0} fallidos` +
        (data.errores?.length ? `\n\nErrores:\n${data.errores.slice(0, 5).join('\n')}` : ''),
      )
    } catch (e) {
      alert('Error al procesar automatización: ' + mensajeError(e))
    } finally {
      setProcesandoAuto(false)
    }
  }

  const envioActual = envios[indiceEnvio]
  const promoEnvio = campanaEnvio?.promocion ?? promociones.find(p => p.id === campanaEnvio?.promocion_id)

  async function marcarEnvio(estado: 'enviado' | 'sin_contacto' | 'omitido') {
    if (!envioActual || !campanaEnvio) return
    await sb.from('promocion_envios').update({
      estado,
      enviado_at: estado === 'enviado' ? new Date().toISOString() : null,
    }).eq('id', envioActual.id)

    const actualizados = envios.map((e, i) =>
      i === indiceEnvio ? { ...e, estado } : e,
    )
    setEnvios(actualizados)

    const totalEnviados = actualizados.filter(e => e.estado === 'enviado').length
    const totalOmit = actualizados.filter(e => e.estado !== 'enviado' && e.estado !== 'pendiente').length

    await sb.from('promocion_campanas').update({
      total_enviados: totalEnviados,
      total_omitidos: totalOmit,
    }).eq('id', campanaEnvio.id)

    const siguiente = actualizados.findIndex((e, i) => i > indiceEnvio && e.estado === 'pendiente')
    if (siguiente >= 0) {
      setEstadoImagen('idle')
      setIndiceEnvio(siguiente)
    } else if (!actualizados.some(e => e.estado === 'pendiente')) {
      await sb.from('promocion_campanas').update({
        estado: 'completada', completada_at: new Date().toISOString(),
      }).eq('id', campanaEnvio.id)
      alert('¡Campaña completada!')
      setModalEnvio(false)
      await recargar()
    }
  }

  async function enviarActual() {
    const dest = envioActual?.paciente ?? envioActual?.contacto
    if (!dest || !promoEnvio || !envioActual) return
    const url = linkEnvioPromocion(
      destinatarioAContacto(dest),
      promoEnvio,
      envioActual.canal,
      campanaEnvio?.mensaje_personalizado,
    )
    if (!url) {
      alert('Este destinatario no tiene contacto válido para este canal.')
      return
    }
    if (!envioActual.abierto_at) {
      const ahora = new Date().toISOString()
      await sb.from('promocion_envios').update({ abierto_at: ahora }).eq('id', envioActual.id)
      setEnvios(prev => prev.map((e, i) => i === indiceEnvio ? { ...e, abierto_at: ahora } : e))
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function marcarRespondio() {
    if (!envioActual) return
    const ahora = new Date().toISOString()
    await sb.from('promocion_envios').update({
      respondio: true,
      respondio_at: ahora,
    }).eq('id', envioActual.id)
    setEnvios(prev => prev.map((e, i) =>
      i === indiceEnvio ? { ...e, respondio: true, respondio_at: ahora } : e,
    ))
  }

  const textoMensajeActual = useMemo(() => {
    const dest = envioActual?.paciente ?? envioActual?.contacto
    if (!dest || !promoEnvio) return ''
    return mensajePromocion(promoEnvio, destinatarioAContacto(dest), campanaEnvio?.mensaje_personalizado)
  }, [envioActual, promoEnvio, campanaEnvio])

  function irAEnvio(indice: number) {
    setEstadoImagen('idle')
    setIndiceEnvio(indice)
  }

  async function copiarMensajeActual() {
    if (!textoMensajeActual) return
    try {
      await navigator.clipboard.writeText(textoMensajeActual)
      setEstadoImagen('idle')
    } catch {
      alert('No se pudo copiar el mensaje.')
    }
  }

  async function copiarImagenActual() {
    if (!promoEnvio?.imagen_url) return
    setEstadoImagen('copiando')
    try {
      await copiarImagenPortapapeles(promoEnvio.imagen_url)
      setEstadoImagen('copiado')
      setTimeout(() => setEstadoImagen('idle'), 2500)
    } catch {
      setEstadoImagen('error')
      try {
        await descargarImagen(promoEnvio.imagen_url, promoEnvio.titulo || 'promocion')
        alert('No se pudo copiar al portapapeles, pero se descargó la imagen. Adjúntela manualmente en WhatsApp.')
      } catch {
        alert('No se pudo copiar ni descargar la imagen. Verifique su conexión.')
      }
      setTimeout(() => setEstadoImagen('idle'), 2500)
    }
  }

  async function descargarImagenActual() {
    if (!promoEnvio?.imagen_url) return
    try {
      await descargarImagen(promoEnvio.imagen_url, promoEnvio.titulo || 'promocion')
    } catch {
      alert('No se pudo descargar la imagen.')
    }
  }

  async function cancelarCampana(id: number) {
    if (!confirm('¿Cancelar esta campaña?')) return
    await sb.from('promocion_campanas').update({ estado: 'cancelada' }).eq('id', id)
    await recargar()
  }

  return (
    <ModuleShell tint="rose">
      <ModuleHero
        title="Promociones y Publicidad"
        subtitle={
          esSuperAdmin
            ? 'Campañas a pacientes por WhatsApp y correo · todas las sucursales'
            : `${sucursalNombre ?? 'Sucursal'} · comunicación con pacientes`
        }
        badge="Marketing clínico"
        icon={Megaphone}
        gradient="rose"
        kpis={[
          { label: 'Pacientes activos', value: stats.totalActivos, icon: Users },
          { label: 'Con WhatsApp', value: stats.conWhatsApp, icon: MessageCircle },
          { label: 'Con correo', value: stats.conCorreo, icon: Mail },
          { label: 'Contactos', value: contactos.filter(c => c.activo).length, icon: BookUser },
          { label: 'Promociones', value: promociones.filter(p => p.activa).length, icon: Sparkles },
          { label: 'Campañas activas', value: campanasListas.length, icon: Send },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <ModuleBtnGhost onClick={recargar} disabled={cargando}>
              <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            </ModuleBtnGhost>
            <ModuleBtnGhost onClick={procesarAutomaticas} disabled={procesandoAuto} className="gap-1.5">
              <Zap className={`w-4 h-4 ${procesandoAuto ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{procesandoAuto ? 'Procesando…' : 'Procesar automáticas'}</span>
              <span className="sm:hidden">{procesandoAuto ? '…' : 'Auto'}</span>
            </ModuleBtnGhost>
            <button
              type="button"
              onClick={abrirNuevaEncuesta}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 shadow"
            >
              <ClipboardList className="w-4 h-4" /> Nueva encuesta
            </button>
            <button
              type="button"
              onClick={abrirNuevaPromo}
              className="px-4 py-2 rounded-xl text-sm font-bold text-[#003366] bg-white hover:bg-rose-50 flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" /> Nueva promoción
            </button>
          </div>
        }
        banner={campanasListas.length > 0 ? (
          <div className="mt-4 rounded-xl bg-amber-400/20 border border-amber-300/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300" />
              {campanasListas.length} campaña{campanasListas.length !== 1 ? 's' : ''} lista{campanasListas.length !== 1 ? 's' : ''} para envío
            </p>
            <button
              type="button"
              onClick={() => { setTab('campanas') }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30"
            >
              Ver campañas →
            </button>
          </div>
        ) : undefined}
      />

      <ModuleContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { id: 'promociones', label: 'Catálogo', full: 'Catálogo de promociones' },
            { id: 'campanas', label: 'Campañas', full: 'Campañas de envío' },
            { id: 'contactos', label: 'Contactos', full: 'Agenda de contactos', icon: BookUser },
            { id: 'plantillas', label: 'Plantillas', full: 'Plantillas de mensaje', icon: FileText },
            { id: 'reportes', label: 'Reportes', full: 'Historial y métricas', icon: BarChart3 },
            { id: 'auto', label: 'Auto', full: 'Automatizaciones', icon: Cake },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition flex-1 sm:flex-none min-w-[calc(33%-0.25rem)] sm:min-w-0 ${
                tab === t.id
                  ? 'bg-[#003366] text-white shadow-md'
                  : 'bg-white text-gray-600 border hover:border-rose-200'
              }`}
            >
              {'icon' in t && t.icon && <t.icon className="w-3.5 h-3.5 inline sm:mr-1" />}
              <span className="sm:hidden">{t.label}</span>
              <span className="hidden sm:inline">{t.full}</span>
            </button>
          ))}
        </div>

        {tab === 'promociones' && (
          <>
            {promociones.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border">
                <Megaphone className="w-14 h-14 text-rose-200 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">Cree su primera promoción</p>
                <p className="text-sm text-gray-400 mt-1">Suba promociones o encuestas y envíelas a sus pacientes.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                <button type="button" onClick={abrirNuevaEncuesta}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4" /> Crear encuesta
                </button>
                <button type="button" onClick={abrirNuevaPromo}
                  className="px-5 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold">
                  Crear promoción
                </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { id: 'todas', label: `Todas (${promociones.length})` },
                    { id: 'promocion', label: `Promociones (${totalPromos})` },
                    { id: 'encuesta', label: `Encuestas (${totalEncuestas})` },
                  ] as const).map(f => (
                    <button key={f.id} type="button" onClick={() => setFiltroTipo(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                        filtroTipo === f.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {filtroTipo !== 'encuesta' && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <button type="button" onClick={() => setFiltroCategoria('todas')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      filtroCategoria === 'todas' ? 'bg-[#003366] text-white border-[#003366]' : 'bg-white text-gray-600'
                    }`}>
                    Todas las categorías
                  </button>
                  {CATEGORIAS_SERVICIO_PROMO.map(c => {
                    const n = promociones.filter(p => !esEncuesta(p) && (p.categoria_servicio ?? 'general') === c.value).length
                    if (n === 0 && c.value !== 'general') return null
                    return (
                      <button key={c.value} type="button" onClick={() => setFiltroCategoria(c.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                          filtroCategoria === c.value ? `${c.badge} ring-2 ring-offset-1 ring-[#003366]/30` : 'bg-white text-gray-600'
                        }`}>
                        {c.icon} {c.label} ({n})
                      </button>
                    )
                  })}
                </div>
                )}
                {promocionesFiltradas.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border text-gray-500 text-sm">
                    No hay promociones en esta categoría.
                  </div>
                ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {promocionesFiltradas.map(p => {
                  const catCfg = cfgCategoriaServicio(p.categoria_servicio)
                  const tipoCfg = TIPO_CONTENIDO_CFG[p.tipo_contenido]
                  const encuesta = esEncuesta(p)
                  return (
                  <div key={p.id}
                    className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition group ${
                      !p.activa ? 'opacity-60' : ''
                    }`}>
                    <div className={`relative h-40 flex items-center justify-center overflow-hidden ${
                      encuesta ? 'bg-gradient-to-br from-indigo-100 to-violet-50' : 'bg-gradient-to-br from-rose-100 to-amber-50'
                    }`}>
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt={p.titulo} className="w-full h-full object-cover" />
                      ) : encuesta ? (
                        <ClipboardList className="w-12 h-12 text-indigo-300" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-rose-200" />
                      )}
                      {!p.activa && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold bg-slate-600 text-white px-2 py-0.5 rounded-full">
                          Inactiva
                        </span>
                      )}
                      <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoCfg.badge}`}>
                        {tipoCfg.icon} {tipoCfg.label}
                      </span>
                      {!encuesta && (
                        <span className={`absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${catCfg.badge}`}>
                          {catCfg.icon} {catCfg.label}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 line-clamp-1">{p.titulo}</h3>
                      {encuesta && p.encuesta_url && (
                        <p className="text-[10px] text-indigo-600 font-medium mt-0.5 truncate">{p.encuesta_url}</p>
                      )}
                      {p.servicio?.nombre && (
                        <p className="text-[10px] text-violet-600 font-medium mt-0.5">{p.servicio.nombre}</p>
                      )}
                      {(p.descuento_pct || p.precio_promocional) && (
                        <p className="text-xs text-emerald-700 font-bold mt-1">
                          {p.descuento_pct ? `${p.descuento_pct}% dto.` : `L ${Number(p.precio_promocional).toFixed(2)}`}
                        </p>
                      )}
                      {p.subtitulo && <p className="text-xs text-rose-600 font-medium mt-0.5 line-clamp-1">{p.subtitulo}</p>}
                      {p.descripcion && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.descripcion}</p>}
                      <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtVigencia(p)}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button type="button" onClick={() => abrirCampana(p)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg text-white flex items-center justify-center gap-1 ${
                            encuesta ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#003366]'
                          }`}>
                          <Send className="w-3.5 h-3.5" /> {encuesta ? 'Enviar encuesta' : 'Enviar'}
                        </button>
                        <button type="button" onClick={() => abrirEditarPromo(p)}
                          className="p-2 rounded-lg border hover:bg-gray-50 text-gray-500">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => eliminarPromo(p.id)}
                          className="p-2 rounded-lg border hover:bg-red-50 text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'campanas' && (
          <>
          {envioConfig && (
            <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 text-xs text-violet-900 space-y-1">
                <p className="font-semibold text-sm">Proveedores de envío</p>
                <p>{envioConfig.evolution
                  ? (envioConfig.evolutionConnected
                    ? `✓ Evolution API conectada (${envioConfig.evolutionInstance ?? 'instancia'}) · lote ${envioConfig.evolutionBatchSize} msg · pausa ${Math.round(envioConfig.evolutionDelayMs / 1000)}s`
                    : `✗ Evolution configurada pero WhatsApp desconectado (${envioConfig.evolutionState ?? 'sin sesión'})`)
                  : '○ Evolution API sin configurar'}</p>
                <p>{envioConfig.whatsapp ? '✓ WhatsApp oficial Meta' : '○ WhatsApp Meta sin configurar'}</p>
                <p>{(envioConfig.resend || envioConfig.sendgrid) ? '✓ Correo automático' : '○ Correo sin configurar'}</p>
              </div>
              <button type="button" onClick={() => void recargarConfigEnvio()}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-violet-300 text-violet-800 bg-white flex items-center gap-1 self-start">
                <RefreshCw className="w-3.5 h-3.5" /> Verificar conexión
              </button>
            </div>
          )}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {campanas.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Target className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No hay campañas aún. Cree una desde una promoción.</p>
              </div>
            ) : (
              <div className="divide-y">
                {campanas.map(c => {
                  const est = ESTADO_CAMPANA_CFG[c.estado]
                  const promo = c.promocion ?? promociones.find(p => p.id === c.promocion_id)
                  return (
                    <div key={c.id} className="p-4 hover:bg-rose-50/30 transition flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${est.badge}`}>{est.label}</span>
                          <span className="text-xs text-gray-400">{CANAL_CFG[c.canal].icon} {CANAL_CFG[c.canal].label}</span>
                          {c.modo_envio === 'automatico' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfgProveedorEnvio(c.proveedor_envio).badge}`}>
                              {cfgProveedorEnvio(c.proveedor_envio).label}
                            </span>
                          )}
                          {c.modo_envio === 'asistido' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              Asistido
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-500">{promo?.titulo ?? `Promo #${c.promocion_id}`}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {c.total_enviados}/{c.total_destinatarios} enviados
                          {c.programado_para && c.estado === 'programada' && (
                            <> · Programada: {new Date(c.programado_para).toLocaleString('es-HN')}</>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {c.modo_envio === 'automatico' && ['lista_envio', 'en_proceso'].includes(c.estado) && (
                          <button type="button" onClick={procesarAutomaticas}
                            className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5" /> Procesar
                          </button>
                        )}
                        {c.modo_envio !== 'automatico' && ['lista_envio', 'en_proceso', 'programada'].includes(c.estado) && c.estado !== 'programada' && (
                          <button type="button" onClick={() => abrirEnvio(c)}
                            className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white flex items-center gap-1">
                            <Play className="w-3.5 h-3.5" /> {c.estado === 'en_proceso' ? 'Continuar' : 'Iniciar'}
                          </button>
                        )}
                        {c.estado === 'programada' && campanaVencidaProgramacion(c) && (
                          <button type="button" onClick={() => abrirEnvio({ ...c, estado: 'lista_envio' })}
                            className="px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 text-white">
                            Iniciar ahora
                          </button>
                        )}
                        {!['completada', 'cancelada'].includes(c.estado) && (
                          <button type="button" onClick={() => cancelarCampana(c.id)}
                            className="px-3 py-2 text-xs border rounded-lg text-red-500 hover:bg-red-50">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </>
        )}

        {tab === 'plantillas' && (
          <PromocionesPlantillasPanel esSuperAdmin={esSuperAdmin} sucursalId={sucursalId} />
        )}

        {tab === 'reportes' && (
          <PromocionesReportesPanel campanas={campanas} />
        )}

        {tab === 'auto' && (
          <PromocionesAutomatizacionesPanel
            promociones={promociones}
            esSuperAdmin={esSuperAdmin}
            sucursalId={sucursalId}
            onProcesar={procesarAutomaticas}
            procesando={procesandoAuto}
          />
        )}

        {tab === 'contactos' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={buscarContacto}
                  onChange={e => setBuscarContacto(e.target.value)}
                  placeholder="Buscar por nombre, WhatsApp o correo…"
                  className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <button type="button" onClick={abrirNuevoContacto}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-[#003366] text-white flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> Nuevo contacto
              </button>
            </div>
            {contactosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-gray-400 px-4">
                <BookUser className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-gray-600">Agenda vacía</p>
                <p className="text-sm mt-1">Guarde números de WhatsApp y correos para campañas sin depender del expediente.</p>
                <button type="button" onClick={abrirNuevoContacto}
                  className="mt-4 px-4 py-2 bg-rose-50 text-rose-700 rounded-xl text-sm font-semibold border border-rose-200">
                  Agregar primer contacto
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {contactosFiltrados.map(c => {
                  const wa = tieneWhatsApp(c)
                  const em = tieneCorreo(c)
                  return (
                    <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-rose-50/30">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{c.nombre}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {wa && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.celular}
                            </span>
                          )}
                          {em && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 flex items-center gap-1">
                              <AtSign className="w-3 h-3" /> {c.correo}
                            </span>
                          )}
                          {!wa && !em && (
                            <span className="text-[10px] text-amber-700">Sin contacto válido</span>
                          )}
                        </div>
                        {c.notas && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{c.notas}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => abrirEditarContacto(c)}
                          className="p-2 rounded-lg border hover:bg-gray-50 text-gray-500">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => eliminarContacto(c.id)}
                          className="p-2 rounded-lg border hover:bg-red-50 text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold mb-1">Proveedores de envío</p>
            <p className="text-amber-800/90 leading-relaxed">
              <strong>Asistido gratis</strong> abre WhatsApp Web con el mensaje listo.
              <strong> Evolution API</strong> envía automático desde su servidor.
              <strong> Encuestas</strong> se envían con enlace a Google Forms u otro formulario.
              El canal <strong>Inteligente</strong> prioriza WhatsApp sobre correo.
            </p>
          </div>
        </div>
      </ModuleContent>

      {/* Modal promoción */}
      {modalPromo && (
        <ResponsiveModal
          title={promoEdit
            ? (esEncuesta(formPromo) ? 'Editar encuesta' : 'Editar promoción')
            : (formPromo.tipo_contenido === 'encuesta' ? 'Nueva encuesta' : 'Nueva promoción')}
          subtitle={esEncuesta(formPromo)
            ? 'Enlace a Google Forms u otra encuesta para enviar a pacientes'
            : 'Servicio, imagen, texto y vigencia de la oferta'}
          onClose={() => setModalPromo(false)}
          size="lg"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" onClick={() => setModalPromo(false)} className="px-4 py-2.5 border rounded-xl text-sm">Cancelar</button>
              <button type="button" onClick={guardarPromo} disabled={guardandoPromo}
                className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {guardandoPromo ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-600">Título *</label>
              <input value={formPromo.titulo} onChange={e => setFormPromo(p => ({ ...p, titulo: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1"
                placeholder={esEncuesta(formPromo) ? 'Ej. Encuesta de satisfacción post-consulta' : 'Ej. Chequeo preventivo 30% descuento'} />
            </div>
            {esEncuesta(formPromo) ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600">Enlace de la encuesta *</label>
                  <input type="url" value={formPromo.encuesta_url ?? ''}
                    onChange={e => setFormPromo(p => ({ ...p, encuesta_url: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 mt-1"
                    placeholder="https://forms.gle/tu-encuesta" />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Cree la encuesta en Google Forms, Microsoft Forms o similar y pegue el enlace aquí.
                    {ENCUESTA_URL_DEFAULT && ' Por defecto usa la URL configurada en el sistema.'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Subtítulo</label>
                  <input value={formPromo.subtitulo ?? ''} onChange={e => setFormPromo(p => ({ ...p, subtitulo: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. Su opinión nos ayuda a mejorar" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Mensaje para el paciente</label>
                  <textarea value={formPromo.descripcion ?? ''} onChange={e => setFormPromo(p => ({ ...p, descripcion: e.target.value }))}
                    rows={4} className="w-full border rounded-xl px-3 py-2 mt-1 resize-y"
                    placeholder="Explique brevemente por qué es importante su respuesta…" />
                </div>
              </>
            ) : (
              <>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Categoría de servicio</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIAS_SERVICIO_PROMO.map(c => (
                  <button key={c.value} type="button"
                    onClick={() => setFormPromo(p => ({
                      ...p,
                      categoria_servicio: c.value,
                      servicio_id: c.value === p.categoria_servicio ? p.servicio_id : null,
                    }))}
                    className={`p-2 rounded-xl border text-left text-xs transition ${
                      (formPromo.categoria_servicio ?? 'general') === c.value
                        ? `${c.badge} ring-2 ring-[#003366]/20 border-transparent`
                        : 'hover:border-gray-300'
                    }`}>
                    <span>{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>
            {(formPromo.categoria_servicio ?? 'general') !== 'general' && serviciosFormPromo.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600">Servicio específico (opcional)</label>
                <select
                  value={formPromo.servicio_id ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, servicio_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1 text-sm"
                >
                  <option value="">Toda la categoría {cfgCategoriaServicio(formPromo.categoria_servicio).label}</option>
                  {serviciosFormPromo.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} — L {Number(s.precio).toFixed(2)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Descuento %</label>
                <input type="number" min={0} max={100} step={1}
                  value={formPromo.descuento_pct ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, descuento_pct: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. 20" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Precio promocional (L)</label>
                <input type="number" min={0} step={0.01}
                  value={formPromo.precio_promocional ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, precio_promocional: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. 250.00" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Subtítulo</label>
              <input value={formPromo.subtitulo ?? ''} onChange={e => setFormPromo(p => ({ ...p, subtitulo: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Línea destacada corta" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Descripción / mensaje</label>
              <textarea value={formPromo.descripcion ?? ''} onChange={e => setFormPromo(p => ({ ...p, descripcion: e.target.value }))}
                rows={4} className="w-full border rounded-xl px-3 py-2 mt-1 resize-y"
                placeholder="Detalle de la promoción que verá el paciente…" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Imagen promocional</label>
              <input type="file" accept="image/*" onChange={e => setArchivoImg(e.target.files?.[0] ?? null)}
                className="w-full text-xs mt-1" />
              {formPromo.imagen_url && !archivoImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formPromo.imagen_url} alt="" className="mt-2 h-24 rounded-lg object-cover border" />
              )}
            </div>
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Vigencia desde</label>
                <input type="date" value={formPromo.vigencia_desde ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, vigencia_desde: e.target.value || null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Vigencia hasta</label>
                <input type="date" value={formPromo.vigencia_hasta ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, vigencia_hasta: e.target.value || null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" />
              </div>
            </div>
            {esSuperAdmin && (
              <div>
                <label className="text-xs font-medium text-gray-600">Sucursal (vacío = todas)</label>
                <select value={formPromo.sucursal_id ?? ''}
                  onChange={e => setFormPromo(p => ({ ...p, sucursal_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1">
                  <option value="">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formPromo.activa}
                onChange={e => setFormPromo(p => ({ ...p, activa: e.target.checked }))} />
              <span className="text-sm">Promoción activa</span>
            </label>
          </div>
        </ResponsiveModal>
      )}

      {/* Modal campaña wizard */}
      {modalCampana && promoCampana && (
        <ResponsiveModal
          title={esEncuesta(promoCampana) ? 'Enviar encuesta' : 'Nueva campaña'}
          subtitle={`${promoCampana.titulo} · Paso ${pasoCampana} de 3`}
          onClose={() => setModalCampana(false)}
          size="lg"
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between w-full gap-2">
              <button type="button" onClick={() => pasoCampana > 1 ? setPasoCampana(p => p - 1) : setModalCampana(false)}
                className="px-4 py-2.5 border rounded-xl text-sm flex items-center justify-center gap-1 w-full sm:w-auto">
                <ChevronLeft className="w-4 h-4" /> {pasoCampana > 1 ? 'Atrás' : 'Cancelar'}
              </button>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {pasoCampana < 3 ? (
                  <button type="button" onClick={() => setPasoCampana(p => p + 1)}
                    className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold flex items-center gap-1">
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={creandoCampana}
                      onClick={() => crearCampana(false)}
                      className="px-4 py-2.5 border rounded-xl text-sm font-semibold disabled:opacity-50">
                      Guardar para después
                    </button>
                    {!formCampana.programado && (
                      <button type="button" disabled={creandoCampana}
                        onClick={() => crearCampana(true)}
                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                        <Play className="w-4 h-4" /> {formCampana.proveedor_envio !== 'asistido' ? 'Enviar automático' : 'Enviar ahora'}
                      </button>
                    )}
                    {formCampana.programado && (
                      <button type="button" disabled={creandoCampana}
                        onClick={() => crearCampana(false)}
                        className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {formCampana.proveedor_envio !== 'asistido' ? 'Programar automático' : 'Programar'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          }
        >
          {pasoCampana === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Nombre de la campaña</label>
                <input value={formCampana.nombre} onChange={e => setFormCampana(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Canal de envío</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['ambos', 'whatsapp', 'email'] as CanalCampana[]).map(c => (
                    <button key={c} type="button" onClick={() => {
                      setFormCampana(p => ({ ...p, canal: c }))
                      if (destinatariosPreview.length > 0) {
                        const sel = destinatariosPreview.filter(d => seleccionDestinatarios.has(claveDestinatario(d)))
                        setResumenPreview(resumenCanales(sel.length ? sel : destinatariosPreview, c))
                      }
                    }}
                      className={`p-3 rounded-xl border text-left text-sm transition ${
                        formCampana.canal === c ? 'border-[#003366] bg-sky-50 ring-2 ring-[#003366]/20' : 'hover:border-gray-300'
                      }`}>
                      <span className="text-lg">{CANAL_CFG[c].icon}</span>
                      <p className="font-semibold mt-1">{CANAL_CFG[c].label}</p>
                      {CANAL_CFG[c].desc && <p className="text-[10px] text-gray-500 mt-0.5">{CANAL_CFG[c].desc}</p>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {pasoCampana === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {audienciaOpcionesCampana.map(a => (
                  <button key={a.value} type="button"
                    onClick={() => {
                      setFormCampana(p => ({ ...p, audiencia: a.value }))
                      setDestinatariosPreview([])
                      setSeleccionDestinatarios(new Set())
                      setResumenPreview(null)
                      if (a.value === 'contactos') {
                        const ids = new Set(contactos.filter(c => c.activo).map(c => c.id))
                        setContactosElegidos(ids)
                      } else {
                        setContactosElegidos(new Set())
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      formCampana.audiencia === a.value ? 'border-[#003366] bg-rose-50' : ''
                    }`}>
                    <p className="font-semibold text-sm">{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                  </button>
                ))}
              </div>
              {formCampana.audiencia === 'por_servicio' && promoCampana && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm space-y-2">
                  <p className="font-semibold text-violet-900">
                    {cfgCategoriaServicio(promoCampana.categoria_servicio).icon}{' '}
                    Pacientes con historial de {cfgCategoriaServicio(promoCampana.categoria_servicio).label.toLowerCase()}
                    {promoCampana.servicio?.nombre ? `: ${promoCampana.servicio.nombre}` : ''}
                  </p>
                  <div>
                    <label className="text-xs text-violet-700">Últimos meses a considerar</label>
                    <select
                      value={formCampana.meses_historial}
                      onChange={e => setFormCampana(p => ({ ...p, meses_historial: Number(e.target.value) }))}
                      className="w-full border rounded-xl px-3 py-2 mt-1 text-sm bg-white"
                    >
                      <option value={6}>6 meses</option>
                      <option value={12}>12 meses</option>
                      <option value={24}>24 meses</option>
                      <option value={36}>36 meses</option>
                    </select>
                  </div>
                </div>
              )}
              {formCampana.audiencia === 'contactos' && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-violet-100 flex flex-col sm:flex-row sm:items-center gap-2">
                    <p className="text-sm font-semibold text-violet-900 flex-1">
                      Elija quién recibirá la promoción ({contactosElegidos.size} seleccionados)
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button type="button"
                        onClick={() => seleccionarContactosCampana(new Set(contactos.filter(c => c.activo).map(c => c.id)))}
                        className="font-semibold text-[#003366]">Todos</button>
                      <button type="button"
                        onClick={() => seleccionarContactosCampana(new Set())}
                        className="text-gray-500">Ninguno</button>
                    </div>
                  </div>
                  <div className="p-3 border-b border-violet-100">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={buscarContactoCampana}
                        onChange={e => setBuscarContactoCampana(e.target.value)}
                        placeholder="Buscar contacto…"
                        className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                  {contactos.filter(c => c.activo).length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      <p>No hay contactos en la agenda.</p>
                      <button type="button" onClick={() => { setModalCampana(false); setTab('contactos') }}
                        className="mt-2 text-[#003366] font-semibold text-xs underline">
                        Ir a Contactos y agregar
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y bg-white">
                      {contactosCampanaFiltrados.map(c => {
                        const elegido = contactosElegidos.has(c.id)
                        const canal = canalesParaDestinatario(c, formCampana.canal)
                        return (
                          <label key={c.id}
                            className={`flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-violet-50/50 ${elegido ? '' : 'opacity-55'}`}>
                            <input type="checkbox" checked={elegido} onChange={() => toggleContactoElegido(c.id)} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{c.nombre}</p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {c.celular || '—'} {c.correo ? `· ${c.correo}` : ''}
                              </p>
                            </div>
                            {canal[0] === 'whatsapp' ? (
                              <MessageCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" title="WhatsApp" />
                            ) : canal[0] === 'email' ? (
                              <Mail className="w-4 h-4 text-sky-600 flex-shrink-0" title="Correo" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" title="Sin contacto válido" />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {formCampana.audiencia === 'contactos' && resumenPreview && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2">
                    <p className="text-lg font-bold text-emerald-700">{resumenPreview.whatsapp}</p>
                    <p className="text-[10px] text-emerald-600">WhatsApp</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-2">
                    <p className="text-lg font-bold text-sky-700">{resumenPreview.email}</p>
                    <p className="text-[10px] text-sky-600">Correo</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-2">
                    <p className="text-lg font-bold text-amber-700">{resumenPreview.sinContacto}</p>
                    <p className="text-[10px] text-amber-600">Sin contacto</p>
                  </div>
                </div>
              )}
              {esSuperAdmin && formCampana.audiencia !== 'contactos' && (
                <div>
                  <label className="text-xs text-gray-500">Filtrar por sucursal</label>
                  <select value={formCampana.sucursal_filtro ?? ''}
                    onChange={e => setFormCampana(p => ({ ...p, sucursal_filtro: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border rounded-xl px-3 py-2 mt-1 text-sm">
                    <option value="">Todas</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              )}
              {formCampana.audiencia === 'manual' && (
                <div className="space-y-3 rounded-xl border p-3 bg-gray-50">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Pacientes del sistema</label>
                    <BuscarPacienteInput
                      pacientes={[]}
                      value={buscarPacManual}
                      onChange={setBuscarPacManual}
                      buscarRemoto={async (term) => buscarPacientesActivos(sb, term)}
                      onSelectPaciente={p => {
                        if (!pacientesManual.some(x => x.id === p.id)) {
                          setPacientesManual(prev => [...prev, p as PacienteBusquedaRow])
                        }
                        setBuscarPacManual('')
                      }}
                    />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pacientesManual.map(p => (
                        <span key={p.id} className="text-xs bg-sky-100 text-sky-800 px-2 py-1 rounded-full flex items-center gap-1">
                          {nombrePaciente(p)}
                          <button type="button" onClick={() => setPacientesManual(prev => prev.filter(x => x.id !== p.id))}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">Contactos de la agenda — marque quién recibe</label>
                    {contactos.filter(c => c.activo).length === 0 ? (
                      <p className="text-xs text-gray-400">Sin contactos. Agréguelos en la pestaña Contactos.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border rounded-xl divide-y bg-white">
                        {contactos.filter(c => c.activo).map(c => {
                          const enLista = contactosManual.some(x => x.id === c.id)
                          return (
                            <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-violet-50/50">
                              <input
                                type="checkbox"
                                checked={enLista}
                                onChange={() => {
                                  if (enLista) {
                                    setContactosManual(prev => prev.filter(x => x.id !== c.id))
                                  } else {
                                    setContactosManual(prev => [...prev, c])
                                  }
                                }}
                              />
                              <span className="flex-1 truncate">{c.nombre}</span>
                              <span className="text-[10px] text-gray-400">{c.celular || c.correo}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {formCampana.audiencia !== 'contactos' && (
              <button type="button" onClick={cargarPreviewAudiencia} disabled={cargandoPreview}
                className="text-sm text-[#003366] font-semibold flex items-center gap-1 disabled:opacity-50">
                <Users className={`w-4 h-4 ${cargandoPreview ? 'animate-pulse' : ''}`} />
                {cargandoPreview ? 'Calculando…' : 'Cargar y revisar destinatarios'}
              </button>
              )}
              {formCampana.audiencia !== 'contactos' && resumenPreview && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2">
                    <p className="text-lg font-bold text-emerald-700">{resumenPreview.whatsapp}</p>
                    <p className="text-[10px] text-emerald-600">WhatsApp</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-2">
                    <p className="text-lg font-bold text-sky-700">{resumenPreview.email}</p>
                    <p className="text-[10px] text-sky-600">Correo</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-2">
                    <p className="text-lg font-bold text-amber-700">{resumenPreview.sinContacto}</p>
                    <p className="text-[10px] text-amber-600">Sin contacto</p>
                  </div>
                </div>
              )}
              {formCampana.audiencia !== 'contactos' && destinatariosPreview.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700">
                      {seleccionDestinatarios.size} de {destinatariosPreview.length} seleccionados
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => seleccionarTodosDestinatarios(true)} className="text-[#003366] font-semibold">Todos</button>
                      <button type="button" onClick={() => seleccionarTodosDestinatarios(false)} className="text-gray-500">Ninguno</button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {destinatariosPreview.map(d => {
                      const clave = claveDestinatario(d)
                      const canal = canalesParaDestinatario(d, formCampana.canal)
                      const seleccionado = seleccionDestinatarios.has(clave)
                      return (
                        <label key={clave} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${seleccionado ? '' : 'opacity-50'}`}>
                          <input type="checkbox" checked={seleccionado} onChange={() => toggleDestinatario(clave)} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {d.tipo === 'paciente' ? nombrePaciente(d) : d.nombre}
                              <span className="text-[10px] text-gray-400 ml-1">{d.tipo === 'contacto' ? '· contacto' : d.codigo}</span>
                            </p>
                          </div>
                          {canal[0] === 'whatsapp' ? (
                            <MessageCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          ) : canal[0] === 'email' ? (
                            <Mail className="w-4 h-4 text-sky-600 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {pasoCampana === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-2 block">Proveedor de envío</label>
                <div className="space-y-2">
                  {PROVEEDOR_ENVIO_OPCIONES.map(opt => {
                    const sel = formCampana.proveedor_envio === opt.value
                    const deshabilitado =
                      (opt.value === 'meta' && envioConfig && !envioConfig.whatsapp
                        && (formCampana.canal === 'whatsapp' || formCampana.canal === 'ambos'))
                      || (opt.value === 'evolution' && envioConfig && !envioConfig.evolution
                        && (formCampana.canal === 'whatsapp' || formCampana.canal === 'ambos'))
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setFormCampana(p => ({ ...p, proveedor_envio: opt.value }))}
                        className={`w-full text-left p-3 rounded-xl border transition ${
                          sel ? 'border-[#003366] bg-sky-50 ring-1 ring-[#003366]/20' : 'hover:bg-gray-50'
                        } ${deshabilitado ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{opt.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                            {opt.value === 'evolution' && envioConfig?.evolution && (
                              <p className={`text-[10px] mt-1 font-medium ${
                                envioConfig.evolutionConnected ? 'text-emerald-700' : 'text-amber-700'
                              }`}>
                                {envioConfig.evolutionConnected
                                  ? `Conectado · lote ${envioConfig.evolutionBatchSize} · pausa ${Math.round(envioConfig.evolutionDelayMs / 1000)}s`
                                  : `Sin conexión WhatsApp (${envioConfig.evolutionState ?? 'escanee QR'})`}
                              </p>
                            )}
                            {deshabilitado && (
                              <p className="text-[10px] text-amber-700 mt-1">No configurado en el servidor</p>
                            )}
                          </div>
                          {sel && <CheckCircle2 className="w-5 h-5 text-[#003366] flex-shrink-0" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border">
                <input type="checkbox" checked={formCampana.programado}
                  onChange={e => setFormCampana(p => ({ ...p, programado: e.target.checked }))} />
                <div>
                  <p className="font-semibold text-sm">Programar envío</p>
                  <p className="text-xs text-gray-500">
                    {formCampana.proveedor_envio === 'asistido'
                      ? 'Si no marca, puede enviar inmediatamente de forma asistida'
                      : 'Programa el inicio automático de la campaña'}
                  </p>
                </div>
              </label>
              {formCampana.proveedor_envio === 'evolution' && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
                  <p className="font-semibold mb-1">Envío seguro por lotes</p>
                  <p className="leading-relaxed">
                    Evolution envía máximo {envioConfig?.evolutionBatchSize ?? 25} mensajes por ejecución
                    con pausa de {Math.round((envioConfig?.evolutionDelayMs ?? 4000) / 1000)} segundos entre cada uno.
                    Use &quot;Procesar automáticas&quot; varias veces para campañas grandes.
                  </p>
                </div>
              )}
              {formCampana.programado && (
                <div>
                  <label className="text-xs text-gray-500">Fecha y hora</label>
                  <input type="datetime-local" value={formCampana.programado_para}
                    onChange={e => setFormCampana(p => ({ ...p, programado_para: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 mt-1" />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500">Plantilla de mensaje (opcional)</label>
                <select
                  value={formCampana.plantilla_id ?? ''}
                  onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : null
                    const pl = plantillas.find(x => x.id === id)
                    setFormCampana(p => ({
                      ...p,
                      plantilla_id: id,
                      mensaje_personalizado: pl?.contenido ?? p.mensaje_personalizado,
                    }))
                  }}
                  className="w-full border rounded-xl px-3 py-2 mt-1 text-sm"
                >
                  <option value="">Sin plantilla — mensaje de la promoción</option>
                  {plantillas.map(pl => (
                    <option key={pl.id} value={pl.id}>{pl.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Mensaje personalizado (opcional)</label>
                <textarea value={formCampana.mensaje_personalizado}
                  onChange={e => setFormCampana(p => ({ ...p, mensaje_personalizado: e.target.value }))}
                  rows={4} className="w-full border rounded-xl px-3 py-2 mt-1 text-sm"
                  placeholder="Use {{NOMBRE}} y {{CLINICA}} como variables…" />
              </div>
              <div className="rounded-xl bg-gray-50 border p-3 text-xs text-gray-600">
                <p className="font-semibold mb-1">Vista previa del mensaje</p>
                <pre className="whitespace-pre-wrap font-sans text-gray-700">
                  {formCampana.mensaje_personalizado || `Hola [Paciente],\n\n*${promoCampana.titulo}*\n${promoCampana.descripcion ?? ''}`}
                </pre>
              </div>
            </div>
          )}
        </ResponsiveModal>
      )}

      {/* Modal envío asistido */}
      {modalEnvio && campanaEnvio && envioActual && promoEnvio && (
        <ResponsiveModal
          title="Cola de envío asistido"
          subtitle={`${campanaEnvio.nombre} · ${indiceEnvio + 1} de ${envios.length}`}
          onClose={() => setModalEnvio(false)}
          size="lg"
          footer={
            <div className="flex flex-wrap justify-between gap-2 w-full">
              <button type="button" onClick={() => marcarEnvio('omitido')}
                className="px-3 py-2 text-xs border rounded-xl text-gray-500 flex items-center gap-1">
                <SkipForward className="w-3.5 h-3.5" /> Omitir
              </button>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => marcarRespondio()}
                  disabled={envioActual.respondio}
                  className="px-3 py-2 text-xs border rounded-xl text-violet-700 border-violet-200 disabled:opacity-40 flex items-center gap-1">
                  <Reply className="w-3.5 h-3.5" /> Respondió
                </button>
                <button type="button" onClick={enviarActual}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-1">
                  {envioActual.canal === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  Abrir {envioActual.canal === 'whatsapp' ? 'WhatsApp' : 'Correo'}
                </button>
                <button type="button" onClick={() => marcarEnvio('enviado')}
                  className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Enviado y siguiente
                </button>
              </div>
            </div>
          }
        >
          <div className="grid md:grid-cols-[1fr_240px] gap-4">
            {/* Columna principal */}
            <div className="space-y-4 min-w-0">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${((envios.filter(e => e.estado === 'enviado').length) / envios.length) * 100}%` }} />
              </div>

              <div className="rounded-xl border p-4 bg-gradient-to-br from-rose-50 to-amber-50">
                <p className="font-bold text-lg text-gray-900">
                  {envioActual.paciente
                    ? nombrePaciente(envioActual.paciente)
                    : envioActual.contacto?.nombre ?? 'Destinatario'}
                </p>
                <p className="text-xs text-gray-500">
                  {envioActual.paciente?.codigo ?? (envioActual.contacto ? 'Contacto externo' : '')}
                </p>
                <p className="text-sm mt-2 flex items-center gap-2">
                  {envioActual.canal === 'whatsapp' ? <MessageCircle className="w-4 h-4 text-emerald-600" /> : <Mail className="w-4 h-4 text-sky-600" />}
                  {envioActual.canal === 'whatsapp'
                    ? (envioActual.paciente?.celular || envioActual.paciente?.telefono || envioActual.contacto?.celular || 'Sin teléfono')
                    : (envioActual.paciente?.correo || envioActual.contacto?.correo || 'Sin correo')}
                </p>
              </div>

              {/* Vista previa del mensaje */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Mensaje a enviar</label>
                  <button type="button" onClick={copiarMensajeActual}
                    className="text-[11px] text-[#003366] font-semibold flex items-center gap-1 hover:underline">
                    <Copy className="w-3 h-3" /> Copiar texto
                  </button>
                </div>
                <textarea readOnly value={textoMensajeActual} rows={6}
                  className="w-full border rounded-xl px-3 py-2 text-xs bg-gray-50 resize-y text-gray-700" />
              </div>

              {/* Imagen de la promoción (solo WhatsApp) */}
              {promoEnvio.imagen_url && envioActual.canal === 'whatsapp' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={promoEnvio.imagen_url} alt={promoEnvio.titulo}
                      className="w-20 h-20 object-cover rounded-lg border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-900 mb-1">Adjuntar imagen</p>
                      <p className="text-[11px] text-emerald-700 leading-snug mb-2">
                        WhatsApp no permite adjuntar la imagen por enlace. Cópiela y péguela con
                        <strong> Ctrl+V</strong> en el chat, o descárguela para adjuntarla.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={copiarImagenActual}
                          disabled={estadoImagen === 'copiando'}
                          className={`px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 ${
                            estadoImagen === 'copiado'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-emerald-300 text-emerald-700'
                          }`}>
                          {estadoImagen === 'copiando'
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Copiando…</>
                            : estadoImagen === 'copiado'
                              ? <><CheckCircle2 className="w-3 h-3" /> ¡Copiada!</>
                              : <><Copy className="w-3 h-3" /> Copiar imagen</>}
                        </button>
                        <button type="button" onClick={descargarImagenActual}
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-gray-300 text-gray-600 flex items-center gap-1">
                          <Download className="w-3 h-3" /> Descargar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {envioActual.abierto_at && (
                  <p className="text-xs text-violet-700">Abierto · {new Date(envioActual.abierto_at).toLocaleString('es-HN')}</p>
                )}
                {envioActual.respondio && (
                  <p className="text-xs text-emerald-700">Respondió · {envioActual.respondio_at ? new Date(envioActual.respondio_at).toLocaleString('es-HN') : ''}</p>
                )}
                {envioActual.estado !== 'pendiente' && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ya procesado: {envioActual.estado}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button type="button" disabled={indiceEnvio <= 0}
                  onClick={() => irAEnvio(Math.max(0, indiceEnvio - 1))}
                  className="flex-1 py-2 border rounded-xl text-xs disabled:opacity-40 flex items-center justify-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <button type="button" disabled={indiceEnvio >= envios.length - 1}
                  onClick={() => irAEnvio(Math.min(envios.length - 1, indiceEnvio + 1))}
                  className="flex-1 py-2 border rounded-xl text-xs disabled:opacity-40 flex items-center justify-center gap-1">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cola lateral */}
            <div className="md:border-l md:pl-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Cola ({envios.filter(e => e.estado === 'enviado').length}/{envios.length} enviados)
              </p>
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {envios.map((e, i) => {
                  const nombre = e.paciente ? nombrePaciente(e.paciente) : e.contacto?.nombre ?? 'Destinatario'
                  const activo = i === indiceEnvio
                  return (
                    <button key={e.id} type="button" onClick={() => irAEnvio(i)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition ${
                        activo ? 'bg-[#003366] text-white' : 'hover:bg-gray-100 text-gray-700'
                      }`}>
                      {e.estado === 'enviado'
                        ? <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${activo ? 'text-emerald-300' : 'text-emerald-600'}`} />
                        : e.estado === 'pendiente'
                          ? <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${activo ? 'text-amber-300' : 'text-amber-500'}`} />
                          : <SkipForward className={`w-3.5 h-3.5 flex-shrink-0 ${activo ? 'text-gray-300' : 'text-gray-400'}`} />}
                      <span className="flex-1 min-w-0 truncate">{nombre}</span>
                      {e.respondio && <Reply className={`w-3 h-3 flex-shrink-0 ${activo ? 'text-violet-300' : 'text-violet-500'}`} />}
                      {e.canal === 'whatsapp'
                        ? <MessageCircle className={`w-3 h-3 flex-shrink-0 ${activo ? 'text-emerald-300' : 'text-emerald-500'}`} />
                        : <Mail className={`w-3 h-3 flex-shrink-0 ${activo ? 'text-sky-300' : 'text-sky-500'}`} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </ResponsiveModal>
      )}

      {/* Modal contacto */}
      {modalContacto && (
        <ResponsiveModal
          title={contactoEdit ? 'Editar contacto' : 'Nuevo contacto'}
          subtitle="WhatsApp y/o correo para campañas de publicidad"
          onClose={() => setModalContacto(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" onClick={() => setModalContacto(false)} className="px-4 py-2.5 border rounded-xl text-sm">Cancelar</button>
              <button type="button" onClick={guardarContacto} disabled={guardandoContacto}
                className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {guardandoContacto ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-600">Nombre *</label>
              <input value={formContacto.nombre} onChange={e => setFormContacto(p => ({ ...p, nombre: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. María López" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">WhatsApp / celular</label>
              <input value={formContacto.celular ?? ''} onChange={e => setFormContacto(p => ({ ...p, celular: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. 9999-9999" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Correo electrónico</label>
              <input type="email" value={formContacto.correo ?? ''} onChange={e => setFormContacto(p => ({ ...p, correo: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="correo@ejemplo.com" />
            </div>
            <p className="text-[10px] text-gray-500 bg-sky-50 border border-sky-100 rounded-lg p-2">
              Con canal Inteligente: si tiene WhatsApp y correo, solo se usará WhatsApp.
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600">Notas (opcional)</label>
              <textarea value={formContacto.notas ?? ''} onChange={e => setFormContacto(p => ({ ...p, notas: e.target.value }))}
                rows={2} className="w-full border rounded-xl px-3 py-2 mt-1 resize-y" />
            </div>
            {esSuperAdmin && (
              <div>
                <label className="text-xs font-medium text-gray-600">Sucursal</label>
                <select value={formContacto.sucursal_id ?? ''}
                  onChange={e => setFormContacto(p => ({ ...p, sucursal_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1">
                  <option value="">Todas</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formContacto.activo}
                onChange={e => setFormContacto(p => ({ ...p, activo: e.target.checked }))} />
              <span>Contacto activo</span>
            </label>
          </div>
        </ResponsiveModal>
      )}
    </ModuleShell>
  )
}
