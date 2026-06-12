import { BRAND } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'

export interface ExpedientePrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
  genero?: string
  celular?: string
  telefono?: string
  correo?: string
  direccion?: string
  colonia_nombre?: string
  tipo_sangre?: string
  alergias?: string
}

export interface ExpedientePrintAntecedentes {
  personal?: string | null
  alergias?: string | null
  familiares?: string | null
  hospitalario?: string | null
}

export interface ExpedientePrintConsulta {
  id: number
  fecha: string
  hora?: string
  doctor?: string
  tipo_nombre?: string
  presion?: string
  temperatura?: string
  peso?: string
  sintoma?: string
  impresion?: string
  tratamiento?: string
}

function nombreCompleto(p: ExpedientePrintPaciente): string {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function bloqueAntecedente(titulo: string, texto?: string | null): string {
  if (!texto?.trim()) return ''
  return `
    <div style="margin-bottom:10px">
      <p style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px">${titulo}</p>
      <p style="font-size:12px;color:#1e293b;margin:0;white-space:pre-wrap">${texto}</p>
    </div>`
}

export function imprimirExpedienteClinico(
  paciente: ExpedientePrintPaciente,
  antecedentes: ExpedientePrintAntecedentes | null,
  consultas: ExpedientePrintConsulta[],
  baseUrl?: string,
) {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const nombre = nombreCompleto(paciente)
  const hoy = new Date().toLocaleDateString('es-HN', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const ultimas = consultas.slice(0, 15).map(c => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px">${fmtFecha(c.fecha)}${c.hora ? ` ${c.hora.slice(0, 5)}` : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px">${c.tipo_nombre ?? 'Consulta'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px">${c.doctor ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px">${c.impresion ?? c.sintoma ?? '—'}</td>
    </tr>`).join('')

  const html = `
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#0f172a;padding:20px 28px;line-height:1.5}
      h1{font-size:16px;text-align:center;color:${BRAND.navy};letter-spacing:0.06em;text-transform:uppercase;margin:10px 0 4px}
      h2{font-size:13px;color:${BRAND.navy};border-bottom:2px solid ${BRAND.gold};padding-bottom:4px;margin:18px 0 10px}
      .meta{font-size:11px;color:#64748b;text-align:center;margin-bottom:14px}
      .alerta{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:14px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{font-size:10px;text-transform:uppercase;color:#64748b;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1}
      .pie{margin-top:28px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px}
      @media print{@page{margin:12mm} body{padding:0}}
    </style>
    <div style="text-align:center;margin-bottom:8px">${logoTicketHtml(origin, 'mobile')}</div>
    <h1>Expediente Clínico</h1>
    <p class="meta">${BRAND.nombre} · Generado el ${hoy}</p>

    <h2>Datos del paciente</h2>
    <div class="grid">
      <div><b>Nombre:</b> ${nombre}</div>
      <div><b>Identidad:</b> ${paciente.codigo}</div>
      <div><b>Edad:</b> ${edadPacientePrint(paciente.fecha_nac)}</div>
      <div><b>Género:</b> ${paciente.genero ?? '—'}</div>
      <div><b>Teléfono:</b> ${paciente.celular || paciente.telefono || '—'}</div>
      <div><b>Tipo sangre:</b> ${paciente.tipo_sangre ?? '—'}</div>
      <div style="grid-column:1/-1"><b>Dirección:</b> ${[paciente.direccion, paciente.colonia_nombre].filter(Boolean).join(', ') || '—'}</div>
    </div>

    ${(antecedentes?.alergias || paciente.alergias) ? `
      <div class="alerta">
        <b style="color:#b45309">⚠ Alergias:</b>
        ${antecedentes?.alergias || paciente.alergias}
      </div>` : ''}

    <h2>Antecedentes clínicos</h2>
    ${bloqueAntecedente('Personales', antecedentes?.personal)}
    ${bloqueAntecedente('Familiares', antecedentes?.familiares)}
    ${bloqueAntecedente('Hospitalarios / quirúrgicos', antecedentes?.hospitalario)}
    ${!antecedentes?.personal && !antecedentes?.familiares && !antecedentes?.hospitalario
      ? '<p style="font-size:12px;color:#94a3b8;font-style:italic">Sin antecedentes registrados.</p>' : ''}

    <h2>Historial de consultas (${consultas.length})</h2>
    ${consultas.length === 0
      ? '<p style="font-size:12px;color:#94a3b8;font-style:italic">Sin consultas registradas.</p>'
      : `<table>
          <thead><tr>
            <th>Fecha</th><th>Tipo</th><th>Médico</th><th>Diagnóstico / motivo</th>
          </tr></thead>
          <tbody>${ultimas}</tbody>
        </table>
        ${consultas.length > 15 ? `<p style="font-size:10px;color:#94a3b8;margin-top:6px">Mostrando las 15 consultas más recientes de ${consultas.length}.</p>` : ''}`}

    <p class="pie">Documento de uso interno clínico · ${BRAND.nombre} · Confidencial</p>`

  const w = window.open('', '_blank', 'width=900,height=800')
  if (!w) {
    alert('Permita ventanas emergentes para imprimir el expediente.')
    return
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Expediente — ${nombre}</title></head><body>${html}
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`)
  w.document.close()
}
