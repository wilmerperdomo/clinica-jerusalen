import { BRAND, derechosReservadosHtml } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

/** Utilidades compartidas para el módulo de Cotizaciones */

export type TipoItemCot = 'MEDICAMENTO' | 'LABORATORIO' | 'SERVICIO' | 'MANUAL'

export interface ItemCotizacion {
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  isv_pct:         number
  subtotal:        number
  tipo?:           TipoItemCot
  producto_id?:    number   // solo referencia — NO descuenta stock
  lab_id?:         number   // prueba de laboratorio_info
  servicio_id?:    number   // servicio del catálogo
}

export const TIPO_ITEM_LABEL: Record<TipoItemCot, string> = {
  MEDICAMENTO: 'Medicamento',
  LABORATORIO: 'Laboratorio',
  SERVICIO:    'Servicio',
  MANUAL:      'Manual',
}

export const TIPO_ITEM_COLOR: Record<TipoItemCot, string> = {
  MEDICAMENTO: 'bg-green-100 text-green-700',
  LABORATORIO: 'bg-purple-100 text-purple-700',
  SERVICIO:    'bg-blue-100 text-blue-700',
  MANUAL:      'bg-gray-100 text-gray-600',
}

export interface SucursalCot {
  id: number; nombre: string; direccion?: string; telefono?: string
  email?: string; rtn?: string; lema?: string
}

export interface CotizacionPrint {
  numero: string; fecha: string; hora?: string
  cliente_nombre: string; cliente_rtn?: string
  items: ItemCotizacion[]
  subtotal: number; por_descuento: number; descuento_monto: number
  isv_monto: number; total: number
  validez_dias: number; fecha_vencimiento: string
  nota?: string; cajero_nombre?: string
  sucursal_id: number
}

export const VALIDEZ_DIAS_DEFAULT = 15

export const fmtCot = (n: number) =>
  `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`

export function calcularTotalesCot(
  items: ItemCotizacion[],
  porDescuento: number,
  exentoIsv: boolean,
) {
  const subtotal = items.reduce((s, it) => s + it.subtotal, 0)
  const descuento_monto = subtotal * (porDescuento / 100)
  const base = subtotal - descuento_monto
  const isv_monto = exentoIsv
    ? 0
    : items.reduce((s, it) => {
        const prop = subtotal > 0 ? it.subtotal / subtotal : 0
        const baseItem = base * prop
        return s + baseItem * (it.isv_pct / 100)
      }, 0)
  const total = base + isv_monto
  return { subtotal, descuento_monto, isv_monto, total }
}

export function fechaVencimiento(fecha: string, dias = VALIDEZ_DIAS_DEFAULT): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

export function estadoEfectivo(
  estado: string,
  fechaVence: string,
  hoy: string,
): string {
  if (estado === 'CONVERTIDA' || estado === 'ANULADA') return estado
  if (fechaVence < hoy && (estado === 'PENDIENTE' || estado === 'ACEPTADA')) return 'VENCIDA'
  return estado
}

export function siguienteNumeroCot(sucursalId: number, correlativos: { sucursal_id: number; ultimo_numero: number }[]): number {
  const cor = correlativos.find(c => c.sucursal_id === sucursalId)
  return (cor?.ultimo_numero ?? 0) + 1
}

export function formatearNumeroCot(num: number, sucursalId: number): string {
  return `COT-${String(sucursalId).padStart(3, '0')}-${String(num).padStart(6, '0')}`
}

