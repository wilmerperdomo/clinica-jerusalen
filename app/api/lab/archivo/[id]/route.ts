import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerArchivoLab, respuestaHttpArchivoLab } from '@/lib/lab-archivos-server'

export const dynamic = 'force-dynamic'

/** Descarga de resultado maquilado para personal autenticado (con plantilla de la clínica). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return new NextResponse('No disponible', { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const { id } = await params
  const archivoId = Number(id)
  if (!archivoId) return new NextResponse('No encontrado', { status: 404 })

  const archivo = await obtenerArchivoLab(archivoId)
  if (!archivo) return new NextResponse('No encontrado', { status: 404 })

  const res = await respuestaHttpArchivoLab(archivo)
  if (!res) return new NextResponse('Archivo no disponible', { status: 404 })
  return res
}
