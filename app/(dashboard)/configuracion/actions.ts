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

  const { error: rpcError } = await supabase.rpc('fn_admin_upsert_perfil', {
    p_user_id:     nuevoUserId,
    p_nombre:      data.nombre,
    p_apellido:    data.apellido,
    p_cedula:      data.cedula      || null,
    p_telefono:    data.telefono    || null,
    p_rol_id:      data.rol_id,
    p_sucursal_id: data.sucursal_id,
  })

  if (rpcError) {
    const faltaSql = rpcError.message?.includes('fn_admin_upsert_perfil')
      || rpcError.code === 'PGRST202'
    if (faltaSql) {
      return {
        error: 'Ejecute en Supabase → SQL Editor el archivo scripts/FIX-RLS-PERFILES.sql y vuelva a crear el usuario.',
      }
    }
    return {
      error: `Usuario creado en Auth pero error en perfil: ${rpcError.message}`,
    }
  }

  return {
    ok: true,
    userId: nuevoUserId,
    aviso: serviceKey
      ? undefined
      : 'Si no puede entrar: ejecute scripts/ARREGLAR-TODO-USUARIOS.sql en Supabase o desactive "Confirm email".',
  }
}
