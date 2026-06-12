import { BRAND } from '@/lib/brand'

/**
 * ÚNICO logo del sistema: public/brand/ticket.png (img/ticket.png del sistema viejo).
 * No usar logo-familia.svg ni logoSvgHtml en pantallas — distorsionan el layout.
 */
export const LOGO_TICKET_CLASS = 'logo-ticket'

/** Tamaños oficiales — no forzar otros anchos */
export const LOGO_TICKET_SIZES = {
  icon: 32,
  sidebar: 40,
  mobile: 100,
  full: 150,
  print: 150,
} as const

export type LogoTicketSize = keyof typeof LOGO_TICKET_SIZES

export function logoTicketPx(size: LogoTicketSize): number {
  return LOGO_TICKET_SIZES[size]
}

export function logoTicketSrc(baseUrl = ''): string {
  const path = BRAND.logoTicket
  if (!baseUrl) return path
  const origin = baseUrl.replace(/\/$/, '')
  // Evita caché viejo en ventanas de impresión (popup)
  return `${origin}${path}?v=2`
}

/** HTML para ventanas de impresión (factura, reportes, etc.) */
export function logoTicketHtml(
  baseUrl = '',
  size: LogoTicketSize | number = 'print',
): string {
  const px = typeof size === 'number' ? size : logoTicketPx(size)
  const src = logoTicketSrc(baseUrl)
  return `<img src="${src}" alt="${BRAND.nombre}" class="${LOGO_TICKET_CLASS}" width="${px}" style="display:block;margin:0 auto;width:${px}px;max-width:${px}px;height:auto;object-fit:contain"/>`
}
