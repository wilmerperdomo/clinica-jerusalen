import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerArchivoLab, respuestaHttpArchivoLab } from '@/lib/lab-archivos-server'
import { parseLabEncabezadoInforme } from '@/lib/lab-plantilla-assets'

export const dynamic = 'force-dynamic'

/** Descarga de resultado maquilado para personal autenticado. */
export async function GET(
  request: NextRequest,
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

  const encabezado = parseLabEncabezadoInforme(request.nextUrl.searchParams.get('encabezado'))
  const res = await respuestaHttpArchivoLab(archivo, undefined, encabezado)
  if (!res) return new NextResponse('Archivo no disponible', { status: 404 })
  return res
}
