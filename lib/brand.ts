/** Identidad visual — Clínica Médica Jerusalén (colores del sistema anterior) */

export const BRAND = {
  navy:      '#003366',
  navyMid:   '#005580',
  navyDark:  '#004080',
  /** Pie de página — azul profundo con acento dorado */
  footerFrom: '#003366',
  footerTo:   '#001f3f',
  gold:      '#c9a227',
  goldLight: '#e8c547',
  white:     '#ffffff',
  tagline:   'Atención médica a tu alcance',
  nombre:    'Clínica Médica Jerusalén',
  nombreCorto: 'C.M. Jerusalén',
  /** Texto del pie.php del sistema anterior */
  derechosReservados: 'Todos los derechos reservados.',
  /** Logo oficial — mismo img/ticket.png del sistema viejo (factura, login, menú) */
  logoTicket: '/brand/ticket.png',
} as const

/** Datos fiscales y sucursales — formato ticket térmico oficial */
export const FISCAL = {
  rtn: '06111987001162',
  telefonos: '2246-3051 | 9522-7208',
  casaMatriz: 'Barrio Caserío Suyapa, casa no.: n/a',
  sucursal1: 'Col. La Peña calle principal contiguo a Pollo Master casa 224',
  sucursal2: 'El Tizatillo calle principal carretera al sur km 7',
  cai: '48BFE5-3E70C9-174CE0-63BE03-09097A-2B',
  rangoInicio: '001-001-01-00064901',
  rangoFin: '001-001-01-00069900',
  fechaLimiteCai: '2027-01-19',
  facebook: 'clinicamedicajerusalen',
  web: 'www.clinicasmedicasjerusalen.com',
} as const

/** Pie de página — igual al sistema viejo (Modulos/pie.php) */
export function textoDerechosReservados(year = new Date().getFullYear()): string {
  return `${BRAND.nombre} © ${year}. ${BRAND.derechosReservados}`
}

export function derechosReservadosHtml(year = new Date().getFullYear()): string {
  return `<strong>${BRAND.nombre}</strong> &copy; ${year}. ${BRAND.derechosReservados}`
}

/** Icono familia — reutilizable en favicon e impresiones */
export function iconoFamiliaSvg(): string {
  return `
    <circle cx="20" cy="16" r="9" fill="${BRAND.navy}"/>
    <path d="M20 25 C9 30 5 46 16 56 C26 64 42 59 44 44 C46 32 31 27 20 25 Z" fill="${BRAND.navy}"/>
    <circle cx="40" cy="22" r="7" fill="${BRAND.navyMid}"/>
    <path d="M40 29 C33 33 30 44 36 52 C42 58 52 55 53 45 C54 37 47 31 40 29 Z" fill="${BRAND.navyMid}"/>
    <circle cx="56" cy="28" r="5.5" fill="${BRAND.gold}"/>
    <path d="M56 33.5 C51 36.5 49 43 53.5 48.5 C58 52.5 65 49.5 65 43 C65 38 60 35 56 33.5 Z" fill="${BRAND.gold}"/>
  `
}

/**
 * @deprecated No usar en UI — distorsiona tickets. Usar logoTicketHtml de brand-logo.ts
 */
export function logoSvgHtml(width = 300, height = 130): string {
  const uid = `lg${Math.random().toString(36).slice(2, 9)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 340 150" role="img" aria-label="${BRAND.nombre}">
    <defs>
      <linearGradient id="adult-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.navy}"/>
        <stop offset="100%" stop-color="${BRAND.navyMid}"/>
      </linearGradient>
      <linearGradient id="parent-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a6faa"/>
        <stop offset="100%" stop-color="#3d9fd4"/>
      </linearGradient>
      <linearGradient id="child-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#a8841a"/>
        <stop offset="100%" stop-color="${BRAND.goldLight}"/>
      </linearGradient>
      <linearGradient id="gold-text-${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#a8841a"/>
        <stop offset="50%" stop-color="${BRAND.goldLight}"/>
        <stop offset="100%" stop-color="${BRAND.gold}"/>
      </linearGradient>
      <linearGradient id="navy-text-${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${BRAND.navy}"/>
        <stop offset="100%" stop-color="${BRAND.navyMid}"/>
      </linearGradient>
    </defs>
    <path d="M55 78 Q170 92 285 78" fill="none" stroke="url(#gold-text-${uid})" stroke-width="1.5" opacity="0.6"/>
    <g transform="translate(130, 4) scale(1.15)">
      <circle cx="20" cy="16" r="9" fill="url(#adult-${uid})"/>
      <path d="M20 25 C9 30 5 46 16 56 C26 64 42 59 44 44 C46 32 31 27 20 25 Z" fill="url(#adult-${uid})"/>
      <circle cx="40" cy="22" r="7" fill="url(#parent-${uid})"/>
      <path d="M40 29 C33 33 30 44 36 52 C42 58 52 55 53 45 C54 37 47 31 40 29 Z" fill="url(#parent-${uid})"/>
      <circle cx="56" cy="28" r="5.5" fill="url(#child-${uid})"/>
      <path d="M56 33.5 C51 36.5 49 43 53.5 48.5 C58 52.5 65 49.5 65 43 C65 38 60 35 56 33.5 Z" fill="url(#child-${uid})"/>
    </g>
    <circle cx="170" cy="82" r="3" fill="${BRAND.gold}"/>
    <line x1="100" y1="82" x2="158" y2="82" stroke="url(#gold-text-${uid})" stroke-width="1.2"/>
    <line x1="182" y1="82" x2="240" y2="82" stroke="url(#gold-text-${uid})" stroke-width="1.2"/>
    <text x="170" y="118" text-anchor="middle" fill="url(#navy-text-${uid})" font-family="'Segoe Script','Brush Script MT',cursive" font-size="26">${BRAND.nombre}</text>
    <text x="170" y="140" text-anchor="middle" fill="url(#gold-text-${uid})" font-family="Arial,Helvetica,sans-serif" font-size="9" letter-spacing="3" font-weight="600">${BRAND.tagline.toUpperCase()}</text>
  </svg>`
}

/** @deprecated Usar logoTicketHtml de @/lib/brand-logo */
export function urlLogoTicket(baseUrl = ''): string {
  return baseUrl
    ? `${baseUrl.replace(/\/$/, '')}${BRAND.logoTicket}`
    : BRAND.logoTicket
}

/** Logo ticket para impresiones — delega en brand-logo (tamaños fijos) */
export function logoFacturaTicketHtml(baseUrl = '', width = 150): string {
  // Evitar import circular: inline mínimo
  const src = urlLogoTicket(baseUrl)
  return `<img src="${src}" alt="${BRAND.nombre}" class="logo-ticket" width="${width}" style="display:block;margin:0 auto;width:${width}px;max-width:${width}px;height:auto;object-fit:contain"/>`
}

/** Logo compacto solo texto — tickets térmicos */
export function logoTextoHtml(): string {
  return `<div style="text-align:center;line-height:1.35">
    <div style="font-size:14px;font-weight:bold;color:${BRAND.navy}">CLÍNICA MÉDICA</div>
    <div style="font-size:16px;font-weight:bold;color:${BRAND.gold};letter-spacing:1px">JERUSALÉN</div>
  </div>`
}
