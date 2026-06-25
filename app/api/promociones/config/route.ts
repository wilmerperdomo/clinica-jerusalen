import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPromocionesEnvioConfig } from '@/lib/promociones-sender'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, config: getPromocionesEnvioConfig() })
}
