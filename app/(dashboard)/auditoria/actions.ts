'use server'

import { getPerfilSucursal } from '@/lib/get-sucursal'
import { createAdminClient } from '@/lib/supabase/server'
import { crearRespaldo } from '@/lib/respaldos'

export async function generarRespaldoManual() {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) return { ok: false as const, error: 'No autorizado' }
  return crearRespaldo({ tipo: 'MANUAL', userId: perfil.userId, userNombre: perfil.nombre })
}

export async function urlDescargaRespaldo(archivo: string) {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) return { ok: false as const, error: 'No autorizado' }
  const admin = createAdminClient()
  if (!admin) return { ok: false as const, error: 'Service role no configurado' }
  const { data, error } = await admin.storage.from('respaldos').createSignedUrl(archivo, 300, { download: true })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, url: data.signedUrl }
}

export async function eliminarRespaldo(id: number, archivo: string) {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) return { ok: false as const, error: 'No autorizado' }
  const admin = createAdminClient()
  if (!admin) return { ok: false as const, error: 'Service role no configurado' }
  await admin.storage.from('respaldos').remove([archivo])
  const { error } = await admin.from('respaldos').delete().eq('id', id)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
