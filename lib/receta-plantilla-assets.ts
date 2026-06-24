/** Receta médica — diseño nativo media carta horizontal (8.5" × 5.5" / 216 × 140 mm) */

import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

/** Media carta apaisada — mitad de hoja carta en horizontal */
export const RECETA_PAGE_W = '216mm'
export const RECETA_PAGE_H = '140mm'

const SERVICIOS_CLINICA = [
  'Atención de Niños y Adultos',
  'Electrocardiograma',
  'Hemograma 24 horas',
  'Laboratorio',
  'Ultrasonidos 3D y 4D',
  'Toma de Presión Arterial',
  'Medicina General',
  'Cirugía Menor',
  'Aplicación de Oxígeno',
  'Atención de Partos',
  'Hospitalización',
  'Desintoxicación Alcohólica',
  'Nebulizaciones',
  'Control Prenatal',
  'Control de Embarazo',
  'Control niño sano',
] as const

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function caduceoWatermarkSvg(): string {
  const c = BRAND.navy
  return `<svg class="wm-svg" viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g opacity="0.1">
      <!-- vara central -->
      <line x1="100" y1="44" x2="100" y2="244" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>
      <!-- esfera superior -->
      <circle cx="100" cy="40" r="6.5" fill="${c}"/>

      <!-- alas heráldicas con plumas, abiertas hacia arriba -->
      <g fill="${c}" fill-opacity="0.5">
        <path d="M98 76 C78 56 56 46 40 50 C44 56 47 60 50 66 C52 62 55 61 58 64 C61 70 64 74 67 80 C70 75 73 74 76 76 C80 80 84 82 88 84 C91 80 95 78 98 76 Z"/>
        <path d="M102 76 C122 56 144 46 160 50 C156 56 153 60 150 66 C148 62 145 61 142 64 C139 70 136 74 133 80 C130 75 127 74 124 76 C120 80 116 82 112 84 C109 80 105 78 102 76 Z"/>
      </g>
      <!-- separación de plumas -->
      <g stroke="#ffffff" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.5">
        <path d="M94 73 C76 58 58 52 44 55"/>
        <path d="M90 75 C74 64 62 62 54 66"/>
        <path d="M106 73 C124 58 142 52 156 55"/>
        <path d="M110 75 C126 64 138 62 146 66"/>
      </g>

      <!-- serpientes entrelazadas (doble hélice) -->
      <g stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M86 50 C92 53 97 56 100 60 C116 68 130 72 130 84 C130 96 116 100 100 106 C84 112 70 116 70 128 C70 140 84 144 100 150 C116 156 130 160 130 172 C130 184 116 188 100 194 C84 200 70 204 70 216 C70 226 82 230 100 232"/>
        <path d="M114 50 C108 53 103 56 100 60 C84 68 70 72 70 84 C70 96 84 100 100 106 C116 112 130 116 130 128 C130 140 116 144 100 150 C84 156 70 160 70 172 C70 184 84 188 100 194 C116 200 130 204 130 216 C130 226 118 230 100 232"/>
      </g>
      <!-- cabezas de serpiente -->
      <circle cx="86" cy="49" r="4" fill="${c}"/>
      <circle cx="114" cy="49" r="4" fill="${c}"/>
    </g>
  </svg>`
}

