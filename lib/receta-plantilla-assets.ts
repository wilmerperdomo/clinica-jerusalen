/** Plantilla visual de receta médica — public/consultas/receta-plantilla.png */

export const RECETA_PLANTILLA_PATH = '/consultas/receta-plantilla.png'

export function recetaPlantillaSrc(origin = ''): string {
  if (!origin) return RECETA_PLANTILLA_PATH
  return `${origin.replace(/\/$/, '')}${RECETA_PLANTILLA_PATH}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface RecetaPlantillaItem {
  no_producto: string
  indicacion?: string
  cant?: number
  via?: string
}

export interface RecetaPlantillaData {
  paciente_nombre: string
  paciente_edad?: string
  fecha: string
  medico_nombre?: string
  numero_doc?: string
  items: RecetaPlantillaItem[]
  tratamiento?: string
  dias_reposo?: number
  origin?: string
}

function formatMedicamentos(items: RecetaPlantillaItem[]): string {
  if (items.length === 0) {
    return '<p class="rx-empty">Sin medicamentos indicados</p>'
  }
  return items.map((m, i) => {
    const det = [
      m.cant ? `Cant: ${m.cant}` : '',
      m.via ? `Vía: ${m.via}` : '',
    ].filter(Boolean).join(' · ')
    return `<div class="rx-item">
      <p class="rx-med"><b>${i + 1}.</b> ${escapeHtml(m.no_producto)}</p>
      ${det ? `<p class="rx-det">${escapeHtml(det)}</p>` : ''}
      ${m.indicacion ? `<p class="rx-ind">${escapeHtml(m.indicacion)}</p>` : ''}
    </div>`
  }).join('')
}

export function recetaPlantillaStyles(): string {
  /* Posiciones calibradas sobre receta-plantilla.png (1024×644 px) */
  const pageH = 'calc(279mm * 644 / 1024)'
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    @page{size:279mm ${pageH};margin:0}
    body{margin:0;padding:0;background:#fff}
    .receta-page{
      position:relative;width:279mm;height:${pageH};margin:0 auto;
      page-break-after:always;overflow:hidden;
    }
    .receta-bg{
      position:absolute;inset:0;width:100%;height:100%;
      object-fit:fill;pointer-events:none;user-select:none;
    }
    .receta-overlay{position:absolute;inset:0;font-family:Arial,Helvetica,sans-serif;color:#111}
    .f-campo{
      position:absolute;line-height:1.05;font-weight:600;
      transform:translateY(-100%);
    }
    .f-nombre{
      top:32.76%;left:21%;width:24%;font-size:10.5pt;
    }
    .f-edad{
      top:32.61%;left:57%;width:5%;font-size:10.5pt;text-align:center;
    }
    .f-fecha{
      top:31.99%;left:82%;width:16%;font-size:10pt;
    }
    .f-rx{
      position:absolute;top:35.5%;left:29.5%;right:5.5%;bottom:14%;
      overflow:hidden;font-size:10.5pt;line-height:1.45;
    }
    .rx-item{margin-bottom:8px}
    .rx-med{font-weight:700;color:#0a1628}
    .rx-det,.rx-ind{font-size:10pt;color:#333;margin-top:1px;padding-left:14px}
    .rx-trat{margin-top:10px;font-size:10.5pt;color:#111}
    .rx-reposo{margin-top:4px;font-size:10pt;font-weight:600}
    .rx-empty{color:#666;font-style:italic;padding-top:8px}
    .f-doctor{
      top:94.41%;left:20%;width:28%;font-size:10.5pt;font-weight:700;
      text-transform:uppercase;transform:translateY(-100%);
    }
    @media print{
      body{padding:0}
      .receta-page{width:279mm;height:${pageH}}
    }
  `
}

export function htmlRecetaPlantilla(data: RecetaPlantillaData): string {
  const src = recetaPlantillaSrc(data.origin ?? '')
  const meds = formatMedicamentos(data.items)
  const extra = [
    data.tratamiento?.trim()
      ? `<p class="rx-trat"><b>Indicaciones:</b> ${escapeHtml(data.tratamiento.trim())}</p>`
      : '',
    data.dias_reposo && data.dias_reposo > 0
      ? `<p class="rx-reposo">Reposo médico: ${data.dias_reposo} día${data.dias_reposo > 1 ? 's' : ''}</p>`
      : '',
  ].join('')

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Receta ${escapeHtml(data.numero_doc ?? '')}</title>
    <style>${recetaPlantillaStyles()}</style></head><body>
    <div class="receta-page">
      <img class="receta-bg" src="${src}" alt="" />
      <div class="receta-overlay">
        <span class="f-campo f-nombre">${escapeHtml(data.paciente_nombre)}</span>
        <span class="f-campo f-edad">${escapeHtml(data.paciente_edad ?? '')}</span>
        <span class="f-campo f-fecha">${escapeHtml(data.fecha)}</span>
        <div class="f-rx">${meds}${extra}</div>
        <span class="f-campo f-doctor">${escapeHtml(data.medico_nombre ?? '')}</span>
      </div>
    </div>
    </body></html>`
}
