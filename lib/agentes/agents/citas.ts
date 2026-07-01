import type { SupabaseClient } from '@supabase/supabase-js'
import { respuestaUnica, SIN_DATOS, type AgenteHandler } from '@/lib/agentes/agents/base'
import { listarCitasPaciente, citasDisponiblesHoy } from '@/lib/agentes/tools/citas'
import { buscarPacientePorTelefono } from '@/lib/agentes/tools/pacientes'

export const agenteCitas: AgenteHandler = async (sb, turno, enrutamiento) => {
  const pacienteId =
    turno.contexto.paciente_id ??
    (await buscarPacientePorTelefono(sb, turno.entrada.contactoExterno))?.id

  if (!pacienteId && enrutamiento.intencion !== 'agendar_cita') {
    return respuestaUnica(
      'Para consultar sus citas necesito identificarle en el sistema. ' +
      '¿Podría indicarme su nombre completo y número de identidad o código de paciente?',
      'citas',
      enrutamiento.intencion,
      enrutamiento.confianza,
      { fuentes_consultadas: ['pacientes'] },
    )
  }

  if (enrutamiento.intencion === 'agendar_cita') {
    const ocupadas = await citasDisponiblesHoy(sb, turno.configCanal.sucursal_id)
    return respuestaUnica(
      `Con gusto le ayudo a agendar. Hoy tenemos ${ocupadas} cita(s) registrada(s) en agenda. ` +
      'Para confirmar fecha y hora exacta, indíqueme: día preferido, motivo de consulta y si ya es paciente registrado. ' +
      'También puede llamar a recepción para confirmación inmediata.',
      'citas',
      'agendar_cita',
      enrutamiento.confianza,
      { fuentes_consultadas: ['citas'] },
    )
  }

  if (pacienteId) {
    const citas = await listarCitasPaciente(sb, pacienteId)
    if (citas.length === 0) {
      return respuestaUnica(
        'No encontré citas próximas a su nombre en el sistema. ¿Desea agendar una nueva?',
        'citas',
        enrutamiento.intencion,
        enrutamiento.confianza,
        { fuentes_consultadas: ['citas'], actualizar_contexto: { paciente_id: pacienteId } },
      )
    }
    const lineas = citas.map(
      c => `• ${c.fecha} ${c.hora} — ${c.servicio ?? 'Consulta'} (${c.estado})`,
    )
    return respuestaUnica(
      `Estas son sus próximas citas en ${turno.configCanal.nombre}:\n${lineas.join('\n')}`,
      'citas',
      enrutamiento.intencion,
      enrutamiento.confianza,
      { fuentes_consultadas: ['citas'], actualizar_contexto: { paciente_id: pacienteId } },
    )
  }

  return respuestaUnica(SIN_DATOS, 'citas', enrutamiento.intencion, enrutamiento.confianza, {
    escalar: { motivo: 'Paciente no identificado para consulta de citas' },
  })
}
