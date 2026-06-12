import { createClient } from '@supabase/supabase-js'

function adminSb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Repara perfil vinculado al UUID real de auth.users */
export async function repararPerfilUsuario(userId: string, email?: string) {
  const admin = adminSb()
  if (!admin) return { ok: false as const, error: 'Sin service role key' }

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
