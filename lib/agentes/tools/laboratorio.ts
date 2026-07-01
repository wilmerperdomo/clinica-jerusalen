import type { SupabaseClient } from '@supabase/supabase-js'

export interface OrdenLabResumen {
  id: number
  nombre: string
  estado: string
  fecha: string
  fecha_prometida?: string | null
}

export async function listarOrdenesLabPaciente(
  sb: SupabaseClient,
  pacienteId: number,
): Promise<OrdenLabResumen[]> {
  const { data } = await sb
    .from('consulta_analisis')
    .select('id, no_analisis, estado_lab, fecha, fecha_prometida, pagado')
    .eq('paciente_id', pacienteId)
    .order('fecha', { ascending: false })
    .limit(8)

  return (data ?? []).map(o => ({
    id: o.id,
    nombre: o.no_analisis ?? `Orden #${o.id}`,
    estado: o.estado_lab ?? (o.pagado ? 'PAGADO' : 'PENDIENTE_COBRO'),
    fecha: o.fecha,
    fecha_prometida: o.fecha_prometida,
  }))
}

export async function ordenesLabPendientesCobro(
  sb: SupabaseClient,
  pacienteId: number,
): Promise<number> {
  const { count } = await sb
    .from('consulta_analisis')
    .select('id', { count: 'exact', head: true })
    .eq('paciente_id', pacienteId)
    .eq('estado_lab', 'PENDIENTE_COBRO')
  return count ?? 0
}
