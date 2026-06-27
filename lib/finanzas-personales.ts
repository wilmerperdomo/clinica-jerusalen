/** Utilidades — finanzas personales y resumen total del negocio */



export type FinAmbito = 'CLINICA' | 'CASA' | 'PERSONAL'

export type FinFormaPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'



export type FinCategoria = {

  id: number

  tipo: 'INGRESO' | 'EGRESO'

  clave: string

  nombre: string

  icono?: string

  orden: number

  activo: boolean

  es_sistema?: boolean

}



export type FinMovimiento = {

  id: number

  tipo: 'INGRESO' | 'EGRESO'

  categoria_id?: number | null

  monto: number

  fecha: string

  descripcion: string

  referencia?: string | null

  sucursal_id?: number | null

  con_factura: boolean

  notas?: string | null

  ambito?: FinAmbito

  forma_pago?: FinFormaPago

  tarjeta_id?: number | null

  categoria?: FinCategoria | null

  tarjeta?: FinTarjeta | null

}



export type FinPrestamo = {

  id: number

  nombre: string

  acreedor?: string | null

  monto_original: number

  saldo_pendiente: number

  cuota_mensual?: number | null

  tasa_interes?: number | null

  fecha_inicio?: string | null

  fecha_fin?: string | null

  activo: boolean

  notas?: string | null

  tipo?: string

  ambito?: FinAmbito

}



export type FinTarjeta = {

  id: number

  alias: string

  banco?: string | null

  ultimos_digitos?: string | null

  limite_credito?: number | null

  saldo_actual: number

  pago_minimo?: number | null

  dia_corte?: number | null

  dia_pago?: number | null

  tasa_interes?: number | null

  color: string

  ambito: FinAmbito | 'MIXTO'

  activo: boolean

  notas?: string | null

}



export type FinDeuda = {

  id: number

  nombre: string

  acreedor?: string | null

  tipo: string

  ambito: FinAmbito

  monto_original: number

  saldo_pendiente: number

  fecha_vencimiento?: string | null

  activo: boolean

  notas?: string | null

}



export type ResumenPersonal = {

  ingresos: number

  egresos: number

  utilidad: number

  porCategoria: Record<string, number>

  porAmbito: Record<FinAmbito, { ingresos: number; egresos: number }>

}



export type ResumenDeudas = {

  prestamos: number

  tarjetas: number

  deudas: number

  cxpSistema: number

  total: number

}



export type ResumenTotalNegocio = {

  clinica: { ingresos: number; egresos: number; utilidad: number }

  personal: ResumenPersonal

  planillaReferencia: number

  gananciaReal: number

  deudas: ResumenDeudas

  patrimonioEstimado: number

}



export function fmtFin(n: number) {

  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`

}



const ambitoVacio = (): Record<FinAmbito, { ingresos: number; egresos: number }> => ({

  CLINICA: { ingresos: 0, egresos: 0 },

  CASA: { ingresos: 0, egresos: 0 },

  PERSONAL: { ingresos: 0, egresos: 0 },

})



export function calcularResumenPersonal(movimientos: FinMovimiento[]): ResumenPersonal {

  const porCategoria: Record<string, number> = {}

  const porAmbito = ambitoVacio()

  let ingresos = 0

  let egresos = 0



  for (const m of movimientos) {

    const monto = Number(m.monto) || 0

    const cat = m.categoria?.nombre ?? 'Sin categoría'

    const amb = (m.ambito ?? 'PERSONAL') as FinAmbito

    if (!porCategoria[cat]) porCategoria[cat] = 0



    if (m.tipo === 'INGRESO') {

      ingresos += monto

      porCategoria[cat] += monto

      if (porAmbito[amb]) porAmbito[amb].ingresos += monto

    } else {

      egresos += monto

      porCategoria[cat] -= monto

      if (porAmbito[amb]) porAmbito[amb].egresos += monto

    }

  }



  return { ingresos, egresos, utilidad: ingresos - egresos, porCategoria, porAmbito }

}



export function calcularResumenDeudas(opts: {

  prestamos: FinPrestamo[]

  tarjetas: FinTarjeta[]

  deudas: FinDeuda[]

  cxpSistema: number

}): ResumenDeudas {

  const prestamos = opts.prestamos.filter(p => p.activo).reduce((s, p) => s + Number(p.saldo_pendiente || 0), 0)

  const tarjetas = opts.tarjetas.filter(t => t.activo).reduce((s, t) => s + Number(t.saldo_actual || 0), 0)

  const deudas = opts.deudas.filter(d => d.activo).reduce((s, d) => s + Number(d.saldo_pendiente || 0), 0)

  const cxpSistema = opts.cxpSistema

  return { prestamos, tarjetas, deudas, cxpSistema, total: prestamos + tarjetas + deudas + cxpSistema }

}



export function calcularGananciaReal(opts: {

  clinicaUtilidad: number

  clinicaIngresos: number

  clinicaEgresos: number

  personal: ResumenPersonal

  planillaReferencia?: number

  deudas?: ResumenDeudas

}): ResumenTotalNegocio {

  const planillaReferencia = opts.planillaReferencia ?? 0

  const gananciaReal = opts.clinicaUtilidad + opts.personal.utilidad - planillaReferencia

  const deudas = opts.deudas ?? { prestamos: 0, tarjetas: 0, deudas: 0, cxpSistema: 0, total: 0 }



  return {

    clinica: {

      ingresos: opts.clinicaIngresos,

      egresos: opts.clinicaEgresos,

      utilidad: opts.clinicaUtilidad,

    },

    personal: opts.personal,

    planillaReferencia,

    gananciaReal,

    deudas,

    patrimonioEstimado: gananciaReal - deudas.total,

  }

}



export function pctUsoTarjeta(t: FinTarjeta): number | null {

  const lim = Number(t.limite_credito || 0)

  if (lim <= 0) return null

  return Math.round((Number(t.saldo_actual) / lim) * 100)

}



export function exportarMovimientosPersonalesCSV(

  movimientos: FinMovimiento[],

  periodo: string,

) {

  const BOM = '\uFEFF'

  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

  const rows = [

    [esc('Fecha'), esc('Tipo'), esc('Ámbito'), esc('Forma pago'), esc('Categoría'), esc('Descripción'), esc('Monto'), esc('Factura')].join(','),

    ...movimientos.map(m => [

      esc(m.fecha),

      esc(m.tipo),

      esc(m.ambito ?? 'PERSONAL'),

      esc(m.forma_pago ?? 'EFECTIVO'),

      esc(m.categoria?.nombre ?? ''),

      esc(m.descripcion),

      Number(m.monto).toFixed(2),

      esc(m.con_factura ? 'Sí' : 'No'),

    ].join(',')),

  ]

  const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })

  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')

  a.href = url

  a.download = `finanzas_personales_${periodo.replace(/\s+/g, '_')}.csv`

  document.body.appendChild(a)

  a.click()

  document.body.removeChild(a)

  URL.revokeObjectURL(url)

}

