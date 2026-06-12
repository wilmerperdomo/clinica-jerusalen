'use server'

import { createClient } from '@supabase/supabase-js'
import { getPerfilSucursal } from '@/lib/get-sucursal'

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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceKey || !url) {
    return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en .env.local' }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rolNuevo } = await admin.from('roles').select('es_super_admin').eq('id', data.rol_id).maybeSingle()
  if (rolNuevo?.es_super_admin) {
    return { error: 'No se puede asignar el rol Super Administrador desde este formulario.' }
  }

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email:         data.email,
    password:      data.password,
    email_confirm: true,           // confirmar directo, sin email de verificación
    user_metadata: {
      nombre:   data.nombre,
      apellido: data.apellido,
    },
  })

  if (authError) return { error: authError.message }

  const nuevoUserId = authData.user?.id
  if (!nuevoUserId) return { error: 'No se pudo obtener el ID del usuario creado' }

  // 2. Crear o actualizar su perfil
  const { error: perfilError } = await admin.from('perfiles').upsert({
    id:          nuevoUserId,
    nombre:      data.nombre,
    apellido:    data.apellido,
    cedula:      data.cedula      || null,
    telefono:    data.telefono    || null,
    rol_id:      data.rol_id,
    sucursal_id: data.sucursal_id,
    activo:      true,
  })

  if (perfilError) return { error: perfilError.message }

  // 3. Vincular rol en perfil_roles (usado por permisos del sidebar)
  await admin.from('perfil_roles').delete().eq('perfil_id', nuevoUserId)
  const { error: rolError } = await admin.from('perfil_roles').insert({
    perfil_id: nuevoUserId,
    rol_id:    data.rol_id,
  })
  if (rolError) return { error: 'Usuario creado pero error al asignar rol: ' + rolError.message }

  return { ok: true, userId: nuevoUserId }
}
