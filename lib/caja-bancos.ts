import type { SupabaseClient } from '@supabase/supabase-js'

/** Bancos comunes en Honduras para registrar transferencias en caja */
export const BANCOS_HONDURAS = [
  'BAC Honduras',
  'BANHCAFE',
  'BANPAÍS',
  'BANRURAL',
  'BANTRAB',
  'Banco Atlántida',
  'Banco Azteca',
  'Banco de Occidente',
  'Banco del País (BANPAÍS)',
  'Banco Ficohsa',
  'Banco Lafise',
  'Banco Popular',
  'Banco Promerica',
  'Banco Davivienda',
  'Banco Cuscatlán',
  'Banco de los Trabajadores (BANTRAB)',
  'Banco de Honduras (BCH)',
  'Banco Hondureño del Café (BANHCAFE)',
  'Banco Nacional de Desarrollo Agrícola (BANADESA)',
  'Banco Central de Honduras',
  'Otro',
] as const

export type BancoHonduras = (typeof BANCOS_HONDURAS)[number]

export interface BancoRow {
  id: number
  nombre: string
  activo: boolean
  orden?: number | null
  created_at?: string
}

/**
 * Carga los bancos activos desde la tabla `bancos` (editable por el usuario).
 * Si la tabla no existe o no devuelve filas, usa la lista por defecto como
 * respaldo para que el cobro nunca se quede sin opciones de banco.
 */
export async function cargarBancosActivos(sb: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await sb
      .from('bancos')
      .select('nombre, activo, orden')
      .eq('activo', true)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })

    if (error || !data?.length) return [...BANCOS_HONDURAS]
    return data.map(b => String(b.nombre)).filter(Boolean)
  } catch {
    return [...BANCOS_HONDURAS]
  }
}
