import { FlaskConical, Pill, Stethoscope } from 'lucide-react'

import type { FormMovimientoVenta, TabCatalogoConfig } from '@/lib/venta-rapida/types'

export const FORM_MOV_VACIO: FormMovimientoVenta = {
  tipo: 'INGRESO',
  concepto_id: '',
  concepto_libre: '',
  paciente_id: '',
  paciente_nombre: '',
  monto: '',
  forma_pago: 'EFECTIVO',
  referencia_pago: '',
  nota: '',
  descuento_pct: '0',
  descuento_motivo: '',
}

export const TABS_CATALOGO_VENTA: TabCatalogoConfig[] = [
  { id: 'servicios',    label: 'Servicios',    icon: Stethoscope  },
  { id: 'laboratorio',  label: 'Laboratorio',  icon: FlaskConical },
  { id: 'medicamentos', label: 'Medicamentos', icon: Pill         },
]

export const PREFIJOS_CONCEPTO_VENTA = {
  SERVICIO: 'Servicio',
  LAB: 'Laboratorio',
  MEDICAMENTO: 'Medicamento',
} as const

export const LIMITE_RESULTADOS_CATALOGO = 15
