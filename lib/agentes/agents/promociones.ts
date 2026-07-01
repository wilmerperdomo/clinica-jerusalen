import { respuestaUnica, type AgenteHandler } from '@/lib/agentes/agents/base'
import { listarPromocionesActivas, planActivoPaciente } from '@/lib/agentes/tools/promociones'
import { buscarPacientePorTelefono } from '@/lib/agentes/tools/pacientes'

export const agentePromociones: AgenteHandler = async (sb, turno, enrutamiento) => {
  if (enrutamiento.intencion === 'planes_medicos') {
    const pacienteId =
      turno.contexto.paciente_id ??
      (await buscarPacientePorTelefono(sb, turno.entrada.contactoExterno))?.id

    if (!pacienteId) {
      return respuestaUnica(
        'Nuestros planes médicos incluyen beneficios en consultas, laboratorio y medicamentos. ' +
        'Para verificar si usted ya tiene un plan activo, indíqueme su nombre completo o visite recepción.',
        'promociones',
        'planes_medicos',
        enrutamiento.confianza,
        { fuentes_consultadas: ['membresias'] },
      )
    }

    const plan = await planActivoPaciente(sb, pacienteId)
    if (!plan) {
      return respuestaUnica(
        'Según el sistema, no tiene un plan médico activo en este momento. ' +
        'En recepción le explican opciones y precios vigentes — no publico montos sin confirmar en base de datos.',
        'promociones',
        'planes_medicos',
        enrutamiento.confianza,
        { fuentes_consultadas: ['membresias'], actualizar_contexto: { paciente_id: pacienteId } },
      )
    }

    return respuestaUnica(
      `Su plan activo es «${plan.tipo}», vigente hasta ${plan.fecha_fin}. ` +
      'Para beneficios específicos de hoy, recepción puede detallarle coberturas.',
      'promociones',
      'planes_medicos',
      enrutamiento.confianza,
      { fuentes_consultadas: ['membresias'] },
    )
  }

  const promos = await listarPromocionesActivas(sb)
  if (promos.length === 0) {
    return respuestaUnica(
      'En este momento no hay promociones activas registradas en el sistema. ' +
      'Puede consultar en recepción o visitarnos para conocer servicios disponibles.',
      'promociones',
      'promociones',
      enrutamiento.confianza,
      { fuentes_consultadas: ['promociones'] },
    )
  }

  const lineas = promos.map(p => {
    const vig = p.vigencia_hasta ? ` (hasta ${p.vigencia_hasta})` : ''
    const desc = p.descripcion ? `: ${p.descripcion}` : ''
    return `• ${p.nombre}${desc}${vig}`
  })

  return respuestaUnica(
    `Promociones vigentes en ${turno.configCanal.nombre}:\n${lineas.join('\n')}\n\n` +
    'Los precios finales se confirman en caja o recepción.',
    'promociones',
    'promociones',
    enrutamiento.confianza,
    { fuentes_consultadas: ['promociones'] },
  )
}
