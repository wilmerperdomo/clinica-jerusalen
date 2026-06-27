import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { importarComisionesDesdeCaja } from '@/lib/planilla-caja-comisiones'
import { rangoQuincena } from '@/lib/planilla-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { esSuperAdmin, esAdmin, sucursalId } = await getPerfilSucursal()
  if (!esSuperAdmin && !esAdmin) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const anio = Number(req.nextUrl.searchParams.get('anio')) || new Date().getFullYear()
  const mes = Number(req.nextUrl.searchParams.get('mes')) || new Date().getMonth() + 1
  const quincena = (Number(req.nextUrl.searchParams.get('quincena')) || 1) as 1 | 2
  const { fecha_inicio, fecha_fin } = rangoQuincena(anio, mes, quincena)

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Sin conexión' }, { status: 500 })

  const lineas = await importarComisionesDesdeCaja(supabase, {
    desde: fecha_inicio,
    hasta: fecha_fin,
    sucursalId,
    esSuperAdmin,
  })

  return NextResponse.json({ lineas, periodo: { fecha_inicio, fecha_fin } })
}
