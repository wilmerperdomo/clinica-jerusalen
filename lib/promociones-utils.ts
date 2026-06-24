import { BRAND } from '@/lib/brand'
import { linkEmailMensaje, linkWhatsAppMensaje, nombrePaciente, type ContactoPaciente } from '@/lib/mensajes-paciente'

export type TipoContenidoPromo = 'texto' | 'imagen' | 'mixto'
export type CanalCampana = 'whatsapp' | 'email' | 'ambos'
export type ModoEnvioCampana = 'inmediato' | 'programado' | 'asistido' | 'automatico'
export type EstadoCampana = 'borrador' | 'programada' | 'lista_envio' | 'en_proceso' | 'completada' | 'cancelada'
export type EstadoEnvio = 'pendiente' | 'enviado' | 'sin_contacto' | 'omitido' | 'fallido'
export type TipoAudiencia = 'todos' | 'whatsapp' | 'correo' | 'manual'

export interface FiltroAudiencia {
  tipo: TipoAudiencia
  paciente_ids?: number[]
  sucursal_id?: number | null
}

export interface Promocion {
  id: number
  titulo: string
  subtitulo?: string | null
  descripcion?: string | null
  imagen_url?: string | null
  tipo_contenido: TipoContenidoPromo
  vigencia_desde?: string | null
  vigencia_hasta?: string | null
  activa: boolean
  sucursal_id?: number | null
  created_at: string
  updated_at?: string | null
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
  paciente_id: number
  canal: 'whatsapp' | 'email'
  estado: EstadoEnvio
  enviado_at?: string | null
  proveedor?: string | null
  proveedor_id?: string | null
  error?: string | null
  nota?: string | null
  paciente?: ContactoPaciente & { id: number; codigo?: string }
}

export const ESTADO_CAMPANA_CFG: Record<EstadoCampana, { label: string; badge: string }> = {
  borrador:      { label: 'Borrador',       badge: 'bg-slate-100 text-slate-700' },
  programada:    { label: 'Programada',     badge: 'bg-violet-100 text-violet-800' },
  lista_envio:   { label: 'Lista para envío', badge: 'bg-amber-100 text-amber-800' },
  en_proceso:    { label: 'En proceso',     badge: 'bg-sky-100 text-sky-800' },
  completada:    { label: 'Completada',     badge: 'bg-emerald-100 text-emerald-800' },
  cancelada:     { label: 'Cancelada',      badge: 'bg-red-100 text-red-700' },
}

export const CANAL_CFG: Record<CanalCampana, { label: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬' },
  email:    { label: 'Correo', icon: '✉️' },
  ambos:    { label: 'WhatsApp + Correo', icon: '📣' },
}

export const AUDIENCIA_OPCIONES: { value: TipoAudiencia; label: string; desc: string }[] = [
  { value: 'whatsapp', label: 'Con WhatsApp', desc: 'Pacientes activos con celular válido' },
  { value: 'correo', label: 'Con correo', desc: 'Pacientes activos con email registrado' },
  { value: 'todos', label: 'Todos los activos', desc: 'Base completa de pacientes activos' },
  { value: 'manual', label: 'Selección manual', desc: 'Elija pacientes específicos' },
]

export function mensajePromocion(
  promo: Pick<Promocion, 'titulo' | 'subtitulo' | 'descripcion' | 'imagen_url'>,
  paciente: ContactoPaciente,
  personalizado?: string | null,
): string {
  if (personalizado?.trim()) {
    return personalizado
      .replace(/\{\{NOMBRE\}\}/gi, nombrePaciente(paciente))
      .replace(/\{\{CLINICA\}\}/gi, BRAND.nombre)
  }
  const nombre = nombrePaciente(paciente)
  const lineas = [
    `Hola ${nombre},`,
    '',
    `*${promo.titulo}*`,
    promo.subtitulo ? `_${promo.subtitulo}_` : '',
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

export function linkEnvioPromocion(
  paciente: ContactoPaciente & { correo?: string | null },
  promo: Promocion,
  canal: 'whatsapp' | 'email',
  mensajePersonalizado?: string | null,
): string | null {
  const mensaje = mensajePromocion(promo, paciente, mensajePersonalizado)
  if (canal === 'whatsapp') {
    return linkWhatsAppMensaje(paciente.celular, paciente.telefono, mensaje)
  }
  return linkEmailMensaje(paciente.correo, asuntoPromocion(promo), mensaje)
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
