import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import AuditoriaClient from './auditoria-client'
import {
  fetchResumenAuditoria,
  fetchTablasBitacora,
  fetchUsuariosBitacora,
  fetchAccesosModulo,
  registrarAccesoAuditoria,
} from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Auditoría y Respaldos' }

export default async function AuditoriaPage() {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) redirect('/')

  const supabase = await createClient()
  if (!supabase) redirect('/')

  const [{ data: respaldos }, resumenRes, tablasRes, usuariosRes, accesosRes] = await Promise.all([
    supabase
      .from('respaldos')
      .select('id, archivo, tipo, tablas, registros, tamano_bytes, generado_por_nombre, nota, hash_sha256, comprimido, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    fetchResumenAuditoria(),
    fetchTablasBitacora(),
    fetchUsuariosBitacora(),
    fetchAccesosModulo(12),
  ])

  await registrarAccesoAuditoria('MODULO_ABIERTO')

  const serviceRoleDisponible = !!createAdminClient()

  return (
    <AuditoriaClient
      respaldos={respaldos ?? []}
      resumen={resumenRes.ok ? resumenRes.resumen! : {
        totalEventos: 0,
        eliminacionesHoy: 0,
        eventosPorDia: [],
        topUsuarios: [],
        topTablas: [],
        ultimoRespaldoAuto: null,
        horasSinRespaldoAuto: null,
        respaldoSaludable: false,
      }}
      tablas={tablasRes.ok ? tablasRes.tablas : []}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      accesos={accesosRes.ok ? accesosRes.rows : []}
      serviceRoleDisponible={serviceRoleDisponible}
    />
  )
}
