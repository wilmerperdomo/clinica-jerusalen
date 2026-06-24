import { calcularEdad } from '@/lib/consultas-utils'
import { htmlRecetaPlantilla } from '@/lib/receta-plantilla-assets'
import { BRAND } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

export interface RecetaPrintItem {
  no_producto: string
  indicacion?: string
  cant?: number
  via?: string
}

export interface DocumentoPrintBase {
  numero_doc: string
  fecha: string
  paciente_nombre: string
  paciente_codigo?: string
  paciente_edad?: string
  medico_nombre?: string
  medico_registro?: string
  baseUrl?: string
}

function abrirVentanaImpresion(html: string, titulo: string) {
  const w = window.open('', '_blank', 'width=920,height=640')
  if (!w) {
    alert('Permita ventanas emergentes para imprimir.')
    return
  }
  w.document.write(html.replace(
    '</body>',
    '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body>',
  ))
  w.document.close()
}

/** HTML de receta — diseño nativo media carta (216 × 140 mm). */
export function htmlRecetaMedica(data: DocumentoPrintBase & {
  items: RecetaPrintItem[]
  tratamiento?: string
  dias_reposo?: number
}): string {
  const origin = data.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return htmlRecetaPlantilla({
    origin,
    numero_doc: data.numero_doc,
    paciente_nombre: data.paciente_nombre,
    paciente_edad: data.paciente_edad,
    fecha: data.fecha,
    medico_nombre: data.medico_nombre,
    items: data.items,
    tratamiento: data.tratamiento,
    dias_reposo: data.dias_reposo,
  })
}

export function imprimirRecetaMedica(data: DocumentoPrintBase & {
  items: RecetaPrintItem[]
  tratamiento?: string
  dias_reposo?: number
}) {
  abrirVentanaImpresion(htmlRecetaMedica(data), `Receta ${data.numero_doc}`)
}

function escapeHtmlDoc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto editable → párrafos justificados, con soporte de **negrita**. */
function cuerpoDocHtml(texto: string): string {
  const bloques = texto.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return bloques.map(bloque => {
    const conSaltos = escapeHtmlDoc(bloque).replace(/\n/g, '<br>')
    const conNegrita = conSaltos.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    return `<p>${conNegrita}</p>`
  }).join('')
}

