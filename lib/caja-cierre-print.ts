import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'

export interface CajaCierreMovimiento {
  hora?: string
  concepto: string
  tipo: 'INGRESO' | 'EGRESO'
  monto: number
  forma_pago: string
  paciente_nombre?: string
}

export interface CajaCierrePrintData {
  sucursal_nombre?: string
  cajero_nombre?: string
  fecha: string
  hora_apertura?: string
  hora_cierre?: string
  monto_inicial: number
  ingresos_efectivo: number
  ingresos_tarjeta: number
  ingresos_transferencia: number
  ingresos_credito: number
  total_ingresos: number
  total_egresos: number
  efectivo_esperado: number
  efectivo_dia?: number
  egresos_detalle?: { hora?: string; concepto: string; monto: number; forma_pago?: string }[]
  conteo_apertura: number
  conteo_ventas_efectivo: number
  conteo_egresos: number
  efectivo_contado: number
  tarjeta_contada: number
  transfer_contada: number
  diferencia: number
  observacion?: string
  movimientos?: CajaCierreMovimiento[]
}

function L(n: number): string {
  return `L ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtFecha(f: string): string {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-HN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function htmlCierreCaja(d: CajaCierrePrintData, baseUrl = ''): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const movs = d.movimientos ?? []
  const filasMov = movs.map(m => `
    <tr>
      <td style="padding:2px 4px;font-size:10px">${m.hora?.slice(0, 5) ?? ''}</td>
      <td style="padding:2px 4px;font-size:10px">${m.concepto}</td>
      <td style="padding:2px 4px;font-size:10px;text-align:right;color:${m.tipo === 'INGRESO' ? '#166534' : '#b91c1c'}">
        ${m.tipo === 'INGRESO' ? '+' : '−'}${L(m.monto)}
      </td>
    </tr>
  `).join('')

  const cuadra = Math.abs(d.diferencia) < 0.01
  const efectivoDia = typeof d.efectivo_dia === 'number'
    ? d.efectivo_dia
    : (d.ingresos_efectivo - d.total_egresos)
  const egresosDet = d.egresos_detalle ?? []
  const filasEgr = egresosDet.map(e => `
    <tr>
      <td style="padding:2px 4px;font-size:10px">${e.hora?.slice(0, 5) ?? ''}</td>
      <td style="padding:2px 4px;font-size:10px">${e.concepto}</td>
      <td style="padding:2px 4px;font-size:10px;text-align:right;color:#b91c1c">−${L(e.monto)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cierre de Caja — ${d.fecha}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Consolas, monospace; font-size: 11px; color: #111; padding: 12px; max-width: 320px; margin: 0 auto; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #999; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
    .ok { color: #166534; font-weight: bold; }
    .bad { color: #b91c1c; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:4px">${logoTicketHtml(origin, 'mobile')}</div>
  <div class="center bold" style="font-size:11px;margin-top:4px">${BRAND.nombre}</div>
  <div class="center bold" style="font-size:13px;margin-top:6px">CIERRE DE CAJA</div>
  <div class="line"></div>

  <div class="row"><span>Sucursal:</span><span class="bold">${d.sucursal_nombre ?? '—'}</span></div>
  <div class="row"><span>Enfermero/a:</span><span>${d.cajero_nombre ?? '—'}</span></div>
  <div class="row"><span>Fecha:</span><span>${fmtFecha(d.fecha)}</span></div>
  <div class="row"><span>Apertura:</span><span>${d.hora_apertura?.slice(0, 5) ?? '—'}</span></div>
  <div class="row"><span>Cierre:</span><span>${d.hora_cierre?.slice(0, 5) ?? '—'}</span></div>
  <div class="line"></div>

  <div class="bold" style="margin-bottom:4px">RESUMEN DEL SISTEMA</div>
  <div class="row"><span>(+) Ventas efectivo</span><span>${L(d.ingresos_efectivo)}</span></div>
  <div class="row"><span>(−) Egresos</span><span>${L(d.total_egresos)}</span></div>
  <div class="row bold"><span>= Efectivo del día</span><span>${L(efectivoDia)}</span></div>
  <div class="row" style="margin-top:4px"><span>Fondo de caja (se conserva)</span><span>${L(d.monto_inicial)}</span></div>
  <div class="row bold"><span>= Total en cajón</span><span>${L(d.efectivo_esperado)}</span></div>
  <div style="font-size:9px;color:#666;margin-top:2px">El fondo queda en el cajón para el día siguiente.</div>
  <div class="line"></div>
  <div class="row"><span>Ventas tarjeta</span><span>${L(d.ingresos_tarjeta)}</span></div>
  <div class="row"><span>Ventas transferencia</span><span>${L(d.ingresos_transferencia)}</span></div>
  <div class="row"><span>A crédito</span><span>${L(d.ingresos_credito)}</span></div>
  <div class="row"><span>Total ingresos</span><span>${L(d.total_ingresos)}</span></div>

  ${egresosDet.length ? `
  <div class="line"></div>
  <div class="bold" style="margin-bottom:4px">DETALLE DE EGRESOS (${egresosDet.length})</div>
  <table>${filasEgr}</table>
  <div class="row bold" style="margin-top:2px"><span>Total egresos</span><span>−${L(d.total_egresos)}</span></div>
  ` : ''}

  <div class="line"></div>
  <div class="bold" style="margin-bottom:4px">ARQUEO FÍSICO (CAJERO)</div>
  <div class="row"><span>Efectivo apertura</span><span>${L(d.conteo_apertura)}</span></div>
  <div class="row"><span>Ventas efectivo contadas</span><span>${L(d.conteo_ventas_efectivo)}</span></div>
  <div class="row"><span>Egresos pagados</span><span>${L(d.conteo_egresos)}</span></div>
  <div class="row bold"><span>= Efectivo contado</span><span>${L(d.efectivo_contado)}</span></div>
  <div class="row"><span>Tarjetas</span><span>${L(d.tarjeta_contada)}</span></div>
  <div class="row"><span>Transferencias</span><span>${L(d.transfer_contada)}</span></div>

  <div class="line"></div>
  <div class="row bold ${cuadra ? 'ok' : 'bad'}">
    <span>${cuadra ? '✓ CAJA CUADRADA' : d.diferencia > 0 ? 'SOBRANTE' : 'FALTANTE'}</span>
    <span>${cuadra ? '—' : L(Math.abs(d.diferencia))}</span>
  </div>

  ${d.observacion ? `<div class="line"></div><div style="font-size:10px"><span class="bold">Obs:</span> ${d.observacion}</div>` : ''}

  ${movs.length ? `
  <div class="line"></div>
  <div class="bold" style="margin-bottom:4px">MOVIMIENTOS (${movs.length})</div>
  <table>${filasMov}</table>
  ` : ''}

  <div class="line"></div>
  <div class="center" style="font-size:9px;color:#666">RTN ${FISCAL.rtn}</div>
  <div class="center" style="font-size:9px;color:#666;margin-top:4px">Impreso ${new Date().toLocaleString('es-HN')}</div>

  <div class="no-print center" style="margin-top:16px">
    <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Imprimir</button>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body>
</html>`
}

export function abrirCierreCajaPrint(d: CajaCierrePrintData, autoPrint = true): void {
  const win = window.open('', '_blank', 'width=420,height=900,scrollbars=yes')
  if (!win) {
    alert('Permita ventanas emergentes para imprimir el cierre de caja.')
    return
  }
  win.document.open()
  win.document.write(htmlCierreCaja(d, typeof window !== 'undefined' ? window.location.origin : ''))
  win.document.close()
  win.focus()
  if (!autoPrint) return
}
