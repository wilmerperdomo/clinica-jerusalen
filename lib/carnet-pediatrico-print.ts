import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import { etiquetaVacuna, type VacunaCatalogo, type PacienteVacuna } from '@/lib/vacunas-utils'
import { puntosDesdeConsultas, generoOMS, percentilPesoAprox } from '@/lib/crecimiento-oms'

export interface CarnetPedPrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
  genero?: string
}

interface ConsultaCrecimiento {
  id: number
  fecha: string
  peso?: string
  talla?: string
  perim_cefalico?: string
}

interface ControlNinoSano {
  fecha: string
  control_nino_sano?: string | null
  hitos_desarrollo?: string | null
  tipo_alimentacion?: string | null
}

function nombreCompleto(p: CarnetPedPrintPaciente): string {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function imprimirCarnetPediatrico(
  paciente: CarnetPedPrintPaciente,
  catalogo: VacunaCatalogo[],
  vacunas: PacienteVacuna[],
  consultas: ConsultaCrecimiento[],
  controles?: ControlNinoSano[],
) {
  const mapVac = new Map(vacunas.map(v => [v.vacuna_id, v]))
  const filasVac = [...catalogo]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(v => {
      const app = mapVac.get(v.id)
      return `<tr>
        <td>${etiquetaVacuna(v)}</td>
        <td>${v.edad_min_meses != null ? `${v.edad_min_meses} m` : '—'}</td>
        <td>${app ? fmtFecha(app.fecha_aplicada) : '<span style="color:#dc2626">Pendiente</span>'}</td>
        <td>${app?.lote ?? '—'}</td>
      </tr>`
    }).join('')

  const g = generoOMS(paciente.genero)
  const puntos = paciente.fecha_nac ? puntosDesdeConsultas(consultas, paciente.fecha_nac) : []
  const filasCrec = puntos.map(p => {
    const pct = percentilPesoAprox(p.peso, p.edadMeses, g)
    return `<tr>
      <td>${fmtFecha(p.fecha)}</td>
      <td class="right">${p.edadMeses}</td>
      <td class="right">${p.peso ?? '—'}</td>
      <td class="right">${p.talla ?? '—'}</td>
      <td class="right">${p.perimCefalico ?? '—'}</td>
      <td class="right">${pct != null ? `P${pct}` : '—'}</td>
    </tr>`
  }).join('')

  const filasCtrl = (controles ?? []).map(c => `
    <tr>
      <td>${fmtFecha(c.fecha)}</td>
      <td>${c.control_nino_sano ?? '—'}</td>
      <td style="font-size:9px">${c.hitos_desarrollo ?? '—'}</td>
      <td>${c.tipo_alimentacion ?? '—'}</td>
    </tr>`).join('')

  const html = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Paciente</div><div class="kpi-val" style="font-size:11px">${nombreCompleto(paciente)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Código</div><div class="kpi-val">${paciente.codigo}</div></div>
      <div class="kpi"><div class="kpi-lbl">Edad</div><div class="kpi-val" style="font-size:11px">${edadPacientePrint(paciente.fecha_nac)}</div></div>
    </div>

    <h2>Carnet de vacunación</h2>
    <table>
      <thead><tr><th>Vacuna</th><th>Edad ref.</th><th>Fecha</th><th>Lote</th></tr></thead>
      <tbody>${filasVac || '<tr><td colspan="4">Sin catálogo</td></tr>'}</tbody>
    </table>

    <h2>Curva de crecimiento</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Edad (m)</th><th>Peso (kg)</th><th>Talla (cm)</th><th>PC (cm)</th><th>Percentil</th></tr></thead>
      <tbody>${filasCrec || '<tr><td colspan="6">Sin mediciones</td></tr>'}</tbody>
    </table>

    ${filasCtrl ? `
    <h2>Controles del niño sano</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Control</th><th>Hitos desarrollo</th><th>Alimentación</th></tr></thead>
      <tbody>${filasCtrl}</tbody>
    </table>` : ''}

    <p style="font-size:9px;color:#64748b;margin-top:12px">
      Documento pediátrico integrado — vacunación, crecimiento y controles. Validar con esquema nacional vigente.
    </p>`

  imprimirReporte({
    titulo: 'Carnet pediátrico',
    subtitulo: nombreCompleto(paciente),
    contenidoHtml: html,
    orientacion: 'portrait',
  })
}