/** Estilos de la constancia profesional (carta vertical, estilo oficial Jerusalén). */
function estilosConstancia(): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:letter portrait;margin:0}
    html,body{width:216mm;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:12pt;line-height:1.55}
    .doc{position:relative;width:216mm;min-height:279mm;display:flex;flex-direction:column;
      padding:16mm 22mm 0;overflow:hidden}

    .wm{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;
      pointer-events:none;z-index:0}
    .wm span{font-family:'Brush Script MT','Segoe Script',cursive;font-size:54pt;color:${BRAND.navy};
      opacity:0.06;white-space:nowrap;transform:rotate(-8deg)}

    .doc-inner{position:relative;z-index:1;flex:1;display:flex;flex-direction:column}

    /* Encabezado */
    .c-hdr{text-align:center;border-bottom:2pt solid ${BRAND.navy};padding-bottom:4mm;margin-bottom:7mm}
    .c-hdr .logo-row{display:flex;align-items:center;justify-content:center;gap:5mm;margin-bottom:1.5mm}
    .c-hdr .logo-row img{width:18mm!important;max-width:18mm!important;height:auto!important;margin:0!important}
    .c-name{font-family:Georgia,'Times New Roman',serif;font-size:21pt;font-weight:700;color:${BRAND.navy};
      letter-spacing:0.01em;line-height:1.05}
    .c-name .j{font-family:'Brush Script MT','Segoe Script',cursive;font-weight:400}
    .c-24h{font-size:11pt;font-weight:700;color:${BRAND.navy};margin-top:0.5mm}
    .c-addr{font-size:8.5pt;color:#444;margin-top:0.5mm}

    .doc-no{position:absolute;top:0;right:0;font-size:8pt;color:#777;font-family:Consolas,monospace}

    /* Título */
    .c-title{text-align:center;margin-bottom:9mm}
    .c-title h1{font-size:15pt;font-weight:800;letter-spacing:0.08em;color:#111}
    .c-title h2{font-size:13pt;font-weight:800;letter-spacing:0.1em;color:${BRAND.navy};margin-top:2mm}

    /* Cuerpo */
    .c-body{flex:1}
    .c-body p{text-align:justify;margin-bottom:5mm;text-justify:inter-word}

    /* Firma */
    .c-sign{margin-top:14mm;text-align:center}
    .c-sign .dr{font-size:12pt;font-weight:700;color:#111}
    .c-sign .cargo{font-size:11pt;color:#333;margin-top:0.5mm}
    .c-sign .line{width:70mm;border-top:1pt solid #333;margin:18mm auto 0}
    .c-sign .firma-lbl{font-size:11pt;font-weight:700;letter-spacing:0.08em;color:#111;margin-top:1.5mm}

    /* Pie */
    .c-footer{margin-top:auto;margin-left:-22mm;margin-right:-22mm;
      background:${BRAND.footerFrom};color:#fff;text-align:center;
      font-size:8.5pt;letter-spacing:0.03em;padding:4mm 6mm}
    .c-footer b{font-weight:600}

    @media print{.doc{min-height:279mm}}
  `
}

export function htmlConstanciaMedica(data: DocumentoPrintBase & {
  texto: string
  subtitulo?: string
  cargo_medico?: string
}): string {
  const origin = data.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const subtitulo = (data.subtitulo ?? 'INCAPACIDAD').trim().toUpperCase()
  const cargo = (data.cargo_medico ?? 'Médico General').trim()
  const medico = data.medico_nombre?.trim()
    ? (data.medico_nombre.trim().toLowerCase().startsWith('dr') ? data.medico_nombre.trim() : `DR. ${data.medico_nombre.trim()}`)
    : 'DR. _______________________'

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Constancia ${escapeHtmlDoc(data.numero_doc)}</title>
    <style>${estilosConstancia()}</style></head><body>
    <div class="doc">
      <div class="wm"><span>Clínicas Médicas Jerusalén</span></div>
      <div class="doc-inner">
        <span class="doc-no">Constancia No. ${escapeHtmlDoc(data.numero_doc)}</span>
        <header class="c-hdr">
          <div class="logo-row">
            ${logoTicketHtml(origin, 64)}
            <div>
              <div class="c-name">Clínica Médica <span class="j">Jerusalén</span></div>
              <div class="c-24h">Atención 365 días del año · 24 Horas</div>
            </div>
          </div>
          <div class="c-addr">Col. Alemán, Calle Principal, Antiguo Local Clínica Sinaí · Tel.: 2246-3051</div>
        </header>

        <div class="c-title">
          <h1>CONSTANCIA MÉDICA</h1>
          ${subtitulo ? `<h2>${escapeHtmlDoc(subtitulo)}</h2>` : ''}
        </div>

        <main class="c-body">${cuerpoDocHtml(data.texto)}</main>

        <div class="c-sign">
          <div class="dr">${escapeHtmlDoc(medico)}</div>
          <div class="cargo">${escapeHtmlDoc(cargo)}</div>
          <div class="line"></div>
          <div class="firma-lbl">FIRMA</div>
        </div>

        <footer class="c-footer">
          <b>www.clinicamedicajerusalen.com</b> &nbsp;|&nbsp; Abierto las 24 horas, 365 días del año
        </footer>
      </div>
    </div>
    </body></html>`
}

export function imprimirConstanciaMedica(data: DocumentoPrintBase & {
  texto: string
  subtitulo?: string
  cargo_medico?: string
}) {
  abrirVentanaImpresion(htmlConstanciaMedica(data), `Constancia ${data.numero_doc}`)
}

export interface ActaDefuncionData extends DocumentoPrintBase {
  texto: string
  tipo_muerte?: string
  causas?: string[]
  cargo_medico?: string
  paciente_fecha_nac?: string
  paciente_direccion?: string
}

function fmtFechaLargaDoc(fecha?: string): string {
  if (!fecha) return '—'
  try {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return fecha
  }
}

function estilosActa(): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:letter portrait;margin:0}
    html,body{width:216mm;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5}
    .doc{position:relative;width:216mm;min-height:279mm;display:flex;flex-direction:column;
      padding:15mm 20mm 0;overflow:hidden}
    .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
    .wm span{font-family:'Brush Script MT','Segoe Script',cursive;font-size:50pt;color:${BRAND.navy};
      opacity:0.055;white-space:nowrap;transform:rotate(-8deg)}
    .doc-inner{position:relative;z-index:1;flex:1;display:flex;flex-direction:column}

    .a-hdr{text-align:center;border-bottom:2pt solid ${BRAND.navy};padding-bottom:3.5mm;margin-bottom:6mm}
    .a-hdr .logo-row{display:flex;align-items:center;justify-content:center;gap:5mm;margin-bottom:1.2mm}
    .a-hdr .logo-row img{width:17mm!important;max-width:17mm!important;height:auto!important;margin:0!important}
    .a-name{font-family:Georgia,'Times New Roman',serif;font-size:20pt;font-weight:700;color:${BRAND.navy};line-height:1.05}
    .a-name .j{font-family:'Brush Script MT','Segoe Script',cursive;font-weight:400}
    .a-24h{font-size:10.5pt;font-weight:700;color:${BRAND.navy};margin-top:0.4mm}
    .a-addr{font-size:8pt;color:#444;margin-top:0.4mm}
    .doc-no{position:absolute;top:0;right:0;font-size:8pt;color:#777;font-family:Consolas,monospace}

    .a-title{text-align:center;font-size:15pt;font-weight:800;letter-spacing:0.1em;color:#111;margin-bottom:6mm}

    .a-sec{font-size:10.5pt;font-weight:800;letter-spacing:0.05em;color:${BRAND.navy};
      margin:5mm 0 2mm;text-transform:uppercase}
    .a-datos{font-size:10.5pt;line-height:1.7}
    .a-datos .row{display:flex;flex-wrap:wrap;gap:8mm}
    .a-datos b{color:#111}

    .a-body{margin-top:2mm}
    .a-body p{text-align:justify;margin-bottom:3.5mm}

    .a-tipo{margin-top:3mm;font-size:10.5pt}
    .a-tipo b{letter-spacing:0.04em;color:${BRAND.navy}}

    .a-causas{margin-top:1.5mm;padding-left:9mm}
    .a-causas li{margin-bottom:1mm;text-transform:uppercase;font-size:10pt}

    .a-sign{margin-top:14mm;text-align:center}
    .a-sign .line{width:72mm;border-top:1pt solid #333;margin:0 auto 1.5mm}
    .a-sign .dr{font-size:11.5pt;font-weight:700;color:#111}
    .a-sign .cargo{font-size:10.5pt;color:#333}
    .a-sign .sello{font-size:10pt;font-weight:700;letter-spacing:0.06em;color:#111;margin-top:0.5mm}

    @media print{.doc{min-height:279mm}}
  `
}

export function htmlActaDefuncion(data: ActaDefuncionData): string {
  const origin = data.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const tipoMuerte = (data.tipo_muerte ?? 'NATURAL').trim().toUpperCase()
  const cargo = (data.cargo_medico ?? 'Médico General').trim()
  const medico = data.medico_nombre?.trim()
    ? (/^dr/i.test(data.medico_nombre.trim()) ? data.medico_nombre.trim() : `DR. ${data.medico_nombre.trim()}`)
    : 'DR. _______________________'

  const causas = (data.causas ?? []).map(c => c.trim()).filter(Boolean)
  const causasHtml = causas.length
    ? `<div class="a-sec">Causa de fallecimiento:</div>
       <ol class="a-causas">${causas.map(c => `<li>${escapeHtmlDoc(c)}</li>`).join('')}</ol>`
    : ''

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Acta de Defunción ${escapeHtmlDoc(data.numero_doc)}</title>
    <style>${estilosActa()}</style></head><body>
    <div class="doc">
      <div class="wm"><span>Clínicas Médicas Jerusalén</span></div>
      <div class="doc-inner">
        <span class="doc-no">Acta No. ${escapeHtmlDoc(data.numero_doc)}</span>
        <header class="a-hdr">
          <div class="logo-row">
            ${logoTicketHtml(origin, 60)}
            <div>
              <div class="a-name">Clínica Médica <span class="j">Jerusalén</span></div>
              <div class="a-24h">Atención 365 días del año · 24 Horas</div>
            </div>
          </div>
          <div class="a-addr">Col. Alemán, Calle Principal, Antiguo Local Clínica Sinaí · Tel.: 2246-3051</div>
        </header>

        <div class="a-title">ACTA DE DEFUNCIÓN</div>

        <div class="a-sec">Datos generales</div>
        <div class="a-datos">
          <div class="row">
            <span><b>Nombre:</b> ${escapeHtmlDoc(data.paciente_nombre || '—')}</span>
            <span><b>Edad:</b> ${escapeHtmlDoc(data.paciente_edad ?? '—')}</span>
            <span><b>Fecha:</b> ${escapeHtmlDoc(data.fecha)}</span>
          </div>
          <div><b>Fecha de nacimiento:</b> ${escapeHtmlDoc(fmtFechaLargaDoc(data.paciente_fecha_nac))}</div>
          <div><b>Número de identidad:</b> ${escapeHtmlDoc(data.paciente_codigo ?? '—')}</div>
          <div><b>Dirección:</b> ${escapeHtmlDoc(data.paciente_direccion?.trim() || '—')}</div>
        </div>

        <main class="a-body">${cuerpoDocHtml(data.texto)}</main>

        <div class="a-tipo"><b>Tipo de muerte:</b> ${escapeHtmlDoc(tipoMuerte)}</div>

        ${causasHtml}

        <div class="a-sign">
          <div class="line"></div>
          <div class="dr">${escapeHtmlDoc(medico)}</div>
          <div class="cargo">${escapeHtmlDoc(cargo)}</div>
          <div class="sello">FIRMA Y SELLO</div>
        </div>
      </div>
    </div>
    </body></html>`
}

export function imprimirActaDefuncion(data: ActaDefuncionData) {
  abrirVentanaImpresion(htmlActaDefuncion(data), `Acta defunción ${data.numero_doc}`)
}

export function edadPacientePrint(fechaNac?: string): string {
  const e = calcularEdad(fechaNac)
  return e || '—'
}
