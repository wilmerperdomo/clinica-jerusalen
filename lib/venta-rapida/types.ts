import type { LucideIcon } from 'lucide-react'
import type { PacienteBusqueda } from '@/components/buscar-paciente-input'

export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO'
export type TabCatalogoVenta = 'servicios' | 'laboratorio' | 'medicamentos'
export type TipoVentaItem = 'SERVICIO' | 'LAB' | 'MEDICAMENTO'

export interface VentaRapidaItem {
  key: string
  tipo: TipoVentaItem
  nombre: string
  precio: number
  cantidad: number
  refId: number
}

export interface FormMovimientoVenta {
  tipo: TipoMovimientoCaja
  concepto_id: string
  concepto_libre: string
  paciente_id: string
  paciente_nombre: string
  monto: string
  forma_pago: string
  referencia_pago: string
  nota: string
  descuento_pct: string
  descuento_motivo: string
}

export interface DescuentoVentaInfo {
  pct: number
  motivo: string
  edad: number
}

export interface ServicioCatalogo {
  id: number
  nombre: string
  tipo: string
  precio: number
}

export interface ProductoCatalogo {
  id: number
  codigo: string
  nombre: string
  precio_venta: number
  tipo?: string
}

export interface PruebaLabCatalogo {
  id: number
  nombre: string
  costo: number
}

export interface ConceptoEgreso {
  id: number
  nombre: string
  tipo: 'INGRESO' | 'EGRESO'
}

export interface SucursalVenta {
  id: number
  nombre: string
  tercera_edad?: number
  cuarta_edad?: number
  por_descuento_tercera?: number
  por_descuento_cuarta?: number
}

export interface SesionVenta {
  id: number
  sucursal_id?: number
  cajero_id?: string
  estado?: string
  total_ingresos: number
  total_egresos: number
}

export type PacienteVenta = PacienteBusqueda

/** Datos devueltos tras cobrar una venta rápida (para factura fiscal) */
export interface VentaRapidaIngresoOk {
  totalNeto: number
  subtotal: number
  descuentoPct: number
  descuentoMonto: number
  items: VentaRapidaItem[]
  pacienteId: number | null
  pacienteNombre: string | null
  formaPago: string
  paciente?: PacienteVenta
}

export interface TabCatalogoConfig {
  id: TabCatalogoVenta
  label: string
  icon: LucideIcon
}
