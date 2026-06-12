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

  type PerfilRow = {
    id: string
    nombre: string | null
    apellido: string | null
    cedula: string | null
    telefono: string | null
    sucursal_id: number | null
    rol_id: number | null
    activo: boolean
    created_at: string
    email?: string | null
    rol?: { id: number; nombre: string; color: string; es_admin: boolean } | null
  }

  const { data: perfilesRpc, error: perfilesRpcError } = await supabase.rpc('fn_listar_perfiles_admin')
  let perfilesLista: PerfilRow[] = []

  if (!perfilesRpcError && Array.isArray(perfilesRpc)) {
    perfilesLista = perfilesRpc.map((p: Record<string, unknown>) => ({
      id:          p.id as string,
      nombre:      p.nombre as string | null,
      apellido:    p.apellido as string | null,
      cedula:      p.cedula as string | null,
      telefono:    p.telefono as string | null,
      sucursal_id: p.sucursal_id as number | null,
      rol_id:      p.rol_id as number | null,
      activo:      Boolean(p.activo),
      created_at:  (p.created_at as string) ?? '',
      email:       p.email as string | null,
      rol: p.rol_nombre ? {
        id:       Number(p.rol_id),
        nombre:   p.rol_nombre as string,
        color:    (p.rol_color as string) ?? '#64748b',
        es_admin: Boolean(p.rol_es_admin),
      } : null,
    }))
  }

  const [
    { data: perfilesDirect },
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

  if (perfilesLista.length === 0 && perfilesDirect?.length) {
    perfilesLista = perfilesDirect as PerfilRow[]
  }

  return (
    <ConfigClient
      perfiles={perfilesLista}
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
