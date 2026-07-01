import type { SupabaseClient } from '@supabase/supabase-js'
import { fechaHoyHN } from '@/lib/fecha-hn'

export interface PromocionActiva {
  id: number
  nombre: string
  descripcion?: string | null
  vigencia_hasta?: string | null
}

export async function listarPromocionesActivas(
  sb: SupabaseClient,
): Promise<PromocionActiva[]> {
  const hoy = fechaHoyHN()
  const { data } = await sb
    .from('promociones')
    .select('id, titulo, descripcion, vigencia_hasta')
    .eq('activa', true)
    .or(`vigencia_hasta.is.null,vigencia_hasta.gte.${hoy}`)
    .order('titulo')
    .limit(6)

  return (data ?? []).map(p => ({
    id: p.id,
    nombre: p.titulo,
    descripcion: p.descripcion,
    vigencia_hasta: p.vigencia_hasta,
  }))
}

export interface PlanActivo {
  id: number
  tipo: string
  fecha_fin: string
  estado: string
}

export async function planActivoPaciente(
  sb: SupabaseClient,
  pacienteId: number,
): Promise<PlanActivo | null> {
  const { data } = await sb
    .from('membresias')
    .select('id, fecha_fin, estado, tipo:membresia_tipos(nombre)')
    .eq('paciente_id', pacienteId)
    .eq('estado', 'activo')
    .gte('fecha_fin', fechaHoyHN())
    .order('fecha_fin', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const tipo = data.tipo as { nombre?: string } | { nombre?: string }[] | null
  const nombre = Array.isArray(tipo) ? tipo[0]?.nombre : tipo?.nombre
  return {
    id: data.id,
    tipo: nombre ?? 'Plan médico',
    fecha_fin: data.fecha_fin,
    estado: data.estado,
  }
}
