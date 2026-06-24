/** Recursos visuales extraídos de public/lab/plantilla-informe.pdf */

export const LAB_PLANTILLA_ASSETS = {
  encabezado: '/lab/plantilla-encabezado.png',
  firmaSello: '/lab/plantilla-firma-sello.png',
} as const

function assetSrc(origin: string, rel: string): string {
  if (!origin) return rel
  return `${origin.replace(/\/$/, '')}${rel}`
}

/** Banda de encabezado del PDF institucional (encima del logo Jerusalén). */
export function labEncabezadoPlantillaHtml(origin = ''): string {
  const src = assetSrc(origin, LAB_PLANTILLA_ASSETS.encabezado)
  return `<div class="plantilla-hdr"><img src="${src}" alt="" class="plantilla-hdr-img"/></div>`
}

/** Firma y sello oficial extraídos del PDF de la clínica. */
export function labFirmaSelloPlantillaHtml(origin = ''): string {
  const src = assetSrc(origin, LAB_PLANTILLA_ASSETS.firmaSello)
  return `<div class="plantilla-firma"><img src="${src}" alt="Firma y sello autorizado" class="plantilla-firma-img"/></div>`
}

export function labPlantillaInformeStyles(): string {
  return `
    .plantilla-hdr{text-align:center;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #003366}
    .plantilla-hdr-img{width:100%;max-height:92px;object-fit:contain;object-position:top center}
    .plantilla-firma{text-align:center;margin-top:28px;padding-top:4px}
    .plantilla-firma-img{width:100%;max-height:155px;object-fit:contain;object-position:center bottom}
    .validado-por{text-align:center;font-size:10px;color:#475569;margin-top:6px}
  `
}
