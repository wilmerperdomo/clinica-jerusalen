import { respuestaUnica, type AgenteHandler } from '@/lib/agentes/agents/base'
import { BRAND } from '@/lib/brand'

export const agenteEscalamiento: AgenteHandler = async (_sb, turno, enrutamiento) => {
  const motivo =
    enrutamiento.intencion === 'hablar_humano'
      ? 'El paciente solicitó atención humana'
      : `Confianza baja (${enrutamiento.confianza}) o consulta no resuelta`

  return respuestaUnica(
    `Entendido. He notificado a nuestro equipo de ${turno.configCanal.nombre}. ` +
    `Un asesor de ${BRAND.nombre} le contactará pronto. ` +
    'Si es urgente, llame a recepción.',
    'escalamiento',
    enrutamiento.intencion,
    enrutamiento.confianza,
    {
      escalar: { motivo, prioridad: enrutamiento.intencion === 'hablar_humano' ? 'alta' : 'normal' },
    },
  )
}
