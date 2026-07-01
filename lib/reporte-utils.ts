import { BRAND, derechosReservadosHtml } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import { fechaHoyHN } from '@/lib/fecha-hn'

/** Utilidades compartidas para el módulo de Reportes */

export function fmtReporte(n: number) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

/** Exporta datos a archivo CSV (compatible con Excel) */
export function exportarCSV(nombre: string, headers: string[], rows: (string | number)[][]) {
  const BOM = '\uFEFF'
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [
    headers.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ].join('\r\n')

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${nombre}_${fechaHoyHN()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Abre ventana de impresión / PDF con contenido HTML */
export function imprimirReporte(opts: {
  titulo: string
  subtitulo?: string
  contenidoHtml: string
  orientacion?: 'portrait' | 'landscape'
}) {
  const ventana = window.open('', '_blank', 'width=900,height=700')
  if (!ventana) return
  ventana.document.write(`<!DOCTYPE html><html><head><title>${opts.titulo}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:20px}
      .brand-header{text-align:center;margin-bottom:16px}
      .brand-header svg{max-width:240px;height:auto}
      h1{font-size:16px;font-weight:bold;margin-bottom:2px;color:${BRAND.navy}}
      p.sub{font-size:10px;color:#555;margin-bottom:14px}
      h2{font-size:12px;font-weight:bold;margin:14px 0 6px;color:${BRAND.navy};border-bottom:1px solid #ddd;padding-bottom:3px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{background:${BRAND.navy};color:#fff;padding:5px 8px;text-align:left;font-size:10px}
      td{padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:10px}
      tr:nth-child(even) td{background:#f9fafb}
      .right{text-align:right}.bold{font-weight:bold}
      .total-row td{background:#eff6ff;font-weight:bold;border-top:2px solid ${BRAND.navy}}
      .danger{color:#dc2626}.success{color:#16a34a}
      .footer{margin-top:20px;font-size:9px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
      .kpi{border:1px solid #e5e7eb;border-radius:6px;padding:8px;text-align:center}
      .kpi-val{font-size:14px;font-weight:bold;color:${BRAND.navy}}
      .kpi-lbl{font-size:9px;color:#6b7280}
      @page{size:Letter ${opts.orientacion ?? 'portrait'};margin:1.2cm}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="brand-header">${logoTicketHtml(typeof window !== 'undefined' ? window.location.origin : '', 'full')}</div>
    <p style="text-align:center;font-weight:bold;color:${BRAND.navy};margin:6px 0 12px">${BRAND.nombre}</p>
    <h1>${opts.titulo}</h1>
    ${opts.subtitulo ? `<p class="sub">${opts.subtitulo}</p>` : ''}
    ${opts.contenidoHtml}
    <p class="footer">Impreso el ${new Date().toLocaleString('es-HN')} · ${derechosReservadosHtml()}</p>
    </body></html>`)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => { ventana.print() }, 400)
}
