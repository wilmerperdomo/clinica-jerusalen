import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgenteEspecializado } from '@/lib/agentes/types'

export async function registrarAuditoria(
  sb: SupabaseClient,
  opts: {
    conversacionId?: string
    accion: string
    agente?: AgenteEspecializado
    detalle?: Record<string, unknown>
  },
): Promise<void> {
  await sb.from('agente_auditoria').insert({
    conversacion_id: opts.conversacionId ?? null,
    accion: opts.accion,
    agente: opts.agente ?? null,
    detalle: opts.detalle ?? {},
  })
}

export async function crearEscalamiento(
  sb: SupabaseClient,
  opts: {
    conversacionId: string
    motivo: string
    prioridad?: 'baja' | 'normal' | 'alta' | 'urgente'
  },
): Promise<void> {
  await sb.from('agente_escalamientos').insert({
    conversacion_id: opts.conversacionId,
    motivo: opts.motivo,
    prioridad: opts.prioridad ?? 'normal',
  })
  await sb
    .from('agente_conversaciones')
    .update({ estado: 'escalada', updated_at: new Date().toISOString() })
    .eq('id', opts.conversacionId)
}
