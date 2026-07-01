import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { procesarMensajeEntrante } from '@/lib/agentes/orchestrator'
import { parseMessengerWebhook, verificarWebhookToken } from '@/lib/agentes/channels/normalizer'
import { enviarRespuestaCanal } from '@/lib/agentes/channels/outbound'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (verificarWebhookToken(
    searchParams.get('hub.mode'),
    searchParams.get('hub.verify_token'),
    process.env.AGENTES_WEBHOOK_SECRET,
  )) {
    return new NextResponse(searchParams.get('hub.challenge') ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const sb = createAdminClient()
  if (!sb) return NextResponse.json({ error: 'Supabase admin no disponible' }, { status: 500 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const entradas = parseMessengerWebhook(body)
  const resultados = []
  const errores: { etapa: string; error: string }[] = []

  for (const entrada of entradas) {
    try {
      const res = await procesarMensajeEntrante(sb, entrada)
      for (const r of res.respuestas) {
        try {
          await enviarRespuestaCanal({
            canal: 'messenger_pagina',
            contacto: entrada.contactoExterno,
            texto: r.texto,
            proveedor: 'messenger',
          })
        } catch (e) {
          errores.push({
            etapa: 'envio',
            error: e instanceof Error ? e.message : 'Error al enviar respuesta',
          })
        }
      }
      resultados.push(res)
    } catch (e) {
      errores.push({
        etapa: 'procesamiento',
        error: e instanceof Error ? e.message : 'Error al procesar mensaje',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    procesados: resultados.length,
    errores: errores.length ? errores : undefined,
  })
}
