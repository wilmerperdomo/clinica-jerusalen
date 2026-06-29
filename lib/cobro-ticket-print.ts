import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import { calcularCambioEfectivo } from '@/lib/caja-pago-utils'
import type { LineaCobroDesc } from '@/lib/membresia-utils'

export interface CobroTicketLinea {
  descripcion: string
  monto: number
  cantidad?: number
}

export interface CobroTicketData {
  titulo?: string
  fecha: string
  hora?: string
  paciente_nombre: string
  concepto?: string
  forma_pago: string
  referencia_pago?: string | null
  banco?: string | null
  lineas: CobroTicketLinea[]
  subtotal?: number
  descuento_monto?: number
  total: number
  monto_recibido?: number | null
  cambio?: number | null
  cajero_nombre?: string | null
  nota?: string | null
}

const LABEL_CATEGORIA: Record<string, string> = {
  consulta: 'Consulta',
  servicios: 'Servicios adicionales',
  laboratorio: 'Laboratorio',
  medicamentos: 'Medicamentos',
}

function L(n: number): string {
  return `L ${Number(n).toFixed(2)}`
}

function fila(izq: string, der: string, bold = false): string {
  const tag = bold ? 'strong' : 'span'
  return `<div class="row"><${tag}>${izq}</${tag}><${tag}>${der}</${tag}></div>`
}

export function lineasDesgloseATicket(lineas: LineaCobroDesc[]): CobroTicketLinea[] {
  return lineas
    .filter(l => l.bruto > 0 || l.neto > 0)
    .map(l => ({
      descripcion: LABEL_CATEGORIA[l.categoria] || l.categoria,
      monto: l.neto,
    }))
}

export function htmlCobroTicket(d: CobroTicketData): string {
  const titulo = d.titulo || 'COMPROBANTE DE COBRO'
  const cambio = d.cambio ?? (
    d.forma_pago === 'EFECTIVO' && d.monto_recibido != null
      ? calcularCambioEfectivo(d.total, String(d.monto_recibido))
      : null
  )

  const lineasHtml = d.lineas.map(li => fila(
    li.descripcion,
    L(li.monto),
  )).join('')

  const pagoExtra = [
    d.forma_pago === 'TARJETA' && d.referencia_pago
      ? fila('Voucher', d.referencia_pago)
      : '',
    d.forma_pago === 'TRANSFERENCIA' && d.banco
      ? fila('Banco', d.banco)
      : '',
    d.forma_pago === 'TRANSFERENCIA' && d.referencia_pago
      ? fila('Referencia', d.referencia_pago)
      : '',
    d.forma_pago === 'EFECTIVO' && d.monto_recibido != null
      ? fila('Recibido', L(d.monto_recibido))
      : '',
    d.forma_pago === 'EFECTIVO' && cambio != null && cambio > 0
      ? fila('Cambio', L(cambio), true)
      : '',
  ].join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${titulo}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; margin: 0 auto; color: #111; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #333; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; margin: 2px 0; }
  .row span, .row strong { max-width: 48%; word-break: break-word; }
  .row strong:last-child, .row span:last-child { text-align: right; flex-shrink: 0; }
  .titulo { font-size: 13px; font-weight: bold; margin: 8px 0 4px; }
  .total { font-size: 14px; margin-top: 4px; }
  .nota { font-size: 10px; color: #444; margin-top: 6px; }
  .pie { font-size: 9px; color: #666; margin-top: 10px; }
</style>
</head>
<body>
  <div class="center">${logoTicketHtml()}</div>
  <div class="center bold" style="margin-top:4px">${BRAND.nombre}</div>
  <div class="center" style="font-size:10px">${FISCAL.casaMatriz}</div>
  <div class="sep"></div>
  <div class="center titulo">${titulo}</div>
  <div class="center" style="font-size:10px">${d.fecha}${d.hora ? ` · ${d.hora}` : ''}</div>
  <div class="sep"></div>
  ${fila('Paciente', d.paciente_nombre, true)}
  ${d.concepto ? fila('Concepto', d.concepto) : ''}
  <div class="sep"></div>
  ${lineasHtml || fila('Total', L(d.total))}
  ${d.descuento_monto && d.descuento_monto > 0 ? fila('Descuento', `- ${L(d.descuento_monto)}`) : ''}
  ${d.subtotal != null && d.descuento_monto ? fila('Subtotal', L(d.subtotal)) : ''}
  <div class="sep"></div>
  ${fila('TOTAL', L(d.total), true)}
  <div class="sep"></div>
  ${fila('Forma de pago', d.forma_pago)}
  ${pagoExtra}
  ${d.cajero_nombre ? `<div class="sep"></div>${fila('Cajero/a', d.cajero_nombre)}` : ''}
  ${d.nota ? `<p class="nota">Nota: ${d.nota}</p>` : ''}
  <div class="sep"></div>
  <p class="pie center">Documento no fiscal · ${BRAND.nombre}</p>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`
}

export function abrirCobroTicketPrint(d: CobroTicketData): void {
  const win = window.open('', '_blank', 'width=420,height=900,scrollbars=yes')
  if (!win) {
    alert('Permita ventanas emergentes para imprimir el ticket.')
    return
  }
  win.document.open()
  win.document.write(htmlCobroTicket(d))
  win.document.close()
  win.focus()
}
