import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'

export function createClient() {
  const env = getPublicSupabaseEnv()
  if (!env) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createBrowserClient(env.url, env.anonKey)
}
