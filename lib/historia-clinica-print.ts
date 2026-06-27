import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import { resumenSignosVitales } from '@/lib/signos-vitales-utils'
import { etiquetaEnfoque, type EnfoqueClinico } from '@/lib/consulta-especialidad-utils'

export interface HistoriaPrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
  genero?: string
  celular?: string
  telefono?: string
  tipo_sangre?: string
  alergias?: string
}

export interface HistoriaPrintAntecedentes {
  personal?: string | null
  alergias?: string | null
  familiares?: string | null
  hospitalario?: string | null
}

export interface HistoriaPrintDiagnostico {
  cie10_codigo?: string | null
  descripcion: string
  principal?: boolean
}

export interface HistoriaPrintConsulta {
  id: number
  fecha: string
  hora?: string
  doctor?: string
  tipo_nombre?: string
  enfoque_clinico?: EnfoqueClinico | string
  presion?: string
  temperatura?: string
  peso?: string
  talla?: string
  frecuencia?: string
  pulso?: string
  perim_cefalico?: string
  saturacion_oxigeno?: string
  dolor_eva?: number | string
  glucosa_capilar?: string | number
  sintoma?: string
  historia?: string
  impresion?: string
  tratamiento?: string
  estudios_complementarios?: string
  diagnosticos?: HistoriaPrintDiagnostico[]
}

export interface HistoriaPrintProblema {
  descripcion: string
  cie10_codigo?: string | null
  estado?: string
}

function nombreCompleto(p: HistoriaPrintPaciente): string {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function bloque(titulo: string, texto?: string | null): string {
  if (!texto?.trim()) return ''
  return `<div class="bloque"><p class="lbl">${titulo}</p><p class="txt">${texto}</p></div>`
}

function filaConsulta(c: HistoriaPrintConsulta): string {
  const vitales = resumenSignosVitales(c as unknown as Record<string, unknown>)
  const dx = (c.diagnosticos ?? [])
    .map(d => `${d.principal ? '★ ' : ''}${d.cie10_codigo ? `[${d.cie10_codigo}] ` : ''}${d.descripcion}`)
    .join('; ')
  const enfoque = c.enfoque_clinico ? etiquetaEnfoque(c.enfoque_clinico as EnfoqueClinico) : ''

  return `
    <div class="consulta">
      <div class="consulta-hdr">
        <span><b>${fmtFecha(c.fecha)}</b>${c.hora ? ` ${c.hora.slice(0, 5)}` : ''}</span>
        <span>${c.tipo_nombre ?? 'Consulta'}${enfoque ? ` · ${enfoque}` : ''}</span>
        <span>${c.doctor ?? '—'}</span>
      </div>
      ${vitales !== '—' ? `<p class="vitales"><b>Signos:</b> ${vitales}</p>` : ''}
      ${bloque('Motivo / síntoma', c.sintoma)}
      ${bloque('Historia', c.historia)}
      ${bloque('Impresión diagnóstica', c.impresion)}
      ${dx ? `<p class="dx"><b>CIE-10:</b> ${dx}</p>` : ''}
      ${bloque('Plan / tratamiento', c.tratamiento)}
      ${bloque('Estudios', c.estudios_complementarios)}
    </div>`
}

export function imprimirHistoriaClinica(
  paciente: HistoriaPrintPaciente,
  antecedentes: HistoriaPrintAntecedentes | null,
  consultas: HistoriaPrintConsulta[],
  opciones?: {
    fechaDesde?: string
    fechaHasta?: string
    problemasActivos?: HistoriaPrintProblema[]
  },
) {
  const desde = opciones?.fechaDesde
  const hasta = opciones?.fechaHasta
  const filtradas = [...consultas]
    .filter(c => (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora ?? '').localeCompare(a.hora ?? ''))

  const rango = desde || hasta
    ? `${desde ? fmtFecha(desde) : 'inicio'} — ${hasta ? fmtFecha(hasta) : 'hoy'}`
    : 'Historial completo'

  const problemas = (opciones?.problemasActivos ?? [])
    .filter(p => p.estado !== 'resuelto')
    .map(p => `<li>${p.cie10_codigo ? `[${p.cie10_codigo}] ` : ''}${p.descripcion}</li>`)
    .join('')

  const cuerpo = filtradas.length > 0
    ? filtradas.map(filaConsulta).join('')
    : '<p class="vacio">No hay consultas en el rango seleccionado.</p>'

  const html = `
    <style>
      .meta-pac{font-size:11px;margin-bottom:12px;line-height:1.6}
      .alerta{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px}
      .problemas{margin-bottom:12px;font-size:11px}
      .problemas ul{margin:4px 0 0 16px;padding:0}
      .consulta{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
      .consulta-hdr{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px;color:#475569;margin-bottom:6px}
      .vitales,.dx{font-size:10px;color:#334155;margin:4px 0}
      .bloque{margin:4px 0}
      .lbl{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0}
      .txt{font-size:11px;margin:2px 0 0;white-space:pre-wrap}
      .vacio{text-align:center;color:#94a3b8;padding:24px;font-size:12px}
      .pie-rango{font-size:10px;color:#64748b;margin-bottom:14px}
    </style>
    <div class="meta-pac">
      <b>${nombreCompleto(paciente)}</b> · Código ${paciente.codigo} · ${edadPacientePrint(paciente.fecha_nac)}
      ${paciente.genero ? ` · ${paciente.genero}` : ''}
      ${paciente.tipo_sangre ? ` · TS ${paciente.tipo_sangre}` : ''}
    </div>
    <p class="pie-rango"><b>Período:</b> ${rango} · <b>${filtradas.length}</b> consulta(s)</p>
    ${(antecedentes?.alergias || paciente.alergias) ? `
      <div class="alerta"><b>⚠ Alergias:</b> ${antecedentes?.alergias || paciente.alergias}</div>` : ''}
    ${problemas ? `<div class="problemas"><b>Problemas activos</b><ul>${problemas}</ul></div>` : ''}
    ${bloque('Antecedentes personales', antecedentes?.personal)}
    ${bloque('Antecedentes familiares', antecedentes?.familiares)}
    <h2 style="font-size:12px;margin:14px 0 8px;color:#003366">Consultas</h2>
    ${cuerpo}`

  imprimirReporte({
    titulo: 'Historia clínica',
    subtitulo: `${nombreCompleto(paciente)} · ${rango}`,
    contenidoHtml: html,
    orientacion: 'portrait',
  })
}
