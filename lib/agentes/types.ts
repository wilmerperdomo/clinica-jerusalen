/** Tipos compartidos del sistema multiagente — Clínica Jerusalén */

export type CanalClave =
  | 'whatsapp_principal'
  | 'whatsapp_sucursal'
  | 'whatsapp_corporativo'
  | 'messenger_pagina'

export type ProveedorCanal = 'whatsapp_meta' | 'whatsapp_evolution' | 'messenger'

export type AgenteEspecializado =
  | 'orquestador'
  | 'citas'
  | 'laboratorio'
  | 'promociones'
  | 'facturacion'
  | 'faq'
  | 'escalamiento'

export type IntencionUsuario =
  | 'agendar_cita'
  | 'consultar_cita'
  | 'cancelar_cita'
  | 'estado_laboratorio'
  | 'resultados_lab'
  | 'promociones'
  | 'planes_medicos'
  | 'factura'
  | 'horarios_ubicacion'
  | 'precios_generales'
  | 'hablar_humano'
  | 'saludo'
  | 'otro'

export interface HorarioCanal {
  dia: number // 0=domingo … 6=sábado
  abre: string // HH:mm
  cierra: string
}

export interface ConfigCanal {
  clave: CanalClave
  nombre: string
  sucursal_id?: number | null
  tono: string
  ubicacion?: string
  direccion?: string
  telefono?: string
  horarios: HorarioCanal[]
  servicios_destacados: string[]
  mensaje_fuera_horario?: string
  permite_escalamiento: boolean
}

export interface MensajeEntrante {
  proveedor: ProveedorCanal
  canalClave: CanalClave
  mensajeExternoId: string
  contactoExterno: string
  contactoNombre?: string
  texto: string
  timestamp: string
  raw?: unknown
}

export interface MensajeSaliente {
  texto: string
  metadata?: Record<string, unknown>
}

export interface ContextoConversacion {
  paciente_id?: number | null
  paciente_nombre?: string | null
  ultima_intencion?: IntencionUsuario
  variables?: Record<string, string>
}

export interface ResultadoEnrutamiento {
  agente: AgenteEspecializado
  intencion: IntencionUsuario
  confianza: number
  razon: string
  requiere_escalamiento: boolean
}

export interface ResultadoAgente {
  respuestas: MensajeSaliente[]
  agente: AgenteEspecializado
  intencion: IntencionUsuario
  confianza: number
  escalar?: { motivo: string; prioridad?: 'baja' | 'normal' | 'alta' | 'urgente' }
  actualizar_contexto?: Partial<ContextoConversacion>
  fuentes_consultadas?: string[]
}

export interface TurnoOrquestador {
  entrada: MensajeEntrante
  conversacionId: string
  historial: { rol: 'usuario' | 'asistente' | 'sistema'; contenido: string }[]
  contexto: ContextoConversacion
  configCanal: ConfigCanal
}
