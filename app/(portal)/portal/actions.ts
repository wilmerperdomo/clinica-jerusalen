'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizarCodigoPaciente } from '@/lib/paciente-utils'
import {
  verifyPassword, setSesionPortal, limpiarSesionPortal,
} from '@/lib/portal/session'

const MAX_INTENTOS = 5
const BLOQUEO_MIN = 15

export interface PortalLoginState {
  error?: string
}

export async function loginPortal(
  _prev: PortalLoginState,
  formData: FormData,
): Promise<PortalLoginState> {
  const usuario = normalizarCodigoPaciente(String(formData.get('usuario') || ''))
  const password = String(formData.get('password') || '')

  if (!usuario || !password) {
    return { error: 'Ingrese su número de identidad y su contraseña.' }
  }

  const admin = createAdminClient()
  if (!admin) return { error: 'El portal no está disponible en este momento.' }

  const { data: cuenta } = await admin
    .from('paciente_portal')
    .select('*')
    .eq('usuario', usuario)
    .maybeSingle()

  const credInvalida = { error: 'Identidad o contraseña incorrecta.' }
  if (!cuenta || !cuenta.activo) return credInvalida

  if (cuenta.bloqueado_hasta && new Date(cuenta.bloqueado_hasta) > new Date()) {
    return { error: 'Cuenta temporalmente bloqueada por varios intentos. Intente más tarde.' }
  }

  const ok = verifyPassword(password, cuenta.password_hash, cuenta.password_salt)
  if (!ok) {
    const intentos = (cuenta.intentos ?? 0) + 1
    const upd: Record<string, unknown> = { intentos }
    if (intentos >= MAX_INTENTOS) {
      upd.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString()
      upd.intentos = 0
    }
    await admin.from('paciente_portal').update(upd).eq('id', cuenta.id)
    return credInvalida
  }

  await admin.from('paciente_portal')
    .update({ intentos: 0, bloqueado_hasta: null, last_login: new Date().toISOString() })
    .eq('id', cuenta.id)

  await setSesionPortal(cuenta.paciente_id)
  redirect('/portal')
}

export async function logoutPortal(): Promise<void> {
  await limpiarSesionPortal()
  redirect('/portal/login')
}
