import { imprimirReporte } from '@/lib/reporte-utils'
import { edadPacientePrint } from '@/lib/consulta-documentos-print'
import type { PrenatalPrintControl } from '@/lib/prenatal-print'

export interface CarnetMaternoPaciente {
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fecha_nac?: string
}

export interface CarnetMaternoEmbarazo {
  fum?: string | null
  fpp?: string | null
  gestas?: number | null
  partos?: number | null
  cesareas?: number | null
  abortos?: number | null
  grupo_sanguineo?: string | null
  rh?: string | null
}

export interface CarnetMaternoGineco {
  menarquia?: string | null
  ciclo_menstrual?: string | null
  fup?: string | null
  metodo_planificacion?: string | null
  plan_parto?: string | null
  riesgo_obstetrico?: string | null
}

function nombreCompleto(p: CarnetMaternoPaciente): string {
  return `${p.nombre} ${p.apellido1} ${p.apellido2 ?? ''}`.trim()
}

function fmtFecha(d?: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fila(c: PrenatalPrintControl): string {
  return `<tr>
    <td>${fmtFecha(c.fecha)}</td>
    <td class="right">${c.num_control ?? '—'}</td>
    <td class="right">${c.semanas_gestacion ?? '—'}</td>
    <td class="right">${c.peso_materno ?? '—'}</td>
    <td>${c.presion_arterial ?? '—'}</td>
    <td class="right">${c.fcf ?? '—'}</td>
    <td class="right">${c.altura_uterina ?? '—'}</td>
    <td>${c.proteinuria ?? '—'}</td>
    <td>${c.edema ?? '—'}</td>
    <td style="font-size:9px">${c.usg_resumen ?? '—'}</td>
  </tr>`
}

const CHECKLIST_TRIMESTRES = [
  { trim: '1er trimestre', items: ['Ácido fólico', 'Labs iniciales (BH, GS/Rh, VDRL, VIH, Hb, orina)', 'USG 1er trimestre', 'Tamizaje riesgo'] },
  { trim: '2do trimestre', items: ['Anatomía fetal (18-22 sem)', 'Curva de peso', 'Tamizaje diabetes gestacional', 'Vacuna Tdap'] },
  { trim: '3er trimestre', items: ['Controles quincenales/semanales', 'Estreptococo B', 'Plan de parto', 'Signos de alarma'] },
]

export function imprimirCarnetMaterno(
  paciente: CarnetMaternoPaciente,
  embarazo: CarnetMaternoEmbarazo | null,
  gineco: CarnetMaternoGineco | null,
  controles: PrenatalPrintControl[] = [],
) {
  const checklist = CHECKLIST_TRIMESTRES.map(t => `
    <div style="margin-bottom:8px">
      <p style="font-size:10px;font-weight:700;color:#9d174d;margin:0 0 4px">${t.trim}</p>
      <ul style="margin:0;padding-left:16px;font-size:10px;line-height:1.5">
        ${t.items.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </div>`).join('')

  const html = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
      <div class="kpi"><div class="kpi-lbl">Paciente</div><div class="kpi-val" style="font-size:10px">${nombreCompleto(paciente)}</div></div>
      <div class="kpi"><div class="kpi-lbl">FUM</div><div class="kpi-val" style="font-size:10px">${fmtFecha(embarazo?.fum)}</div></div>
      <div class="kpi"><div class="kpi-lbl">FPP</div><div class="kpi-val" style="font-size:10px">${fmtFecha(embarazo?.fpp)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Edad</div><div class="kpi-val" style="font-size:10px">${edadPacientePrint(paciente.fecha_nac)}</div></div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">G/P/C/A</div><div class="kpi-val" style="font-size:10px">${embarazo?.gestas ?? '—'}/${embarazo?.partos ?? '—'}/${embarazo?.cesareas ?? '—'}/${embarazo?.abortos ?? '—'}</div></div>
      <div class="kpi"><div class="kpi-lbl">GS/Rh</div><div class="kpi-val" style="font-size:10px">${[embarazo?.grupo_sanguineo, embarazo?.rh].filter(Boolean).join(' ') || '—'}</div></div>
      <div class="kpi"><div class="kpi-lbl">Ciclo</div><div class="kpi-val" style="font-size:10px">${gineco?.ciclo_menstrual ?? '—'}</div></div>
      <div class="kpi"><div class="kpi-lbl">Método PF</div><div class="kpi-val" style="font-size:10px">${gineco?.metodo_planificacion ?? '—'}</div></div>
      <div class="kpi"><div class="kpi-lbl">Riesgo</div><div class="kpi-val" style="font-size:10px">${gineco?.riesgo_obstetrico ?? (embarazo ? 'Evaluar' : '—')}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div>
        <h2>Checklist prenatal</h2>
        ${checklist}
      </div>
      <div>
        <h2>Plan de parto / notas</h2>
        <p style="font-size:11px;white-space:pre-wrap;min-height:80px;border:1px solid #e2e8f0;border-radius:6px;padding:8px">
          ${gineco?.plan_parto?.trim() || 'Registrar plan de parto, acompañante y lugar preferido.'}
        </p>
        <p style="font-size:9px;color:#64748b;margin-top:8px">Código: ${paciente.codigo}</p>
      </div>
    </div>

    <h2>Controles prenatales</h2>
    <table>
      <thead><tr>
        <th>Fecha</th><th>#</th><th>Sem.</th><th>Peso</th><th>PA</th><th>FCF</th><th>AU</th><th>Prot.</th><th>Edema</th><th>USG</th>
      </tr></thead>
      <tbody>${controles.map(fila).join('') || '<tr><td colspan="10">Sin controles registrados</td></tr>'}</tbody>
    </table>

    <div style="margin-top:12px;padding:8px 10px;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:6px;font-size:10px">
      <b>Signos de alarma:</b> sangrado vaginal, cefalea intensa, visión borrosa, dolor epigástrico, disminución de movimientos fetales, fiebre, contracciones antes de término.
    </div>`

  imprimirReporte({
    titulo: 'Carnet materno',
    subtitulo: nombreCompleto(paciente),
    contenidoHtml: html,
    orientacion: 'landscape',
  })
}
