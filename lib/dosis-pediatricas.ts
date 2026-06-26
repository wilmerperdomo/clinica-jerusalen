/** Calculadora de dosis pediátricas por peso (referencia orientativa) */

export interface DosisPediatrica {
  medicamento: string
  dosis: string
  frecuencia: string
  nota?: string
}

export function calcularDosisPediatricas(pesoKg: number): DosisPediatrica[] {
  if (!pesoKg || pesoKg <= 0) return []
  const p = pesoKg
  return [
    {
      medicamento: 'Paracetamol',
      dosis: `${Math.round(15 * p)} mg`,
      frecuencia: 'c/6h PRN fiebre/dolor',
      nota: `Máx 60 mg/kg/día (≈${Math.round(60 * p)} mg/día)`,
    },
    {
      medicamento: 'Ibuprofeno',
      dosis: `${Math.round(10 * p)} mg`,
      frecuencia: 'c/8h PRN (≥6 meses)',
      nota: `Máx 40 mg/kg/día`,
    },
    {
      medicamento: 'Amoxicilina',
      dosis: `${Math.round(50 * p)} mg/día`,
      frecuencia: 'dividido c/8h × 7-10 días',
      nota: 'Dosis estándar 50 mg/kg/día',
    },
    {
      medicamento: 'Suero oral (plan A deshidratación leve)',
      dosis: `${Math.round(75 * p)} ml`,
      frecuencia: 'en 4 horas, luego mantenimiento',
      nota: 'OMS — reevaluar hidratación',
    },
  ]
}

export function formatearDosisPediatricas(pesoKg: number): string {
  return calcularDosisPediatricas(pesoKg)
    .map(d => `${d.medicamento}: ${d.dosis} ${d.frecuencia}${d.nota ? ` (${d.nota})` : ''}`)
    .join('\n')
}

export const CONTROLES_NINO_SANO = [
  { value: 'rn', label: 'Recién nacido (0-28 d)' },
  { value: '2m', label: '2 meses' },
  { value: '4m', label: '4 meses' },
  { value: '6m', label: '6 meses' },
  { value: '9m', label: '9 meses' },
  { value: '12m', label: '12 meses' },
  { value: '18m', label: '18 meses' },
  { value: '24m', label: '24 meses' },
  { value: '3a', label: '3 años' },
  { value: '4a', label: '4 años' },
  { value: '5a', label: '5 años' },
] as const

export const HITOS_DESARROLLO = [
  'Sonrisa social (6-8 sem)',
  'Sostén cefálico (3 meses)',
  'Sedestación sin apoyo (6-8 meses)',
  'Marcha independiente (12-15 meses)',
  'Primeras palabras (12 meses)',
  'Frases de 2 palabras (24 meses)',
] as const

export const TIPOS_ALIMENTACION = [
  'Lactancia materna exclusiva',
  'Lactancia mixta',
  'Fórmula láctea',
  'Ablactación en curso',
  'Dieta familiar',
] as const
