import {
  labEncabezadoInformeHtml,
  labPieInformeHtml,
  labPlantillaInformeStyles,
  type LabEncabezadoInforme,
} from '@/lib/lab-plantilla-assets'

export interface ResultadoLabPrint {
  paciente_nombre: string
  paciente_codigo?: string
  prueba_nombre: string
  fecha: string
  valor_resultado?: string
  unidad?: string
  rango_texto?: string
  observacion?: string
  anormal?: boolean
  validadoPor?: string
  encabezado?: LabEncabezadoInforme
  baseUrl?: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function resultadoStyles(): string {
  return `
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1f2937;font-size:12px;line-height:1.45;background:#fff}
    .page{max-width:780px;margin:0 auto;padding:22px 30px}
    .hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #003366;padding-bottom:12px;margin-bottom:14px}
    .hdr .brand{display:flex;align-items:center;gap:12px}
    .hdr .brand .logo img{height:54px;width:auto}
    .hdr .brand .name{font-size:17px;font-weight:800;color:#003366}
    .hdr .brand .tag{font-size:10px;color:#64748b}
    .hdr .meta{text-align:right;font-size:10px;color:#475569}
    .title{text-align:center;font-size:14px;font-weight:800;color:#003366;letter-spacing:1px;margin:0 0 14px;text-transform:uppercase}
    table.info{width:100%;border-collapse:collapse;margin:12px 0}
    table.info td{padding:7px 8px;border-bottom:1px solid #eef2f7;font-size:11px}
    table.info td:first-child{color:#475569;width:38%;font-weight:600}
    .valor{font-size:22px;font-weight:800;color:#003366;margin:16px 0;text-align:center}
    .anormal{color:#b91c1c}
    .rango,.obs{font-size:11px;color:#475569;margin:8px 0}
    .firma-block{margin-top:28px}
    ${labPlantillaInformeStyles()}
    @media print{@page{size:A4;margin:12mm}.page{padding:0}}
  `
}

export function htmlResultadoLaboratorio(data: ResultadoLabPrint, origin = ''): string {
  const encabezado = data.encabezado ?? 'clinica'
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Resultado — ${escapeHtml(data.prueba_nombre)}</title>
    <style>${resultadoStyles()}</style></head><body>
    <div class="page">
      ${labEncabezadoInformeHtml(encabezado, origin)}
      <div class="title">Resultado de Laboratorio</div>
      <table class="info">
        <tr><td>Paciente</td><td>${escapeHtml(data.paciente_nombre)}</td></tr>
        <tr><td>Identidad</td><td>${escapeHtml(data.paciente_codigo ?? '—')}</td></tr>
        <tr><td>Prueba</td><td>${escapeHtml(data.prueba_nombre)}</td></tr>
        <tr><td>Fecha</td><td>${escapeHtml(data.fecha)}</td></tr>
      </table>
      <p class="valor ${data.anormal ? 'anormal' : ''}">${escapeHtml(data.valor_resultado ?? '—')}${data.unidad ? ` ${escapeHtml(data.unidad)}` : ''}</p>
      ${data.rango_texto ? `<p class="rango"><b>Rango de referencia:</b> ${escapeHtml(data.rango_texto)}</p>` : ''}
      ${data.observacion ? `<p class="obs"><b>Observación:</b> ${escapeHtml(data.observacion)}</p>` : ''}
      ${labPieInformeHtml(origin, data.validadoPor)}
    </div>
    </body></html>`
}

export function imprimirResultadoLaboratorio(data: ResultadoLabPrint) {
  const origin = data.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const w = window.open('', '_blank', 'width=800,height=700')
  if (!w) {
    alert('Permita ventanas emergentes para imprimir.')
    return
  }
  const html = htmlResultadoLaboratorio(data, origin)
  w.document.write(html.replace('</body>', '<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body>'))
  w.document.close()
}

export function linkWhatsAppResultado(
  telefono: string,
  pacienteNombre: string,
  pruebaNombre: string,
  valor?: string,
): string {
  const tel = telefono.replace(/\D/g, '')
  const num = tel.startsWith('504') ? tel : `504${tel}`
  const texto = encodeURIComponent(
    `Hola ${pacienteNombre}, desde Clínica Médica Jerusalén le informamos que su resultado de *${pruebaNombre}*${valor ? ` es: *${valor}*` : ' ya está disponible'}. Puede recogerlo en recepción o solicitar una copia impresa.`,
  )
  return `https://wa.me/${num}?text=${texto}`
}
