/** Controles anti-fraude para operaciones de caja */

export const MAX_CANTIDAD_VENTA = 99

export interface SucursalDescuento {
  tercera_edad?: number
  cuarta_edad?: number
  por_descuento_tercera?: number
  por_descuento_cuarta?: number
}

export function calcularEdad(fechaNac: string): number {
  const hoy = new Date()
  const nac = new Date(fechaNac)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

/** Descuento automático por edad según sucursal */
export function descuentoEdadPaciente(
  fechaNac: string | undefined | null,
  sucursal: SucursalDescuento | undefined | null,
): { pct: number; motivo: string; edad: number } {
  if (!fechaNac || !sucursal) return { pct: 0, motivo: '', edad: 0 }
  const edad = calcularEdad(fechaNac)
  const cuartaMin = sucursal.cuarta_edad ?? 80
  const terceraMin = sucursal.tercera_edad ?? 60
  const pctCuarta = sucursal.por_descuento_cuarta ?? 0
  const pctTercera = sucursal.por_descuento_tercera ?? 0
  if (cuartaMin > 0 && edad >= cuartaMin && pctCuarta > 0) {
    return { pct: pctCuarta, motivo: '4ta Edad', edad }
  }
  if (terceraMin > 0 && edad >= terceraMin && pctTercera > 0) {
    return { pct: pctTercera, motivo: '3ra Edad', edad }
  }
  return { pct: 0, motivo: '', edad }
}

/**
 * Enfermera (operador de caja): no puede superar el descuento automático.
 * Admin: puede aplicar más descuento con nota obligatoria.
 */
export function validarDescuento(
  pctSolicitado: number,
  pctMaximoAuto: number,
  esAdmin: boolean,
  nota?: string | null,
): { ok: boolean; pctAplicar: number; error?: string } {
  const pct = Math.max(0, Math.min(100, pctSolicitado || 0))
  if (pct <= pctMaximoAuto) return { ok: true, pctAplicar: pct }
  if (!esAdmin) {
    return {
      ok: false,
      pctAplicar: pctMaximoAuto,
      error: `El descuento máximo permitido es ${pctMaximoAuto}% (tercera/cuarta edad). Solicite un administrador para más descuento.`,
    }
  }
  if (!nota?.trim()) {
    return {
      ok: false,
      pctAplicar: pctMaximoAuto,
      error: 'Descuento superior al automático requiere observación del administrador.',
    }
  }
  return { ok: true, pctAplicar: pct }
}

export function requiereReferenciaPago(formaPago: string): boolean {
  return formaPago === 'TARJETA' || formaPago === 'TRANSFERENCIA'
}

export function validarReferenciaPago(formaPago: string, referencia?: string | null): string | null {
  if (!requiereReferenciaPago(formaPago)) return null
  if (!referencia?.trim()) {
    return formaPago === 'TARJETA'
      ? 'Ingrese el número de voucher de tarjeta'
      : 'Ingrese la referencia de transferencia'
  }
  return null
}

export function validarCreditoConPaciente(formaPago: string, pacienteId?: number | null): string | null {
  if (formaPago !== 'CREDITO') return null
  if (!pacienteId) return 'Las ventas a crédito requieren un paciente registrado'
  return null
}

export function validarSesionOperacion(
  sesion: { id: number; cajero_id?: string; estado?: string } | null,
  userId: string,
): string | null {
  if (!sesion) return 'Debe abrir la caja del día antes de operar'
  if (sesion.estado && sesion.estado !== 'ABIERTA') return 'La sesión de caja no está abierta'
  if (sesion.cajero_id && sesion.cajero_id !== userId) {
    return 'Solo quien abrió la sesión de caja puede registrar movimientos'
  }
  return null
}

export interface ItemVentaCatalogo {
  tipo: 'SERVICIO' | 'LAB' | 'MEDICAMENTO'
  refId: number
  nombre: string
  precio: number
  cantidad: number
}

export function validarItemsVentaCatalogo(
  items: ItemVentaCatalogo[],
  servicios: { id: number; nombre: string; precio: number }[],
  productos: { id: number; nombre: string; precio_venta: number }[],
  pruebasLab: { id: number; nombre: string; costo: number }[],
): { ok: boolean; items: ItemVentaCatalogo[]; error?: string } {
  if (!items.length) return { ok: false, items: [], error: 'Agregue ítems del catálogo' }

  const normalizados: ItemVentaCatalogo[] = []

  for (const item of items) {
    const cantidad = Math.min(MAX_CANTIDAD_VENTA, Math.max(1, Math.floor(item.cantidad || 1)))

    if (item.tipo === 'SERVICIO') {
      const s = servicios.find(x => x.id === item.refId)
      if (!s) return { ok: false, items: [], error: `Servicio no válido: ${item.nombre}` }
      normalizados.push({ tipo: 'SERVICIO', refId: s.id, nombre: s.nombre, precio: Number(s.precio), cantidad })
    } else if (item.tipo === 'MEDICAMENTO') {
      const p = productos.find(x => x.id === item.refId)
      if (!p) return { ok: false, items: [], error: `Medicamento no válido: ${item.nombre}` }
      if (Number(p.precio_venta) <= 0) return { ok: false, items: [], error: `${p.nombre} no tiene precio de venta` }
      normalizados.push({ tipo: 'MEDICAMENTO', refId: p.id, nombre: p.nombre, precio: Number(p.precio_venta), cantidad })
    } else {
      const l = pruebasLab.find(x => x.id === item.refId)
      if (!l) return { ok: false, items: [], error: `Prueba de lab no válida: ${item.nombre}` }
      normalizados.push({ tipo: 'LAB', refId: l.id, nombre: l.nombre, precio: Number(l.costo) || 0, cantidad })
    }
  }

  const total = normalizados.reduce((s, i) => s + i.precio * i.cantidad, 0)
  if (total <= 0) return { ok: false, items: [], error: 'El total a cobrar debe ser mayor a cero' }

  return { ok: true, items: normalizados }
}
