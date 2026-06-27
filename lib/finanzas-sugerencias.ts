/** Motor de sugerencias — qué más conviene registrar */

import type { FinCategoria, FinMovimiento, FinPrestamo, FinTarjeta, FinDeuda } from './finanzas-personales'

export type PrioridadSugerencia = 'alta' | 'media' | 'baja'

export type SugerenciaFin = {
  id: string
  prioridad: PrioridadSugerencia
  titulo: string
  descripcion: string
  tab?: 'movimientos' | 'tarjetas' | 'deudas' | 'prestamos' | 'clinica' | 'presupuesto' | 'flujo' | 'cajas' | 'ejecutivo'
  icono?: string
}

export type ContextoSugerencias = {
  movimientos: FinMovimiento[]
  categorias: FinCategoria[]
  tarjetas: FinTarjeta[]
  prestamos: FinPrestamo[]
  deudas: FinDeuda[]
  cxcPendiente: number
  cxpPendiente: number
  planillaMes: number
  comprasMes: number
  anio: number
  mes: number
}

const CHECKLIST_MENSUAL: { clave: string; titulo: string; ambito: string; tab: SugerenciaFin['tab'] }[] = [
  { clave: 'COMBUSTIBLE', titulo: 'Combustible / transporte', ambito: 'CLINICA', tab: 'movimientos' },
  { clave: 'MEDICAMENTOS_SF', titulo: 'Medicamentos sin factura', ambito: 'CLINICA', tab: 'movimientos' },
  { clave: 'SERVICIOS_BASIC', titulo: 'Luz, agua, internet (casa)', ambito: 'CASA', tab: 'movimientos' },
  { clave: 'CASA_ARRIENDO', titulo: 'Arriendo o hipoteca de casa', ambito: 'CASA', tab: 'movimientos' },
  { clave: 'CASA_ALIMENTOS', titulo: 'Supermercado / alimentos', ambito: 'CASA', tab: 'movimientos' },
  { clave: 'AMBULANCIA', titulo: 'Ingresos por ambulancia', ambito: 'CLINICA', tab: 'movimientos' },
  { clave: 'ATAUDES', titulo: 'Venta de ataúdes', ambito: 'CLINICA', tab: 'movimientos' },
  { clave: 'CLINICA_EXTRA', titulo: 'Gastos clínica en efectivo', ambito: 'CLINICA', tab: 'movimientos' },
]

function diasHasta(diaMes: number | null | undefined, hoy = new Date()): number | null {
  if (!diaMes || diaMes < 1 || diaMes > 31) return null
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  let target = new Date(y, m, diaMes)
  if (target < hoy) target = new Date(y, m + 1, diaMes)
  return Math.ceil((target.getTime() - hoy.getTime()) / 86400000)
}

function tieneCategoria(movs: FinMovimiento[], clave: string, categorias: FinCategoria[]): boolean {
  const cat = categorias.find(c => c.clave === clave)
  if (!cat) return false
  return movs.some(m => m.categoria_id === cat.id || m.categoria?.clave === clave)
}

