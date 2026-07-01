import type { SupabaseClient } from '@supabase/supabase-js'
import { fechaHoyHN } from '@/lib/fecha-hn'

export interface PacienteResumen {
  id: number
  nombre: string
  celular?: string | null
  codigo?: string
}

export async function buscarPacientePorId(
  sb: SupabaseClient,
  id: number,
): Promise<PacienteResumen | null> {
  const { data } = await sb
    .from('pacientes')
    .select('id, nombre, apellido1, celular, codigo')
    .eq('id', id)
    .eq('activo', true)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    nombre: `${data.nombre} ${data.apellido1 ?? ''}`.trim(),
    celular: data.celular,
    codigo: data.codigo,
  }
}

export async function buscarPacientePorTelefono(
  sb: SupabaseClient,
  telefono: string,
): Promise<PacienteResumen | null> {
  const suffix = telefono.replace(/\D/g, '').slice(-8)
  if (suffix.length < 8) return null
  const { data } = await sb
    .from('pacientes')
    .select('id, nombre, apellido1, celular, codigo')
    .eq('activo', true)
    .or(`celular.ilike.%${suffix}%,telefono.ilike.%${suffix}%`)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    nombre: `${data.nombre} ${data.apellido1 ?? ''}`.trim(),
    celular: data.celular,
    codigo: data.codigo,
  }
}

export { fechaHoyHN }
