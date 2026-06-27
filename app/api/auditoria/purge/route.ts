import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Purga eventos de bitácora mayores a N meses (cron mensual). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Sin service role' }, { status: 500 })
  }

  const meses = Number(process.env.AUDITORIA_RETENCION_MESES ?? 12)
  const { data, error } = await admin.rpc('fn_purgar_auditoria_antigua', { p_meses: meses })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, eliminados: data })
}