/** Vista de impresión / PDF — formato carta con logo Clínica Médica Jerusalén */
export function imprimirCotizacion(cot: CotizacionPrint, suc?: SucursalCot) {
  const items = cot.items as ItemCotizacion[]
  const ordenTipos: TipoItemCot[] = ['SERVICIO', 'LABORATORIO', 'MEDICAMENTO', 'MANUAL']
  const filasHtml = ordenTipos.flatMap(tipo => {
    const grupo = items.filter(it => (it.tipo || 'MANUAL') === tipo)
    if (grupo.length === 0) return []
    return [
      `<tr><td colspan="4" style="background:#e8f0fe;font-weight:bold;text-align:left;padding:8px 10px;color:#003366">
        ${TIPO_ITEM_LABEL[tipo].toUpperCase()}
      </td></tr>`,
      ...grupo.map(it => `
      <tr>
        <td>${it.cantidad}</td>
        <td style="text-align:left">${it.descripcion}</td>
        <td class="right">${fmtCot(it.precio_unitario)}</td>
        <td class="right">${fmtCot(it.subtotal)}</td>
      </tr>`),
    ]
  }).join('')

  const w = window.open('', '_blank', 'width=900,height=800')
  if (!w) return

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const logoHtml = logoTicketHtml(origin, 'full')

  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Cotización ${cot.numero}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#333;background:#f9f9f9;padding:20px}
  .container{max-width:900px;margin:0 auto;background:#fff;padding:36px;border-radius:8px;box-shadow:0 0 12px rgba(0,0,0,.08)}
  .logo,.header-info,.title,.footer-note,.signature{text-align:center}
  .header-info{margin-top:12px;font-weight:bold;font-size:14px;color:${BRAND.navy}}
  .title{font-size:22px;font-weight:bold;margin:32px 0 20px;color:${BRAND.navy};letter-spacing:2px}
  .details{margin-bottom:20px;font-size:15px;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  thead{background:${BRAND.navy};color:#fff}
  th,td{border:1px solid #ccc;padding:10px}
  th{font-size:13px}
  td{font-size:13px}
  tbody td{text-align:center}
  .right{text-align:right!important}
  tfoot th{background:#f1f1f1;color:#333;font-weight:bold}
  .footer-note{margin-top:28px;padding:14px;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;font-size:13px;color:#5d4037;text-align:center}
  .signature{margin-top:50px}
  .signature-line{display:inline-block;border-top:1px solid #000;padding-top:6px;width:220px;font-size:13px}
  .btn-print{float:right;margin-bottom:12px;padding:8px 18px;background:${BRAND.navy};color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
  @media print{
    body{background:#fff;padding:0}
    .container{box-shadow:none;padding:20px}
    .btn-print{display:none}
  }
</style></head><body>
<div class="container">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>

  <div class="logo">${logoHtml}</div>
  <div class="header-info" style="margin-top:8px;font-size:15px;font-weight:bold">${BRAND.nombre}</div>
  <div class="header-info">
    ${suc?.direccion || 'Clínica Médica Jerusalén'}<br>
    ${suc?.telefono ? `Tel: ${suc.telefono}<br>` : ''}
    RTN: ${suc?.rtn || '—'}
  </div>

  <div class="title">COTIZACIÓN N° ${cot.numero}</div>

  <div class="details">
    <strong>Fecha:</strong> ${cot.fecha} ${(cot.hora || '').slice(0, 5)}<br>
    <strong>Cliente:</strong> ${cot.cliente_nombre}<br>
    ${cot.cliente_rtn ? `<strong>RTN:</strong> ${cot.cliente_rtn}<br>` : ''}
    <strong>Válida hasta:</strong> ${cot.fecha_vencimiento}
  </div>

  <table>
    <thead>
      <tr>
        <th>Cantidad</th>
        <th>Descripción</th>
        <th class="right">Precio Unitario</th>
        <th class="right">Valor Total</th>
      </tr>
    </thead>
    <tbody>
      ${filasHtml}
    </tbody>
    <tfoot>
      <tr>
        <th colspan="2" style="text-align:left;font-weight:normal;font-size:12px">
          Validez: ${cot.validez_dias} días · Sujeto a cambios
        </th>
        <th class="right">Sub-Total</th>
        <th class="right">${fmtCot(cot.subtotal)}</th>
      </tr>
      ${cot.por_descuento > 0 ? `
      <tr>
        <th colspan="2"></th>
        <th class="right">Descuento (${cot.por_descuento}%)</th>
        <th class="right">-${fmtCot(cot.descuento_monto)}</th>
      </tr>` : ''}
      ${cot.isv_monto > 0 ? `
      <tr>
        <th colspan="2"></th>
        <th class="right">I.S.V.</th>
        <th class="right">${fmtCot(cot.isv_monto)}</th>
      </tr>` : ''}
      <tr>
        <th colspan="2"></th>
        <th class="right">Total a Pagar</th>
        <th class="right">${fmtCot(cot.total)}</th>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">
    <strong>Este presupuesto tiene una validez de ${cot.validez_dias} días</strong> a partir de la fecha de emisión,
    sujeto a disponibilidad de productos y cambios de precio.
    ${cot.nota ? `<br><em>Nota: ${cot.nota}</em>` : ''}
  </div>

  <div class="signature">
    <div class="signature-line">Sello y firma</div>
    ${cot.cajero_nombre ? `<p style="margin-top:8px;font-size:12px;color:#666">Elaborado por: ${cot.cajero_nombre}</p>` : ''}
  </div>

  <p style="margin-top:28px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e5e7eb;padding-top:12px">
    ${derechosReservadosHtml()}
  </p>
</div>
</body></html>`)
  w.document.close()
  w.focus()
}
