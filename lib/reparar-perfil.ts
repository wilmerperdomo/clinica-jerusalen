import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPublicSupabaseEnv, getServiceRoleKey } from '@/lib/supabase/env'

function adminSb() {
  const env = getPublicSupabaseEnv()
  const key = getServiceRoleKey()
  if (!env || !key) return null
  return createSupabaseAdmin(env.url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Repara perfil vinculado al UUID real de auth.users */
export async function repararPerfilUsuario(userId: string, email?: string) {
  const admin = adminSb()
  if (admin) {
    const { data: existente } = await admin
      .from('perfiles')
      .select('id, nombre, apellido, sucursal_id, rol_id')
      .eq('id', userId)
      .maybeSingle()

    const { data: suc } = await admin
      .from('sucursales')
      .select('id')
      .order('id')
      .limit(1)
      .maybeSingle()

    const sucursalId = suc?.id ?? 1

    let rolId = existente?.rol_id as number | null | undefined

    if (!rolId && email === 'admin@clinica.com') {
      const { data: rolSuper } = await admin
        .from('roles')
        .select('id')
        .eq('nombre', 'Super Administrador')
        .maybeSingle()
      rolId = rolSuper?.id ?? null
    }

    if (!rolId) {
      const { data: rolAdmin } = await admin
        .from('roles')
        .select('id')
        .eq('nombre', 'Administrador')
        .maybeSingle()
      rolId = rolAdmin?.id ?? null
    }

    const nombreDefault = email?.split('@')[0] ?? 'Usuario'

    const payload = {
      id:          userId,
      nombre:      existente?.nombre || (email === 'admin@clinica.com' ? 'Administrador' : nombreDefault),
      apellido:    existente?.apellido || '',
      sucursal_id: existente?.sucursal_id ?? sucursalId,
      rol_id:      rolId,
      activo:      true,
    }

    const { error } = await admin.from('perfiles').upsert(payload, { onConflict: 'id' })
    if (error) return { ok: false as const, error: error.message }

    if (rolId) {
      await admin.from('perfil_roles').delete().eq('perfil_id', userId)
      await admin.from('perfil_roles').insert({ perfil_id: userId, rol_id: rolId })
    }

    return { ok: true as const }
  }

  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin sesión' }

  const { error } = await supabase.rpc('fn_sync_perfil_roles_login')
  if (error) {
    return {
      ok: false as const,
      error: 'Ejecute scripts/REPARAR-USUARIOS-CREADOS.sql en Supabase SQL Editor',
    }
  }

  return { ok: true as const }
}
