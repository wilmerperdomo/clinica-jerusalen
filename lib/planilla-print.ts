import { imprimirReporte, exportarCSV } from '@/lib/reporte-utils'
import { fmtL, labelQuincena } from '@/lib/planilla-utils'

export type EstadoLiquidacion = 'PENDIENTE' | 'APROBADO' | 'PAGADO' | 'RETENIDO' | 'ANULADO'

export type AjustePlanilla = {
  tipo: string
  descripcion: string
  monto: number
}

export type LiquidacionPrint = {
  id?: number
  empleadoNombre: string
  tipoNomina: string
  sueldoFijo: number
  totalComisiones: number
  bonificaciones: number
  deducciones: number
  totalPagar: number
  estado: EstadoLiquidacion
  ajustes?: AjustePlanilla[]
  detalleComisiones?: { descripcion: string; monto: number; comision: number }[]
}

const ESTADO_LABEL: Record<EstadoLiquidacion, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  PAGADO: 'Pagado',
  RETENIDO: 'Retenido',
  ANULADO: 'Anulado',
}

export function imprimirReciboPlanilla(
  liq: LiquidacionPrint,
  periodo: { quincena: 1 | 2; mes: number; anio: number },
  sucursalNombre?: string,
) {
  const detalle = (liq.detalleComisiones ?? []).map(d => `
    <tr>
      <td>${d.descripcion}</td>
      <td class="right">${fmtL(d.monto)}</td>
      <td class="right bold">${fmtL(d.comision)}</td>
    </tr>
  `).join('')

  const ajustes = (liq.ajustes ?? []).map(a => `
    <tr>
      <td>${a.tipo}</td>
      <td>${a.descripcion}</td>
      <td class="right ${a.monto < 0 ? 'danger' : 'success'}">${fmtL(a.monto)}</td>
    </tr>
  `).join('')

  const html = `
    <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:12px">
      <p><strong>Empleado:</strong> ${liq.empleadoNombre}</p>
      <p><strong>Tipo:</strong> ${liq.tipoNomina} · <strong>Estado:</strong> ${ESTADO_LABEL[liq.estado]}</p>
      ${sucursalNombre ? `<p><strong>Sucursal:</strong> ${sucursalNombre}</p>` : ''}
    </div>
    <table>
      <tr><td>Sueldo quincenal</td><td class="right bold">${fmtL(liq.sueldoFijo)}</td></tr>
      <tr><td>Comisiones</td><td class="right bold">${fmtL(liq.totalComisiones)}</td></tr>
      <tr><td>Bonificaciones</td><td class="right success">${fmtL(liq.bonificaciones)}</td></tr>
      <tr><td>Deducciones</td><td class="right danger">−${fmtL(liq.deducciones)}</td></tr>
      <tr class="total-row"><td>Total a pagar</td><td class="right">${fmtL(liq.totalPagar)}</td></tr>
    </table>
    ${detalle ? `<h2>Detalle comisiones</h2><table><thead><tr><th>Concepto</th><th class="right">Base</th><th class="right">Comisión</th></tr></thead><tbody>${detalle}</tbody></table>` : ''}
    ${ajustes ? `<h2>Ajustes</h2><table><thead><tr><th>Tipo</th><th>Descripción</th><th class="right">Monto</th></tr></thead><tbody>${ajustes}</tbody></table>` : ''}
    <div style="margin-top:40px;display:flex;justify-content:space-between">
      <div style="width:40%;border-top:1px solid #333;padding-top:4px;text-align:center;font-size:10px">Firma empleado</div>
      <div style="width:40%;border-top:1px solid #333;padding-top:4px;text-align:center;font-size:10px">Firma administración</div>
    </div>
  `

  imprimirReporte({
    titulo: 'Recibo de Planilla',
    subtitulo: labelQuincena(periodo.quincena, periodo.mes, periodo.anio),
    contenidoHtml: html,
  })
}

export function exportarPlanillaCSV(
  filas: LiquidacionPrint[],
  periodo: { quincena: 1 | 2; mes: number; anio: number },
) {
  exportarCSV(
    `planilla_Q${periodo.quincena}_${periodo.mes}_${periodo.anio}`,
    ['Empleado', 'Tipo', 'Sueldo Q', 'Comisiones', 'Bonos', 'Deducciones', 'Total', 'Estado'],
    filas.map(f => [
      f.empleadoNombre,
      f.tipoNomina,
      f.sueldoFijo.toFixed(2),
      f.totalComisiones.toFixed(2),
      f.bonificaciones.toFixed(2),
      f.deducciones.toFixed(2),
      f.totalPagar.toFixed(2),
      ESTADO_LABEL[f.estado],
    ]),
  )
}

export function imprimirPlanillaCompleta(
  filas: LiquidacionPrint[],
  periodo: { quincena: 1 | 2; mes: number; anio: number },
  sucursalNombre?: string,
) {
  const rows = filas.map(f => `
    <tr>
      <td>${f.empleadoNombre}</td>
      <td>${f.tipoNomina}</td>
      <td class="right">${fmtL(f.sueldoFijo)}</td>
      <td class="right">${fmtL(f.totalComisiones)}</td>
      <td class="right success">${fmtL(f.bonificaciones)}</td>
      <td class="right danger">${fmtL(f.deducciones)}</td>
      <td class="right bold">${fmtL(f.totalPagar)}</td>
      <td>${ESTADO_LABEL[f.estado]}</td>
    </tr>
  `).join('')

  const total = filas.reduce((s, f) => s + f.totalPagar, 0)

  imprimirReporte({
    titulo: 'Liquidación de Planilla',
    subtitulo: `${labelQuincena(periodo.quincena, periodo.mes, periodo.anio)}${sucursalNombre ? ` · ${sucursalNombre}` : ''}`,
    contenidoHtml: `
      <table>
        <thead>
          <tr>
            <th>Empleado</th><th>Tipo</th><th class="right">Sueldo Q</th>
            <th class="right">Comisiones</th><th class="right">Bonos</th>
            <th class="right">Deducciones</th><th class="right">Total</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="6">Total planilla</td>
            <td class="right">${fmtL(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `,
    orientacion: 'landscape',
  })
}
