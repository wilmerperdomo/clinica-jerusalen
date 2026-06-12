export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
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
  return {
    urlOk: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    anonOk: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
    serviceOk: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  }
}
