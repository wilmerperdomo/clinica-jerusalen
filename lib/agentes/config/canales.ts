import type { CanalClave, ConfigCanal, HorarioCanal } from '@/lib/agentes/types'
import { BRAND } from '@/lib/brand'

/** Horario estándar L–S 7:00–19:00 (ajustar por sucursal en BD o aquí) */
const HORARIO_CLINICA: HorarioCanal[] = [
  { dia: 0, abre: '08:00', cierra: '12:00' },
  ...([1, 2, 3, 4, 5, 6] as const).map(d => ({ dia: d, abre: '07:00', cierra: '19:00' })),
]

const BASE: Omit<ConfigCanal, 'clave' | 'nombre'> = {
  tono: 'profesional, cálido y claro en español de Honduras',
  ubicacion: 'Tegucigalpa, Honduras',
  direccion: 'Consultar en recepción o sitio web',
  telefono: '',
  horarios: HORARIO_CLINICA,
  servicios_destacados: [
    'Consultas médicas generales y especializadas',
    'Ultrasonidos y estudios de laboratorio',
    'Farmacia y medicamentos',
    'Planes médicos (membresías)',
  ],
  mensaje_fuera_horario:
    `Gracias por escribir a ${BRAND.nombre}. En este momento estamos fuera de horario. ` +
    'Un asesor le responderá en el próximo horario de atención.',
  permite_escalamiento: true,
}

/** Configuración por número/canal — fuente de verdad en código; BD puede sobreescribir vía JSONB */
export const CONFIG_CANALES: Record<CanalClave, ConfigCanal> = {
  whatsapp_principal: {
    ...BASE,
    clave: 'whatsapp_principal',
    nombre: 'Clínica Principal',
    tono: 'cálido, cercano y resolutivo — primera línea de atención al paciente',
    servicios_destacados: [
      ...BASE.servicios_destacados,
      'Agenda del día y consultas sin cita previa (según disponibilidad)',
    ],
  },
  whatsapp_sucursal: {
    ...BASE,
    clave: 'whatsapp_sucursal',
    nombre: 'Sucursal',
    tono: 'práctico y local — mencionar que es la línea de la sucursal',
    // sucursal_id se asigna en runtime desde agente_canales.sucursal_id
  },
  whatsapp_corporativo: {
    ...BASE,
    clave: 'whatsapp_corporativo',
    nombre: 'Atención Corporativa',
    tono: 'formal y ejecutivo — enfoque en información general, convenios y derivación',
    servicios_destacados: [
      'Información institucional',
      'Convenios empresariales',
      'Derivación a sucursal o departamento',
    ],
  },
  messenger_pagina: {
    ...BASE,
    clave: 'messenger_pagina',
    nombre: 'Facebook Messenger',
    tono: 'breve y amable — respuestas cortas aptas para chat web',
  },
}

export function obtenerConfigCanal(
  clave: CanalClave,
  override?: Partial<ConfigCanal> | null,
): ConfigCanal {
  const base = CONFIG_CANALES[clave]
  if (!override) return base
  return { ...base, ...override, horarios: override.horarios ?? base.horarios }
}

export function canalEstaEnHorario(config: ConfigCanal, ahora = new Date()): boolean {
  const dia = ahora.getDay()
  const slot = config.horarios.find(h => h.dia === dia)
  if (!slot) return false
  const mins = ahora.getHours() * 60 + ahora.getMinutes()
  const [ah, am] = slot.abre.split(':').map(Number)
  const [ch, cm] = slot.cierra.split(':').map(Number)
  const abre = ah * 60 + (am || 0)
  const cierra = ch * 60 + (cm || 0)
  return mins >= abre && mins < cierra
}

export function esCanalClave(v: string): v is CanalClave {
  return v in CONFIG_CANALES
}
