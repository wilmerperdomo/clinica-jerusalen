import { createClient } from '@/lib/supabase/server'
import PacientesClient from './pacientes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pacientes' }

export default async function PacientesPage() {
  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [{ data: pacientes }, { data: listas }, { data: membresiasActivas }, { data: colonias }] = await Promise.all([
    supabase
      .from('pacientes')
      .select(`
        id, codigo, tipo, nombre, apellido1, apellido2,
        nombre_empresa, rtn_empresa, contacto,
        telefono, celular, correo, responsable,
        fecha_nac, genero, grupo_sanguineo, puntos, activo,
        lista_id, colonia_id, created_at, foto_url,
        listas_precio(nombre),
        colonias(id, nombre)
      `)
      .order('activo', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),

    supabase.from('listas_precio').select('id, nombre').eq('activo', true),

    supabase
      .from('membresias')
      .select('paciente_id, tipo_id, fecha_fin, numero_carnet, tipo:membresia_tipos(nombre)')
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy),

    supabase
      .from('colonias')
      .select('id, nombre, activo')
      .eq('activo', true)
      .order('nombre'),
  ])

  const memMap: Record<number, { tipo: string; fecha_fin: string; numero_carnet?: string }> = {}
  for (const m of membresiasActivas ?? []) {
    const tipoNombre = Array.isArray(m.tipo) ? m.tipo[0]?.nombre : (m.tipo as { nombre: string } | null)?.nombre
    memMap[m.paciente_id] = { tipo: tipoNombre ?? '—', fecha_fin: m.fecha_fin, numero_carnet: m.numero_carnet ?? undefined }
  }

  return (
    <PacientesClient
      pacientes={pacientes ?? []}
      listas={listas ?? []}
      colonias={colonias ?? []}
      membresiasMap={memMap}
    />
  )
}
