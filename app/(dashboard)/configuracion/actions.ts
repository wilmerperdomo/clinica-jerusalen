'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { getPublicSupabaseEnv, getServiceRoleKey } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'

export async function crearUsuario(data: {
  email:       string
  password:    string
  nombre:      string
  apellido:    string
  cedula?:     string
  telefono?:   string
  rol_id?:     number
  sucursal_id?: number
}) {
  const { esSuperAdmin, userId: adminUserId } = await getPerfilSucursal()
  if (!adminUserId || !esSuperAdmin) {
    return { error: 'No autorizado. Solo el Super Administrador puede crear usuarios.' }
  }

  if (!data.rol_id) {
    return { error: 'Debes asignar un rol al usuario.' }
  }
  if (!data.sucursal_id) {
    return { error: 'Debes asignar una sucursal al usuario.' }
  }

  const env = getPublicSupabaseEnv()
  if (!env) {
    return { error: 'Falta configuración de Supabase' }
  }

  const supabase = await createClient()
  if (!supabase) {
    return { error: 'Sesión inválida. Vuelva a iniciar sesión.' }
  }

  const { data: rolNuevo } = await supabase
    .from('roles')
    .select('es_super_admin')
    .eq('id', data.rol_id)
    .maybeSingle()

  if (rolNuevo?.es_super_admin) {
    return { error: 'No se puede asignar el rol Super Administrador desde este formulario.' }
  }

  const serviceKey = getServiceRoleKey()
  let nuevoUserId: string | undefined

  if (serviceKey) {
    const admin = createSupabaseClient(env.url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         data.email,
      password:      data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre, apellido: data.apellido },
    })

    if (authError) return { error: authError.message }
    nuevoUserId = authData.user?.id
  } else {
    const anon = createSupabaseClient(env.url, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await anon.auth.signUp({
      email:    data.email,
      password: data.password,
      options:  { data: { nombre: data.nombre, apellido: data.apellido } },
    })

    if (authError) return { error: authError.message }

    nuevoUserId = authData.user?.id
    if (!nuevoUserId) {
      return {
        error: 'No se pudo crear el usuario. En Supabase → Authentication → Providers → Email, desactive "Confirm email" e intente de nuevo.',
      }
    }
  }

  if (!nuevoUserId) {
    return { error: 'No se pudo obtener el ID del usuario creado' }
  }

  const { error: perfilError } = await supabase.from('perfiles').upsert({
    id:          nuevoUserId,
    nombre:      data.nombre,
    apellido:    data.apellido,
    cedula:      data.cedula      || null,
    telefono:    data.telefono    || null,
    rol_id:      data.rol_id,
    sucursal_id: data.sucursal_id,
    activo:      true,
  })

  if (perfilError) {
    return {
      error: serviceKey
        ? perfilError.message
        : `Usuario creado en Auth pero error en perfil: ${perfilError.message}. Verifique que usted es Super Administrador.`,
    }
  }

  await supabase.from('perfil_roles').delete().eq('perfil_id', nuevoUserId)
  const { error: rolError } = await supabase.from('perfil_roles').insert({
    perfil_id: nuevoUserId,
    rol_id:    data.rol_id,
  })

  if (rolError) {
    return { error: 'Usuario creado pero error al asignar rol: ' + rolError.message }
  }

  return { ok: true, userId: nuevoUserId }
}
