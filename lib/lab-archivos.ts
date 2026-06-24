export const LAB_RESULTADOS_BUCKET = 'lab-resultados'

export interface LabArchivo {
  id: number
  lab_grupo_id: string
  paciente_id: number
  orden_id?: number | null
  storage_path: string
  nombre_archivo: string
  mime_type?: string | null
  tamano_bytes?: number | null
  tipo?: string
  created_at?: string
}

export function extensionArchivoLab(nombre: string): string {
  const p = nombre.split('.').pop()?.toLowerCase()
  if (p && p.length <= 5) return p
  return 'pdf'
}

export function aceptaArchivoResultadoLab(file: File): boolean {
  const n = file.name.toLowerCase()
  const okExt = n.endsWith('.pdf') || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')
  const okMime = file.type.startsWith('image/') || file.type === 'application/pdf'
  return okExt || okMime
}
