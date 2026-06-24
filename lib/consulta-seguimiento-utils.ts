import { addDays, hayConflicto } from '@/lib/agenda-utils'

export type PrioridadSeguimiento = 'normal' | 'urgente'

export interface FormSeguimiento {
  activo: boolean
  fecha: string
  hora: string
  motivo: string
  motivoOtro: string
  prioridad: PrioridadSeguimiento
  notaRecepcion: string
  servicioId: string
  enviarWhatsApp: boolean
}

export const MOTIVOS_SEGUIMIENTO = [
  { value: 'revision', label: 'Revisión / control de evolución' },
  { value: 'prenatal', label: 'Control prenatal' },
  { value: 'postoperatorio', label: 'Seguimiento post-operatorio' },
  { value: 'cronicos', label: 'Control de crónicos (HTA, DM, etc.)' },
  { value: 'laboratorio', label: 'Revisión de resultados de laboratorio' },
  { value: 'otro', label: 'Otro motivo' },
] as const

export const ATAJOS_SEGUIMIENTO = [
  { dias: 1, label: 'Mañana' },
  { dias: 3, label: '3 días' },
  { dias: 7, label: '7 días' },
  { dias: 15, label: '15 días' },
  { dias: 30, label: '1 mes' },
] as const

export function formSeguimientoInicial(fechaBase: string, servicioId = ''): FormSeguimiento {
  return {
    activo: false,
    fecha: addDays(fechaBase, 7),
    hora: '09:00',
    motivo: 'revision',
    motivoOtro: '',
    prioridad: 'normal',
    notaRecepcion: '',
    servicioId,
    enviarWhatsApp: false,
  }
}

export function aplicarAtajoSeguimiento(
  form: FormSeguimiento,
  fechaBase: string,
  dias: number,
): FormSeguimiento {
  return { ...form, fecha: addDays(fechaBase, dias) }
}

export function textoMotivoSeguimiento(form: FormSeguimiento): string {
  if (form.motivo === 'otro') return form.motivoOtro.trim()
  return MOTIVOS_SEGUIMIENTO.find(m => m.value === form.motivo)?.label ?? ''
}

export function construirNotaCitaSeguimiento(form: FormSeguimiento, consultaId: number): string {
  const partes: string[] = []
  if (form.prioridad === 'urgente') partes.push('[URGENTE]')
  const motivo = textoMotivoSeguimiento(form)
  if (motivo) partes.push(motivo)
  const nota = form.notaRecepcion.trim()
  if (nota) partes.push(nota)
  partes.push(`Seguimiento — consulta #${consultaId}`)
  return partes.join(' · ')
}

export function validarFormSeguimiento(form: FormSeguimiento, fechaHoy: string): string | null {
  if (!form.activo) return null
  if (!form.fecha) return 'Indique la fecha de la próxima cita.'
  if (!form.hora) return 'Indique la hora de la próxima cita.'
  if (form.fecha < fechaHoy) return 'La fecha de seguimiento debe ser hoy o posterior.'
  if (form.motivo === 'otro' && !form.motivoOtro.trim()) {
    return 'Describa el motivo de la próxima cita.'
  }
  return null
}

export interface CitaSeguimientoCreada {
  id: number
  fecha: string
  hora: string
  nota?: string | null
  servicio_nombre?: string | null
}

interface CrearCitaSeguimientoOpts {
  pacienteId: number
  sucursalId: number | null
  consultaId: number
  form: FormSeguimiento
  servicioId: number | null
  servicioNombre: string | null
  fechaHoy: string
  confirmConflicto?: () => Promise<boolean>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearCitaSeguimiento(
  sb: { from: (t: string) => any },
  opts: CrearCitaSeguimientoOpts,
): Promise<{ error?: string; cita?: CitaSeguimientoCreada }> {
  const { pacienteId, sucursalId, consultaId, form, servicioId, servicioNombre, fechaHoy, confirmConflicto } = opts
  const validacion = validarFormSeguimiento(form, fechaHoy)
  if (validacion) return { error: validacion }

  const { data: dup } = await sb.from('citas')
    .select('id')
    .eq('paciente_id', pacienteId)
    .eq('fecha', form.fecha)
    .not('estado', 'in', '("CANCELADO","NO ASISTIÓ","NO ASISTIO")')
    .maybeSingle()
  if (dup) {
    return { error: 'Este paciente ya tiene una cita activa en la fecha seleccionada.' }
  }

  const { data: citasDia } = await sb.from('citas')
    .select('id,fecha,hora,estado')
    .eq('fecha', form.fecha)

  if (hayConflicto(citasDia ?? [], form.fecha, form.hora)) {
    if (confirmConflicto) {
      const ok = await confirmConflicto()
      if (!ok) return { error: 'Cita no agendada: horario ocupado.' }
    } else {
      return { error: 'Ya existe una cita activa a esa hora.' }
    }
  }

  const hora = form.hora.length === 5 ? `${form.hora}:00` : form.hora
  const payload: Record<string, unknown> = {
    paciente_id: pacienteId,
    fecha: form.fecha,
    hora,
    nota: construirNotaCitaSeguimiento(form, consultaId),
    estado: 'ACTIVO',
    sucursal_id: sucursalId,
    servicio_id: servicioId,
    servicio_nombre: servicioNombre,
    recordatorio_estado: 'pendiente',
  }

  const { data, error } = await sb.from('citas').insert(payload).select('id,fecha,hora,nota,servicio_nombre').single()
  if (error) return { error: error.message }
  if (!data) return { error: 'No se recibió respuesta al crear la cita.' }
  return { cita: data }
}
