/** Recursos visuales extraídos de public/lab/plantilla-informe.pdf */

import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

export type LabEncabezadoInforme = 'clinica' | 'maquila'

export const LAB_ENCABEZADO_STORAGE_KEY = 'lab-encabezado-informe'

export const LAB_ENCABEZADO_LABELS: Record<LabEncabezadoInforme, string> = {
  clinica: 'Clínica Jerusalén',
  maquila: 'Laboratorio maquila',
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

/** Encabezado maquila: banda del PDF del laboratorio referido. */
export function labEncabezadoMaquilaHtml(origin = ''): string {
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
  return tipo === 'maquila'
    ? labEncabezadoMaquilaHtml(origin)
    : labEncabezadoClinicaHtml(origin, meta)
}

/** Firma y sello del PDF maquila (solo cuando aplica). */
export function labFirmaSelloPlantillaHtml(origin = ''): string {
  const src = assetSrc(origin, LAB_PLANTILLA_ASSETS.firmaSello)
  return `<div class="plantilla-firma"><img src="${src}" alt="Firma y sello autorizado" class="plantilla-firma-img"/></div>`
}

export function labFirmaClinicaHtml(validadoPor?: string): string {
  const nombre = escapeHtml(validadoPor || 'Responsable de laboratorio')
  return `<div class="firma-clinica">
    <div class="firma-line">${nombre}</div>
    <div class="firma-sub">Validado por · ${escapeHtml(BRAND.nombre)}</div>
  </div>`
}

export function labPieInformeHtml(
  encabezado: LabEncabezadoInforme,
  origin = '',
  validadoPor?: string,
): string {
  if (encabezado === 'maquila') {
    return `<div class="firma-block">
      ${labFirmaSelloPlantillaHtml(origin)}
      ${validadoPor ? `<div class="validado-por">Validado por: <b>${escapeHtml(validadoPor)}</b></div>` : ''}
    </div>`
  }
  return `<div class="firma-block">${labFirmaClinicaHtml(validadoPor)}</div>`
}

export function parseLabEncabezadoInforme(raw?: string | null): LabEncabezadoInforme {
  return raw === 'maquila' ? 'maquila' : 'clinica'
}

export function labPlantillaInformeStyles(): string {
  return `
    .plantilla-hdr{text-align:center;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #003366}
    .plantilla-hdr-img{width:100%;max-height:96px;object-fit:contain;object-position:top center}
    .plantilla-firma{text-align:center;margin-top:8px;padding:8px 0 4px}
    .plantilla-firma-img{display:block;margin:0 auto;width:auto;max-width:340px;height:auto;max-height:220px;object-fit:contain}
    .firma-clinica{text-align:center;margin-top:12px;padding-top:12px}
    .firma-clinica .firma-line{display:inline-block;min-width:260px;border-top:1px solid #334155;padding-top:8px;font-size:11px;font-weight:600;color:#1e293b}
    .firma-clinica .firma-sub{margin-top:4px;font-size:10px;color:#64748b}
    .validado-por{text-align:center;font-size:10px;color:#475569;margin-top:8px}
  `
}
