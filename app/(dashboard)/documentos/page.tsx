import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { PACIENTE_CONSULTA_SELECT } from '@/lib/consultas-utils'
import DocumentosClient from './documentos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Documentos Médicos' }

const DOCUMENTOS_SELECT = `
  id, tipo, numero_doc, correlativo, contenido, medico_nombre,
  created_at, updated_at, sucursal_id, consulta_id, paciente_id,
  consulta:consultas(id, fecha),
  paciente:pacientes(${PACIENTE_CONSULTA_SELECT}, direccion)
`

export default async function DocumentosPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin, sucursalNombre } = await getPerfilSucursal()

  const hace90 = new Date()
  hace90.setDate(hace90.getDate() - 90)
  const desde = hace90.toISOString()

  let docsQuery = supabase
    .from('consulta_documentos')
    .select(DOCUMENTOS_SELECT)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!esSuperAdmin && sucursalId) {
    docsQuery = docsQuery.eq('sucursal_id', sucursalId)
  }

  const [{ data: documentos }, { data: sucursales }] = await Promise.all([
    docsQuery,
    supabase.from('sucursales').select('id, nombre').order('nombre'),
  ])

  return (
    <DocumentosClient
      documentosIniciales={documentos ?? []}
      sucursales={sucursales ?? []}
      esSuperAdmin={esSuperAdmin}
      sucursalId={sucursalId}
      sucursalNombre={sucursalNombre}
    />
  )
}