function listaServiciosHtml(): string {
  return SERVICIOS_CLINICA.map(s =>
    `<li>${escapeHtml(s)}</li>`,
  ).join('')
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
      <p class="rx-med"><span class="rx-n">${i + 1}.</span> ${escapeHtml(m.no_producto)}</p>
      ${det ? `<p class="rx-det">${escapeHtml(det)}</p>` : ''}
      ${m.indicacion ? `<p class="rx-ind">${escapeHtml(m.indicacion)}</p>` : ''}
    </div>`
  }).join('')
}

export function recetaPlantillaStyles(): string {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    @page{size:${RECETA_PAGE_W} ${RECETA_PAGE_H};margin:0}
    html,body{width:${RECETA_PAGE_W};height:${RECETA_PAGE_H};margin:0;padding:0;background:#fff;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a2332;font-size:9pt;line-height:1.35}

    .receta{
      width:${RECETA_PAGE_W};min-height:${RECETA_PAGE_H};height:${RECETA_PAGE_H};
      padding:3.5mm 4mm 3mm;display:flex;flex-direction:column;overflow:hidden;
    }

    /* ── Encabezado ── */
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:3mm;margin-bottom:2mm;flex-shrink:0}
    .hdr-brand{display:flex;align-items:flex-start;gap:2.5mm;min-width:0;flex:1}
    .hdr-logo{flex-shrink:0;line-height:0}
    .hdr-logo img{width:14mm!important;max-width:14mm!important;height:auto!important;margin:0!important}
    .hdr-titles{min-width:0}
    .clinic-name{
      font-family:Georgia,'Times New Roman',serif;font-size:13pt;font-weight:700;
      color:${BRAND.navy};letter-spacing:0.02em;line-height:1.15;
    }
    .clinic-verse{font-size:5.8pt;font-style:italic;color:#444;margin-top:0.8mm;line-height:1.25;max-width:95mm}
    .hdr-badges{display:flex;flex-wrap:wrap;gap:2mm;margin-top:1.2mm;align-items:center}
    .badge-24h{font-size:6.5pt;font-weight:700;color:${BRAND.navyMid};letter-spacing:0.03em}
    .badge-amb{font-size:6.5pt;font-weight:800;color:#c0392b;letter-spacing:0.04em}
    .hdr-contact{
      flex-shrink:0;text-align:right;font-size:5.8pt;color:#333;line-height:1.35;max-width:58mm;
    }
    .hdr-contact b{color:${BRAND.navy};font-size:6pt;display:block;margin-bottom:0.5mm}
    .hdr-contact .web{color:${BRAND.navyMid};font-weight:600;margin-top:0.8mm}

    /* ── Cuerpo con borde ── */
    .form-box{
      flex:1;display:flex;flex-direction:column;border:1.6pt solid #111;
      border-radius:4mm;padding:2.5mm 3mm 2mm;min-height:0;position:relative;
    }
    .doc-no{
      position:absolute;top:2mm;right:3mm;font-size:6pt;color:#666;
      font-family:Consolas,monospace;letter-spacing:0.04em;
    }

    .patient-row{
      display:flex;align-items:flex-end;gap:3mm;margin-bottom:2mm;padding-bottom:1mm;
      border-bottom:0.6pt solid #ccc;flex-shrink:0;
    }
    .field{display:flex;align-items:baseline;gap:1.5mm;min-width:0}
    .field label{font-size:8pt;font-weight:700;color:#111;white-space:nowrap;flex-shrink:0}
    .field-val{
      flex:1;border-bottom:0.6pt solid #222;font-size:8.5pt;font-weight:600;
      color:#0a1628;padding-bottom:0.3mm;min-height:4mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    }
    .field-nombre{flex:1.8;min-width:0}
    .field-edad{flex:0 0 22mm}
    .field-edad .field-val{text-align:center}
    .field-fecha{flex:0 0 38mm}

    .body-grid{display:flex;flex:1;min-height:0;gap:2.5mm;margin-top:0.5mm}
    .services{
      flex:0 0 27%;font-size:5.6pt;color:#222;line-height:1.28;
      border-right:0.5pt solid #ddd;padding-right:2mm;overflow:hidden;
    }
    .services ul{list-style:none;padding:0}
    .services li{
      position:relative;padding-left:2.5mm;margin-bottom:0.6mm;
    }
    .services li::before{
      content:'';position:absolute;left:0;top:1.2mm;width:1mm;height:1mm;
      border-radius:50%;background:${BRAND.navy};
    }

    .rx-area{
      flex:1;position:relative;min-width:0;display:flex;flex-direction:column;
      padding-left:1mm;
    }
    .wm-svg{
      position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);
      width:33mm;height:43mm;pointer-events:none;
    }
    .rx-symbol{
      position:absolute;top:0;right:1mm;font-size:22pt;font-weight:300;
      color:${BRAND.navy};opacity:0.12;font-family:Georgia,serif;line-height:1;
    }
    .rx-content{
      position:relative;z-index:1;flex:1;overflow:hidden;
      font-size:8.5pt;line-height:1.4;padding-top:0.5mm;
    }
    .rx-item{margin-bottom:1.8mm}
    .rx-med{font-weight:700;color:${BRAND.navy}}
    .rx-n{color:${BRAND.gold};margin-right:1mm}
    .rx-det,.rx-ind{font-size:7.8pt;color:#444;padding-left:3.5mm;margin-top:0.3mm}
    .rx-trat{margin-top:2mm;font-size:8pt;padding-top:1.5mm;border-top:0.4pt dashed #ccc}
    .rx-reposo{margin-top:1mm;font-size:8pt;font-weight:700;color:#333}
    .rx-empty{color:#888;font-style:italic;font-size:8pt;padding-top:2mm}

    .sig-row{
      display:flex;align-items:flex-end;gap:4mm;margin-top:2mm;padding-top:1.5mm;
      border-top:0.6pt solid #ccc;flex-shrink:0;
    }
    .field-dr{flex:1;display:flex;align-items:baseline;gap:1.5mm}
    .field-dr label{font-size:8pt;font-weight:800;letter-spacing:0.06em}
    .field-dr .field-val{text-transform:uppercase;font-size:8.5pt}
    .field-sello{flex:1;display:flex;align-items:baseline;gap:1.5mm}
    .field-sello label{font-size:7pt;font-weight:700;white-space:nowrap;color:#333}
    .field-sello .field-val{min-height:5mm;border-bottom-style:dashed}

    @media print{
      .receta{width:${RECETA_PAGE_W};height:${RECETA_PAGE_H}}
    }
  `
}

