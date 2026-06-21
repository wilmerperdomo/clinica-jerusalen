import { descuentoEdadPaciente } from '@/lib/caja-seguridad'
import { desglosarLineasCobro, type BeneficiosMembresia, type CategoriaCobro } from '@/lib/membresia-utils'
import type {
  DescuentoVentaInfo,
  FormMovimientoVenta,
  PacienteVenta,
  SucursalVenta,
  TipoVentaItem,
  VentaRapidaItem,
} from '@/lib/venta-rapida/types'

/** Mapea el tipo de ítem de venta rápida a la categoría de beneficios de membresía */
export function categoriaVenta(tipo: TipoVentaItem): CategoriaCobro {
  return tipo === 'LAB' ? 'laboratorio'
    : tipo === 'MEDICAMENTO' ? 'medicamentos'
      : 'servicios'
}

/** Total de la venta combinando descuento por edad + beneficios de membresía por categoría */
export function totalVentaConMembresia(
  items: VentaRapidaItem[],
  pctEdadAplicado: number,
  motivoEdad: string,
  beneficios?: BeneficiosMembresia | null,
): { subtotal: number; descTotal: number; total: number } {
  const desg = desglosarLineasCobro(
    items.map(it => ({ categoria: categoriaVenta(it.tipo), bruto: it.precio * it.cantidad })),
    pctEdadAplicado,
    motivoEdad,
    beneficios,
  )
  return { subtotal: desg.subtotal, descTotal: desg.descTotal, total: desg.total }
}

export function pctDescuentoMaximoPaciente(
  pacienteId: string,
  pacientes: PacienteVenta[],
  sucursal?: SucursalVenta,
): number {
  const pac = pacientes.find(p => p.id === Number(pacienteId))
  return descuentoEdadPaciente(pac?.fecha_nac, sucursal).pct
}

export function resolverDescuentoDesdePaciente(
  pac: PacienteVenta | undefined,
  sucursal?: SucursalVenta,
): { descuento: DescuentoVentaInfo | null; formPatch: Partial<FormMovimientoVenta> } {
  // El descuento por edad NUNCA se aplica automáticamente: se sugiere y la caja
  // debe confirmarlo (ver casilla en el modal). Por eso el formPatch siempre
  // deja descuento_pct en 0 y descuento_confirmado en false.
  const patchSinAplicar: Partial<FormMovimientoVenta> = {
    descuento_pct: '0',
    descuento_motivo: '',
    descuento_confirmado: false,
  }

  if (!pac?.fecha_nac) {
    return { descuento: null, formPatch: patchSinAplicar }
  }

  const desc = descuentoEdadPaciente(pac.fecha_nac, sucursal)

  // Fecha imposible/sospechosa: avisar a la caja, no sugerir descuento.
  if (desc.fechaSospechosa) {
    return {
      descuento: { pct: 0, motivo: '', edad: 0, fechaNac: pac.fecha_nac, fechaSospechosa: true },
      formPatch: patchSinAplicar,
    }
  }

  if (desc.pct <= 0) {
    return { descuento: null, formPatch: patchSinAplicar }
  }

  return {
    descuento: {
      pct: desc.pct,
      motivo: desc.motivo,
      edad: desc.edad,
      fechaNac: pac.fecha_nac,
      fechaSospechosa: false,
    },
    formPatch: patchSinAplicar,
  }
}

export function resolverDescuentoPaciente(
  pacienteId: string,
  pacientes: PacienteVenta[],
  sucursal?: SucursalVenta,
  pacienteDirecto?: PacienteVenta,
): { descuento: DescuentoVentaInfo | null; formPatch: Partial<FormMovimientoVenta> } {
  if (!pacienteId) {
    return { descuento: null, formPatch: { descuento_pct: '0', descuento_motivo: '' } }
  }

  const pac = pacienteDirecto ?? pacientes.find(p => p.id === Number(pacienteId))
  return resolverDescuentoDesdePaciente(pac, sucursal)
}

export function totalConDescuento(
  subtotal: number,
  descuentoPct: number,
  pctMaximo: number,
  esAdmin: boolean,
): number {
  const pct = Math.min(descuentoPct, esAdmin ? 100 : pctMaximo)
  return subtotal * (1 - pct / 100)
}
