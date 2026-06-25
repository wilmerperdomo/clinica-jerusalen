import { BRAND } from '@/lib/brand'
import { linkEmailMensaje, linkWhatsAppMensaje, nombrePaciente, type ContactoPaciente } from '@/lib/mensajes-paciente'

export type TipoContenidoPromo = 'texto' | 'imagen' | 'mixto'
export type CanalCampana = 'whatsapp' | 'email' | 'ambos'
export type ModoEnvioCampana = 'inmediato' | 'programado' | 'asistido' | 'automatico'
export type EstadoCampana = 'borrador' | 'programada' | 'lista_envio' | 'en_proceso' | 'completada' | 'cancelada'
export type EstadoEnvio = 'pendiente' | 'enviado' | 'sin_contacto' | 'omitido' | 'fallido'
export type TipoAudiencia = 'todos' | 'whatsapp' | 'correo' | 'manual' | 'contactos' | 'por_servicio'

export type CategoriaServicioPromo =
  | 'general'
  | 'consulta'
  | 'laboratorio'
  | 'ultrasonido'
  | 'procedimiento'
  | 'medicamentos'

export interface FiltroAudiencia {
  tipo: TipoAudiencia
  paciente_ids?: number[]
  contacto_ids?: number[]
  sucursal_id?: number | null
  categoria_servicio?: CategoriaServicioPromo
  servicio_id?: number | null
  meses_historial?: number
}

export interface ServicioPromo {
  id: number
  nombre: string
  tipo: string
  precio: number
}

export const CATEGORIAS_SERVICIO_PROMO: {
  value: CategoriaServicioPromo
  label: string
  icon: string
  badge: string
}[] = [
  { value: 'general',       label: 'General',       icon: '✨', badge: 'bg-slate-100 text-slate-700' },
  { value: 'consulta',      label: 'Consulta',      icon: '🩺', badge: 'bg-blue-100 text-blue-800' },
  { value: 'laboratorio',   label: 'Laboratorio',   icon: '🔬', badge: 'bg-cyan-100 text-cyan-800' },
  { value: 'ultrasonido',   label: 'Ultrasonido',   icon: '📡', badge: 'bg-purple-100 text-purple-800' },
  { value: 'procedimiento', label: 'Procedimiento', icon: '💉', badge: 'bg-amber-100 text-amber-800' },
  { value: 'medicamentos',  label: 'Medicamentos',  icon: '💊', badge: 'bg-emerald-100 text-emerald-800' },
]

export function cfgCategoriaServicio(cat?: CategoriaServicioPromo | null) {
  return CATEGORIAS_SERVICIO_PROMO.find(c => c.value === (cat ?? 'general'))
    ?? CATEGORIAS_SERVICIO_PROMO[0]
}

export function serviciosParaCategoria(
  servicios: ServicioPromo[],
  categoria: CategoriaServicioPromo,
): ServicioPromo[] {
  if (categoria === 'general') return servicios
  if (categoria === 'consulta') {
    return servicios.filter(s => s.tipo.toLowerCase() === 'consulta')
  }
  if (categoria === 'laboratorio') {
    return servicios.filter(s =>
      s.tipo.toLowerCase() === 'laboratorio'
      || /lab|hemograma|glicemia|orina|embarazo/i.test(s.nombre),
    )
  }
  if (categoria === 'ultrasonido') {
    return servicios.filter(s =>
      /ultrason/i.test(s.nombre) || /ultrason/i.test(s.tipo),
    )
  }
  if (categoria === 'procedimiento') {
    return servicios.filter(s =>
      ['procedimiento', 'inyectable', 'curación', 'cirugía menor', 'control', 'diagnóstico', 'documento']
        .includes(s.tipo.toLowerCase())
      && !/ultrason/i.test(s.nombre),
    )
  }
  return servicios
}

export interface PromocionContacto {
  id: number
  nombre: string
  celular?: string | null
  correo?: string | null
  notas?: string | null
  activo: boolean
  sucursal_id?: number | null
  created_at?: string
}

