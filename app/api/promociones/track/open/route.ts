import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { PIXEL_GIF } from '@/lib/promociones-plantillas'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (token) {
    const supabase = createAdminClient()
    if (supabase) {
      const ahora = new Date().toISOString()
      await supabase
        .from('promocion_envios')
        .update({ abierto_at: ahora })
        .eq('tracking_token', token)
        .is('abierto_at', null)
    }
  }

  return new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
