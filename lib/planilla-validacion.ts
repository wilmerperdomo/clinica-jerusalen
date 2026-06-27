import { sueldoQuincena } from '@/lib/planilla-utils'

export type EmpleadoPlanilla = {
  id: string
  nombre: string
  apellido?: string
  tipo_nomina: string
  sueldo_fijo?: number
}

export type MedicoProduccion = {
  id: string
  nombre: string
  lineas: number
  comision: number
}

export type AlertaCierre = {
  tipo: 'error' | 'warning' | 'info'
  mensaje: string
}

export function validarCierrePlanilla(opts: {
  medicos: MedicoProduccion[]
  fijos: EmpleadoPlanilla[]
  quincena: 1 | 2
}): AlertaCierre[] {
  const alertas: AlertaCierre[] = []

  const medicosSinProd = opts.medicos.filter(m => m.lineas === 0)
  if (medicosSinProd.length > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: `${medicosSinProd.length} médico(s) sin producción en este período.`,
    })
  }

  const fijosPlanilla = opts.fijos.filter(e =>
    ['ENFERMERA', 'ADMINISTRATIVO'].includes(e.tipo_nomina),
  )

  const sinTipo = opts.fijos.filter(e => e.tipo_nomina === 'NINGUNO')
  if (sinTipo.length > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: `${sinTipo.length} empleado(s) sin tipo de nómina asignado (no entrarán a liquidación).`,
    })
  }

  const sueldoCero = fijosPlanilla.filter(e => !e.sueldo_fijo || Number(e.sueldo_fijo) <= 0)
  if (sueldoCero.length > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: `${sueldoCero.length} empleado(s) de planilla fija con sueldo en L 0.00.`,
    })
  }

  const totalCom = opts.medicos.reduce((s, m) => s + m.comision, 0)
  const totalFijos = fijosPlanilla.reduce(
    (s, e) => s + sueldoQuincena(Number(e.sueldo_fijo || 0), opts.quincena),
    0,
  )

  if (totalCom <= 0 && totalFijos <= 0) {
    alertas.push({
      tipo: 'error',
      mensaje: 'No hay comisiones ni sueldos fijos para liquidar en este período.',
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      tipo: 'info',
      mensaje: 'Todo listo para cerrar la quincena.',
    })
  }

  return alertas
}
