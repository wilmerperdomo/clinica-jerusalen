import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import AuditoriaClient from './auditoria-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Auditoría y Respaldos' }

export default async function AuditoriaPage() {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) redirect('/')

  const supabase = await createClient()
  if (!supabase) redirect('/')

  const [{ data: bitacora }, { data: respaldos }] = await Promise.all([
    supabase
      .from('auditoria_general')
      .select('id, tabla, registro_id, operacion, datos_antes, datos_despues, campos_cambiados, usuario_email, usuario_nombre, fecha')
      .order('fecha', { ascending: false })
      .limit(400),
    supabase
      .from('respaldos')
      .select('id, archivo, tipo, tablas, registros, tamano_bytes, generado_por_nombre, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const serviceRoleDisponible = !!createAdminClient()

  return (
    <AuditoriaClient
      bitacora={bitacora || []}
      respaldos={respaldos || []}
      serviceRoleDisponible={serviceRoleDisponible}
    />
  )
}
