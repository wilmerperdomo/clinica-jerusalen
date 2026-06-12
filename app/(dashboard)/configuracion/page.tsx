import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'
import ConfigClient from './config-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configuración' }

export default async function ConfiguracionPage() {
  const perfil = await getPerfilSucursal()
  const modulosAcceso = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)
  if (!perfil.esSuperAdmin && !modulosAcceso.includes('configuracion')) redirect('/')

  const supabase    = await createClient()
  if (!supabase) redirect('/login')

  const adminClient = createAdminClient()

  const accesoLogsQuery = adminClient
    ? adminClient
        .from('acceso_logs')
        .select('id, email, accion, ip, created_at, sucursal_id')
        .order('created_at', { ascending: false })
        .limit(200)
    : Promise.resolve({ data: [] })

  const [
    { data: perfiles },
    { data: roles },
    { data: sucursales },
    { data: modulos },
    { data: perfilRoles },
    { data: servicios },
    { data: permisos },
    { data: rolPermisos },
    { data: accesoLogs },
  ] = await Promise.all([
    supabase.from('perfiles').select('*, rol:roles(id, nombre, color, es_admin)').order('created_at', { ascending: false }),
    supabase.from('roles').select('*').order('nombre'),
    supabase.from('sucursales').select('*').order('nombre'),
    supabase.from('modulos').select('*').eq('activo', true).order('orden'),
    supabase.from('perfil_roles').select('perfil_id, rol_id'),
    supabase.from('servicios').select('*').order('nombre'),
    supabase.from('permisos').select('id, modulo_id, accion'),
    supabase.from('rol_permisos').select('rol_id, permiso_id'),
    accesoLogsQuery,
  ])

  return (
    <ConfigClient
      perfiles={perfiles || []}
      roles={roles || []}
      sucursales={sucursales || []}
      modulos={modulos || []}
      perfilRoles={perfilRoles || []}
      servicios={servicios || []}
      permisos={permisos || []}
      rolPermisos={rolPermisos || []}
      accesoLogs={accesoLogs || []}
      esSuperAdmin={perfil.esSuperAdmin}
    />
  )
}
