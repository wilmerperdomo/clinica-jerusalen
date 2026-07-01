import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CanalClave,
  ContextoConversacion,
  MensajeEntrante,
  ProveedorCanal,
} from '@/lib/agentes/types'
import { limpiarCelular } from '@/lib/mensajes-paciente'

export interface ConversacionPersistida {
  id: string
  canal_id: number
  paciente_id: number | null
  contacto_externo: string
  contexto: ContextoConversacion
  estado: string
}

const HISTORIAL_MAX = Number(process.env.AGENTES_HISTORIAL_MAX ?? '20')

export async function resolverCanalId(
  sb: SupabaseClient,
  clave: CanalClave,
): Promise<number | null> {
  const { data } = await sb.from('agente_canales').select('id').eq('clave', clave).maybeSingle()
  return data?.id ?? null
}

export async function obtenerOCrearConversacion(
  sb: SupabaseClient,
  opts: {
    canalId: number
    entrada: MensajeEntrante
  },
): Promise<ConversacionPersistida> {
  const contacto = normalizarContacto(opts.entrada.contactoExterno, opts.entrada.proveedor)
  const { data: existente } = await sb
    .from('agente_conversaciones')
    .select('id, canal_id, paciente_id, contacto_externo, contexto, estado')
    .eq('canal_id', opts.canalId)
    .eq('contacto_externo', contacto)
    .maybeSingle()

  if (existente) {
    return {
      id: existente.id,
      canal_id: existente.canal_id,
      paciente_id: existente.paciente_id,
      contacto_externo: existente.contacto_externo,
      contexto: (existente.contexto ?? {}) as ContextoConversacion,
      estado: existente.estado,
    }
  }

  const pacienteId = await buscarPacientePorTelefono(sb, contacto)

  const { data: nueva, error } = await sb
    .from('agente_conversaciones')
    .insert({
      canal_id: opts.canalId,
      contacto_externo: contacto,
      contacto_nombre: opts.entrada.contactoNombre ?? null,
      paciente_id: pacienteId,
      contexto: pacienteId ? { paciente_id: pacienteId } : {},
    })
    .select('id, canal_id, paciente_id, contacto_externo, contexto, estado')
    .single()

  if (error || !nueva) throw new Error(error?.message ?? 'No se pudo crear conversación')

  return {
    id: nueva.id,
    canal_id: nueva.canal_id,
    paciente_id: nueva.paciente_id,
    contacto_externo: nueva.contacto_externo,
    contexto: (nueva.contexto ?? {}) as ContextoConversacion,
    estado: nueva.estado,
  }
}

export async function cargarHistorial(
  sb: SupabaseClient,
  conversacionId: string,
): Promise<{ rol: 'usuario' | 'asistente' | 'sistema'; contenido: string }[]> {
  const { data } = await sb
    .from('agente_mensajes')
    .select('rol, contenido')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(HISTORIAL_MAX)

  return (data ?? [])
    .reverse()
    .filter(m => m.rol === 'usuario' || m.rol === 'asistente' || m.rol === 'sistema')
    .map(m => ({
      rol: m.rol as 'usuario' | 'asistente' | 'sistema',
      contenido: m.contenido,
    }))
}

export async function guardarMensaje(
  sb: SupabaseClient,
  opts: {
    conversacionId: string
    rol: 'usuario' | 'asistente' | 'sistema' | 'humano'
    contenido: string
    agente?: string
    intencion?: string
    confianza?: number
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await sb.from('agente_mensajes').insert({
    conversacion_id: opts.conversacionId,
    rol: opts.rol,
    contenido: opts.contenido,
    agente: opts.agente ?? null,
    intencion: opts.intencion ?? null,
    confianza: opts.confianza ?? null,
    metadata: opts.metadata ?? {},
  })

  await sb
    .from('agente_conversaciones')
    .update({
      ultimo_mensaje_at: new Date().toISOString(),
      ultimo_agente: opts.agente ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.conversacionId)
}

export async function actualizarContexto(
  sb: SupabaseClient,
  conversacionId: string,
  parcial: Partial<ContextoConversacion>,
  pacienteId?: number | null,
): Promise<void> {
  const { data } = await sb
    .from('agente_conversaciones')
    .select('contexto')
    .eq('id', conversacionId)
    .single()

  const prev = (data?.contexto ?? {}) as ContextoConversacion
  await sb
    .from('agente_conversaciones')
    .update({
      contexto: { ...prev, ...parcial },
      ...(pacienteId !== undefined ? { paciente_id: pacienteId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversacionId)
}

function normalizarContacto(raw: string, proveedor: ProveedorCanal): string {
  if (proveedor === 'messenger') return raw.replace(/\D/g, '')
  return limpiarCelular(raw) || raw.replace(/\D/g, '')
}

async function buscarPacientePorTelefono(
  sb: SupabaseClient,
  contacto: string,
): Promise<number | null> {
  const suffix = contacto.slice(-8)
  if (suffix.length < 8) return null

  const { data } = await sb
    .from('pacientes')
    .select('id, celular, telefono')
    .eq('activo', true)
    .or(`celular.ilike.%${suffix}%,telefono.ilike.%${suffix}%`)
    .limit(1)

  return data?.[0]?.id ?? null
}
