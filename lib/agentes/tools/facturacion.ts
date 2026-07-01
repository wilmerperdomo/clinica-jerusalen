import type { SupabaseClient } from '@supabase/supabase-js'

export interface FacturaResumen {
  numero: string
  fecha: string
  total: number
  estado: string
}

export async function ultimasFacturasPaciente(
  sb: SupabaseClient,
  pacienteId: number,
): Promise<FacturaResumen[]> {
  const { data } = await sb
    .from('facturas')
    .select('numero, fecha, total, estado')
    .eq('paciente_id', pacienteId)
    .order('fecha', { ascending: false })
    .limit(5)

  return (data ?? []).map(f => ({
    numero: f.numero,
    fecha: f.fecha,
    total: Number(f.total),
    estado: f.estado,
  }))
}

export async function saldoCxcPaciente(
  sb: SupabaseClient,
  pacienteId: number,
): Promise<number> {
  const { data } = await sb
    .from('cxc')
    .select('saldo')
    .eq('paciente_id', pacienteId)
    .in('estado', ['PENDIENTE', 'PARCIAL'])

  return (data ?? []).reduce((s, r) => s + Number(r.saldo || 0), 0)
}
