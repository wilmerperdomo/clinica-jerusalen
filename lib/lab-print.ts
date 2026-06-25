import { BRAND } from '@/lib/brand'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  labEncabezadoInformeHtml,
  labPieInformeHtml,
  labPlantillaInformeStyles,
  type LabEncabezadoInforme,
} from '@/lib/lab-plantilla-assets'
import { indicadorDesdeRango, type GrupoLab, type PruebaLab, type IndicadorRango, type OrdenLab } from '@/lib/lab-utils'
import { linkWhatsAppResultado } from '@/lib/lab-resultado-print'

/** Texto de resultado externo/adjunto (legacy); no mostrar "maquila" en informe clínica. */
export function esTextoResultadoAdjunto(valor?: string | null): boolean {
  if (!valor?.trim()) return false
  const v = valor.toLowerCase()
  return v.includes('adjunto') || v.includes('maquila') || v.includes('masterlab')
}

/** Valor mostrado en tabla del informe (clínica u otro). */
export function valorResultadoInforme(
  orden: Pick<OrdenLab, 'resultado_externo' | 'resultado_resumen'>,
  valorLab?: string | null,
): string {
  const v = valorLab?.trim()
  if (v && !esTextoResultadoAdjunto(v)) return v
  if (orden.resultado_externo || esTextoResultadoAdjunto(v) || esTextoResultadoAdjunto(orden.resultado_resumen)) {
    return 'Ver archivo adjunto'
  }
  const res = orden.resultado_resumen?.trim()
  return res && !esTextoResultadoAdjunto(res) ? res : '—'
}

/** Hay valor numérico/cualitativo propio de la clínica (no solo PDF adjunto). */
export function filaTieneValorClinica(f: FilaResultadoPrint): boolean {
  const v = f.valor?.trim()
  if (!v || v === '—' || v === 'Ver archivo adjunto') return false
  return !esTextoResultadoAdjunto(v)
}

export interface FilaResultadoPrint {
  prueba: string
  campo?: string
  valor: string
  unidad?: string
  rango?: string
  anormal?: boolean
  indicador?: IndicadorRango
  obs?: string
}

