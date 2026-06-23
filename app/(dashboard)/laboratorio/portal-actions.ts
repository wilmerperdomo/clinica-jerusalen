'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizarCodigoPaciente } from '@/lib/paciente-utils'
import { hashPassword, generarPassword } from '@/lib/portal/session'

export interface AccesoPortalResult {
  ok: boolean
  usuario?: string
  password?: string
  error?: string
}

/**
 * Genera (o regenera) las credenciales del portal para un paciente.
 * Solo staff autenticado. Devuelve la contraseña en claro UNA sola vez.
 */
export async function generarAccesoPortal(pacienteId: number): Promise<AccesoPortalResult> {
  const supabase = await createClient()
  if (!supabase) return { ok: false, error: 'Sesión no disponible' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autorizado' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor' }

  const { data: pac } = await admin
    .from('pacientes')
    .select('id, codigo')
    .eq('id', pacienteId)
    .maybeSingle()

  if (!pac) return { ok: false, error: 'Paciente no encontrado' }

  const usuario = normalizarCodigoPaciente(pac.codigo)
  if (!usuario) return { ok: false, error: 'El paciente no tiene un número de identidad/código válido para crear el acceso.' }

  const password = generarPassword(6)
  const { hash, salt } = hashPassword(password)

  const { data: existente } = await admin
    .from('paciente_portal')
    .select('id, paciente_id')
    .eq('usuario', usuario)
    .maybeSingle()

  if (existente && existente.paciente_id !== pacienteId) {
    return { ok: false, error: 'Esa identidad ya está asignada a otro paciente en el portal.' }
  }

  const payload = {
    paciente_id: pacienteId,
    usuario,
    password_hash: hash,
    password_salt: salt,
    activo: true,
    intentos: 0,
    bloqueado_hasta: null,
    creado_por: user.id,
    updated_at: new Date().toISOString(),
  }

  const { data: porPaciente } = await admin
    .from('paciente_portal')
    .select('id')
    .eq('paciente_id', pacienteId)
    .maybeSingle()

  const err = porPaciente
    ? (await admin.from('paciente_portal').update(payload).eq('id', porPaciente.id)).error
    : (await admin.from('paciente_portal').insert(payload)).error

  if (err) {
    return { ok: false, error: err.message.includes('paciente_portal') ? 'Falta la migración del portal (FIX-PORTAL-PACIENTE.sql)' : err.message }
  }

  return { ok: true, usuario, password }
}
