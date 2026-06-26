import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import {
  curvaPesoOMS, puntosDesdeConsultas, generoOMS, percentilPesoAprox,
  type PuntoCrecimiento,
} from '@/lib/crecimiento-oms'

export interface CrecimientoPrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
  genero?: string | null
}

function nombreCompleto(p: CrecimientoPrintPaciente) {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function svgCurvaPeso(puntos: PuntoCrecimiento[], genero: 'M' | 'F'): string {
  const curva = curvaPesoOMS(genero)
  const w = 520
  const h = 220
  const pad = { l: 40, r: 12, t: 12, b: 28 }
  const maxMes = 24
  const maxPeso = Math.max(15, ...curva.map(c => c.p97), ...puntos.map(p => p.peso)) + 1

  const x = (mes: number) => pad.l + (mes / maxMes) * (w - pad.l - pad.r)
  const y = (kg: number) => pad.t + (1 - kg / maxPeso) * (h - pad.t - pad.b)

  const linea = (fn: (c: typeof curva[0]) => number, color: string) =>
    curva.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.mes).toFixed(1)},${y(fn(c)).toFixed(1)}`).join(' ')

  const ptsPaciente = puntos.map((p, i) =>
    `<circle cx="${x(p.edadMeses).toFixed(1)}" cy="${y(p.peso).toFixed(1)}" r="4" fill="#003366"/>`
    + (i === puntos.length - 1 ? `<text x="${x(p.edadMeses) + 6}" y="${y(p.peso) - 4}" font-size="8" fill="#003366">${p.peso}kg</text>` : ''),
  ).join('')

  return `<svg width="${w}" height="${h}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#fff">
    <text x="${pad.l}" y="10" font-size="9" fill="#64748b">Peso (kg) vs edad (meses) — OMS</text>
    <path d="${linea(c => c.p97, '#cbd5e1')}" fill="none" stroke="#cbd5e1" stroke-width="1"/>
    <path d="${linea(c => c.p50, '#94a3b8')}" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
    <path d="${linea(c => c.p3, '#cbd5e1')}" fill="none" stroke="#cbd5e1" stroke-width="1"/>
    ${ptsPaciente}
    <text x="${w / 2}" y="${h - 4}" font-size="9" fill="#64748b" text-anchor="middle">Edad (meses)</text>
  </svg>`
}

export function imprimirCurvaCrecimiento(
  paciente: CrecimientoPrintPaciente,
  consultas: { id: number; fecha: string; peso?: string | null; talla?: string | null; perim_cefalico?: string | null }[],
) {
  if (!paciente.fecha_nac) {
    alert('El paciente no tiene fecha de nacimiento registrada.')
    return
  }
  const genero = generoOMS(paciente.genero)
  const puntos = puntosDesdeConsultas(consultas, paciente.fecha_nac)
  const tabla = puntos.map(p => {
    const pct = percentilPesoAprox(p.peso, p.edadMeses, genero)
    return `<tr>
      <td>${p.fecha}</td>
      <td class="right">${p.edadMeses}</td>
      <td class="right">${p.peso}</td>
      <td class="right">${p.talla ?? '—'}</td>
      <td class="right">${p.perimCefalico ?? '—'}</td>
      <td class="right">${pct != null ? `P${pct}` : '—'}</td>
    </tr>`
  }).join('')

  imprimirReporte({
    titulo: 'Curva de crecimiento',
    subtitulo: `${nombreCompleto(paciente)} · ${edadPacientePrint(paciente.fecha_nac)}`,
    contenidoHtml: `
      ${svgCurvaPeso(puntos, genero)}
      <h2 style="margin-top:14px">Mediciones registradas</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Edad (m)</th><th>Peso (kg)</th><th>Talla</th><th>PC (cm)</th><th>Percentil</th></tr></thead>
        <tbody>${tabla || '<tr><td colspan="6">Sin mediciones con peso</td></tr>'}</tbody>
      </table>`,
  })
}
