import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { procesarPromocionesAutomaticas } from '@/lib/promociones-sender'

export const dynamic = 'force-dynamic'

function autorizadoPorCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function autorizado(req: Request, permitirSesion: boolean) {
  if (autorizadoPorCron(req)) return true
  if (!permitirSesion) return false
  const supabaseSesion = await createClient()
  if (!supabaseSesion) return false
  const { data: { user } } = await supabaseSesion.auth.getUser()
  return Boolean(user)
}

async function procesar(req: Request, permitirSesion = false) {
  if (!(await autorizado(req, permitirSesion))) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY para procesar campañas automáticas.',
    }, { status: 500 })
  }

  const res = await procesarPromocionesAutomaticas(supabase)
  return NextResponse.json(res, { status: res.ok ? 200 : 207 })
}

export async function GET(req: Request) {
  return procesar(req, false)
}

export async function POST(req: Request) {
  return procesar(req, true)
}
