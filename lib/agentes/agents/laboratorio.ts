import { respuestaUnica, SIN_DATOS, type AgenteHandler } from '@/lib/agentes/agents/base'
import { listarOrdenesLabPaciente, ordenesLabPendientesCobro } from '@/lib/agentes/tools/laboratorio'
import { buscarPacientePorTelefono } from '@/lib/agentes/tools/pacientes'

const ESTADO_LEGIBLE: Record<string, string> = {
  PENDIENTE_COBRO: 'pendiente de cobro en caja',
  PAGADO: 'pagado — en cola de laboratorio',
  EN_PROCESO: 'en proceso de análisis',
  RESULTADO_LISTO: 'resultado listo para entrega',
  VALIDADO: 'validado por médico',
  ENTREGADO: 'entregado',
}

export const agenteLaboratorio: AgenteHandler = async (sb, turno, enrutamiento) => {
  const pacienteId =
    turno.contexto.paciente_id ??
    (await buscarPacientePorTelefono(sb, turno.entrada.contactoExterno))?.id

  if (!pacienteId) {
    return respuestaUnica(
      'Para consultar el estado de laboratorio necesito identificarle como paciente. ' +
      'Indíqueme su nombre completo y código de paciente si lo tiene.',
      'laboratorio',
      enrutamiento.intencion,
      enrutamiento.confianza,
      { escalar: { motivo: 'Consulta lab sin paciente identificado', prioridad: 'normal' } },
    )
  }

  const ordenes = await listarOrdenesLabPaciente(sb, pacienteId)
  if (ordenes.length === 0) {
    return respuestaUnica(
      'No encontré órdenes de laboratorio recientes a su nombre en el sistema.',
      'laboratorio',
      enrutamiento.intencion,
      enrutamiento.confianza,
      { fuentes_consultadas: ['consulta_analisis'], actualizar_contexto: { paciente_id: pacienteId } },
    )
  }

  const pendientesCobro = await ordenesLabPendientesCobro(sb, pacienteId)
  const lineas = ordenes.slice(0, 5).map(o => {
    const est = ESTADO_LEGIBLE[o.estado] ?? o.estado
    const prom = o.fecha_prometida ? ` — entrega estimada ${o.fecha_prometida}` : ''
    return `• ${o.nombre}: ${est}${prom}`
  })

  let extra = ''
  if (pendientesCobro > 0) {
    extra = `\n\nTiene ${pendientesCobro} estudio(s) pendiente(s) de cobro en caja antes de procesarse.`
  }

  if (enrutamiento.intencion === 'resultados_lab') {
    const listos = ordenes.filter(o => ['RESULTADO_LISTO', 'VALIDADO', 'ENTREGADO'].includes(o.estado))
    if (listos.length === 0) {
      return respuestaUnica(
        `Sus estudios aún están en proceso:\n${lineas.join('\n')}${extra}\n\n` +
        'Le avisaremos cuando el resultado esté listo. También puede consultar en recepción.',
        'laboratorio',
        'resultados_lab',
        enrutamiento.confianza,
        { fuentes_consultadas: ['consulta_analisis'] },
      )
    }
  }

  return respuestaUnica(
    `Estado de sus estudios de laboratorio:\n${lineas.join('\n')}${extra}`,
    'laboratorio',
    enrutamiento.intencion,
    enrutamiento.confianza,
    { fuentes_consultadas: ['consulta_analisis'], actualizar_contexto: { paciente_id: pacienteId } },
  )
}
