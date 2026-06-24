import type { SupabaseClient } from '@supabase/supabase-js'
import { BRAND } from '@/lib/brand'
import { limpiarCelular } from '@/lib/mensajes-paciente'
import { fmtFecha, necesitaRecordatorio } from '@/lib/agenda-utils'

type PacienteCita = {
  id: number
  nombre?: string | null
  apellido1?: string | null
  celular?: string | null
  telefono?: string | null
}

type CitaRecordatorio = {
  id: number
  fecha: string
  hora: string
  estado: string
  recordatorio_estado?: string | null
  servicio_nombre?: string | null
  paciente?: PacienteCita | null
  servicio?: { nombre?: string | null } | null
}

export interface ProcesarRecordatoriosAgendaResultado {
  ok: boolean
  candidatos: number
  enviados: number
  omitidos: number
  errores: string[]
  config: {
    whatsapp: boolean
  }
}

function fechaHoyHN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' })
}

function addDays(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function whatsappConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v20.0'
  const templateName = process.env.WHATSAPP_CITA_TEMPLATE_NAME?.trim()
  const templateLang = process.env.WHATSAPP_CITA_TEMPLATE_LANG?.trim() || 'es'
  return { token, phoneNumberId, apiVersion, templateName, templateLang }
}

function nombrePaciente(p?: PacienteCita | null) {
  return `${p?.nombre ?? ''} ${p?.apellido1 ?? ''}`.trim() || 'paciente'
}

function mensajeCita(cita: CitaRecordatorio) {
  const svc = cita.servicio?.nombre || cita.servicio_nombre
  return [
    `Hola ${nombrePaciente(cita.paciente)},`,
    `le recordamos su cita en *${BRAND.nombre}*:`,
    `📅 ${fmtFecha(cita.fecha)} a las ${cita.hora.slice(0, 5)}`,
    svc ? `🩺 ${svc}` : '',
    '',
    'Por favor confirme su asistencia. ¡Gracias!',
  ].filter(Boolean).join('\n')
}

async function enviarWhatsAppCita(cita: CitaRecordatorio) {
  const cfg = whatsappConfig()
  if (!cfg.token || !cfg.phoneNumberId) {
    return { ok: false, error: 'Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID' }
  }

  const to = limpiarCelular(cita.paciente?.celular, cita.paciente?.telefono)
  if (!to) return { ok: false, error: 'Paciente sin celular válido' }

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`
  const body = cfg.templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: cfg.templateName,
          language: { code: cfg.templateLang },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nombrePaciente(cita.paciente) },
                { type: 'text', text: fmtFecha(cita.fecha) },
                { type: 'text', text: cita.hora.slice(0, 5) },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: mensajeCita(cita) },
      }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `WhatsApp HTTP ${res.status}` }
  }
  return { ok: true, id: data?.messages?.[0]?.id as string | undefined }
}

export async function procesarRecordatoriosAgenda(
  supabase: SupabaseClient,
  opts: { limite?: number } = {},
): Promise<ProcesarRecordatoriosAgendaResultado> {
  const cfg = whatsappConfig()
  const configOk = Boolean(cfg.token && cfg.phoneNumberId)
  const errores: string[] = []
  let enviados = 0
  let omitidos = 0

  if (!configOk) {
    return {
      ok: false,
      candidatos: 0,
      enviados: 0,
      omitidos: 0,
      errores: ['Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID'],
      config: { whatsapp: false },
    }
  }

  const hoy = fechaHoyHN()
  const manana = addDays(hoy, 1)

  const { data, error } = await supabase
    .from('citas')
    .select(`
      id, fecha, hora, estado, recordatorio_estado, servicio_nombre,
      paciente:pacientes(id,nombre,apellido1,celular,telefono),
      servicio:servicios(nombre)
    `)
    .eq('estado', 'ACTIVO')
    .eq('recordatorio_estado', 'pendiente')
    .gte('fecha', hoy)
    .lte('fecha', manana)
    .order('fecha')
    .order('hora')
    .limit(opts.limite ?? 80)

  if (error) {
    return {
      ok: false,
      candidatos: 0,
      enviados: 0,
      omitidos: 0,
      errores: [error.message],
      config: { whatsapp: configOk },
    }
  }

  const candidatos = ((data ?? []) as CitaRecordatorio[])
    .filter(c => necesitaRecordatorio(c, hoy))

  for (const cita of candidatos) {
    const resultado = await enviarWhatsAppCita(cita)
    if (resultado.ok) {
      await supabase.from('citas').update({
        recordatorio_estado: 'whatsapp',
        recordatorio_at: new Date().toISOString(),
        recordatorio_nota: `Recordatorio automático enviado${resultado.id ? ` (${resultado.id})` : ''}`,
      }).eq('id', cita.id)
      enviados++
    } else {
      await supabase.from('citas').update({
        recordatorio_estado: 'no_contacto',
        recordatorio_at: new Date().toISOString(),
        recordatorio_nota: `Recordatorio automático falló: ${resultado.error}`,
      }).eq('id', cita.id)
      omitidos++
      if (resultado.error) errores.push(`Cita ${cita.id}: ${resultado.error}`)
    }
  }

  return {
    ok: errores.length === 0,
    candidatos: candidatos.length,
    enviados,
    omitidos,
    errores,
    config: { whatsapp: configOk },
  }
}
