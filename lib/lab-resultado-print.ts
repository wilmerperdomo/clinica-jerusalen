import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

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
  baseUrl?: string
}

export function imprimirResultadoLaboratorio(data: ResultadoLabPrint) {
  const origin = data.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const w = window.open('', '_blank', 'width=800,height=700')
  if (!w) {
    alert('Permita ventanas emergentes para imprimir.')
    return
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resultado ${data.prueba_nombre}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#1a1a1a;line-height:1.5}
    h1{font-size:17px;text-align:center;color:#003366;margin:12px 0}
    .logo{text-align:center;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    td{padding:6px 0;border-bottom:1px solid #eee}
    .valor{font-size:22px;font-weight:bold;color:#003366;margin:12px 0}
    .anormal{color:#b91c1c;font-weight:bold}
    .firma{margin-top:40px;text-align:center;border-top:1px solid #333;width:260px;margin-left:auto;margin-right:auto;padding-top:6px;font-size:11px}
    @media print{@page{margin:12mm}}
  </style></head><body>
  <div class="logo">${logoTicketHtml(origin, 'mobile')}</div>
  <p style="text-align:center;font-size:12px;font-weight:bold;color:#003366">${BRAND.nombre}</p>
  <p style="text-align:center;font-size:11px;color:#555">Tel: ${FISCAL.telefonos}</p>
  <h1>RESULTADO DE LABORATORIO</h1>
  <table>
    <tr><td><b>Paciente</b></td><td>${data.paciente_nombre}</td></tr>
    <tr><td><b>Identidad</b></td><td>${data.paciente_codigo ?? '—'}</td></tr>
    <tr><td><b>Prueba</b></td><td>${data.prueba_nombre}</td></tr>
    <tr><td><b>Fecha</b></td><td>${data.fecha}</td></tr>
  </table>
  <p class="valor ${data.anormal ? 'anormal' : ''}">${data.valor_resultado ?? '—'}${data.unidad ? ` ${data.unidad}` : ''}</p>
  ${data.rango_texto ? `<p><b>Rango de referencia:</b> ${data.rango_texto}</p>` : ''}
  ${data.observacion ? `<p><b>Observación:</b> ${data.observacion}</p>` : ''}
  <div class="firma">Responsable de laboratorio<br>Firma y sello</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
  </body></html>`
  w.document.write(html)
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
