import { FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

export interface NotaCreditoItem {
  descripcion: string
  cantidad?: number
  precio_unitario?: number
  subtotal: number
}

export interface NotaCreditoData {
  numero: string
  factura_numero?: string | null
  fecha: string
  hora?: string | null
  cliente_nombre?: string | null
  paciente_nombre?: string | null
  sucursal_nombre?: string | null
  cajero_nombre?: string | null
  motivo?: string | null
  tipo_reembolso: string
  es_anulacion?: boolean
  subtotal: number
  isv_monto: number
  total: number
  items: NotaCreditoItem[] | unknown
}

function L(n: number): string {
  return `L ${Number(n).toFixed(2)}`
}

const REEMBOLSO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  SALDO_FAVOR: 'Saldo a favor del paciente',
}

function normalizarItems(items: unknown): NotaCreditoItem[] {
  if (!items) return []
  let raw = items
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw.map(it => ({
    descripcion: String(it.descripcion ?? ''),
    subtotal: Number(it.subtotal ?? 0),
    cantidad: it.cantidad != null ? Number(it.cantidad) : undefined,
    precio_unitario: it.precio_unitario != null ? Number(it.precio_unitario) : undefined,
  }))
}

export function htmlNotaCredito(d: NotaCreditoData): string {
  const items = normalizarItems(d.items)
  const hora = (d.hora ?? '').slice(0, 5)
  const titulo = d.es_anulacion ? 'NOTA DE CRÉDITO — ANULACIÓN' : 'NOTA DE CRÉDITO — DEVOLUCIÓN'
  const reembolso = REEMBOLSO_LABEL[d.tipo_reembolso] ?? d.tipo_reembolso
  const logo = logoTicketHtml(window.location.origin, 'print')

  const itemsHtml = items.length > 0
    ? items.map(it => {
        const detalle = it.cantidad && it.precio_unitario
          ? `<br><span class="detalle">${it.cantidad} x L ${Number(it.precio_unitario).toFixed(2)}</span>`
          : ''
        return `<tr><td class="desc">${it.descripcion}${detalle}</td><td class="monto">${L(it.subtotal)}</td></tr>`
      }).join('')
    : `<tr><td class="desc">Devolución</td><td class="monto">${L(d.subtotal)}</td></tr>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${d.numero}</title>
<style>
  html, body { margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size: 80mm auto; margin: 2mm 1.5mm; }
  body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:600; color:#000; width:76mm; max-width:76mm; margin:0 auto; padding:3mm 2mm 8mm; word-wrap:break-word; }
  .center{text-align:center}.bold{font-weight:bold}
  .logo-wrap{text-align:center;margin-bottom:4px}
  .logo-wrap img.logo-ticket{display:block;margin:0 auto;width:150px;max-width:150px;height:auto}
  .nombre-clinica{font-size:12px;margin:4px 0 2px}
  .titulo{font-size:12px;font-weight:bold;text-align:center;margin:6px 0;letter-spacing:.5px}
  .dir{font-size:9.5px;line-height:1.4;font-weight:normal}
  .line{border-top:1px dashed #000;margin:5px 0}
  .line-solid{border-top:2px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;gap:6px;line-height:1.45}
  .row span,.row strong{flex:1}
  .row span:last-child,.row strong:last-child{text-align:right;white-space:nowrap;flex:0 0 auto}
  .detalle{font-size:9.5px;font-weight:normal}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  td{padding:2px 0;vertical-align:top}
  td.desc{width:68%;font-size:10.5px;padding-right:4px;word-break:break-word}
  td.monto{width:32%;text-align:right;white-space:nowrap;font-size:10.5px}
  .pie{font-size:9.5px;line-height:1.45;font-weight:normal}
  .btn{display:block;margin:8px auto 12px;padding:8px 20px;background:#9a3412;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px}
  @media print{.no-print{display:none!important}}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Imprimir</button>
<div class="logo-wrap">${logo}</div>
<div class="center bold nombre-clinica">CLINICA MEDICA JERUSALEN</div>
<div class="center dir">RTN: ${FISCAL.rtn}</div>
<div class="line"></div>

<div class="titulo">${titulo}</div>
<div><strong>No. </strong>${d.numero}</div>
${d.factura_numero ? `<div><strong>Factura origen: </strong>${d.factura_numero}</div>` : ''}
<div><strong>Fecha: </strong>${d.fecha}${hora ? `&nbsp;&nbsp;<strong>Hora: </strong>${hora}` : ''}</div>
${d.sucursal_nombre ? `<div><strong>Sucursal: </strong>${d.sucursal_nombre}</div>` : ''}
${d.cajero_nombre ? `<div><strong>Cajero: </strong>${d.cajero_nombre}</div>` : ''}
<div class="line"></div>

<div><strong>Cliente: </strong>${d.cliente_nombre || d.paciente_nombre || 'CLIENTE GENERAL'}</div>
<div><strong>Reembolso: </strong>${reembolso}</div>
${d.motivo ? `<div class="pie" style="margin-top:3px"><strong>Motivo: </strong>${d.motivo}</div>` : ''}
<div class="line-solid"></div>

<table>
  <tr><td class="desc"><b>Descripción</b></td><td class="monto"><b>Monto</b></td></tr>
  ${itemsHtml}
</table>
<div class="line"></div>

<div class="row"><span>Subtotal:</span><span>${L(d.subtotal)}</span></div>
<div class="row"><span>ISV:</span><span>${L(d.isv_monto)}</span></div>
<div class="line-solid"></div>
<div class="row" style="font-size:13px"><strong>TOTAL DEVUELTO:</strong><strong>${L(d.total)}</strong></div>
<div class="line"></div>

<div class="center pie" style="margin-top:6px">
  <strong>Documento interno — no es factura fiscal</strong><br><br>
  Firma cliente: ____________________<br><br>
  ${FISCAL.web}
</div>
<script>
  window.addEventListener('load', function(){ setTimeout(function(){ window.print() }, 300) })
</script>
</body></html>`
}

export function abrirNotaCredito(d: NotaCreditoData): void {
  const win = window.open('', '_blank', 'width=420,height=900,scrollbars=yes')
  if (!win) { alert('Permita ventanas emergentes para imprimir la nota de crédito.'); return }
  win.document.open()
  win.document.write(htmlNotaCredito(d))
  win.document.close()
  win.focus()
}
