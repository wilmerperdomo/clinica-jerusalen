import { NextRequest, NextResponse } from 'next/server'
import { getSesionPortal } from '@/lib/portal/session'
import { cargarPortalPaciente, filasDeGrupo } from '@/lib/portal/data'
import { htmlInformeResultadosLab } from '@/lib/lab-print'
import { parseLabEncabezadoInforme } from '@/lib/lab-plantilla-assets'
import { calcularEdad } from '@/lib/lab-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ grupo: string }> },
) {
  const sesion = await getSesionPortal()
  if (!sesion) {
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }

  const { grupo: grupoRaw } = await params
  const grupoId = decodeURIComponent(grupoRaw)

  const data = await cargarPortalPaciente(sesion.pacienteId)
  if (!data) return new NextResponse('No disponible', { status: 404 })
  const res = filasDeGrupo(data, grupoId)
  if (!res) return new NextResponse('Resultado no encontrado', { status: 404 })

  const { grupo, filas } = res
  const fechaResultado = grupo.ordenes.map(o => o.fecha_resultado).filter(Boolean).sort().pop()
  const origin = new URL(request.url).origin

  const encabezado = parseLabEncabezadoInforme(request.nextUrl.searchParams.get('encabezado'))

  let html = htmlInformeResultadosLab(grupo, filas, {
    edad: calcularEdad(data.paciente?.fecha_nac),
    sexo: data.paciente?.genero,
    fechaResultado: fechaResultado ?? undefined,
    encabezado,
  }, origin)
  // Auto-abrir el diálogo de impresión (guardar como PDF)
  html = html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body>')

  return new NextResponse(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
