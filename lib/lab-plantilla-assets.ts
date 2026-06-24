/** Recursos visuales extraídos de public/lab/plantilla-informe.pdf (Masterlab) */

import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

export type LabEncabezadoInforme = 'clinica' | 'masterlab'

export const LAB_ENCABEZADO_STORAGE_KEY = 'lab-encabezado-informe'

export const LAB_ENCABEZADO_LABELS: Record<LabEncabezadoInforme, string> = {
  clinica: 'Clínica Jerusalén',
  masterlab: 'Masterlab',
}

export const LAB_PLANTILLA_ASSETS = {
  encabezado: '/lab/plantilla-encabezado.png',
  firmaSello: '/lab/plantilla-firma-sello.png',
} as const

export interface LabEncabezadoMeta {
  sucursalNombre?: string
}

function assetSrc(origin: string, rel: string): string {
  if (!origin) return rel
  return `${origin.replace(/\/$/, '')}${rel}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Encabezado Masterlab: banda del PDF del laboratorio referido. */
export function labEncabezadoMasterlabHtml(origin = ''): string {
  const src = assetSrc(origin, LAB_PLANTILLA_ASSETS.encabezado)
  return `<div class="plantilla-hdr"><img src="${src}" alt="" class="plantilla-hdr-img"/></div>`
}

/** Encabezado clínica: logo y datos de Clínica Jerusalén. */
export function labEncabezadoClinicaHtml(origin = '', meta: LabEncabezadoMeta = {}): string {
  return `<div class="hdr">
    <div class="brand">
      <div class="logo">${logoTicketHtml(origin, 'mobile')}</div>
      <div>
        <div class="name">${escapeHtml(BRAND.nombre)}</div>
        <div class="tag">Laboratorio Clínico${meta.sucursalNombre ? ' · ' + escapeHtml(meta.sucursalNombre) : ''}</div>
      </div>
    </div>
    <div class="meta">
      Tel: ${escapeHtml(FISCAL.telefonos)}<br>
      RTN: ${escapeHtml(FISCAL.rtn)}
    </div>
  </div>`
}

/** Un solo encabezado según elección del usuario. */
export function labEncabezadoInformeHtml(
  tipo: LabEncabezadoInforme,
  origin = '',
  meta: LabEncabezadoMeta = {},
): string {
  return tipo === 'masterlab'
    ? labEncabezadoMasterlabHtml(origin)
    : labEncabezadoClinicaHtml(origin, meta)
}

/** Firma y sello extraídos del PDF Masterlab. */
export function labFirmaSelloPlantillaHtml(origin = ''): string {
  const src = assetSrc(origin, LAB_PLANTILLA_ASSETS.firmaSello)
  return `<div class="plantilla-firma"><img src="${src}" alt="Firma y sello autorizado" class="plantilla-firma-img"/></div>`
}

/** Pie del informe: sello/firma Masterlab en todos los informes (clínica y Masterlab). */
export function labPieInformeHtml(origin = '', validadoPor?: string): string {
  return `<div class="firma-block">
    ${labFirmaSelloPlantillaHtml(origin)}
    ${validadoPor ? `<div class="validado-por">Validado por: <b>${escapeHtml(validadoPor)}</b></div>` : ''}
  </div>`
}

export function parseLabEncabezadoInforme(raw?: string | null): LabEncabezadoInforme {
  if (raw === 'masterlab' || raw === 'maquila') return 'masterlab'
  return 'clinica'
}

export function labPlantillaInformeStyles(): string {
  return `
    .plantilla-hdr{text-align:center;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #003366}
    .plantilla-hdr-img{width:100%;max-height:96px;object-fit:contain;object-position:top center}
    .plantilla-firma{text-align:center;margin-top:8px;padding:8px 0 4px}
    .plantilla-firma-img{display:block;margin:0 auto;width:auto;max-width:340px;height:auto;max-height:220px;object-fit:contain}
    .validado-por{text-align:center;font-size:10px;color:#475569;margin-top:8px}
  `
}