export function generarSugerencias(ctx: ContextoSugerencias): SugerenciaFin[] {
  const out: SugerenciaFin[] = []

  if (ctx.tarjetas.length === 0) {
    out.push({
      id: 'sin-tarjetas',
      prioridad: 'alta',
      titulo: 'Registre sus tarjetas de crédito',
      descripcion: 'Agregue cada tarjeta con límite, saldo, día de corte y día de pago. Así controla cuánto debe y cuándo pagar.',
      tab: 'tarjetas',
      icono: 'credit-card',
    })
  }

  for (const t of ctx.tarjetas.filter(x => x.activo)) {
    const limite = Number(t.limite_credito || 0)
    const saldo = Number(t.saldo_actual || 0)
    if (limite > 0 && saldo / limite >= 0.8) {
      out.push({
        id: `tarjeta-limite-${t.id}`,
        prioridad: 'alta',
        titulo: `${t.alias}: saldo al ${Math.round((saldo / limite) * 100)}% del límite`,
        descripcion: `Saldo ${saldo.toLocaleString('es-HN')} de límite ${limite.toLocaleString('es-HN')}. Conviene abonar antes del corte.`,
        tab: 'tarjetas',
        icono: 'alert',
      })
    }
    const diasPago = diasHasta(t.dia_pago)
    if (diasPago !== null && diasPago <= 7 && saldo > 0) {
      out.push({
        id: `tarjeta-pago-${t.id}`,
        prioridad: diasPago <= 3 ? 'alta' : 'media',
        titulo: `Pago de ${t.alias} en ${diasPago} día(s)`,
        descripcion: `Saldo pendiente: L. ${saldo.toLocaleString('es-HN')}. Registre el pago cuando lo haga.`,
        tab: 'tarjetas',
        icono: 'calendar',
      })
    }
  }

  for (const item of CHECKLIST_MENSUAL) {
    if (!tieneCategoria(ctx.movimientos, item.clave, ctx.categorias)) {
      out.push({
        id: `check-${item.clave}`,
        prioridad: item.ambito === 'CLINICA' ? 'media' : 'baja',
        titulo: `¿Registró ${item.titulo}?`,
        descripcion: `No hay movimientos de "${item.titulo}" este mes (${item.ambito === 'CASA' ? 'casa' : 'clínica'}). Si hubo gasto o ingreso, regístrelo para cuadrar su ganancia real.`,
        tab: item.tab,
        icono: 'clipboard',
      })
    }
  }

  const egresosCasa = ctx.movimientos.filter(m => m.tipo === 'EGRESO' && m.ambito === 'CASA')
  const egresosClinicaManual = ctx.movimientos.filter(m => m.tipo === 'EGRESO' && m.ambito === 'CLINICA')
  if (egresosCasa.length === 0) {
    out.push({
      id: 'sin-gastos-casa',
      prioridad: 'media',
      titulo: 'Sin gastos de casa este mes',
      descripcion: 'Registre arriendo, servicios, supermercado y gastos familiares con ámbito "Casa" para separarlos de la clínica.',
      tab: 'movimientos',
      icono: 'home',
    })
  }
  if (egresosClinicaManual.length === 0 && ctx.comprasMes > 0) {
    out.push({
      id: 'compras-sin-manual',
      prioridad: 'baja',
      titulo: 'Compras en sistema vs gastos en efectivo',
      descripcion: `Hay L. ${ctx.comprasMes.toLocaleString('es-HN')} en compras a proveedores. Si pagó algo de la clínica en efectivo sin factura, regístrelo en movimientos (ámbito Clínica).`,
      tab: 'movimientos',
      icono: 'building',
    })
  }

  if (ctx.cxpPendiente > 5000) {
    out.push({
      id: 'cxp-alta',
      prioridad: 'alta',
      titulo: 'Cuentas por pagar pendientes elevadas',
      descripcion: `L. ${ctx.cxpPendiente.toLocaleString('es-HN')} por pagar a proveedores. Revise el módulo CXP y programe pagos.`,
      tab: 'deudas',
      icono: 'trending-down',
    })
  }

  if (ctx.cxcPendiente > 5000) {
    out.push({
      id: 'cxc-alta',
      prioridad: 'media',
      titulo: 'Dinero por cobrar a clientes',
      descripcion: `L. ${ctx.cxcPendiente.toLocaleString('es-HN')} en cuentas por cobrar. Cobre morosos para mejorar flujo de caja.`,
      tab: 'clinica',
      icono: 'trending-up',
    })
  }

  if (ctx.planillaMes > 0 && !tieneCategoria(ctx.movimientos, 'PRESTAMOS', ctx.categorias)) {
    const tieneNominaCaja = ctx.movimientos.some(m =>
      m.descripcion?.toLowerCase().includes('nomina') || m.descripcion?.toLowerCase().includes('planilla'),
    )
    if (!tieneNominaCaja) {
      out.push({
        id: 'planilla-ref',
        prioridad: 'media',
        titulo: 'Planilla del mes registrada en sistema',
        descripcion: `Referencia planilla: L. ${ctx.planillaMes.toLocaleString('es-HN')}. La ganancia real ya la descuenta; no hace falta duplicar salarios si salieron de caja.`,
        tab: 'clinica',
        icono: 'users',
      })
    }
  }

  const saldoPrestamos = ctx.prestamos.filter(p => p.activo).reduce((s, p) => s + Number(p.saldo_pendiente || 0), 0)
  const saldoDeudas = ctx.deudas.filter(d => d.activo).reduce((s, d) => s + Number(d.saldo_pendiente || 0), 0)
  const saldoTarjetas = ctx.tarjetas.filter(t => t.activo).reduce((s, t) => s + Number(t.saldo_actual || 0), 0)
  const deudaTotal = saldoPrestamos + saldoDeudas + saldoTarjetas + ctx.cxpPendiente

  if (deudaTotal > 0 && ctx.prestamos.length === 0 && ctx.deudas.length === 0) {
    out.push({
      id: 'registrar-deudas',
      prioridad: 'alta',
      titulo: 'Registre préstamos y deudas personales',
      descripcion: 'Banco, vehículo, deudas con personas o proveedores informales — así ve su pasivo total en un solo lugar.',
      tab: 'deudas',
      icono: 'landmark',
    })
  }

  for (const d of ctx.deudas.filter(x => x.activo && x.fecha_vencimiento)) {
    const venc = new Date(d.fecha_vencimiento!)
    const dias = Math.ceil((venc.getTime() - Date.now()) / 86400000)
    if (dias >= 0 && dias <= 14) {
      out.push({
        id: `deuda-vence-${d.id}`,
        prioridad: dias <= 5 ? 'alta' : 'media',
        titulo: `Deuda "${d.nombre}" vence en ${dias} día(s)`,
        descripcion: `Saldo: L. ${Number(d.saldo_pendiente).toLocaleString('es-HN')}. Acreedor: ${d.acreedor || '—'}`,
        tab: 'deudas',
        icono: 'clock',
      })
    }
  }

  const orden: Record<PrioridadSugerencia, number> = { alta: 0, media: 1, baja: 2 }
  return out.sort((a, b) => orden[a.prioridad] - orden[b.prioridad])
}

export const AMBITO_LABELS: Record<string, string> = {
  CLINICA: 'Clínica',
  CASA: 'Casa',
  PERSONAL: 'Personal',
  MIXTO: 'Mixto',
}

export const FORMA_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
}
