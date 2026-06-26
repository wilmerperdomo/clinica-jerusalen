/** Plantillas rápidas de consulta médica */

import type { FormConsultaGeneral } from '@/lib/consulta-general-utils'

export interface PlantillaMedica {
  id: string
  label: string
  sintoma: string
  historia: string
  impresion: string
  tratamiento: string
  general?: Partial<FormConsultaGeneral>
}

export const PLANTILLAS_CONSULTA: PlantillaMedica[] = [
  {
    id: 'gripe',
    label: 'Gripe / IVAS',
    sintoma: 'Cuadro respiratorio de 2-3 días: congestión nasal, tos, malestar general.',
    historia: 'Inicio gradual. Sin disnea ni dolor torácico. Afebril o febrícula.',
    impresion: 'Infección viral de vías respiratorias altas.',
    tratamiento: 'Sintomáticos. Hidratación. Reposo relativo.',
    general: {
      rev_respiratorio: 'Rinorrea, faringe hiperémica, sin estertores.',
      plan_medicamentos: 'Paracetamol 500 mg c/6-8h PRN. Suero oral abundante.',
      plan_signos_alarma: 'Fiebre >38.5°C persistente, disnea, dolor torácico, empeoramiento >5 días.',
      plan_seguimiento: 'Control en 5-7 días si no mejora.',
    },
  },
  {
    id: 'hta',
    label: 'HTA / Control PA',
    sintoma: 'Control de presión arterial / cefalea ocasional.',
    historia: 'Antecedente de HTA. Adherencia a tratamiento a valorar.',
    impresion: 'Hipertensión arterial en control.',
    tratamiento: 'Continuar antihipertensivo. Modificaciones de estilo de vida.',
    general: {
      rev_cardiovascular: 'Ruidos cardíacos rítmicos, sin soplos.',
      plan_recomendaciones: 'Dieta baja en sodio. Ejercicio moderado. Control de peso.',
      plan_seguimiento: 'Control PA en 2-4 semanas.',
    },
  },
  {
    id: 'diabetes',
    label: 'Diabetes',
    sintoma: 'Control de diabetes mellitus.',
    historia: 'DM tipo 2 en tratamiento. Glucemias domiciliarias a valorar.',
    impresion: 'Diabetes mellitus en seguimiento.',
    tratamiento: 'Continuar esquema actual. Educación diabetológica.',
    general: {
      plan_estudios: 'HbA1c si no reciente. Perfil lipídico anual.',
      plan_recomendaciones: 'Dieta balanceada. Actividad física regular. Cuidado de pies.',
      plan_signos_alarma: 'Hipoglucemia, poliuria intensa, pérdida de peso inexplicada.',
    },
  },
  {
    id: 'dolor_abdominal',
    label: 'Dolor abdominal',
    sintoma: 'Dolor abdominal.',
    historia: 'Inicio, localización, irradiación, náuseas/vómitos, cambios en hábito intestinal.',
    impresion: 'Dolor abdominal a estudio / etiología funcional.',
    tratamiento: 'Dieta blanda. Analgésicos según necesidad.',
    general: {
      rev_digestivo: 'Abdomen blando, dolor a palpación localizada, sin defensa.',
      plan_signos_alarma: 'Dolor intenso progresivo, fiebre, vómito persistente, sangrado.',
      plan_seguimiento: 'Reevaluar en 48-72 h si persiste.',
    },
  },
  {
    id: 'itu',
    label: 'Infección urinaria',
    sintoma: 'Disuria, urgencia miccional, polaquiuria.',
    historia: 'Sin fiebre alta ni dolor lumbar. Primera episodio o recurrente.',
    impresion: 'Infección urinaria baja.',
    tratamiento: 'Antibiótico según protocolo. Aumentar ingesta de líquidos.',
    general: {
      rev_urinario: 'Puño percusión lumbar negativa.',
      plan_estudios: 'EGO / urocultivo.',
      plan_signos_alarma: 'Fiebre, dolor lumbar, hematuria franca.',
    },
  },
  {
    id: 'cefalea',
    label: 'Cefalea',
    sintoma: 'Cefalea.',
    historia: 'Tipo, duración, desencadenantes. Sin síntomas de alarma neurológica.',
    impresion: 'Cefalea tensional / migraña.',
    tratamiento: 'Analgésico PRN. Hidratación. Descanso.',
    general: {
      rev_neurologico: 'Glasgow 15. Pares craneales sin déficit. Fuerza y sensibilidad conservadas.',
      plan_signos_alarma: 'Cefalea súbita intensa, alteración de conciencia, fiebre con rigidez nucal.',
    },
  },
  {
    id: 'lumbalgia',
    label: 'Lumbalgia',
    sintoma: 'Dolor lumbar.',
    historia: 'Inicio tras esfuerzo o postura. Sin irradiación o con ciática leve.',
    impresion: 'Lumbalgia mecánica.',
    tratamiento: 'AINEs PRN. Reposo relativo 48h. Ejercicios de estiramiento.',
    general: {
      rev_musculo_esqueletico: 'Contractura paravertebral. Lasègue negativo.',
      plan_recomendaciones: 'Corrección postural. Evitar cargar peso. Calor local.',
      plan_signos_alarma: 'Pérdida de fuerza en extremidades, incontinencia, fiebre.',
    },
  },
]

export function buscarPlantilla(id: string): PlantillaMedica | undefined {
  return PLANTILLAS_CONSULTA.find(p => p.id === id)
}
