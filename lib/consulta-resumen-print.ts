import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import type { FormConsultaGeneral } from '@/lib/consulta-general-utils'
import { REVISION_SISTEMAS } from '@/lib/consulta-general-utils'

export interface ResumenConsultaPrint {
  id: number
  fecha: string
  paciente: { nombre: string; apellido1: string; apellido2?: string; codigo?: string; fecha_nac?: string }
  doctor?: string
  sintoma?: string
  historia?: string
  impresion?: string
  tratamiento?: string
  estudios?: string
  diasReposo?: number
  alergias?: string | null
  peso?: string
  talla?: string
  presion?: string
  general?: FormConsultaGeneral | null
  diagnosticos?: { cie10_codigo: string | null; descripcion: string; principal: boolean }[]
}

function nombreCompleto(p: ResumenConsultaPrint['paciente']) {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function bloque(titulo: string, texto?: string | null): string {
  if (!texto?.trim()) return ''
  return `<div style="margin-bottom:10px"><p style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px">${titulo}</p><p style="font-size:12px;margin:0;white-space:pre-wrap">${texto}</p></div>`
}

export function imprimirResumenConsultaPaciente(data: ResumenConsultaPrint) {
  const g = data.general
  const revisiones = g
    ? REVISION_SISTEMAS.map(s => g[s.key]?.trim() ? `<li><b>${s.label}:</b> ${g[s.key]}</li>` : '').filter(Boolean).join('')
    : ''

  const html = `
    ${data.alergias?.trim() ? `<div style="background:#fef3c7;border:1px solid #f59e0b;padding:8px;border-radius:6px;margin-bottom:12px"><b>⚠ Alergias:</b> ${data.alergias}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:11px">
      ${data.peso ? `<span>Peso: <b>${data.peso} kg</b></span>` : ''}
      ${data.talla ? `<span>Talla: <b>${data.talla}</b></span>` : ''}
      ${data.presion ? `<span>PA: <b>${data.presion}</b></span>` : ''}
      ${g?.imc ? `<span>IMC: <b>${g.imc}</b></span>` : ''}
      ${g?.escala_dolor ? `<span>Dolor: <b>${g.escala_dolor}/10</b></span>` : ''}
    </div>
    ${bloque('Motivo de consulta', data.sintoma)}
    ${bloque('Historia', data.historia)}
    ${data.diagnosticos?.length
      ? `<div style="margin-bottom:10px"><p style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px">Diagnósticos (CIE-10)</p><ul style="font-size:11px;margin:4px 0;padding-left:18px">${data.diagnosticos.map(d =>
        `<li>${d.principal ? '<b>Principal:</b> ' : ''}${d.cie10_codigo ? `<span style="font-family:monospace">${d.cie10_codigo}</span> — ` : ''}${d.descripcion}</li>`,
      ).join('')}</ul></div>`
      : ''}
    ${!data.diagnosticos?.length && g?.diagnostico_principal ? bloque('Diagnóstico principal', g.diagnostico_principal) : ''}
    ${bloque('Impresión diagnóstica', data.impresion)}
    ${g?.diagnosticos_secundarios ? bloque('Diagnósticos secundarios', g.diagnosticos_secundarios) : ''}
    ${revisiones ? `<div style="margin-bottom:10px"><p style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase">Revisión por sistemas</p><ul style="font-size:11px;margin:4px 0;padding-left:18px">${revisiones}</ul></div>` : ''}
    ${bloque('Tratamiento', data.tratamiento)}
    ${g?.plan_medicamentos ? bloque('Medicamentos', g.plan_medicamentos) : ''}
    ${bloque('Estudios', g?.plan_estudios || data.estudios)}
    ${g?.plan_recomendaciones ? bloque('Recomendaciones', g.plan_recomendaciones) : ''}
    ${g?.plan_signos_alarma ? bloque('Signos de alarma — acudir de urgencia si', g.plan_signos_alarma) : ''}
    ${g?.plan_seguimiento ? bloque('Seguimiento', g.plan_seguimiento) : ''}
    ${data.diasReposo ? `<p style="font-size:12px"><b>Días de reposo:</b> ${data.diasReposo}</p>` : ''}
    <p style="font-size:9px;color:#94a3b8;margin-top:16px">Este documento es orientativo. No sustituye la receta médica formal.</p>`

  imprimirReporte({
    titulo: 'Resumen de consulta médica',
    subtitulo: `${nombreCompleto(data.paciente)} · ${edadPacientePrint(data.paciente.fecha_nac)} · Consulta #${data.id}`,
    contenidoHtml: html,
  })
}
