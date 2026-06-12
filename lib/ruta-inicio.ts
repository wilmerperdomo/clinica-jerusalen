import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { esRolEnfermeria } from '@/lib/consultas-utils'

export const RUTA_INICIO = '/'
export const RUTA_CAJA = '/ventas'

/** Enfermera, cajero o recepción — deben iniciar en apertura de caja */
export function debeIniciarEnCaja(roles: string[]): boolean {
  return roles.some(esRolEnfermeria)
}

async function rolesDelUsuario(
  perfil: Awaited<ReturnType<typeof getPerfilSucursal>>,
): Promise<string[]> {
  const roles: string[] = perfil.rol ? [perfil.rol] : []

  if (!perfil.userId) return roles

  const supabase = await createClient()
  if (!supabase) return roles

  const { data: perfilRoles } = await supabase
    .from('perfil_roles')
    .select('roles(nombre)')
    .eq('perfil_id', perfil.userId)

  for (const pr of perfilRoles ?? []) {
    const nombre = (pr.roles as { nombre?: string } | null)?.nombre
    if (nombre && !roles.includes(nombre)) roles.push(nombre)
  }

  return roles
}

/** Ruta de inicio según rol: cajero/enfermería → apertura de caja */
export async function obtenerRutaInicioSesion(): Promise<string> {
  const perfil = await getPerfilSucursal()

  if (perfil.esSuperAdmin || perfil.esAdmin) return RUTA_INICIO

  const roles = await rolesDelUsuario(perfil)
  if (debeIniciarEnCaja(roles)) return RUTA_CAJA

  return RUTA_INICIO
}
