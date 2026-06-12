import { BRAND } from '@/lib/brand'

/** Configura en .env.local: NEXT_PUBLIC_ENCUESTA_URL=https://forms.gle/tu-encuesta */
export const ENCUESTA_URL =
  process.env.NEXT_PUBLIC_ENCUESTA_URL ?? 'https://forms.gle/REEMPLAZA_CON_TU_ENCUESTA'

export interface ContactoPaciente {
  nombre: string
  apellido1?: string
  celular?: string | null
  telefono?: string | null
  correo?: string | null
}

export function nombrePaciente(c: ContactoPaciente) {
  return `${c.nombre} ${c.apellido1 ?? ''}`.trim()
}

export function limpiarCelular(cel?: string | null, tel?: string | null) {
  const raw = cel || tel
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('504')) return digits
  if (digits.length === 8) return `504${digits}`
  return digits
}

export function fmtMonto(monto: number) {
  return `L ${Number(monto).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

export function mensajeAgradecimientoPago(nombre: string, monto: number) {
  return [
    `Hola ${nombre},`,
    `gracias por preferir ${BRAND.nombre}.`,
    `Tu pago por ${fmtMonto(monto)} ha sido recibido.`,
    `Nos ayudarías mucho llenando esta encuesta de satisfacción:`,
    ENCUESTA_URL,
  ].join(' ')
}

export function mensajePublicidad(nombre: string) {
  return [
    `Hola ${nombre},`,
    `desde ${BRAND.nombre} te compartimos nuestras promociones del mes:`,
    `consultas, ultrasonidos y chequeos preventivos con precios especiales.`,
    `Agenda tu cita respondiendo este mensaje o llamándonos.`,
    `¡Te esperamos!`,
  ].join(' ')
}

export function linkWhatsAppMensaje(
  cel?: string | null,
  tel?: string | null,
  mensaje?: string,
) {
  const n = limpiarCelular(cel, tel)
  if (!n || !mensaje) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}`
}

export function linkEmailMensaje(
  correo?: string | null,
  asunto?: string,
  cuerpo?: string,
) {
  const email = correo?.trim()
  if (!email) return null
  const params = new URLSearchParams()
  if (asunto) params.set('subject', asunto)
  if (cuerpo) params.set('body', cuerpo)
  const q = params.toString()
  return `mailto:${email}${q ? `?${q}` : ''}`
}
