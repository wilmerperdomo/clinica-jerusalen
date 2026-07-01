import { respuestaUnica, type AgenteHandler } from '@/lib/agentes/agents/base'
import { BRAND } from '@/lib/brand'

function formatearHorarios(turno: Parameters<AgenteHandler>[1]): string {
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return turno.configCanal.horarios
    .map(h => `${dias[h.dia]} ${h.abre}–${h.cierra}`)
    .join(', ')
}

export const agenteFaq: AgenteHandler = async (_sb, turno, enrutamiento) => {
  const cfg = turno.configCanal

  if (enrutamiento.intencion === 'saludo') {
    return respuestaUnica(
      `¡Hola! Soy el asistente virtual de ${BRAND.nombre} (${cfg.nombre}). ` +
      'Puedo ayudarle con citas, laboratorio, promociones, planes médicos y facturación. ¿En qué le apoyo?',
      'faq',
      'saludo',
      enrutamiento.confianza,
    )
  }

  if (enrutamiento.intencion === 'horarios_ubicacion') {
    return respuestaUnica(
      `${cfg.nombre}\n` +
      (cfg.direccion ? `Dirección: ${cfg.direccion}\n` : '') +
      (cfg.ubicacion ? `Ubicación: ${cfg.ubicacion}\n` : '') +
      `Horarios: ${formatearHorarios(turno)}\n` +
      `Servicios: ${cfg.servicios_destacados.join('; ')}`,
      'faq',
      'horarios_ubicacion',
      enrutamiento.confianza,
      { fuentes_consultadas: ['config_canal'] },
    )
  }

  if (enrutamiento.intencion === 'precios_generales') {
    return respuestaUnica(
      'Los precios dependen del servicio, lista de precios y promociones vigentes. ' +
      'No puedo indicar montos sin consultar el sistema para su caso. ' +
      '¿Desea información de consultas, laboratorio o un plan médico específico?',
      'faq',
      'precios_generales',
      enrutamiento.confianza,
    )
  }

  return respuestaUnica(
    'Puedo ayudarle con: agendar o consultar citas, estado de laboratorio, promociones, ' +
    'planes médicos y facturación. ¿Cuál de estos temas necesita?',
    'faq',
    'otro',
    enrutamiento.confianza,
  )
}
