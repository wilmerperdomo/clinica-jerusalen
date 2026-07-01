import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'

export async function puedeVerAgentesIa(): Promise<{
  ok: boolean
  esSuperAdmin: boolean
  esAdmin: boolean
  userId: string | null
}> {
  const perfil = await getPerfilSucursal()
  if (!perfil.userId) return { ok: false, esSuperAdmin: false, esAdmin: false, userId: null }

  const modulos = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)
  const ok = perfil.esSuperAdmin || perfil.esAdmin || modulos.includes('agentes_ia')

  return {
    ok,
    esSuperAdmin: perfil.esSuperAdmin,
    esAdmin: perfil.esAdmin,
    userId: perfil.userId,
  }
}
