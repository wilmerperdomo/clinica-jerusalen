import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import UsuariosClient from './usuarios-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuarios' }

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
  sueldo_fijo?: number | null
  tipo_nomina?: string | null
  email?: string | null
  rol?: { id: number; nombre: string; color: string; es_admin: boolean } | null
}

export default async function UsuariosPage() {
  const perfil = await getPerfilSucursal()
  // Solo administradores (incluye super admin) gestionan usuarios
  if (!perfil.esAdmin) redirect('/')

  const supabase = await createClient()
  if (!supabase) redirect('/login')

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
      sueldo_fijo: p.sueldo_fijo as number | null,
      tipo_nomina: p.tipo_nomina as string | null,
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
    { data: perfilRoles },
  ] = await Promise.all([
    supabase.from('perfiles').select('*, rol:roles(id, nombre, color, es_admin)').order('created_at', { ascending: false }),
    supabase.from('roles').select('*').order('nombre'),
    supabase.from('sucursales').select('*').order('nombre'),
    supabase.from('perfil_roles').select('perfil_id, rol_id'),
  ])

  if (perfilesLista.length === 0 && perfilesDirect?.length) {
    perfilesLista = perfilesDirect as PerfilRow[]
  }

  return (
    <UsuariosClient
      perfiles={perfilesLista}
      roles={roles || []}
      sucursales={sucursales || []}
      perfilRoles={perfilRoles || []}
      esSuperAdmin={perfil.esSuperAdmin}
    />
  )
}
