import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarPacientesActivos } from '@/lib/buscar-pacientes'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ pacientes: [] })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Sin conexión' }, { status: 500 })
  }

  const pacientes = await buscarPacientesActivos(supabase, q, 40)
  return NextResponse.json({ pacientes })
}
