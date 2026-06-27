import type { EnfoqueClinico } from '@/lib/consulta-especialidad-utils'

export interface FormSignosVitales {
  presion: string
  frecuencia: string
  pulso: string
  temperatura: string
  peso: string
  talla: string
  perim_cefalico: string
  saturacion_oxigeno: string
  dolor_eva: string
  glucosa_capilar: string
  hidratacion: string
  dificultad_resp: string
  signos_fum: string
  signos_semanas_gestacion: string
  signos_fcf: string
  signos_altura_uterina: string
  signos_edema: string
  signos_proteinuria: string
}

export const OPCIONES_HIDRATACION = [
  { value: '', label: '—' },
  { value: 'normal', label: 'Normal' },
  { value: 'leve', label: 'Deshidratación leve' },
  { value: 'moderada', label: 'Deshidratación moderada' },
  { value: 'severa', label: 'Deshidratación severa' },
] as const

export const OPCIONES_DIFICULTAD_RESP = [
  { value: '', label: '—' },
  { value: 'ninguna', label: 'Sin dificultad' },
  { value: 'leve', label: 'Leve (tiraje leve)' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'severa', label: 'Severa / cianosis' },
] as const

export const OPCIONES_PROTEINURIA = [
  { value: '', label: '—' },
  { value: 'negativa', label: 'Negativa' },
  { value: 'trazas', label: 'Trazas' },
  { value: '+', label: '+' },
  { value: '++', label: '++' },
  { value: '+++', label: '+++' },
] as const

export function signosVitalesVacio(): FormSignosVitales {
  return {
    presion: '', frecuencia: '', pulso: '', temperatura: '',
    peso: '', talla: '', perim_cefalico: '',
    saturacion_oxigeno: '', dolor_eva: '', glucosa_capilar: '',
    hidratacion: '', dificultad_resp: '',
    signos_fum: '', signos_semanas_gestacion: '', signos_fcf: '',
    signos_altura_uterina: '', signos_edema: '', signos_proteinuria: '',
  }
}

function str(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v)
}

export function signosDesdeConsulta(c: Record<string, unknown>): FormSignosVitales {
  return {
    presion: str(c.presion),
    frecuencia: str(c.frecuencia),
    pulso: str(c.pulso),
    temperatura: str(c.temperatura),
    peso: str(c.peso),
    talla: str(c.talla),
    perim_cefalico: str(c.perim_cefalico),
    saturacion_oxigeno: str(c.saturacion_oxigeno),
    dolor_eva: str(c.dolor_eva),
    glucosa_capilar: str(c.glucosa_capilar),
    hidratacion: str(c.hidratacion),
    dificultad_resp: str(c.dificultad_resp),
    signos_fum: str(c.signos_fum),
    signos_semanas_gestacion: str(c.signos_semanas_gestacion),
    signos_fcf: str(c.signos_fcf),
    signos_altura_uterina: str(c.signos_altura_uterina),
    signos_edema: str(c.signos_edema),
    signos_proteinuria: str(c.signos_proteinuria),
  }
}

