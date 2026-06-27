import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { obtenerFidelidadConfig } from '@/lib/fidelidad-config'
import FidelidadClient from './fidelidad-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Puntos de Fidelidad' }

export default async function FidelidadPage() {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin && !perfil.esAdmin) redirect('/')

  const supabase = await createClient()
  if (!supabase) redirect('/login')

  const config = await obtenerFidelidadConfig(supabase)

  return <FidelidadClient configInicial={config} />
}
