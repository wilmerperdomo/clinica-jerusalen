import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { repararPerfilUsuario } from '@/lib/reparar-perfil'

export interface PerfilSucursal {
  userId:         string
  sucursalId:     number | null
  sucursalNombre: string
  rolId:          number | null
  esSuperAdmin:   boolean
  esAdmin:        boolean
  nombre:         string
  rol:            string
}

const MODULOS_SUPER_ADMIN_FALLBACK = [
  'dashboard', 'agenda', 'notificaciones', 'consultas', 'pacientes', 'laboratorio', 'expediente',
  'ventas', 'compras', 'cxp', 'proveedores', 'inventario', 'productos',
  'membresias', 'cotizaciones', 'facturacion', 'reportes', 'planilla', 'control-financiero',
  'configuracion',
]

type RolData = { nombre: string; es_admin: boolean; es_super_admin?: boolean }

function esRolSuperAdmin(rol: RolData | null): boolean {
  if (!rol) return false
  if (rol.es_super_admin === true) return true
  return rol.nombre === 'Super Administrador'
}

async function leerRol(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rolId: number,
): Promise<RolData | null> {
  const { data, error } = await supabase
    .from('roles')
    .select('nombre, es_admin, es_super_admin')
    .eq('id', rolId)
    .maybeSingle()

  if (!error && data) return data as RolData

  const { data: basico } = await supabase
    .from('roles')
    .select('nombre, es_admin')
    .eq('id', rolId)
    .maybeSingle()

  return basico as RolData | null
}

async function primeraSucursal(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('sucursales')
    .select('id, nombre')
    .order('id')
    .limit(1)
    .maybeSingle()
  return data ? { id: Number(data.id), nombre: data.nombre as string } : null
}

export async function getPerfilSucursal(): Promise<PerfilSucursal> {
  const supabase = await createClient()

  const vacio: PerfilSucursal = {
    userId: '', sucursalId: null, sucursalNombre: 'Sin sucursal',
    rolId: null, esSuperAdmin: false, esAdmin: false, nombre: '', rol: '',
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return vacio

  const adminClient = createAdminClient()

  let p: {
    nombre: string | null
    apellido: string | null
    sucursal_id: number | null
    rol_id: number | null
  } | null = null

  const { data: pSesion } = await supabase
    .from('perfiles')
    .select('nombre, apellido, sucursal_id, rol_id')
    .eq('id', user.id)
    .maybeSingle()

  p = pSesion

  if (!p) {
    const { data: pAdmin } = await adminClient
      .from('perfiles')
      .select('nombre, apellido, sucursal_id, rol_id')
      .eq('id', user.id)
      .maybeSingle()
    p = pAdmin
  }

  if (!p) {
    await repararPerfilUsuario(user.id, user.email ?? undefined)
    const { data: pNuevo } = await adminClient
      .from('perfiles')
      .select('nombre, apellido, sucursal_id, rol_id')
      .eq('id', user.id)
      .maybeSingle()
    p = pNuevo
  }

  let rolId = p?.rol_id != null ? Number(p.rol_id) : null
  let rolData: RolData | null = null

  if (rolId) {
    rolData = await leerRol(supabase, rolId)
  } else {
    const { data: pr } = await supabase
      .from('perfil_roles')
      .select('rol_id')
      .eq('perfil_id', user.id)
      .limit(1)
      .maybeSingle()
    if (pr?.rol_id) {
      rolId = Number(pr.rol_id)
      rolData = await leerRol(supabase, rolId)
    }
  }

  const esSuperAdmin = esRolSuperAdmin(rolData)
  const esAdmin      = esSuperAdmin || rolData?.es_admin === true
  const rolNombre    = rolData?.nombre ?? ''

  let sucursalId = p?.sucursal_id != null ? Number(p.sucursal_id) : null
  let sucursalNombre = ''

  if (esSuperAdmin) {
    sucursalNombre = 'Todas las sucursales'
    if (!sucursalId) {
      const pri = await primeraSucursal(supabase)
      sucursalId = pri?.id ?? 1
    }
  } else if (sucursalId) {
    const { data: suc } = await supabase
      .from('sucursales')
      .select('nombre')
      .eq('id', sucursalId)
      .maybeSingle()
    sucursalNombre = suc?.nombre ?? `Sucursal #${sucursalId}`
  } else {
    const pri = await primeraSucursal(supabase)
    if (pri) {
      sucursalId = pri.id
      sucursalNombre = pri.nombre
    } else {
      sucursalNombre = 'Sin sucursal'
    }
  }

  const nombre = p
    ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim()
    : ''

  return {
    userId:         user.id,
    sucursalId,
    sucursalNombre,
    rolId,
    esSuperAdmin,
    esAdmin,
    nombre:         nombre || (user.email ?? ''),
    rol:            rolNombre,
  }
}

async function listarClavesModulos(): Promise<string[]> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  let { data: mods } = await adminClient.from('modulos').select('clave').eq('activo', true)
  if (!mods?.length) {
    const { data: modsSesion } = await supabase.from('modulos').select('clave').eq('activo', true)
    mods = modsSesion
  }
  const claves = (mods ?? []).map(m => m.clave).filter(Boolean) as string[]
  return claves.length > 0 ? claves : MODULOS_SUPER_ADMIN_FALLBACK
}

function clavesDesdePermisos(
  perms: { permisos?: { accion?: string; modulos?: { clave?: string } } }[] | null,
): string[] {
  return (perms ?? [])
    .filter(rp => rp.permisos?.accion === 'ver')
    .map(rp => rp.permisos?.modulos?.clave)
    .filter(Boolean) as string[]
}

export async function getModulosPermitidos(
  rolId: number | null,
  esSuperAdmin: boolean,
  esAdmin = false,
): Promise<string[]> {
  if (esSuperAdmin) return listarClavesModulos()
  if (!rolId) return []

  const supabase = await createClient()
  const adminClient = createAdminClient()

  let { data: perms } = await adminClient
    .from('rol_permisos')
    .select('permisos(accion, modulos(clave))')
    .eq('rol_id', rolId)

  if (!perms?.length) {
    const { data: permsSesion } = await supabase
      .from('rol_permisos')
      .select('permisos(accion, modulos(clave))')
      .eq('rol_id', rolId)
    perms = permsSesion
  }

  const claves = clavesDesdePermisos(perms)
  if (claves.length === 0 && esAdmin) return listarClavesModulos()
  return claves
}

export function buscarSucursal<T extends { id: number }>(
  sucursales: T[],
  sucursalId: number | null | undefined,
): T | null {
  if (sucursalId == null) return null
  return sucursales.find(s => Number(s.id) === Number(sucursalId)) ?? null
}
