import { descuentoEdadPaciente } from '@/lib/caja-seguridad'
import type {
  DescuentoVentaInfo,
  FormMovimientoVenta,
  PacienteVenta,
  SucursalVenta,
} from '@/lib/venta-rapida/types'

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
  if (!pac?.fecha_nac) {
    return { descuento: null, formPatch: { descuento_pct: '0', descuento_motivo: '' } }
  }

  const desc = descuentoEdadPaciente(pac.fecha_nac, sucursal)
  if (desc.pct <= 0) {
    return { descuento: null, formPatch: { descuento_pct: '0', descuento_motivo: '' } }
  }

  return {
    descuento: { pct: desc.pct, motivo: desc.motivo, edad: desc.edad },
    formPatch: { descuento_pct: String(desc.pct), descuento_motivo: desc.motivo },
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
