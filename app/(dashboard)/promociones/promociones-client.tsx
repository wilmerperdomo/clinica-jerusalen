'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Megaphone, Plus, Image as ImageIcon, Calendar, Send, Users,
  MessageCircle, Mail, Sparkles, Trash2, Pencil, Play, Clock,
  CheckCircle2, ChevronRight, ChevronLeft, RefreshCw,
  AlertCircle, Target, Zap,
} from 'lucide-react'
import ResponsiveModal from '@/components/responsive-modal'
import BuscarPacienteInput from '@/components/buscar-paciente-input'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'
import { nombrePaciente } from '@/lib/consultas-utils'
import { buscarPacientesActivos, type PacienteBusquedaRow } from '@/lib/buscar-pacientes'
import { subirImagenPromocion, resolverAudiencia, canalesParaPaciente } from '@/lib/promocion-audiencia'
import {
  AUDIENCIA_OPCIONES, CANAL_CFG, ESTADO_CAMPANA_CFG,
  campanaVencidaProgramacion, fmtVigencia, linkEnvioPromocion,
  type Campana, type CanalCampana, type EnvioRegistro, type FiltroAudiencia,
  type Promocion, type TipoAudiencia,
} from '@/lib/promociones-utils'

interface SucursalOpt { id: number; nombre: string }
interface Stats { totalActivos: number; conWhatsApp: number; conCorreo: number }

