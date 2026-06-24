import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import PromocionesClient from './promociones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Promociones y Publicidad' }

export default async function PromocionesPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin, sucursalNombre } = await getPerfilSucursal()

  let promosQuery = supabase
    .from('promociones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  let campanasQuery = supabase
    .from('promocion_campanas')
    .select('*, promocion:promociones(*)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!esSuperAdmin && sucursalId) {
    promosQuery = promosQuery.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
    campanasQuery = campanasQuery.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
  }

  const [{ data: promociones }, { data: campanas }, { data: sucursales }, statsRes] = await Promise.all([
    promosQuery,
    campanasQuery,
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    (() => {
      let q = supabase.from('pacientes').select('id, celular, telefono, correo, activo').limit(8000)
      if (!esSuperAdmin && sucursalId) q = q.eq('sucursal_id', sucursalId)
      return q
    })(),
  ])

  const pacientes = statsRes.data ?? []
  const activos = pacientes.filter(p => {
    const activo = p.activo as boolean | string | null | undefined
    return activo !== false && activo !== '0' && activo !== 'false'
  })
  const conWhatsApp = activos.filter(p => {
    const raw = p.celular || p.telefono
    return raw && raw.replace(/\D/g, '').length >= 8
  })
  const conCorreo = activos.filter(p => p.correo?.trim())

  return (
    <PromocionesClient
      promocionesIniciales={promociones ?? []}
      campanasIniciales={campanas ?? []}
      sucursales={sucursales ?? []}
      esSuperAdmin={esSuperAdmin}
      sucursalId={sucursalId}
      sucursalNombre={sucursalNombre}
      stats={{
        totalActivos: activos.length,
        conWhatsApp: conWhatsApp.length,
        conCorreo: conCorreo.length,
      }}
    />
  )
}
