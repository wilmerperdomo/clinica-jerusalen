import type { createClient } from '@/lib/supabase/client'

type BrowserSupabase = ReturnType<typeof createClient>

/** true si el usuario tiene una sesión de caja ABIERTA hoy (no debe auto-cerrar login). */
export async function tieneCajaSesionAbierta(sb: BrowserSupabase): Promise<boolean> {
  try {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return false

    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await sb
      .from('caja_sesiones')
      .select('id')
      .eq('cajero_id', user.id)
      .eq('fecha', hoy)
      .eq('estado', 'ABIERTA')
      .maybeSingle()

    if (error) {
      console.warn('tieneCajaSesionAbierta:', error.message)
      return false
    }
    return !!data
  } catch {
    return false
  }
}