function numOrNull(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function intOrNull(s: string): number | null {
  const n = numOrNull(s)
  return n == null ? null : Math.round(n)
}

export function payloadSignosVitales(form: FormSignosVitales): Record<string, unknown> {
  return {
    presion: form.presion.trim() || null,
    frecuencia: form.frecuencia.trim() || null,
    pulso: form.pulso.trim() || null,
    temperatura: form.temperatura.trim() || null,
    peso: numOrNull(form.peso),
    talla: numOrNull(form.talla),
    perim_cefalico: form.perim_cefalico.trim() || null,
    saturacion_oxigeno: form.saturacion_oxigeno.trim() || null,
    dolor_eva: intOrNull(form.dolor_eva),
    glucosa_capilar: numOrNull(form.glucosa_capilar),
    hidratacion: form.hidratacion || null,
    dificultad_resp: form.dificultad_resp || null,
    signos_fum: form.signos_fum || null,
    signos_semanas_gestacion: numOrNull(form.signos_semanas_gestacion),
    signos_fcf: intOrNull(form.signos_fcf),
    signos_altura_uterina: numOrNull(form.signos_altura_uterina),
    signos_edema: form.signos_edema.trim() || null,
    signos_proteinuria: form.signos_proteinuria || null,
  }
}

export interface CampoSigno {
  key: keyof FormSignosVitales
  label: string
  ph?: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: readonly { value: string; label: string }[]
  enfoques?: EnfoqueClinico[]
  colSpan?: boolean
}

const CAMPOS_BASE: CampoSigno[] = [
  { key: 'presion', label: 'Presión arterial', ph: '120/80' },
  { key: 'pulso', label: 'Pulso (lat/min)', ph: '72' },
  { key: 'frecuencia', label: 'Frec. respiratoria', ph: '16' },
  { key: 'temperatura', label: 'Temperatura (°C)', ph: '36.5' },
  { key: 'saturacion_oxigeno', label: 'SpO₂ (%)', ph: '98' },
  { key: 'dolor_eva', label: 'Dolor EVA (0-10)', ph: '0', type: 'number' },
  { key: 'glucosa_capilar', label: 'Glucosa capilar', ph: 'mg/dL', type: 'number' },
  { key: 'peso', label: 'Peso (kg)', ph: '65.0', type: 'number' },
  { key: 'talla', label: 'Talla (cm)', ph: '165', type: 'number' },
]

const CAMPOS_PED: CampoSigno[] = [
  { key: 'perim_cefalico', label: 'Perím. cefálico (cm)', ph: 'cm', type: 'number', enfoques: ['pediatria'] },
  { key: 'hidratacion', label: 'Hidratación', type: 'select', options: OPCIONES_HIDRATACION, enfoques: ['pediatria'] },
  { key: 'dificultad_resp', label: 'Dificultad respiratoria', type: 'select', options: OPCIONES_DIFICULTAD_RESP, enfoques: ['pediatria'] },
]

const CAMPOS_GINE: CampoSigno[] = [
  { key: 'signos_fum', label: 'FUM', type: 'date', enfoques: ['ginecologia'] },
  { key: 'signos_semanas_gestacion', label: 'Semanas gestación', ph: '28', type: 'number', enfoques: ['ginecologia'] },
  { key: 'signos_fcf', label: 'FCF (lat/min)', ph: '140', type: 'number', enfoques: ['ginecologia'] },
  { key: 'signos_altura_uterina', label: 'Altura uterina (cm)', ph: '28', type: 'number', enfoques: ['ginecologia'] },
  { key: 'signos_edema', label: 'Edema', ph: 'Sin edema / MMII +', enfoques: ['ginecologia'] },
  { key: 'signos_proteinuria', label: 'Proteinuria', type: 'select', options: OPCIONES_PROTEINURIA, enfoques: ['ginecologia'] },
]

export function camposSignosPorEnfoque(enfoque: EnfoqueClinico): CampoSigno[] {
  const extras = [...CAMPOS_PED, ...CAMPOS_GINE].filter(
    c => !c.enfoques || c.enfoques.includes(enfoque),
  )
  return [...CAMPOS_BASE, ...extras]
}

export function etiquetaEnfoqueSignos(enfoque: EnfoqueClinico): string {
  const map: Record<EnfoqueClinico, string> = {
    general: 'Adulto / general',
    pediatria: 'Pediatría',
    ginecologia: 'Gineco-obstétrico',
  }
  return map[enfoque] ?? 'General'
}

export function resumenSignosVitales(c: Record<string, unknown>): string {
  const partes: string[] = []
  if (c.presion) partes.push(`PA ${c.presion}`)
  if (c.pulso) partes.push(`Pulso ${c.pulso}`)
  if (c.frecuencia) partes.push(`FR ${c.frecuencia}`)
  if (c.temperatura) partes.push(`T° ${c.temperatura}°C`)
  if (c.saturacion_oxigeno) partes.push(`SpO₂ ${c.saturacion_oxigeno}%`)
  if (c.dolor_eva != null && c.dolor_eva !== '') partes.push(`Dolor ${c.dolor_eva}/10`)
  if (c.peso) partes.push(`Peso ${c.peso} kg`)
  if (c.talla) partes.push(`Talla ${c.talla} cm`)
  if (c.perim_cefalico) partes.push(`PC ${c.perim_cefalico} cm`)
  if (c.signos_semanas_gestacion) partes.push(`${c.signos_semanas_gestacion} sem`)
  if (c.signos_fcf) partes.push(`FCF ${c.signos_fcf}`)
  return partes.join(' · ') || '—'
}
