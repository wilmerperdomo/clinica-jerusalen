import { createAdminClient } from '@/lib/supabase/server'
import { prepararDescargaResultado } from '@/lib/lab-pdf-template'
import type { LabEncabezadoInforme } from '@/lib/lab-plantilla-assets'
import type { LabArchivo } from '@/lib/lab-archivos'
export async function obtenerArchivoLab(id: number): Promise<LabArchivo | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin.from('lab_archivos').select('*').eq('id', id).maybeSingle()
  return data as LabArchivo | null
}

export async function descargarBytesArchivoLab(archivo: LabArchivo): Promise<Uint8Array | null> {
  const admin = createAdminClient()
  if (!admin) return null
  const { data, error } = await admin.storage.from('lab-resultados').download(archivo.storage_path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

export async function respuestaHttpArchivoLab(
  archivo: LabArchivo,
  nombreDescarga?: string,
  encabezado: LabEncabezadoInforme = 'maquila',
) {
  const raw = await descargarBytesArchivoLab(archivo)
  if (!raw) return null
  const { bytes, contentType } = await prepararDescargaResultado(raw, archivo.mime_type, encabezado)
  const nombre = nombreDescarga ?? archivo.nombre_archivo ?? 'resultado-laboratorio.pdf'
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${nombre.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function listarArchivosGrupo(labGrupoId: string): Promise<LabArchivo[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data } = await admin
    .from('lab_archivos')
    .select('*')
    .eq('lab_grupo_id', labGrupoId)
    .order('created_at', { ascending: false })
  return (data ?? []) as LabArchivo[]
}

export async function listarArchivosPaciente(pacienteId: number): Promise<LabArchivo[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data } = await admin
    .from('lab_archivos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
  return (data ?? []) as LabArchivo[]
}
