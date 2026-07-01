import type { SupabaseClient } from '@supabase/supabase-js'
import { fechaHoyHN } from '@/lib/agentes/tools/pacientes'

export interface CitaResumen {
  id: number
  fecha: string
  hora: string
  estado: string
  servicio?: string | null
}

export async function listarCitasPaciente(
  sb: SupabaseClient,
  pacienteId: number,
  desde?: string,
): Promise<CitaResumen[]> {
  const { data } = await sb
    .from('citas')
    .select('id, fecha, hora, estado, servicio_nombre')
    .eq('paciente_id', pacienteId)
    .gte('fecha', desde ?? fechaHoyHN())
    .order('fecha')
    .order('hora')
    .limit(5)

  return (data ?? []).map(c => ({
    id: c.id,
    fecha: c.fecha,
    hora: String(c.hora ?? '').slice(0, 5),
    estado: c.estado,
    servicio: c.servicio_nombre,
  }))
}

export async function citasDisponiblesHoy(
  sb: SupabaseClient,
  sucursalId?: number | null,
): Promise<number> {
  let q = sb
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('fecha', fechaHoyHN())
    .in('estado', ['ACTIVO', 'pendiente', 'en_proceso'])

  if (sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { count } = await q
  return count ?? 0
}
