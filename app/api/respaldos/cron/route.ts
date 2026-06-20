import { NextResponse } from 'next/server'
import { crearRespaldo } from '@/lib/respaldos'

export const dynamic = 'force-dynamic'

/**
 * Respaldo automático programado.
 * Vercel Cron envía `Authorization: Bearer <CRON_SECRET>` cuando CRON_SECRET
 * está configurado. Si no hay CRON_SECRET, el endpoint queda abierto (solo
 * recomendado en entornos sin cron).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  const res = await crearRespaldo({ tipo: 'AUTOMATICO' })
  return NextResponse.json(res, { status: res.ok ? 200 : 500 })
}
