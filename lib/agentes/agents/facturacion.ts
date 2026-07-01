import { respuestaUnica, SIN_DATOS, type AgenteHandler } from '@/lib/agentes/agents/base'
import { ultimasFacturasPaciente, saldoCxcPaciente } from '@/lib/agentes/tools/facturacion'
import { buscarPacientePorTelefono } from '@/lib/agentes/tools/pacientes'

const fmt = (n: number) => `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`

export const agenteFacturacion: AgenteHandler = async (sb, turno, enrutamiento) => {
  const pacienteId =
    turno.contexto.paciente_id ??
    (await buscarPacientePorTelefono(sb, turno.entrada.contactoExterno))?.id

  if (!pacienteId) {
    return respuestaUnica(
      'Para consultar facturas o saldos necesito identificarle en el sistema. ' +
      'Indíqueme su nombre y número de identidad, o acérquese a caja con su recibo.',
      'facturacion',
      enrutamiento.intencion,
      enrutamiento.confianza,
      { escalar: { motivo: 'Consulta facturación sin paciente', prioridad: 'normal' } },
    )
  }

  const [facturas, saldo] = await Promise.all([
    ultimasFacturasPaciente(sb, pacienteId),
    saldoCxcPaciente(sb, pacienteId),
  ])

  const partes: string[] = []

  if (facturas.length > 0) {
    const lineas = facturas.map(f => `• ${f.numero} — ${f.fecha} — ${fmt(f.total)} (${f.estado})`)
    partes.push(`Últimas facturas:\n${lineas.join('\n')}`)
  } else {
    partes.push('No encontré facturas recientes a su nombre.')
  }

  if (saldo > 0) {
    partes.push(`Saldo pendiente (cuenta por cobrar): ${fmt(saldo)}. Puede abonar en caja.`)
  }

  if (facturas.length === 0 && saldo <= 0) {
    return respuestaUnica(SIN_DATOS, 'facturacion', enrutamiento.intencion, enrutamiento.confianza, {
      fuentes_consultadas: ['facturas', 'cxc'],
    })
  }

  return respuestaUnica(
    partes.join('\n\n'),
    'facturacion',
    enrutamiento.intencion,
    enrutamiento.confianza,
    { fuentes_consultadas: ['facturas', 'cxc'], actualizar_contexto: { paciente_id: pacienteId } },
  )
}
