import { NextRequest, NextResponse } from 'next/server'
import { getSesionPortal } from '@/lib/portal/session'
import { obtenerArchivoLab, respuestaHttpArchivoLab } from '@/lib/lab-archivos-server'
import { parseLabEncabezadoInforme } from '@/lib/lab-plantilla-assets'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ grupo: string; id: string }> },
) {
  const sesion = await getSesionPortal()
  if (!sesion) {
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }

  const { id } = await params
  const archivoId = Number(id)
  if (!archivoId) return new NextResponse('No encontrado', { status: 404 })

  const archivo = await obtenerArchivoLab(archivoId)
  if (!archivo || archivo.paciente_id !== sesion.pacienteId) {
    return new NextResponse('No autorizado', { status: 403 })
  }

  const encabezado = parseLabEncabezadoInforme(request.nextUrl.searchParams.get('encabezado'))
  const res = await respuestaHttpArchivoLab(archivo, undefined, encabezado)
  if (!res) return new NextResponse('Archivo no disponible', { status: 404 })
  return res
}
