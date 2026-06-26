/** Plantillas de examen físico — un clic llena NL o enfoque por sistema */

export type CampoExamenFisico =
  | 'cabeza' | 'cuello' | 'ojos' | 'orl' | 'pulmonar' | 'abdomen'
  | 'genito' | 'extremidades' | 'sistema' | 'oste' | 'piel'

export type FormExamenFisico = Record<CampoExamenFisico, string>

export const CAMPOS_EXAMEN_FISICO: CampoExamenFisico[] = [
  'cabeza', 'cuello', 'ojos', 'orl', 'pulmonar', 'abdomen',
  'genito', 'extremidades', 'sistema', 'oste', 'piel',
]

export function examenFisicoVacio(): FormExamenFisico {
  return Object.fromEntries(CAMPOS_EXAMEN_FISICO.map(k => [k, 'NL'])) as FormExamenFisico
}

export interface PlantillaExamenFisico {
  id: string
  label: string
  valores: Partial<FormExamenFisico>
}

export const PLANTILLAS_EXAMEN_FISICO: PlantillaExamenFisico[] = [
  {
    id: 'normal',
    label: 'Normal completo',
    valores: examenFisicoVacio(),
  },
  {
    id: 'respiratorio',
    label: 'Respiratorio',
    valores: {
      ...examenFisicoVacio(),
      pulmonar: 'MV conservado, sin estertores ni sibilancias',
      orl: 'Faringe sin eritema importante',
    },
  },
  {
    id: 'abdominal',
    label: 'Abdominal',
    valores: {
      ...examenFisicoVacio(),
      abdomen: 'Blando, depresible, no doloroso, sin visceromegalias',
    },
  },
  {
    id: 'neurologico',
    label: 'Neurológico',
    valores: {
      ...examenFisicoVacio(),
      sistema: 'Alerta, orientado, pares craneales sin déficit aparente',
      extremidades: 'Fuerza y sensibilidad conservadas',
    },
  },
  {
    id: 'pediatrico',
    label: 'Pediátrico',
    valores: {
      ...examenFisicoVacio(),
      cabeza: 'Fontanela normotensa, sin deformidades',
      pulmonar: 'MV simétrico, sin tiraje',
      abdomen: 'Blando, no distendido',
      piel: 'Hidratación adecuada',
    },
  },
  {
    id: 'ginecologico',
    label: 'Ginecológico',
    valores: {
      ...examenFisicoVacio(),
      abdomen: 'Blando, no doloroso',
      genito: 'Especuloscopia y tacto según hallazgos clínicos',
    },
  },
]

export function aplicarPlantillaExamen(
  actual: FormExamenFisico,
  plantillaId: string,
): FormExamenFisico {
  const p = PLANTILLAS_EXAMEN_FISICO.find(x => x.id === plantillaId)
  if (!p) return actual
  return { ...actual, ...p.valores }
}
