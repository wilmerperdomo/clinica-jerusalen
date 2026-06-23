import { NextResponse } from 'next/server'
import { getEnvDiagnostics } from '@/lib/supabase/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de solo lectura para verificar la configuración del entorno en
 * producción SIN exponer secretos. Devuelve únicamente booleanos y la longitud
 * de la clave (la longitud no revela el secreto).
 */
export async function GET() {
  const diag = getEnvDiagnostics()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  const serviceKeyPresent = serviceKey.length > 0
  const serviceKeyLength = serviceKey.length

  return NextResponse.json({
    serviceOk: diag.serviceOk,
    serviceKeyPresent,
    serviceKeyLength,
    urlOk: diag.urlOk,
    anonOk: diag.anonOk,
    usingFallback: diag.usingFallback,
    nodeEnv: process.env.NODE_ENV,
  })
}
