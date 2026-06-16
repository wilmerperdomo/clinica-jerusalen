'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { getPublicSupabaseEnv, getServiceRoleKey } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'

/** Traduce errores crudos de Supabase Auth a mensajes accionables en español. */
function traducirErrorAuth(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('rate limit') || (m.includes('email') && m.includes('limit'))) {
    return 'Límite de correos de Supabase alcanzado. Para crear usuarios sin enviar correos, configure SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel → Variables) o desactive "Confirm email" en Supabase → Authentication → Providers → Email. El límite se reinicia en ~1 hora.'
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'Ya existe un usuario con ese correo electrónico.'
  }
  if (m.includes('password')) {
    return 'La contraseña no cumple los requisitos (mínimo 6 caracteres).'
  }
  return msg
}

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
  const { esAdmin, esSuperAdmin, userId: adminUserId } = await getPerfilSucursal()
  if (!adminUserId || !esAdmin) {
    return { error: 'No autorizado. Solo administradores pueden crear usuarios.' }
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

  // Solo un super admin puede crear otro super admin
  if (rolNuevo?.es_super_admin && !esSuperAdmin) {
    return { error: 'No se puede asignar el rol Super Administrador desde este formulario.' }
  }

  const serviceKey = getServiceRoleKey()
  let nuevoUserId: string | undefined

  if (serviceKey) {
    // Camino recomendado: crea el usuario ya confirmado y NO envía ningún correo.
    const admin = createSupabaseClient(env.url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         data.email,
      password:      data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre, apellido: data.apellido },
    })

    if (authError) return { error: traducirErrorAuth(authError.message) }
    nuevoUserId = authData.user?.id
  } else {
    // Sin service key: signUp envía correo de confirmación (sujeto a rate limit).
    const anon = createSupabaseClient(env.url, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await anon.auth.signUp({
      email:    data.email,
      password: data.password,
      options:  { data: { nombre: data.nombre, apellido: data.apellido } },
    })

    if (authError) return { error: traducirErrorAuth(authError.message) }

    nuevoUserId = authData.user?.id
    if (!nuevoUserId) {
      return {
        error: 'No se pudo crear el usuario. Configure SUPABASE_SERVICE_ROLE_KEY o desactive "Confirm email" en Supabase → Authentication → Providers → Email.',
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

  if (!serviceKey) {
    await supabase.rpc('fn_confirmar_usuario_auth', { p_user_id: nuevoUserId })
  }

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
