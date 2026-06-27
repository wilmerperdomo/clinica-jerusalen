import type { FacturaPrintData } from '@/lib/factura-print'
import type { ItemCotizacion } from '@/lib/cotizacion-utils'

/** Texto genérico en factura fiscal (sin nombre del fármaco). */
export const ETIQUETA_MEDICAMENTO_FACTURA = 'Medicamento'

export interface ItemFacturaMedicamento {
  descripcion: string
  cantidad: number
  precio_unitario: number
  isv_pct: number
  subtotal: number
  tipo_item?: string
  nombre_real?: string
  es_medicamento?: boolean
}

function parseItemsJson(items: unknown): ItemFacturaMedicamento[] {
  if (!items) return []
  let raw = items
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw as ItemFacturaMedicamento[]
}

/** Detecta si una línea de factura corresponde a medicamento. */
export function esItemMedicamento(item: {
  tipo_item?: string
  tipo?: string
  es_medicamento?: boolean
  descripcion?: string
}): boolean {
  if (item.es_medicamento) return true
  const tipo = item.tipo_item ?? item.tipo
  if (tipo === 'MEDICAMENTO') return true
  const d = String(item.descripcion ?? '').trim()
  // "Medicamento", "Medicamentos", "Medicamento — X" o "Medicamento Acetaminofén"
  if (/^medicamentos?\b/i.test(d)) return true
  return false
}

/**
 * ISV % seguro para una línea: los medicamentos son exentos por ley en Honduras,
 * así que SIEMPRE retornan 0, sin importar el toggle de la factura ni la
 * configuración del producto. Para el resto se respeta `pctSiGravado`.
 */
export function isvPctSeguroMedicamento(
  item: { tipo_item?: string; tipo?: string; es_medicamento?: boolean; descripcion?: string },
  pctSiGravado: number,
): number {
  return esItemMedicamento(item) ? 0 : pctSiGravado
}

/** Obtiene el nombre real del medicamento (metadata o descripción legada). */
export function extraerNombreRealMedicamento(item: {
  descripcion?: string
  nombre_real?: string
}): string | undefined {
  if (item.nombre_real?.trim()) return item.nombre_real.trim()
  const d = String(item.descripcion ?? '').trim()
  const m = d.match(/^Medicamentos?\s*[—–-]\s*(.+)$/i)
  return m?.[1]?.trim() || undefined
}

/** Descripción a imprimir según preferencia del paciente. */
export function descripcionMedicamentoFactura(
  nombreReal: string | undefined,
  mostrarNombre: boolean,
): string {
  if (!mostrarNombre || !nombreReal) return ETIQUETA_MEDICAMENTO_FACTURA
  return `${ETIQUETA_MEDICAMENTO_FACTURA} — ${nombreReal}`
}

export function facturaTieneMedicamentos(items: unknown): boolean {
  return parseItemsJson(items).some(esItemMedicamento)
}

/**
 * Línea de medicamento para insertar en facturas.
 * El ISV se fija siempre en 0 (medicamento exento por ley).
 */
export function itemMedicamentoParaFactura(params: {
  nombreReal: string
  cantidad: number
  precio_unitario: number
}): ItemFacturaMedicamento {
  const subtotal = params.precio_unitario * params.cantidad
  return {
    descripcion: ETIQUETA_MEDICAMENTO_FACTURA,
    cantidad: params.cantidad,
    precio_unitario: params.precio_unitario,
    isv_pct: 0,
    subtotal,
    tipo_item: 'MEDICAMENTO',
    nombre_real: params.nombreReal,
    es_medicamento: true,
  }
}

/** Ítems de cotización → factura (descripción anonimizada, nombre_real guardado). */
export function prepararItemsCotizacionParaBd(items: ItemCotizacion[]): ItemFacturaMedicamento[] {
  return items.map(it => {
    if (it.tipo === 'MEDICAMENTO') {
      return {
        descripcion: ETIQUETA_MEDICAMENTO_FACTURA,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        isv_pct: 0,
        subtotal: it.subtotal,
        tipo_item: 'MEDICAMENTO',
        nombre_real: it.descripcion,
        es_medicamento: true,
      }
    }
    return {
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      isv_pct: it.isv_pct,
      subtotal: it.subtotal,
    }
  })
}

/** Asegura descripción anonimizada en BD conservando nombre_real. */
export function prepararItemsMedicamentosParaBd<T extends ItemFacturaMedicamento>(
  items: T[],
): T[] {
  return items.map(it => {
    if (!esItemMedicamento(it)) return it
    const nombreReal = extraerNombreRealMedicamento(it) ?? it.descripcion
    return {
      ...it,
      descripcion: ETIQUETA_MEDICAMENTO_FACTURA,
      tipo_item: 'MEDICAMENTO',
      nombre_real: nombreReal,
      es_medicamento: true,
    }
  })
}

/** Transforma ítems solo para impresión (no modifica el registro en BD). */
export function itemsFacturaParaImpresion<T extends ItemFacturaMedicamento>(
  items: T[],
  mostrarNombresMedicamentos: boolean,
): T[] {
  return items.map(it => {
    if (!esItemMedicamento(it)) return it
    const nombreReal = extraerNombreRealMedicamento(it)
    return {
      ...it,
      descripcion: descripcionMedicamentoFactura(nombreReal, mostrarNombresMedicamentos),
    }
  })
}

/** Aplica privacidad de medicamentos al payload de impresión térmica. */
export function aplicarPrivacidadMedicamentosImpresion(
  printData: FacturaPrintData,
  mostrarNombresMedicamentos: boolean,
): FacturaPrintData {
  const items = parseItemsJson(printData.items)
  if (!items.some(esItemMedicamento)) return printData
  return {
    ...printData,
    items: itemsFacturaParaImpresion(items, mostrarNombresMedicamentos),
  }
}