function encabezadoHtml(origin: string, numeroDoc?: string): string {
  const logo = logoTicketHtml(origin, 52)
  const docNo = numeroDoc
    ? `<span class="doc-no">Receta No. ${escapeHtml(numeroDoc)}</span>`
    : ''

  return `${docNo}
  <header class="hdr">
    <div class="hdr-brand">
      <div class="hdr-logo">${logo}</div>
      <div class="hdr-titles">
        <div class="clinic-name">${escapeHtml(BRAND.nombre)}</div>
        <p class="clinic-verse">Mas a Jehová vuestro Dios serviréis, y él bendecirá tu pan y tus aguas; y yo quitaré toda enfermedad de en medio de ti. Éxodo 23:25</p>
        <div class="hdr-badges">
          <span class="badge-24h">Atención 365 días del año · 24 horas</span>
          <span class="badge-amb">SERVICIO DE AMBULANCIA</span>
        </div>
      </div>
    </div>
    <div class="hdr-contact">
      <b>Col. Alemán, Calle Principal</b>
      Antiguo Local Clínica Sinaí · Tel. ${escapeHtml(FISCAL.telefonos.split('|')[0]?.trim() ?? '2246-3051')}
      <br><b>Sucursal El Tizatillo</b>
      Km 6 carretera al Sur, 100 m arriba Villa Foresta
      <div class="web">${escapeHtml(FISCAL.web)}</div>
    </div>
  </header>`
}

export function htmlRecetaPlantilla(data: RecetaPlantillaData): string {
  const origin = data.origin ?? ''
  const meds = formatMedicamentos(data.items)
  const extra = [
    data.tratamiento?.trim()
      ? `<p class="rx-trat"><b>Indicaciones:</b> ${escapeHtml(data.tratamiento.trim())}</p>`
      : '',
    data.dias_reposo && data.dias_reposo > 0
      ? `<p class="rx-reposo">Reposo médico: ${data.dias_reposo} día${data.dias_reposo > 1 ? 's' : ''}</p>`
      : '',
  ].join('')

  const medico = data.medico_nombre?.trim()
    ? (data.medico_nombre.trim().toLowerCase().startsWith('dr') ? data.medico_nombre.trim() : `Dr. ${data.medico_nombre.trim()}`)
    : ''

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Receta ${escapeHtml(data.numero_doc ?? '')}</title>
    <style>${recetaPlantillaStyles()}</style></head><body>
    <div class="receta">
      ${encabezadoHtml(origin, data.numero_doc)}
      <main class="form-box">
        <div class="patient-row">
          <div class="field field-nombre">
            <label>Nombre:</label>
            <span class="field-val">${escapeHtml(data.paciente_nombre)}</span>
          </div>
          <div class="field field-edad">
            <label>Edad:</label>
            <span class="field-val">${escapeHtml(data.paciente_edad ?? '')}</span>
          </div>
          <div class="field field-fecha">
            <label>Fecha:</label>
            <span class="field-val">${escapeHtml(data.fecha)}</span>
          </div>
        </div>
        <div class="body-grid">
          <aside class="services"><ul>${listaServiciosHtml()}</ul></aside>
          <section class="rx-area">
            ${caduceoWatermarkSvg()}
            <span class="rx-symbol">℞</span>
            <div class="rx-content">${meds}${extra}</div>
          </section>
        </div>
        <footer class="sig-row">
          <div class="field field-dr">
            <label>DR.</label>
            <span class="field-val">${escapeHtml(medico)}</span>
          </div>
          <div class="field field-sello">
            <label>FIRMA Y SELLO</label>
            <span class="field-val"></span>
          </div>
        </footer>
      </main>
    </div>
    </body></html>`
}
