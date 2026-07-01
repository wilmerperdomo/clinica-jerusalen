import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgenteEspecializado, MensajeEntrante, MensajeSaliente } from '@/lib/agentes/types'
import { obtenerConfigCanal, canalEstaEnHorario } from '@/lib/agentes/config/canales'
import { clasificarIntencion } from '@/lib/agentes/openai/router'
import {
  resolverCanalId,
  obtenerOCrearConversacion,
  cargarHistorial,
  guardarMensaje,
  actualizarContexto,
} from '@/lib/agentes/memory/store'
import { registrarAuditoria, crearEscalamiento } from '@/lib/agentes/audit/logger'
import { agenteCitas } from '@/lib/agentes/agents/citas'
import { agenteLaboratorio } from '@/lib/agentes/agents/laboratorio'
import { agentePromociones } from '@/lib/agentes/agents/promociones'
import { agenteFacturacion } from '@/lib/agentes/agents/facturacion'
import { agenteFaq } from '@/lib/agentes/agents/faq'
import { agenteEscalamiento } from '@/lib/agentes/agents/escalamiento'
import type { AgenteHandler } from '@/lib/agentes/agents/base'

const AGENTES: Record<AgenteEspecializado, AgenteHandler | null> = {
  orquestador: null,
  citas: agenteCitas,
  laboratorio: agenteLaboratorio,
  promociones: agentePromociones,
  facturacion: agenteFacturacion,
  faq: agenteFaq,
  escalamiento: agenteEscalamiento,
}

export interface ResultadoOrquestador {
  conversacionId: string
  respuestas: MensajeSaliente[]
  agente: AgenteEspecializado
  intencion: string
  escalado: boolean
}

/**
 * Punto de entrada único: recibe mensaje normalizado, persiste memoria,
 * clasifica intención (OpenAI), delega al agente especializado y audita.
 */
export async function procesarMensajeEntrante(
  sb: SupabaseClient,
  entrada: MensajeEntrante,
): Promise<ResultadoOrquestador> {
  const configCanal = obtenerConfigCanal(entrada.canalClave)
  const canalId = await resolverCanalId(sb, entrada.canalClave)

  if (!canalId) {
    throw new Error(`Canal no registrado: ${entrada.canalClave}`)
  }

  const conversacion = await obtenerOCrearConversacion(sb, { canalId, entrada })
  const historial = await cargarHistorial(sb, conversacion.id)

  await guardarMensaje(sb, {
    conversacionId: conversacion.id,
    rol: 'usuario',
    contenido: entrada.texto,
    metadata: { mensaje_externo_id: entrada.mensajeExternoId },
  })

  if (!canalEstaEnHorario(configCanal) && process.env.AGENTES_IGNORAR_HORARIO !== 'true') {
    const texto = configCanal.mensaje_fuera_horario ?? 'Fuera de horario de atención.'
    await guardarMensaje(sb, {
      conversacionId: conversacion.id,
      rol: 'asistente',
      contenido: texto,
      agente: 'faq',
    })
    return {
      conversacionId: conversacion.id,
      respuestas: [{ texto }],
      agente: 'faq',
      intencion: 'horarios_ubicacion',
      escalado: false,
    }
  }

  const enrutamiento = await clasificarIntencion({
    texto: entrada.texto,
    historial,
    tonoCanal: configCanal.tono,
  })

  await registrarAuditoria(sb, {
    conversacionId: conversacion.id,
    accion: 'enrutamiento',
    agente: enrutamiento.agente,
    detalle: { ...enrutamiento, canal: entrada.canalClave },
  })

  const handler = AGENTES[enrutamiento.agente] ?? agenteFaq
  const resultado = await handler(sb, {
    entrada,
    conversacionId: conversacion.id,
    historial,
    contexto: conversacion.contexto,
    configCanal,
  }, enrutamiento)

  if (resultado.actualizar_contexto) {
    await actualizarContexto(
      sb,
      conversacion.id,
      resultado.actualizar_contexto,
      resultado.actualizar_contexto.paciente_id,
    )
  }

  let escalado = false
  if (resultado.escalar || enrutamiento.requiere_escalamiento) {
    await crearEscalamiento(sb, {
      conversacionId: conversacion.id,
      motivo: resultado.escalar?.motivo ?? enrutamiento.razon,
      prioridad: resultado.escalar?.prioridad,
    })
    escalado = true
    await registrarAuditoria(sb, {
      conversacionId: conversacion.id,
      accion: 'escalamiento',
      agente: 'escalamiento',
      detalle: resultado.escalar ?? { razon: enrutamiento.razon },
    })
  }

  for (const r of resultado.respuestas) {
    await guardarMensaje(sb, {
      conversacionId: conversacion.id,
      rol: 'asistente',
      contenido: r.texto,
      agente: resultado.agente,
      intencion: resultado.intencion,
      confianza: resultado.confianza,
      metadata: {
        fuentes: resultado.fuentes_consultadas,
        ...r.metadata,
      },
    })
  }

  return {
    conversacionId: conversacion.id,
    respuestas: resultado.respuestas,
    agente: resultado.agente,
    intencion: resultado.intencion,
    escalado,
  }
}
