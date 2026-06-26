import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import { etiquetaVacuna, type VacunaCatalogo, type PacienteVacuna } from '@/lib/vacunas-utils'

export interface VacunasPrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
}

function nombreCompleto(p: VacunasPrintPaciente) {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function imprimirCarnetVacunas(
  paciente: VacunasPrintPaciente,
  catalogo: VacunaCatalogo[],
  aplicadas: PacienteVacuna[],
) {
  const mapAplicadas = new Map(aplicadas.map(v => [v.vacuna_id, v]))
  const filas = [...catalogo]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(v => {
      const app = mapAplicadas.get(v.id)
      return `<tr>
        <td>${etiquetaVacuna(v)}</td>
        <td>${v.edad_min_meses != null ? `${v.edad_min_meses} m` : '—'}</td>
        <td>${app ? fmtFecha(app.fecha_aplicada) : '<span class="danger">Pendiente</span>'}</td>
        <td>${app?.lote ?? '—'}</td>
        <td>${app?.notas ?? '—'}</td>
      </tr>`
    }).join('')

  imprimirReporte({
    titulo: 'Carnet de vacunación',
    subtitulo: `${nombreCompleto(paciente)} · ${edadPacientePrint(paciente.fecha_nac)}`,
    contenidoHtml: `
      <p style="margin-bottom:10px;font-size:10px">Código paciente: <b>${paciente.codigo}</b></p>
      <table>
        <thead><tr><th>Vacuna</th><th>Edad ref.</th><th>Fecha aplicada</th><th>Lote</th><th>Notas</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`,
  })
}
