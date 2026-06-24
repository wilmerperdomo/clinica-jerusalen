import type { SupabaseClient } from '@supabase/supabase-js'
import type { FiltroAudiencia } from '@/lib/promociones-utils'

const BUCKET = 'promociones'
const MAX_MB = 8
const TIPOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

export async function subirImagenPromocion(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  if (!TIPOS.includes(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG, WebP o GIF.')
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen no puede superar ${MAX_MB} MB.`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `promo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  if (upErr) throw new Error(upErr.message)

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

export interface PacienteAudiencia {
  id: number
  codigo: string
  nombre: string
  apellido1?: string | null
  apellido2?: string | null
  celular?: string | null
  telefono?: string | null
  correo?: string | null
  activo?: boolean | string | null
}

function pacienteActivo(p: PacienteAudiencia): boolean {
  if (p.activo === false) return false
  const a = p.activo
  if (a === '0' || a === 'false') return false
  return true
}

function tieneWhatsApp(p: PacienteAudiencia): boolean {
  const raw = p.celular || p.telefono
  if (!raw) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 8
}

function tieneCorreo(p: PacienteAudiencia): boolean {
  return !!p.correo?.trim()
}

export async function resolverAudiencia(
  supabase: SupabaseClient,
  filtro: FiltroAudiencia,
  opts: { sucursalId?: number | null; esSuperAdmin?: boolean },
): Promise<PacienteAudiencia[]> {
  let q = supabase
    .from('pacientes')
    .select('id, codigo, nombre, apellido1, apellido2, celular, telefono, correo, activo')
    .order('nombre')
    .limit(8000)

  const sid = filtro.sucursal_id ?? (!opts.esSuperAdmin ? opts.sucursalId : null)
  if (sid) q = q.eq('sucursal_id', sid)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let lista = (data ?? []).filter(pacienteActivo) as PacienteAudiencia[]

  if (filtro.tipo === 'manual' && filtro.paciente_ids?.length) {
    const ids = new Set(filtro.paciente_ids)
    lista = lista.filter(p => ids.has(p.id))
  } else if (filtro.tipo === 'whatsapp') {
    lista = lista.filter(tieneWhatsApp)
  } else if (filtro.tipo === 'correo') {
    lista = lista.filter(tieneCorreo)
  }

  return lista
}

export function canalesParaPaciente(
  p: PacienteAudiencia,
  canalCampana: 'whatsapp' | 'email' | 'ambos',
): ('whatsapp' | 'email')[] {
  const canales: ('whatsapp' | 'email')[] = []
  if ((canalCampana === 'whatsapp' || canalCampana === 'ambos') && tieneWhatsApp(p)) {
    canales.push('whatsapp')
  }
  if ((canalCampana === 'email' || canalCampana === 'ambos') && tieneCorreo(p)) {
    canales.push('email')
  }
  return canales
}