export interface InformeLabMeta {
  edad?: number | null
  sexo?: string
  sucursalNombre?: string
  validadoPor?: string
  fechaResultado?: string
  portalUrl?: string
  medicoNombre?: string
  urgente?: boolean
  observaciones?: string
  /** Encabezado del informe: clínica propia o Masterlab */
  encabezado?: LabEncabezadoInforme
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

function informeStyles(): string {
  return `
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1f2937;font-size:12px;line-height:1.45;background:#fff}
    .page{max-width:780px;margin:0 auto;padding:22px 30px}
    .hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #003366;padding-bottom:12px}
    .hdr .brand{display:flex;align-items:center;gap:12px}
    .hdr .brand .logo img{height:54px;width:auto}
    .hdr .brand .name{font-size:17px;font-weight:800;color:#003366;letter-spacing:.3px}
    .hdr .brand .tag{font-size:10px;color:#64748b}
    .hdr .meta{text-align:right;font-size:10px;color:#475569}
    .title{text-align:center;font-size:14px;font-weight:800;color:#003366;letter-spacing:1px;margin:14px 0 10px;text-transform:uppercase}
    .pinfo{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:6px}
    .pinfo .row{display:flex;gap:8px;font-size:11px;padding:1px 0}
    .pinfo .row b{color:#475569;min-width:96px;display:inline-block}
    table.res{width:100%;border-collapse:collapse;margin:14px 0 6px}
    table.res th{background:#003366;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:7px 8px;text-align:left}
    table.res td{padding:6px 8px;border-bottom:1px solid #eef2f7;vertical-align:top;font-size:11px}
    table.res tr.grp td{background:#eef2f7;font-weight:700;color:#003366;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
    .val{font-weight:700}
    .alto{color:#b91c1c}
    .bajo{color:#1d4ed8}
    .flag{display:inline-block;font-weight:700;font-size:10px;padding:1px 6px;border-radius:999px}
    .flag.alto{background:#fee2e2;color:#b91c1c}
    .flag.bajo{background:#dbeafe;color:#1d4ed8}
    .flag.normal{background:#dcfce7;color:#166534}
    .obs{color:#64748b;font-size:10px}
    .firma-block{margin-top:32px}
    .foot{margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:9px;color:#94a3b8;text-align:center}
    ${labPlantillaInformeStyles()}
    .portal{margin-top:12px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:10px 14px;font-size:10px;color:#155e75;text-align:center}
    .urg{display:inline-block;background:#dc2626;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;vertical-align:middle;letter-spacing:.5px}
    .obsbox{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 14px;margin-bottom:6px;font-size:10px;color:#92400e}
    @media print{@page{size:A4;margin:12mm}.page{padding:0}.no-print{display:none}}
  `
}

function indicadorFlag(ind?: IndicadorRango): string {
  if (ind === 'ALTO') return '<span class="flag alto">ALTO ↑</span>'
  if (ind === 'BAJO') return '<span class="flag bajo">BAJO ↓</span>'
  if (ind === 'NORMAL') return '<span class="flag normal">Normal</span>'
  return '<span style="color:#94a3b8">—</span>'
}

/** Genera el HTML completo del informe de resultados (reutilizable por staff y portal). */
export function htmlInformeResultadosLab(
  grupo: Pick<GrupoLab, 'pacienteNombre' | 'pacienteCodigo' | 'fecha' | 'ordenes'>,
  filas: FilaResultadoPrint[],
  meta: InformeLabMeta = {},
  origin = '',
): string {
  // Agrupar filas por prueba para encabezados de sección
  const porPrueba = new Map<string, FilaResultadoPrint[]>()
  for (const f of filas) {
    if (!porPrueba.has(f.prueba)) porPrueba.set(f.prueba, [])
    porPrueba.get(f.prueba)!.push(f)
  }

  const cuerpo: string[] = []
  for (const [prueba, fs] of porPrueba) {
    const multi = fs.length > 1 || fs.some(f => f.campo)
    if (multi) {
      cuerpo.push(`<tr class="grp"><td colspan="5">${escapeHtml(prueba)}</td></tr>`)
      for (const f of fs) {
        const cls = f.indicador === 'ALTO' ? 'alto' : f.indicador === 'BAJO' ? 'bajo' : ''
        cuerpo.push(`<tr>
          <td style="padding-left:18px">${escapeHtml(f.campo ?? prueba)}</td>
          <td class="val ${cls}">${escapeHtml(f.valor || '—')}</td>
          <td>${escapeHtml(f.unidad ?? '')}</td>
          <td>${escapeHtml(f.rango ?? '—')}</td>
          <td>${indicadorFlag(f.indicador)}${f.obs ? `<div class="obs">${escapeHtml(f.obs)}</div>` : ''}</td>
        </tr>`)
      }
    } else {
      const f = fs[0]
      const cls = f.indicador === 'ALTO' ? 'alto' : f.indicador === 'BAJO' ? 'bajo' : ''
      cuerpo.push(`<tr>
        <td><b>${escapeHtml(prueba)}</b></td>
        <td class="val ${cls}">${escapeHtml(f.valor || '—')}</td>
        <td>${escapeHtml(f.unidad ?? '')}</td>
        <td>${escapeHtml(f.rango ?? '—')}</td>
        <td>${indicadorFlag(f.indicador)}${f.obs ? `<div class="obs">${escapeHtml(f.obs)}</div>` : ''}</td>
      </tr>`)
    }
  }

  const edadSexo = [
    meta.edad != null ? `${meta.edad} años` : null,
    meta.sexo ? (meta.sexo.toUpperCase().startsWith('M') ? 'Masculino' : meta.sexo.toUpperCase().startsWith('F') ? 'Femenino' : meta.sexo) : null,
  ].filter(Boolean).join(' · ') || '—'

  const portalBox = meta.portalUrl
    ? `<div class="portal">Consulte sus resultados en línea: <b>${escapeHtml(meta.portalUrl)}</b> &nbsp;·&nbsp; Usuario: su número de identidad</div>`
    : ''

  const encabezado = meta.encabezado ?? 'clinica'

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Resultados — ${escapeHtml(grupo.pacienteNombre)}</title>
    <style>${informeStyles()}</style></head><body>
    <div class="page">
      ${labEncabezadoInformeHtml(encabezado, origin, { sucursalNombre: meta.sucursalNombre })}

      <div class="title">Informe de Resultados de Laboratorio${meta.urgente ? ' <span class="urg">URGENTE</span>' : ''}</div>

      <div class="pinfo">
        <div class="row"><b>Paciente</b> ${escapeHtml(grupo.pacienteNombre)}</div>
        <div class="row"><b>Fecha de orden</b> ${escapeHtml(grupo.fecha)}</div>
        <div class="row"><b>Identidad</b> ${escapeHtml(grupo.pacienteCodigo || '—')}</div>
        <div class="row"><b>Fecha de resultado</b> ${escapeHtml(meta.fechaResultado ?? '—')}</div>
        <div class="row"><b>Edad / Sexo</b> ${escapeHtml(edadSexo)}</div>
        <div class="row"><b>Médico solicitante</b> ${escapeHtml(meta.medicoNombre ? `Dr(a). ${meta.medicoNombre}` : '—')}</div>
        <div class="row"><b>Órdenes</b> ${grupo.ordenes.map(o => '#' + o.id).join(', ')}</div>
      </div>

      ${meta.observaciones ? `<div class="obsbox"><b>Observaciones:</b> ${escapeHtml(meta.observaciones)}</div>` : ''}

      <table class="res">
        <thead><tr><th>Prueba / Parámetro</th><th>Resultado</th><th>Unidad</th><th>Valor de referencia</th><th>Indicador</th></tr></thead>
        <tbody>${cuerpo.join('')}</tbody>
      </table>

      ${labPieInformeHtml(origin, meta.validadoPor)}

      ${portalBox}

      <div class="foot">
        Documento generado el ${new Date().toLocaleString('es-HN')} · ${escapeHtml(BRAND.nombre)}<br>
        Los resultados deben ser interpretados por su médico tratante.
      </div>
    </div>
    </body></html>`
}

export function imprimirResultadoGrupoLab(
  grupo: GrupoLab,
  filas: FilaResultadoPrint[],
  meta: InformeLabMeta = {},
  baseUrl?: string,
) {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const w = window.open('', '_blank', 'width=900,height=900')
  if (!w) { alert('Permita ventanas emergentes para imprimir.'); return }
  const html = htmlInformeResultadosLab(grupo, filas, meta, origin)
  w.document.write(html.replace('</body>', '<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body>'))
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
        const indicador = indicadorDesdeRango(r.valor_resultado, r.rango_min, r.rango_max)
        filas.push({
          prueba: orden.no_analisis,
          campo: campo?.nombre ?? r.nombre_prueba,
          valor: valorResultadoInforme(orden, r.valor_resultado),
          unidad: r.unidad,
          rango: r.rango_texto,
          anormal: r.anormal,
          indicador: indicador || (r.anormal ? 'ALTO' : ''),
          obs: r.observacion,
        })
      }
    } else {
      const r = resultados[0]
      const indicador = indicadorDesdeRango(r?.valor_resultado, r?.rango_min, r?.rango_max)
      filas.push({
        prueba: orden.no_analisis,
        valor: valorResultadoInforme(orden, r?.valor_resultado),
        unidad: r?.unidad,
        rango: r?.rango_texto,
        anormal: r?.anormal,
        indicador: indicador || (r?.anormal ? 'ALTO' : ''),
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
  supabase: SupabaseClient,
  ordenId: number,
  accion: string,
  detalle?: string,
) {
  return supabase.from('lab_auditoria').insert({ orden_id: ordenId, accion, detalle: detalle ?? null })
}
