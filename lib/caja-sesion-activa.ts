import type { createClient } from '@/lib/supabase/client'
import { fechaHoyHN } from '@/lib/fecha-hn'

type BrowserSupabase = ReturnType<typeof createClient>

/**
 * true si el usuario tiene una sesión de caja ABIERTA hoy (no debe auto-cerrar login).
 * En error de red/BD asumimos caja abierta (fail-safe) para no expulsar al cajero.
 */
export async function tieneCajaSesionAbierta(sb: BrowserSupabase): Promise<boolean> {
  try {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return false

    const hoy = fechaHoyHN()
    const { data, error } = await sb
      .from('caja_sesiones')
      .select('id')
      .eq('cajero_id', user.id)
      .eq('fecha', hoy)
      .eq('estado', 'ABIERTA')
      .maybeSingle()

    if (error) {
      console.warn('tieneCajaSesionAbierta:', error.message)
      return true
    }
    return !!data
  } catch {
    return true
  }
}
