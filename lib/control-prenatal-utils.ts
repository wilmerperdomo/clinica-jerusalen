/** Control prenatal — serie de visitas por embarazo */

import { addDays } from '@/lib/agenda-utils'
import { calcularFPP, calcularSemanasGestacion } from '@/lib/consulta-especialidad-utils'
import type { FormSeguimiento } from '@/lib/consulta-seguimiento-utils'

export interface FormControlPrenatal {
  num_control: string
  semanas_gestacion: string
  peso_materno: string
  presion_arterial: string
  fcf: string
  altura_uterina: string
  proteinuria: string
  edema: string
  usg_resumen: string
  labs_notas: string
  notas: string
}

export interface ControlPrenatalRow extends FormControlPrenatal {
  consulta_id: number
  embarazo_id?: number | null
  fecha?: string
}

export function formControlPrenatalVacio(semanas?: number | null, numControl = 1): FormControlPrenatal {
  return {
    num_control: String(numControl),
    semanas_gestacion: semanas != null ? String(semanas) : '',
    peso_materno: '',
    presion_arterial: '',
    fcf: '',
    altura_uterina: '',
    proteinuria: '',
    edema: '',
    usg_resumen: '',
    labs_notas: '',
    notas: '',
  }
}

export function mapControlPrenatalFromDb(row: Record<string, unknown>): FormControlPrenatal {
  return {
    num_control: row.num_control != null ? String(row.num_control) : '1',
    semanas_gestacion: row.semanas_gestacion != null ? String(row.semanas_gestacion) : '',
    peso_materno: row.peso_materno != null ? String(row.peso_materno) : '',
    presion_arterial: String(row.presion_arterial ?? ''),
    fcf: row.fcf != null ? String(row.fcf) : '',
    altura_uterina: row.altura_uterina != null ? String(row.altura_uterina) : '',
    proteinuria: String(row.proteinuria ?? ''),
    edema: String(row.edema ?? ''),
    usg_resumen: String(row.usg_resumen ?? ''),
    labs_notas: String(row.labs_notas ?? ''),
    notas: String(row.notas ?? ''),
  }
}

function numOrNull(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

export function payloadControlPrenatal(
  consultaId: number,
  embarazoId: number | null,
  form: FormControlPrenatal,
) {
  return {
    consulta_id: consultaId,
    embarazo_id: embarazoId,
    num_control: numOrNull(form.num_control),
    semanas_gestacion: numOrNull(form.semanas_gestacion),
    peso_materno: numOrNull(form.peso_materno),
    presion_arterial: form.presion_arterial.trim() || null,
    fcf: numOrNull(form.fcf),
    altura_uterina: numOrNull(form.altura_uterina),
    proteinuria: form.proteinuria.trim() || null,
    edema: form.edema.trim() || null,
    usg_resumen: form.usg_resumen.trim() || null,
    labs_notas: form.labs_notas.trim() || null,
    notas: form.notas.trim() || null,
  }
}

export function payloadEmbarazo(pacienteId: number, fum: string, fpp?: string) {
  const fppCalc = fpp || (fum ? calcularFPP(fum) : null)
  return {
    paciente_id: pacienteId,
    fum: fum || null,
    fpp: fppCalc || null,
    activo: true,
    fecha_registro: new Date().toISOString().slice(0, 10),
  }
}

/** Días hasta el próximo control según semanas de gestación */
export function diasProximoControlPrenatal(semanas: number): number {
  if (semanas < 28) return 28
  if (semanas < 36) return 14
  return 7
}

export function fechaProximoControlPrenatal(fechaBase: string, semanas: number): string {
  return addDays(fechaBase, diasProximoControlPrenatal(semanas))
}

/** Sugiere seguimiento prenatal al finalizar consulta */
export function sugerirSeguimientoPrenatal(
  fechaHoy: string,
  semanas: number,
  servicioPrenatalId: string,
): FormSeguimiento {
  const fecha = fechaProximoControlPrenatal(fechaHoy, semanas)
  return {
    activo: true,
    fecha,
    hora: '09:00',
    motivo: 'prenatal',
    motivoOtro: '',
    prioridad: semanas >= 36 ? 'urgente' : 'normal',
    notaRecepcion: `Control prenatal — semana ${semanas}`,
    servicioId: servicioPrenatalId,
    enviarWhatsApp: false,
  }
}

export function semanasDesdeFum(fum: string, fechaRef = new Date()): number | null {
  return calcularSemanasGestacion(fum, fechaRef)
}

export function siguienteNumControl(controlesExistentes: number): number {
  return Math.max(1, controlesExistentes + 1)
}