export interface DestinatarioPromo {
  tipo: 'paciente' | 'contacto'
  id: number
  nombre: string
  apellido1?: string | null
  celular?: string | null
  telefono?: string | null
  correo?: string | null
  codigo?: string
}

export interface Promocion {
  id: number
  titulo: string
  subtitulo?: string | null
  descripcion?: string | null
  imagen_url?: string | null
  tipo_contenido: TipoContenidoPromo
  categoria_servicio?: CategoriaServicioPromo
  servicio_id?: number | null
  descuento_pct?: number | null
  precio_promocional?: number | null
  vigencia_desde?: string | null
  vigencia_hasta?: string | null
  activa: boolean
  sucursal_id?: number | null
  created_at: string
  updated_at?: string | null
  servicio?: ServicioPromo | null
}

export interface Campana {
  id: number
  promocion_id: number
  nombre: string
  canal: CanalCampana
  modo_envio: ModoEnvioCampana
  programado_para?: string | null
  estado: EstadoCampana
  filtro_audiencia: FiltroAudiencia
  mensaje_personalizado?: string | null
  plantilla_id?: number | null
  regla_id?: number | null
  total_destinatarios: number
  total_enviados: number
  total_omitidos: number
  total_fallidos?: number
  sucursal_id?: number | null
  iniciada_at?: string | null
  completada_at?: string | null
  created_at: string
  promocion?: Promocion | null
}

export interface EnvioRegistro {
  id: number
  campana_id: number
  paciente_id?: number | null
  contacto_id?: number | null
  canal: 'whatsapp' | 'email'
  estado: EstadoEnvio
  enviado_at?: string | null
  proveedor?: string | null
  proveedor_id?: string | null
  error?: string | null
  nota?: string | null
  tracking_token?: string | null
  abierto_at?: string | null
  respondio_at?: string | null
  respondio?: boolean
  paciente?: ContactoPaciente & { id: number; codigo?: string }
  contacto?: PromocionContacto | null
}

export const ESTADO_CAMPANA_CFG: Record<EstadoCampana, { label: string; badge: string }> = {
  borrador:      { label: 'Borrador',       badge: 'bg-slate-100 text-slate-700' },
  programada:    { label: 'Programada',     badge: 'bg-violet-100 text-violet-800' },
  lista_envio:   { label: 'Lista para envío', badge: 'bg-amber-100 text-amber-800' },
  en_proceso:    { label: 'En proceso',     badge: 'bg-sky-100 text-sky-800' },
  completada:    { label: 'Completada',     badge: 'bg-emerald-100 text-emerald-800' },
  cancelada:     { label: 'Cancelada',      badge: 'bg-red-100 text-red-700' },
}

export const CANAL_CFG: Record<CanalCampana, { label: string; icon: string; desc?: string }> = {
  whatsapp: { label: 'Solo WhatsApp', icon: '💬', desc: 'Únicamente quienes tengan celular válido' },
  email:    { label: 'Solo correo', icon: '✉️', desc: 'Únicamente quienes tengan email' },
  ambos:    { label: 'Inteligente', icon: '🎯', desc: 'WhatsApp primero; correo solo si no tiene WhatsApp' },
}

export const AUDIENCIA_OPCIONES: { value: TipoAudiencia; label: string; desc: string; soloServicio?: boolean }[] = [
  { value: 'todos', label: 'Pacientes activos', desc: 'Toda la base de pacientes de la clínica' },
  { value: 'por_servicio', label: 'Historial del servicio', desc: 'Pacientes que ya usaron este servicio o categoría', soloServicio: true },
  { value: 'whatsapp', label: 'Con WhatsApp', desc: 'Pacientes con celular válido' },
  { value: 'correo', label: 'Solo correo (sin WA)', desc: 'Pacientes con email y sin WhatsApp' },
  { value: 'contactos', label: 'Elegir contactos', desc: 'Marque en su agenda quién recibirá la promoción' },
  { value: 'manual', label: 'Selección personalizada', desc: 'Elija pacientes y contactos uno a uno' },
]

