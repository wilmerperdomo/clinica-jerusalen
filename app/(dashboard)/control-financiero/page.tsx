import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'
import ControlFinancieroClient from './control-financiero-client'

export const metadata = { title: 'Control Financiero — Clínica Jerusalén' }
export const dynamic = 'force-dynamic'

export default async function ControlFinancieroPage() {
  const supabase = await createClient()
  const perfil = await getPerfilSucursal()
  const modulos = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)

  if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('control-financiero')) {
    redirect('/')
  }

  const { data: sucursales } = await supabase
    .from('sucursales')
    .select('id, nombre')
    .order('nombre')

  const hoy = new Date()

  return (
    <ControlFinancieroClient
      sucursales={sucursales ?? []}
      sucursalDefault={perfil.esSuperAdmin ? null : perfil.sucursalId}
      esSuperAdmin={perfil.esSuperAdmin}
      anioInicial={hoy.getFullYear()}
      mesInicial={hoy.getMonth() + 1}
    />
  )
}
