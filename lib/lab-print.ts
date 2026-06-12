import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import type { GrupoLab, PruebaLab } from '@/lib/lab-utils'
import { linkWhatsAppResultado } from '@/lib/lab-resultado-print'

export interface FilaResultadoPrint {
  prueba: string
  campo?: string
  valor: string
  unidad?: string
  rango?: string
  anormal?: boolean
  obs?: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function baseStyles(): string {
  return `
    body{font-family:Arial,Helvetica,sans-serif;padding:24px 32px;font-size:12px;color:#1a1a1a;line-height:1.45}
    h1{font-size:16px;text-align:center;color:#003366;margin:8px 0 4px;letter-spacing:.5px}
    h2{font-size:13px;color:#003366;margin:18px 0 8px;border-bottom:2px solid #c9a227;padding-bottom:4px}
    .logo{text-align:center;margin-bottom:8px}
    .sub{text-align:center;font-size:10px;color:#555;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{padding:6px 8px;border:1px solid #e5e7eb;text-align:left;vertical-align:top}
    th{background:#f8fafc;font-size:10px;text-transform:uppercase;color:#475569}
    .anormal{color:#b91c1c;font-weight:bold}
    .firma{margin-top:48px;text-align:center;border-top:1px solid #333;width:280px;margin-left:auto;margin-right:auto;padding-top:8px;font-size:10px}
    .etiqueta{border:2px dashed #333;padding:12px 16px;max-width:320px;margin:8px auto;page-break-inside:avoid}
    .etiqueta h3{margin:0 0 6px;font-size:14px}
    .tubo{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:bold;margin:2px}
    @media print{@page{margin:10mm}}
  `
}

export function imprimirEtiquetasTubo(
  grupo: GrupoLab,
  pruebas: PruebaLab[],
  baseUrl?: string,
) {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const w = window.open('', '_blank', 'width=600,height=800')
  if (!w) { alert('Permita ventanas emergentes para imprimir etiquetas.'); return }

  const etiquetas = grupo.ordenes.map(o => {
    const prueba = pruebas.find(p => p.id === Number(o.id_analisis))
    const color = prueba?.color ?? 'Gris'
    const ids = grupo.ordenes.map(x => x.id).join(', ')
    return `
      <div class="etiqueta">
        <h3>${escapeHtml(grupo.pacienteNombre)}</h3>
        <p><b>Código:</b> ${escapeHtml(grupo.pacienteCodigo || '—')} &nbsp; <b>Fecha:</b> ${escapeHtml(grupo.fecha)}</p>
        <p><b>Orden:</b> #${o.id} &nbsp; <b>Lote:</b> ${escapeHtml(grupo.grupoId.slice(0, 12))}</p>
        <p><span class="tubo" style="background:#e5e7eb">${escapeHtml(color)}</span> <b>${escapeHtml(o.no_analisis)}</b></p>
        <p style="font-size:9px;color:#666">Grupo: ${escapeHtml(ids)} · ${BRAND.nombre}</p>
      </div>`
  }).join('')

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas tubo</title><style>${baseStyles()}</style></head>
    <body>${etiquetas}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`)
  w.document.close()
}

export function imprimirResultadoGrupoLab(
  grupo: GrupoLab,
  filas: FilaResultadoPrint[],
  baseUrl?: string,
) {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const w = window.open('', '_blank', 'width=900,height=800')
  if (!w) { alert('Permita ventanas emergentes para imprimir.'); return }

  const rows = filas.map(f => `
    <tr>
      <td>${escapeHtml(f.prueba)}${f.campo ? `<br><small>${escapeHtml(f.campo)}</small>` : ''}</td>
      <td class="${f.anormal ? 'anormal' : ''}"><b>${escapeHtml(f.valor)}</b>${f.unidad ? ` ${escapeHtml(f.unidad)}` : ''}</td>
      <td>${escapeHtml(f.rango ?? '—')}</td>
      <td>${f.anormal ? '<span class="anormal">▲ Anormal</span>' : 'Normal'}</td>
      <td>${escapeHtml(f.obs ?? '')}</td>
    </tr>`).join('')

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resultados ${escapeHtml(grupo.pacienteNombre)}</title>
    <style>${baseStyles()}</style></head><body>
    <div class="logo">${logoTicketHtml(origin, 'mobile')}</div>
    <p class="sub"><b>${escapeHtml(BRAND.nombre)}</b><br>Tel: ${escapeHtml(FISCAL.telefonos)}</p>
    <h1>INFORME DE RESULTADOS DE LABORATORIO</h1>
    <table style="border:none">
      <tr><td style="border:none;width:120px"><b>Paciente</b></td><td style="border:none">${escapeHtml(grupo.pacienteNombre)}</td></tr>
      <tr><td style="border:none"><b>Identidad</b></td><td style="border:none">${escapeHtml(grupo.pacienteCodigo || '—')}</td></tr>
      <tr><td style="border:none"><b>Fecha orden</b></td><td style="border:none">${escapeHtml(grupo.fecha)}</td></tr>
      <tr><td style="border:none"><b>Órdenes</b></td><td style="border:none">${grupo.ordenes.map(o => '#' + o.id).join(', ')}</td></tr>
    </table>
    <h2>Resultados</h2>
    <table>
      <thead><tr><th>Prueba / Parámetro</th><th>Resultado</th><th>Referencia</th><th>Estado</th><th>Obs.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="firma">Responsable de laboratorio — Firma y sello autorizado</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
    </body></html>`)
  w.document.close()
}