export function lineaOfertaPromocion(
  promo: Pick<Promocion, 'descuento_pct' | 'precio_promocional' | 'servicio'>,
): string | null {
  if (promo.descuento_pct && promo.descuento_pct > 0) {
    return `🎁 *${promo.descuento_pct}% de descuento*`
  }
  if (promo.precio_promocional != null && promo.precio_promocional > 0) {
    const svc = promo.servicio?.nombre ? ` en ${promo.servicio.nombre}` : ''
    return `🎁 *Precio promocional: L ${Number(promo.precio_promocional).toFixed(2)}*${svc}`
  }
  return null
}

export function mensajePromocion(
  promo: Pick<Promocion, 'titulo' | 'subtitulo' | 'descripcion' | 'imagen_url' | 'descuento_pct' | 'precio_promocional' | 'servicio'>,
  paciente: ContactoPaciente,
  personalizado?: string | null,
): string {
  if (personalizado?.trim()) {
    return personalizado
      .replace(/\{\{NOMBRE\}\}/gi, nombrePaciente(paciente))
      .replace(/\{\{CLINICA\}\}/gi, BRAND.nombre)
  }
  const nombre = nombrePaciente(paciente)
  const oferta = lineaOfertaPromocion(promo)
  const lineas = [
    `Hola ${nombre},`,
    '',
    `*${promo.titulo}*`,
    promo.subtitulo ? `_${promo.subtitulo}_` : '',
    oferta ?? '',
    promo.descripcion ? promo.descripcion : '',
    promo.imagen_url ? `\n🖼️ Ver promoción: ${promo.imagen_url}` : '',
    '',
    `— ${BRAND.nombre}`,
    'Responda este mensaje o llámenos para más información. ¡Gracias!',
  ]
  return lineas.filter(l => l !== '').join('\n')
}

export function asuntoPromocion(promo: Pick<Promocion, 'titulo'>) {
  return `${promo.titulo} — ${BRAND.nombre}`
}

export function destinatarioAContacto(d: DestinatarioPromo | (ContactoPaciente & { correo?: string | null })) {
  return {
    nombre: d.nombre,
    apellido1: 'apellido1' in d ? d.apellido1 : null,
    celular: d.celular,
    telefono: 'telefono' in d ? d.telefono : null,
    correo: d.correo,
  }
}

export function linkEnvioPromocion(
  destinatario: ContactoPaciente & { correo?: string | null },
  promo: Promocion,
  canal: 'whatsapp' | 'email',
  mensajePersonalizado?: string | null,
): string | null {
  const contacto = destinatarioAContacto(destinatario)
  const mensaje = mensajePromocion(promo, contacto, mensajePersonalizado)
  if (canal === 'whatsapp') {
    return linkWhatsAppMensaje(contacto.celular, contacto.telefono, mensaje)
  }
  return linkEmailMensaje(contacto.correo, asuntoPromocion(promo), mensaje)
}

export function claveDestinatario(d: DestinatarioPromo): string {
  return `${d.tipo}-${d.id}`
}

export function fmtVigencia(p: Promocion): string {
  if (!p.vigencia_desde && !p.vigencia_hasta) return 'Sin vencimiento'
  if (p.vigencia_desde && p.vigencia_hasta) {
    return `${p.vigencia_desde} → ${p.vigencia_hasta}`
  }
  if (p.vigencia_hasta) return `Hasta ${p.vigencia_hasta}`
  return `Desde ${p.vigencia_desde}`
}

export function campanaListaParaEnvio(c: Campana): boolean {
  return c.estado === 'lista_envio' || c.estado === 'en_proceso'
}

export function campanaVencidaProgramacion(c: Campana, ahora = new Date()): boolean {
  if (c.estado !== 'programada' || !c.programado_para) return false
  return new Date(c.programado_para) <= ahora
}