interface Props {
  promocionesIniciales: Promocion[]
  campanasIniciales: Campana[]
  sucursales: SucursalOpt[]
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

const PROMO_VACIA: Omit<Promocion, 'id' | 'created_at'> = {
  titulo: '', subtitulo: '', descripcion: '', imagen_url: null,
  tipo_contenido: 'mixto', vigencia_desde: null, vigencia_hasta: null,
  activa: true, sucursal_id: null,
}

export default function PromocionesClient({
  promocionesIniciales, campanasIniciales, sucursales,
  esSuperAdmin = false, sucursalId, sucursalNombre, stats,
}: Props) {
  const sb = supabase()
  const [tab, setTab] = useState<'promociones' | 'campanas'>('promociones')
  const [promociones, setPromociones] = useState(promocionesIniciales)
  const [campanas, setCampanas] = useState(campanasIniciales)
  const [cargando, setCargando] = useState(false)
  const [procesandoAuto, setProcesandoAuto] = useState(false)

  const [modalPromo, setModalPromo] = useState(false)
  const [promoEdit, setPromoEdit] = useState<Promocion | null>(null)
  const [formPromo, setFormPromo] = useState({ ...PROMO_VACIA })
  const [archivoImg, setArchivoImg] = useState<File | null>(null)
  const [guardandoPromo, setGuardandoPromo] = useState(false)

  const [modalCampana, setModalCampana] = useState(false)
  const [promoCampana, setPromoCampana] = useState<Promocion | null>(null)
  const [pasoCampana, setPasoCampana] = useState(1)
  const [formCampana, setFormCampana] = useState({
    nombre: '', canal: 'whatsapp' as CanalCampana,
    audiencia: 'whatsapp' as TipoAudiencia,
    programado: false,
    automatico: false,
    programado_para: '',
    mensaje_personalizado: '',
    sucursal_filtro: sucursalId ?? null as number | null,
  })
  const [pacientesManual, setPacientesManual] = useState<PacienteBusquedaRow[]>([])
  const [buscarPacManual, setBuscarPacManual] = useState('')
  const [previewAudiencia, setPreviewAudiencia] = useState<number | null>(null)
  const [creandoCampana, setCreandoCampana] = useState(false)

  const [modalEnvio, setModalEnvio] = useState(false)
  const [campanaEnvio, setCampanaEnvio] = useState<Campana | null>(null)
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

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      let pq = sb.from('promociones').select('*').order('created_at', { ascending: false }).limit(200)
      let cq = sb.from('promocion_campanas').select('*, promocion:promociones(*)').order('created_at', { ascending: false }).limit(100)
      if (!esSuperAdmin && sucursalId) {
        pq = pq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
        cq = cq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
      }
      const [{ data: p }, { data: c }] = await Promise.all([pq, cq])
      if (p) setPromociones(p as Promocion[])
      if (c) setCampanas(c as Campana[])
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

  function abrirNuevaPromo() {
    setPromoEdit(null)
    setFormPromo({ ...PROMO_VACIA, sucursal_id: esSuperAdmin ? null : sucursalId ?? null })
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
    setGuardandoPromo(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      let imagenUrl = formPromo.imagen_url
      if (archivoImg) imagenUrl = await subirImagenPromocion(sb, archivoImg)

      const payload = {
        titulo: formPromo.titulo.trim(),
        subtitulo: formPromo.subtitulo?.trim() || null,
        descripcion: formPromo.descripcion?.trim() || null,
        imagen_url: imagenUrl,
        tipo_contenido: formPromo.tipo_contenido,
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
      alert('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
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
    setPromoCampana(promo)
    setPasoCampana(1)
    setFormCampana({
      nombre: `Campaña — ${promo.titulo}`,
      canal: 'whatsapp',
      audiencia: 'whatsapp',
      programado: false,
      automatico: false,
      programado_para: '',
      mensaje_personalizado: '',
      sucursal_filtro: esSuperAdmin ? null : sucursalId ?? null,
    })
    setPacientesManual([])
    setPreviewAudiencia(null)
    setModalCampana(true)
  }

  async function calcularAudiencia() {
    const filtro: FiltroAudiencia = {
      tipo: formCampana.audiencia,
      sucursal_id: formCampana.sucursal_filtro,
      paciente_ids: formCampana.audiencia === 'manual' ? pacientesManual.map(p => p.id) : undefined,
    }
    try {
      const lista = await resolverAudiencia(sb, filtro, { sucursalId, esSuperAdmin })
      setPreviewAudiencia(lista.length)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al calcular audiencia')
    }
  }

  async function crearCampana(iniciarAhora: boolean) {
    if (!promoCampana) return
    if (!formCampana.nombre.trim()) { alert('Nombre de campaña obligatorio.'); return }
    if (formCampana.programado && !formCampana.programado_para) {
      alert('Indique fecha y hora de programación.')
      return
    }
    if (formCampana.audiencia === 'manual' && pacientesManual.length === 0) {
      alert('Agregue al menos un paciente.')
      return
    }

    setCreandoCampana(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      const filtro: FiltroAudiencia = {
        tipo: formCampana.audiencia,
        sucursal_id: formCampana.sucursal_filtro,
        paciente_ids: formCampana.audiencia === 'manual' ? pacientesManual.map(p => p.id) : undefined,
      }
      const audiencia = await resolverAudiencia(sb, filtro, { sucursalId, esSuperAdmin })

      const filasEnvio: { campana_id: number; paciente_id: number; canal: string; estado: string }[] = []
      for (const p of audiencia) {
        for (const canal of canalesParaPaciente(p, formCampana.canal)) {
          filasEnvio.push({ campana_id: 0, paciente_id: p.id, canal, estado: 'pendiente' })
        }
      }

      if (filasEnvio.length === 0) {
        alert('No hay destinatarios con el canal seleccionado.')
        return
      }

      const automatico = formCampana.automatico
      const estado = formCampana.programado
        ? 'programada'
        : (iniciarAhora ? 'en_proceso' : 'lista_envio')
      const modoEnvio = automatico
        ? 'automatico'
        : (formCampana.programado ? 'programado' : 'asistido')

      const { data: campana, error: errC } = await sb.from('promocion_campanas').insert({
        promocion_id: promoCampana.id,
        nombre: formCampana.nombre.trim(),
        canal: formCampana.canal,
        modo_envio: modoEnvio,
        programado_para: formCampana.programado ? new Date(formCampana.programado_para).toISOString() : null,
        estado,
        filtro_audiencia: filtro,
        mensaje_personalizado: formCampana.mensaje_personalizado.trim() || null,
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
      alert('Error al crear campaña: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setCreandoCampana(false)
    }
  }

  async function abrirEnvio(campana: Campana) {
    const { data, error } = await sb
      .from('promocion_envios')
      .select('*, paciente:pacientes(id, codigo, nombre, apellido1, celular, telefono, correo)')
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
        `Campañas: ${data.campanasProcesadas ?? 0}\n` +
        `Enviados: ${data.enviados ?? 0}\n` +
        `Fallidos: ${data.fallidos ?? 0}` +
        (data.errores?.length ? `\n\nErrores:\n${data.errores.slice(0, 5).join('\n')}` : ''),
      )
    } catch (e) {
      alert('Error al procesar automatización: ' + (e instanceof Error ? e.message : 'desconocido'))
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

  function enviarActual() {
    if (!envioActual?.paciente || !promoEnvio) return
    const url = linkEnvioPromocion(
      envioActual.paciente,
      promoEnvio,
      envioActual.canal,
      campanaEnvio?.mensaje_personalizado,
    )
    if (!url) {
      alert('Este paciente no tiene contacto válido para este canal.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
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
          { label: 'Promociones', value: promociones.filter(p => p.activa).length, icon: Sparkles },
          { label: 'Campañas activas', value: campanasListas.length, icon: Send },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <ModuleBtnGhost onClick={recargar} disabled={cargando}>
              <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            </ModuleBtnGhost>
            <ModuleBtnGhost onClick={procesarAutomaticas} disabled={procesandoAuto}>
              <Zap className={`w-4 h-4 ${procesandoAuto ? 'animate-pulse' : ''}`} />
              {procesandoAuto ? 'Procesando…' : 'Procesar automáticas'}
            </ModuleBtnGhost>
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
        <div className="flex gap-2 mb-4">
          {(['promociones', 'campanas'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === t
                  ? 'bg-[#003366] text-white shadow-md'
                  : 'bg-white text-gray-600 border hover:border-rose-200'
              }`}
            >
              {t === 'promociones' ? 'Catálogo de promociones' : 'Campañas de envío'}
            </button>
          ))}
        </div>

        {tab === 'promociones' && (
          <>
            {promociones.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border">
                <Megaphone className="w-14 h-14 text-rose-200 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">Cree su primera promoción</p>
                <p className="text-sm text-gray-400 mt-1">Suba imágenes, textos y luego envíelas a sus pacientes.</p>
                <button type="button" onClick={abrirNuevaPromo}
                  className="mt-4 px-5 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold">
                  Crear promoción
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {promociones.map(p => (
                  <div key={p.id}
                    className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition group ${
                      !p.activa ? 'opacity-60' : ''
                    }`}>
                    <div className="relative h-40 bg-gradient-to-br from-rose-100 to-amber-50 flex items-center justify-center overflow-hidden">
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt={p.titulo} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-rose-200" />
                      )}
                      {!p.activa && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold bg-slate-600 text-white px-2 py-0.5 rounded-full">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 line-clamp-1">{p.titulo}</h3>
                      {p.subtitulo && <p className="text-xs text-rose-600 font-medium mt-0.5 line-clamp-1">{p.subtitulo}</p>}
                      {p.descripcion && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.descripcion}</p>}
                      <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtVigencia(p)}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button type="button" onClick={() => abrirCampana(p)}
                          className="flex-1 py-2 text-xs font-bold rounded-lg bg-[#003366] text-white flex items-center justify-center gap-1">
                          <Send className="w-3.5 h-3.5" /> Enviar
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
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'campanas' && (
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
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Automático
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
        )}

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold mb-1">Envío asistido (fase actual)</p>
            <p className="text-amber-800/90 leading-relaxed">
              Puede trabajar en modo asistido (wa.me / mailto) o automático. El automático usa
              WhatsApp Business API y Resend/SendGrid desde un cron protegido; si faltan llaves de entorno,
              el envío queda marcado como fallido para auditoría sin afectar los módulos clínicos.
            </p>
          </div>
        </div>
      </ModuleContent>

      {/* Modal promoción */}
      {modalPromo && (
        <ResponsiveModal
          title={promoEdit ? 'Editar promoción' : 'Nueva promoción'}
          subtitle="Imagen, texto y vigencia de la oferta"
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
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. Chequeo preventivo 30% descuento" />
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
            <div className="grid grid-cols-2 gap-3">
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
          title="Nueva campaña"
          subtitle={`${promoCampana.titulo} · Paso ${pasoCampana} de 3`}
          onClose={() => setModalCampana(false)}
          size="lg"
          footer={
            <div className="flex justify-between w-full gap-2">
              <button type="button" onClick={() => pasoCampana > 1 ? setPasoCampana(p => p - 1) : setModalCampana(false)}
                className="px-4 py-2.5 border rounded-xl text-sm flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> {pasoCampana > 1 ? 'Atrás' : 'Cancelar'}
              </button>
              <div className="flex gap-2">
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
                        <Play className="w-4 h-4" /> {formCampana.automatico ? 'Enviar automático' : 'Enviar ahora'}
                      </button>
                    )}
                    {formCampana.programado && (
                      <button type="button" disabled={creandoCampana}
                        onClick={() => crearCampana(false)}
                        className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {formCampana.automatico ? 'Programar automático' : 'Programar'}
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
                  {(['whatsapp', 'email', 'ambos'] as CanalCampana[]).map(c => (
                    <button key={c} type="button" onClick={() => setFormCampana(p => ({ ...p, canal: c }))}
                      className={`p-3 rounded-xl border text-left text-sm transition ${
                        formCampana.canal === c ? 'border-[#003366] bg-sky-50 ring-2 ring-[#003366]/20' : 'hover:border-gray-300'
                      }`}>
                      <span className="text-lg">{CANAL_CFG[c].icon}</span>
                      <p className="font-semibold mt-1">{CANAL_CFG[c].label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {pasoCampana === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AUDIENCIA_OPCIONES.map(a => (
                  <button key={a.value} type="button"
                    onClick={() => { setFormCampana(p => ({ ...p, audiencia: a.value })); setPreviewAudiencia(null) }}
                    className={`p-3 rounded-xl border text-left transition ${
                      formCampana.audiencia === a.value ? 'border-[#003366] bg-rose-50' : ''
                    }`}>
                    <p className="font-semibold text-sm">{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                  </button>
                ))}
              </div>
              {esSuperAdmin && (
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
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Agregar pacientes</label>
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
              )}
              <button type="button" onClick={calcularAudiencia}
                className="text-sm text-[#003366] font-semibold flex items-center gap-1">
                <Users className="w-4 h-4" />
                {previewAudiencia != null ? `${previewAudiencia} destinatarios estimados` : 'Calcular audiencia'}
              </button>
            </div>
          )}
          {pasoCampana === 3 && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border">
                <input type="checkbox" checked={formCampana.programado}
                  onChange={e => setFormCampana(p => ({ ...p, programado: e.target.checked }))} />
                <div>
                  <p className="font-semibold text-sm">Programar envío</p>
                  <p className="text-xs text-gray-500">Si no marca, puede enviar inmediatamente de forma asistida</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border border-emerald-200 bg-emerald-50/70">
                <input type="checkbox" checked={formCampana.automatico}
                  onChange={e => setFormCampana(p => ({ ...p, automatico: e.target.checked }))} />
                <div>
                  <p className="font-semibold text-sm text-emerald-900">Envío automático</p>
                  <p className="text-xs text-emerald-700">
                    Usa WhatsApp Business API / Resend / SendGrid desde el cron. Requiere variables de entorno configuradas.
                  </p>
                </div>
              </label>
              {formCampana.programado && (
                <div>
                  <label className="text-xs text-gray-500">Fecha y hora</label>
                  <input type="datetime-local" value={formCampana.programado_para}
                    onChange={e => setFormCampana(p => ({ ...p, programado_para: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 mt-1" />
                </div>
              )}
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
          title="Envío asistido"
          subtitle={`${campanaEnvio.nombre} · ${indiceEnvio + 1} de ${envios.length}`}
          onClose={() => setModalEnvio(false)}
          size="md"
          footer={
            <div className="flex flex-wrap justify-between gap-2 w-full">
              <button type="button" onClick={() => marcarEnvio('omitido')}
                className="px-3 py-2 text-xs border rounded-xl text-gray-500">Omitir</button>
              <div className="flex gap-2">
                <button type="button" onClick={enviarActual}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-1">
                  {envioActual.canal === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  Abrir {envioActual.canal === 'whatsapp' ? 'WhatsApp' : 'Correo'}
                </button>
                <button type="button" onClick={() => marcarEnvio('enviado')}
                  className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Marcar enviado
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${((envios.filter(e => e.estado === 'enviado').length) / envios.length) * 100}%` }} />
            </div>
            <div className="rounded-xl border p-4 bg-gradient-to-br from-rose-50 to-amber-50">
              <p className="font-bold text-lg text-gray-900">
                {nombrePaciente(envioActual.paciente ?? undefined)}
              </p>
              <p className="text-xs text-gray-500">{envioActual.paciente?.codigo}</p>
              <p className="text-sm mt-2 flex items-center gap-2">
                {envioActual.canal === 'whatsapp' ? <MessageCircle className="w-4 h-4 text-emerald-600" /> : <Mail className="w-4 h-4 text-sky-600" />}
                {envioActual.canal === 'whatsapp'
                  ? (envioActual.paciente?.celular || envioActual.paciente?.telefono || 'Sin teléfono')
                  : (envioActual.paciente?.correo || 'Sin correo')}
              </p>
            </div>
            {envioActual.estado !== 'pendiente' && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ya procesado: {envioActual.estado}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={indiceEnvio <= 0}
                onClick={() => setIndiceEnvio(i => Math.max(0, i - 1))}
                className="flex-1 py-2 border rounded-xl text-xs disabled:opacity-40">← Anterior</button>
              <button type="button" disabled={indiceEnvio >= envios.length - 1}
                onClick={() => setIndiceEnvio(i => Math.min(envios.length - 1, i + 1))}
                className="flex-1 py-2 border rounded-xl text-xs disabled:opacity-40">Siguiente →</button>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </ModuleShell>
  )
}