export function filasPrintDesdeGrupo(
  grupo: GrupoLab,
  pruebas: PruebaLab[],
  panelCampos: Record<number, { id: number; nombre: string }[]>,
): FilaResultadoPrint[] {
  const filas: FilaResultadoPrint[] = []
  for (const orden of grupo.ordenes) {
    const prueba = pruebas.find(p => p.id === Number(orden.id_analisis))
    const esPanel = prueba?.es_panel
    const resultados = orden.resultados ?? []

    if (esPanel && panelCampos[Number(orden.id_analisis)]?.length) {
      for (const r of resultados) {
        const campo = panelCampos[Number(orden.id_analisis)]?.find(c => c.id === r.campo_id)
        filas.push({
          prueba: orden.no_analisis,
          campo: campo?.nombre ?? r.nombre_prueba,
          valor: r.valor_resultado ?? '—',
          unidad: r.unidad,
          rango: r.rango_texto,
          anormal: r.anormal,
          obs: r.observacion,
        })
      }
    } else {
      const r = resultados[0]
      filas.push({
        prueba: orden.no_analisis,
        valor: r?.valor_resultado ?? orden.resultado_resumen ?? '—',
        unidad: r?.unidad,
        rango: r?.rango_texto,
        anormal: r?.anormal,
        obs: r?.observacion,
      })
    }
  }
  return filas
}

export function whatsappGrupoLab(grupo: GrupoLab, filas: FilaResultadoPrint[]): string {
  if (!grupo.telefono) return ''
  const resumen = filas.slice(0, 4).map(f =>
    `${f.prueba}${f.campo ? ` (${f.campo})` : ''}: ${f.valor}${f.unidad ? ' ' + f.unidad : ''}`,
  ).join(' · ')
  return linkWhatsAppResultado(
    grupo.telefono,
    grupo.pacienteNombre,
    grupo.pruebas.join(', '),
    resumen || undefined,
  )
}

export function registrarAuditoriaLab(
  supabase: { from: (t: string) => { insert: (p: object) => Promise<{ error: { message: string } | null }> } },
  ordenId: number,
  accion: string,
  detalle?: string,
) {
  return supabase.from('lab_auditoria').insert({ orden_id: ordenId, accion, detalle: detalle ?? null })
}
