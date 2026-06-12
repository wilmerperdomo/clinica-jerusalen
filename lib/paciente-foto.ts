import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'pacientes-fotos'
const MAX_MB = 5
const TIPOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function subirFotoPaciente(
  supabase: SupabaseClient,
  pacienteId: number,
  file: File,
): Promise<string> {
  if (!TIPOS.includes(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WebP.')
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen no puede superar ${MAX_MB} MB.`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `paciente-${pacienteId}/foto-${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw new Error(upErr.message)

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { error: dbErr } = await supabase
    .from('pacientes')
    .update({ foto_url: publicUrl })
    .eq('id', pacienteId)
  if (dbErr) throw new Error(dbErr.message)

  return publicUrl
}

export async function eliminarFotoPaciente(
  supabase: SupabaseClient,
  pacienteId: number,
): Promise<void> {
  const { error } = await supabase
    .from('pacientes')
    .update({ foto_url: null })
    .eq('id', pacienteId)
  if (error) throw new Error(error.message)
}
