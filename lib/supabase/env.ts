/** Valores públicos del proyecto — seguros en el cliente (equivalente a NEXT_PUBLIC_) */
const SUPABASE_URL_FALLBACK = 'https://lvaxphzquokmfkgjudnx.supabase.co'
const SUPABASE_ANON_FALLBACK = 'sb_publishable_TSbey41LYAKXkjtQ3nrsmQ_Oa9qwizp'

export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SUPABASE_URL_FALLBACK
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || SUPABASE_ANON_FALLBACK
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
}

export function hasPublicSupabaseEnv() {
  return getPublicSupabaseEnv() !== null
}

export function getEnvDiagnostics() {
  const urlFromEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
  const anonFromEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())
  return {
    urlOk: urlFromEnv || Boolean(SUPABASE_URL_FALLBACK),
    anonOk: anonFromEnv || Boolean(SUPABASE_ANON_FALLBACK),
    serviceOk: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    usingFallback: !urlFromEnv || !anonFromEnv,
  }
}
