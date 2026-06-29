import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'

/**
 * Cliente de Supabase del navegador como SINGLETON.
 *
 * Crear una instancia nueva en cada componente genera múltiples GoTrueClient
 * compartiendo la misma sesión, lo que provoca carreras al refrescar el token
 * ("session state changed mid-flight / concurrent signOut") y puede CERRAR la
 * sesión del usuario (p. ej. sacar al cajero logueado). Reutilizar una sola
 * instancia evita ese problema.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (browserClient) return browserClient

  const env = getPublicSupabaseEnv()
  if (!env) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  browserClient = createBrowserClient(env.url, env.anonKey)
  return browserClient
}
