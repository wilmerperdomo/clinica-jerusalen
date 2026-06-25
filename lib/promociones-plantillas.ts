import { BRAND } from '@/lib/brand'
import { nombrePaciente, type ContactoPaciente } from '@/lib/mensajes-paciente'
import type { CategoriaServicioPromo, Promocion } from '@/lib/promociones-utils'

export interface PromocionPlantilla {
  id: number
  nombre: string
  contenido: string
  categoria_servicio: CategoriaServicioPromo
  activa: boolean
  sucursal_id?: number | null
  created_at?: string
}

export const VARIABLES_PLANTILLA = [
  { key: '{{NOMBRE}}', desc: 'Nombre del paciente' },
  { key: '{{CLINICA}}', desc: 'Nombre de la clínica' },
  { key: '{{EDAD}}', desc: 'Edad del paciente' },
  { key: '{{SERVICIO}}', desc: 'Servicio o categoría de la promoción' },
  { key: '{{TITULO}}', desc: 'Título de la promoción' },
  { key: '{{DESCUENTO}}', desc: '% de descuento si aplica' },
]

export function calcularEdad(fechaNac?: string | null): string {
  if (!fechaNac) return ''
  const hoy = new Date()
  const nac = new Date(fechaNac)
  if (Number.isNaN(nac.getTime())) return ''
  let e = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) e--
  return e >= 0 ? String(e) : ''
}

export function aplicarPlantilla(
  contenido: string,
  vars: {
    paciente?: ContactoPaciente & { fecha_nac?: string | null }
    promo?: Pick<Promocion, 'titulo' | 'descuento_pct' | 'categoria_servicio' | 'servicio'>
    servicioNombre?: string | null
  },
): string {
  const nombre = vars.paciente ? nombrePaciente(vars.paciente) : '[Nombre]'
  const edad = calcularEdad(vars.paciente?.fecha_nac)
  const servicio = vars.servicioNombre
    ?? vars.promo?.servicio?.nombre
    ?? vars.promo?.categoria_servicio
    ?? ''
  const descuento = vars.promo?.descuento_pct ? `${vars.promo.descuento_pct}%` : ''

  return contenido
    .replace(/\{\{NOMBRE\}\}/gi, nombre)
    .replace(/\{\{CLINICA\}\}/gi, BRAND.nombre)
    .replace(/\{\{EDAD\}\}/gi, edad)
    .replace(/\{\{SERVICIO\}\}/gi, servicio)
    .replace(/\{\{TITULO\}\}/gi, vars.promo?.titulo ?? '')
    .replace(/\{\{DESCUENTO\}\}/gi, descuento)
}

export interface ResumenCampanaReporte {
  total: number
  enviados: number
  abiertos: number
  respondieron: number
  pendientes: number
  fallidos: number
  tasaApertura: number
  tasaRespuesta: number
}

export function calcularResumenReporte(
  envios: { estado: string; abierto_at?: string | null; respondio?: boolean | null }[],
): ResumenCampanaReporte {
  const total = envios.length
  const enviados = envios.filter(e => e.estado === 'enviado').length
  const abiertos = envios.filter(e => !!e.abierto_at).length
  const respondieron = envios.filter(e => e.respondio).length
  const pendientes = envios.filter(e => e.estado === 'pendiente').length
  const fallidos = envios.filter(e => e.estado === 'fallido').length
  const baseApertura = enviados || total
  const baseRespuesta = abiertos || enviados || total
  return {
    total,
    enviados,
    abiertos,
    respondieron,
    pendientes,
    fallidos,
    tasaApertura: baseApertura > 0 ? Math.round((abiertos / baseApertura) * 100) : 0,
    tasaRespuesta: baseRespuesta > 0 ? Math.round((respondieron / baseRespuesta) * 100) : 0,
  }
}

export function urlTrackingApertura(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/promociones/track/open?token=${encodeURIComponent(token)}`
}

/** GIF transparente 1×1 en base64 */
export const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)
