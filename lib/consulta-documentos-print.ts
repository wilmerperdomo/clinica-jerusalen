import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import { calcularEdad } from '@/lib/consultas-utils'

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

function logoHtml(baseUrl?: string): string {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `<div style="text-align:center;margin-bottom:12px">
    ${logoTicketHtml(origin, 'mobile')}
    <p style="font-size:12px;font-weight:bold;color:#003366;margin:6px 0 2px">${BRAND.nombre}</p>
    <p style="font-size:10px;color:#666;margin:0">RTN: ${FISCAL.rtn} · Tel: ${FISCAL.telefonos}</p>
  </div>`
}

function estilosBase(): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:24px 32px;line-height:1.55}
    .doc-no{text-align:right;font-size:11px;color:#555;font-family:monospace;margin-bottom:8px}
    h1{font-size:18px;text-align:center;color:${BRAND.navy};margin:12px 0 20px;letter-spacing:0.05em;text-transform:uppercase}
    .cuerpo{text-align:justify;margin:16px 0}
    .firma{margin-top:48px;text-align:center}
    .firma-linea{border-top:1px solid #333;width:280px;margin:0 auto;padding-top:6px;font-size:12px}
    @media print{@page{margin:15mm} body{padding:0}}
  `
}

function abrirVentanaImpresion(html: string, titulo: string) {
  const w = window.open('', '_blank', 'width=900,height=800')
  if (!w) {
    alert('Permita ventanas emergentes para imprimir.')
    return
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title></head><body>${html}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`)
  w.document.close()
}

export function imprimirRecetaMedica(data: DocumentoPrintBase & {
  items: RecetaPrintItem[]
  tratamiento?: string
  dias_reposo?: number
}) {
  const meds = data.items.length === 0
    ? '<p style="text-align:center;color:#888;font-style:italic;padding:20px">Sin medicamentos en esta receta</p>'
    : data.items.map(m => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <p style="font-weight:700;color:${BRAND.navy}">${m.no_producto}</p>
        <p style="font-size:12px;color:#555;margin-top:4px">
          ${m.cant ? `Cantidad: ${m.cant}` : ''}${m.via ? ` · Vía: ${m.via}` : ''}
          ${m.indicacion ? `<br>${m.indicacion}` : ''}
        </p>
      </div>`).join('')

  const html = `
    <style>${estilosBase()}</style>
    ${logoHtml(data.baseUrl)}
    <p class="doc-no">Receta No. ${data.numero_doc}</p>
    <h1>Receta Médica</h1>
    <table style="width:100%;font-size:13px;margin-bottom:16px">
      <tr><td><b>Paciente:</b> ${data.paciente_nombre}</td><td style="text-align:right"><b>Fecha:</b> ${data.fecha}</td></tr>
      <tr><td><b>Identidad:</b> ${data.paciente_codigo ?? '—'}</td><td style="text-align:right"><b>Edad:</b> ${data.paciente_edad ?? '—'}</td></tr>
    </table>
    <div style="overflow:auto">
      <span style="font-size:42px;font-weight:bold;color:${BRAND.navy};float:left;margin-right:12px;line-height:1">℞</span>
      ${meds}
    </div>
    ${data.tratamiento ? `<p style="margin-top:12px"><b>Tratamiento:</b> ${data.tratamiento}</p>` : ''}
    ${data.dias_reposo && data.dias_reposo > 0 ? `<p><b>Días de reposo:</b> ${data.dias_reposo}</p>` : ''}
    <div class="firma">
      <p class="firma-linea">${data.medico_nombre ?? 'Médico tratante'}<br>Firma y sello</p>
    </div>`
  abrirVentanaImpresion(html, `Receta ${data.numero_doc}`)
}

export function imprimirConstanciaMedica(data: DocumentoPrintBase & { texto: string }) {
  const html = `
    <style>${estilosBase()}</style>
    ${logoHtml(data.baseUrl)}
    <p class="doc-no">Constancia No. ${data.numero_doc}</p>
    <h1>Constancia Médica</h1>
    <div class="cuerpo">
      <p>Yo, <strong>${data.medico_nombre ?? 'el médico tratante'}</strong>${data.medico_registro ? `, con registro profesional ${data.medico_registro}` : ''},
      certifico que soy el médico tratante de <strong>${data.paciente_nombre}</strong>,
      con número de identidad <strong>${data.paciente_codigo ?? '—'}</strong>${data.paciente_edad ? `, de ${data.paciente_edad} de edad` : ''}.</p>
      <p style="margin-top:14px">${data.texto}</p>
      <p style="margin-top:14px">Y para los fines que estime convenientes se extiende la presente constancia médica en la ciudad de Tegucigalpa, M.D.C., a los ${data.fecha}.</p>
    </div>
    <div class="firma">
      <p class="firma-linea">${data.medico_nombre ?? 'Médico tratante'}<br>Firma y sello</p>
    </div>`
  abrirVentanaImpresion(html, `Constancia ${data.numero_doc}`)
}

export function imprimirActaDefuncion(data: DocumentoPrintBase & { texto: string }) {
  const html = `
    <style>${estilosBase()}</style>
    ${logoHtml(data.baseUrl)}
    <p class="doc-no">Acta No. ${data.numero_doc}</p>
    <h1>Constancia de Defunción</h1>
    <p style="margin-bottom:12px"><b>Nombre:</b> ${data.paciente_nombre}<br>
    <b>Identidad:</b> ${data.paciente_codigo ?? '—'}<br>
    <b>Edad:</b> ${data.paciente_edad ?? '—'}<br>
    <b>Fecha:</b> ${data.fecha}</p>
    <div class="cuerpo">
      <p>Mediante el presente documento médico constato lo siguiente:</p>
      <p style="margin-top:12px">${data.texto}</p>
    </div>
    <div class="firma">
      <p class="firma-linea">${data.medico_nombre ?? 'Médico tratante'}<br>Firma y sello</p>
    </div>`
  abrirVentanaImpresion(html, `Acta defunción ${data.numero_doc}`)
}

export function edadPacientePrint(fechaNac?: string): string {
  const e = calcularEdad(fechaNac)
  return e || '—'
}
