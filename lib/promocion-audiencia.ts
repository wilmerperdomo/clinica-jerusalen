import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CanalCampana,
  CategoriaServicioPromo,
  DestinatarioPromo,
  FiltroAudiencia,
  PromocionContacto,
} from '@/lib/promociones-utils'

const BUCKET = 'promociones'
const MAX_MB = 8
const TIPOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

export async function subirImagenPromocion(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  if (!TIPOS.includes(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG, WebP o GIF.')
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen no puede superar ${MAX_MB} MB.`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `promo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  if (upErr) throw new Error(upErr.message)

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export interface PacienteAudiencia {
  id: number
  codigo: string
  nombre: string
  apellido1?: string | null
  apellido2?: string | null
  celular?: string | null
  telefono?: string | null
  correo?: string | null
  activo?: boolean | string | null
}

function pacienteActivo(p: PacienteAudiencia): boolean {
  if (p.activo === false) return false
  const a = p.activo
  if (a === '0' || a === 'false') return false
  return true
}

export function tieneWhatsApp(p: Pick<PacienteAudiencia | DestinatarioPromo, 'celular' | 'telefono'>): boolean {
  const raw = p.celular || ('telefono' in p ? p.telefono : null)
  if (!raw) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 8
}

export function tieneCorreo(p: Pick<PacienteAudiencia | DestinatarioPromo, 'correo'>): boolean {
  return !!p.correo?.trim()
}

export function canalInteligente(
  p: Pick<PacienteAudiencia | DestinatarioPromo, 'celular' | 'telefono' | 'correo'>,
): 'whatsapp' | 'email' | null {
  if (tieneWhatsApp(p)) return 'whatsapp'
  if (tieneCorreo(p)) return 'email'
  return null
}

export function canalesParaDestinatario(
  p: Pick<PacienteAudiencia | DestinatarioPromo, 'celular' | 'telefono' | 'correo'>,
  canalCampana: CanalCampana,
): ('whatsapp' | 'email')[] {
  if (canalCampana === 'whatsapp') {
    return tieneWhatsApp(p) ? ['whatsapp'] : []
  }
  if (canalCampana === 'email') {
    return tieneCorreo(p) ? ['email'] : []
  }
  const preferido = canalInteligente(p)
  return preferido ? [preferido] : []
}

/** @deprecated Use canalesParaDestinatario */
export function canalesParaPaciente(
  p: PacienteAudiencia,
  canalCampana: CanalCampana,
): ('whatsapp' | 'email')[] {
  return canalesParaDestinatario(p, canalCampana)
}

export function resumenCanales(
  destinatarios: DestinatarioPromo[],
  canalCampana: CanalCampana,
) {
  let whatsapp = 0
  let email = 0
  let sinContacto = 0
  for (const d of destinatarios) {
    const canales = canalesParaDestinatario(d, canalCampana)
    if (canales.length === 0) sinContacto++
    else if (canales[0] === 'whatsapp') whatsapp++
    else email++
  }
  return { whatsapp, email, sinContacto, total: destinatarios.length, enviables: whatsapp + email }
}

function pacienteADestinatario(p: PacienteAudiencia): DestinatarioPromo {
  return {
    tipo: 'paciente',
    id: p.id,
    nombre: p.nombre,
    apellido1: p.apellido1,
    celular: p.celular,
    telefono: p.telefono,
    correo: p.correo,
    codigo: p.codigo,
  }
}

function contactoADestinatario(c: PromocionContacto): DestinatarioPromo {
  return {
    tipo: 'contacto',
    id: c.id,
    nombre: c.nombre,
    celular: c.celular,
    correo: c.correo,
  }
}

export async function resolverContactos(
  supabase: SupabaseClient,
  filtro: Pick<FiltroAudiencia, 'contacto_ids' | 'sucursal_id'>,
  opts: { sucursalId?: number | null; esSuperAdmin?: boolean },
): Promise<DestinatarioPromo[]> {
  let q = supabase
    .from('promocion_contactos')
    .select('id, nombre, celular, correo, activo, sucursal_id')
    .eq('activo', true)
    .order('nombre')
    .limit(5000)

  const sid = filtro.sucursal_id ?? (!opts.esSuperAdmin ? opts.sucursalId : null)
  if (sid) q = q.or(`sucursal_id.eq.${sid},sucursal_id.is.null`)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let lista = (data ?? []) as PromocionContacto[]
  if (filtro.contacto_ids?.length) {
    const ids = new Set(filtro.contacto_ids)
    lista = lista.filter(c => ids.has(c.id))
  }

  return lista.map(contactoADestinatario)
}

export async function resolverAudiencia(
  supabase: SupabaseClient,
  filtro: FiltroAudiencia,
  opts: { sucursalId?: number | null; esSuperAdmin?: boolean },
): Promise<PacienteAudiencia[]> {
  let q = supabase
    .from('pacientes')
    .select('id, codigo, nombre, apellido1, apellido2, celular, telefono, correo, activo')
    .order('nombre')
    .limit(8000)

  const sid = filtro.sucursal_id ?? (!opts.esSuperAdmin ? opts.sucursalId : null)
  if (sid) q = q.eq('sucursal_id', sid)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let lista = (data ?? []).filter(pacienteActivo) as PacienteAudiencia[]

  if (filtro.tipo === 'manual' && filtro.paciente_ids?.length) {
    const ids = new Set(filtro.paciente_ids)
    lista = lista.filter(p => ids.has(p.id))
  } else if (filtro.tipo === 'whatsapp') {
    lista = lista.filter(tieneWhatsApp)
  } else if (filtro.tipo === 'correo') {
    lista = lista.filter(p => tieneCorreo(p) && !tieneWhatsApp(p))
  }

  return lista
}

type ConsultaRef = { paciente_id: number; fecha: string; sucursal_id?: number | null }

function fechaDesdeMeses(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

function agregarConsulta(ids: Set<number>, c: ConsultaRef | null | undefined, fechaDesde: string, sucursalId?: number | null) {
  if (!c?.paciente_id || c.fecha < fechaDesde) return
  if (sucursalId && c.sucursal_id && c.sucursal_id !== sucursalId) return
  ids.add(c.paciente_id)
}

export async function pacientesIdsPorHistorialServicio(
  supabase: SupabaseClient,
  opts: {
    categoria: CategoriaServicioPromo
    servicioId?: number | null
    meses?: number
    sucursalId?: number | null
  },
): Promise<number[]> {
  const meses = opts.meses ?? 24
  const fechaDesde = fechaDesdeMeses(meses)
  const ids = new Set<number>()

  if (opts.servicioId) {
    const { data, error } = await supabase
      .from('consulta_servicios')
      .select('consulta:consultas(paciente_id, fecha, sucursal_id)')
      .eq('servicio_id', opts.servicioId)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      agregarConsulta(ids, row.consulta as ConsultaRef | null, fechaDesde, opts.sucursalId)
    }
    return [...ids]
  }

  if (opts.categoria === 'consulta') {
    let q = supabase
      .from('consultas')
      .select('paciente_id')
      .gte('fecha', fechaDesde)
      .neq('estado', 'CANCELADO')
    if (opts.sucursalId) q = q.eq('sucursal_id', opts.sucursalId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    data?.forEach(r => ids.add(r.paciente_id))
    return [...ids]
  }

  if (opts.categoria === 'laboratorio') {
    let q = supabase
      .from('consulta_analisis')
      .select('paciente_id, id_cliente, fecha, sucursal_id')
      .gte('fecha', fechaDesde)
    if (opts.sucursalId) q = q.eq('sucursal_id', opts.sucursalId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const pid = r.paciente_id ?? Number.parseInt(String(r.id_cliente ?? ''), 10)
      if (Number.isFinite(pid) && pid > 0) ids.add(pid)
    }
    return [...ids]
  }

  if (opts.categoria === 'medicamentos') {
    const { data: det, error: errDet } = await supabase
      .from('consulta_detalle')
      .select('paciente_id, consulta_id')
    if (errDet) throw new Error(errDet.message)
    const consultaIds = [...new Set((det ?? []).map(d => d.consulta_id).filter(Boolean))]
    if (consultaIds.length === 0) return []

    let q = supabase
      .from('consultas')
      .select('id, paciente_id')
      .in('id', consultaIds.slice(0, 500))
      .gte('fecha', fechaDesde)
    if (opts.sucursalId) q = q.eq('sucursal_id', opts.sucursalId)
    const { data: cons, error } = await q
    if (error) throw new Error(error.message)
    cons?.forEach(c => ids.add(c.paciente_id))
    return [...ids]
  }

  if (opts.categoria === 'ultrasonido' || opts.categoria === 'procedimiento') {
    const { data: servs, error: errS } = await supabase
      .from('servicios')
      .select('id, nombre, tipo')
      .eq('activo', true)
    if (errS) throw new Error(errS.message)

    const servicioIds = (servs ?? []).filter(s => {
      const nombre = s.nombre.toLowerCase()
      const tipo = (s.tipo ?? '').toLowerCase()
      if (opts.categoria === 'ultrasonido') {
        return /ultrason/.test(nombre) || /ultrason/.test(tipo)
      }
      const tiposProc = ['procedimiento', 'inyectable', 'curación', 'cirugía menor', 'control', 'documento']
      return tiposProc.includes(tipo) && !/ultrason/.test(nombre)
    }).map(s => s.id)

    if (servicioIds.length === 0) return []

    const { data, error } = await supabase
      .from('consulta_servicios')
      .select('consulta:consultas(paciente_id, fecha, sucursal_id)')
      .in('servicio_id', servicioIds.slice(0, 200))
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      agregarConsulta(ids, row.consulta as ConsultaRef | null, fechaDesde, opts.sucursalId)
    }
    return [...ids]
  }

  return []
}

export async function resolverDestinatarios(
  supabase: SupabaseClient,
  filtro: FiltroAudiencia,
  opts: { sucursalId?: number | null; esSuperAdmin?: boolean },
): Promise<DestinatarioPromo[]> {
  if (filtro.tipo === 'contactos') {
    return resolverContactos(supabase, filtro, opts)
  }

  if (filtro.tipo === 'manual') {
    const pacientes = filtro.paciente_ids?.length
      ? await resolverAudiencia(supabase, { ...filtro, tipo: 'manual' }, opts)
      : []
    const contactos = filtro.contacto_ids?.length
      ? await resolverContactos(supabase, filtro, opts)
      : []
    return [
      ...pacientes.map(pacienteADestinatario),
      ...contactos,
    ]
  }

  if (filtro.tipo === 'por_servicio') {
    const categoria = filtro.categoria_servicio ?? 'consulta'
    const sid = filtro.sucursal_id ?? (!opts.esSuperAdmin ? opts.sucursalId : null)
    const pacienteIds = await pacientesIdsPorHistorialServicio(supabase, {
      categoria,
      servicioId: filtro.servicio_id,
      meses: filtro.meses_historial ?? 24,
      sucursalId: sid,
    })
    const idSet = new Set(pacienteIds)
    const todos = await resolverAudiencia(supabase, { tipo: 'todos', sucursal_id: filtro.sucursal_id }, opts)
    return todos.filter(p => idSet.has(p.id)).map(pacienteADestinatario)
  }

  return (await resolverAudiencia(supabase, filtro, opts)).map(pacienteADestinatario)
}
