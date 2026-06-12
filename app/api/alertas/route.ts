import { NextResponse } from 'next/server'
import { getAlertas } from '@/lib/get-alertas'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const alertas = await getAlertas()
    const criticas = alertas.filter(a => a.tipo === 'danger').length
    const advertencias = alertas.filter(a => a.tipo === 'warning').length
    return NextResponse.json({
      alertas,
      total: alertas.length,
      criticas,
      advertencias,
      actualizado: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ alertas: [], total: 0, criticas: 0, advertencias: 0, error: String(e) }, { status: 500 })
  }
}
