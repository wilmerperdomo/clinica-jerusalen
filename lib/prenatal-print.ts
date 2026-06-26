import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'

export interface PrenatalPrintPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
}

export interface PrenatalPrintControl {
  fecha: string
  num_control?: number | null
  semanas_gestacion?: number | null
  peso_materno?: number | null
  presion_arterial?: string | null
  fcf?: number | null
  altura_uterina?: number | null
  proteinuria?: string | null
  edema?: string | null
  usg_resumen?: string | null
  labs_notas?: string | null
  notas?: string | null
}

function nombreCompleto(p: PrenatalPrintPaciente) {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function imprimirHojaControlPrenatal(
  paciente: PrenatalPrintPaciente,
  fum?: string | null,
  fpp?: string | null,
  controles: PrenatalPrintControl[] = [],
) {
  const filas = controles.map(c => `
    <tr>
      <td>${fmtFecha(c.fecha)}</td>
      <td class="right">${c.num_control ?? '—'}</td>
      <td class="right">${c.semanas_gestacion ?? '—'}</td>
      <td class="right">${c.peso_materno ?? '—'}</td>
      <td>${c.presion_arterial ?? '—'}</td>
      <td class="right">${c.fcf ?? '—'}</td>
      <td class="right">${c.altura_uterina ?? '—'}</td>
      <td>${c.proteinuria ?? '—'}</td>
      <td style="font-size:9px">${c.usg_resumen ?? '—'}</td>
    </tr>`).join('')

  const html = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><div class="kpi-lbl">Paciente</div><div class="kpi-val" style="font-size:11px">${nombreCompleto(paciente)}</div></div>
      <div class="kpi"><div class="kpi-lbl">FUM</div><div class="kpi-val" style="font-size:11px">${fmtFecha(fum ?? undefined)}</div></div>
      <div class="kpi"><div class="kpi-lbl">FPP</div><div class="kpi-val" style="font-size:11px">${fmtFecha(fpp ?? undefined)}</div></div>
    </div>
    <h2>Controles prenatales</h2>
    <table>
      <thead><tr>
        <th>Fecha</th><th>#</th><th>Sem.</th><th>Peso</th><th>PA</th><th>FCF</th><th>AU</th><th>Proteinuria</th><th>USG</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="9">Sin controles registrados</td></tr>'}</tbody>
    </table>
    <p style="font-size:9px;color:#64748b;margin-top:8px">Código: ${paciente.codigo} · Edad: ${edadPacientePrint(paciente.fecha_nac)}</p>`

  imprimirReporte({
    titulo: 'Hoja de control prenatal',
    subtitulo: nombreCompleto(paciente),
    contenidoHtml: html,
    orientacion: 'landscape',
  })
}
