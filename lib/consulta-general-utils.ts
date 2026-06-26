/** Consulta general ampliada — revisión por sistemas, plan estructurado, escalas */

export interface FormConsultaGeneral {
  rev_cardiovascular: string
  rev_respiratorio: string
  rev_digestivo: string
  rev_neurologico: string
  rev_urinario: string
  rev_piel: string
  rev_musculo_esqueletico: string
  diagnostico_principal: string
  diagnosticos_secundarios: string
  plan_medicamentos: string
  plan_estudios: string
  plan_recomendaciones: string
  plan_signos_alarma: string
  plan_seguimiento: string
  escala_dolor: string
  glasgow: string
  imc: string
  plantilla_usada: string
}

export const REVISION_SISTEMAS = [
  { key: 'rev_cardiovascular' as const, label: 'Cardiovascular' },
  { key: 'rev_respiratorio' as const, label: 'Respiratorio' },
  { key: 'rev_digestivo' as const, label: 'Digestivo' },
  { key: 'rev_neurologico' as const, label: 'Neurológico' },
  { key: 'rev_urinario' as const, label: 'Urinario' },
  { key: 'rev_piel' as const, label: 'Piel' },
  { key: 'rev_musculo_esqueletico' as const, label: 'Músculo-esquelético' },
]

export function formConsultaGeneralVacio(): FormConsultaGeneral {
  return {
    rev_cardiovascular: '',
    rev_respiratorio: '',
    rev_digestivo: '',
    rev_neurologico: '',
    rev_urinario: '',
    rev_piel: '',
    rev_musculo_esqueletico: '',
    diagnostico_principal: '',
    diagnosticos_secundarios: '',
    plan_medicamentos: '',
    plan_estudios: '',
    plan_recomendaciones: '',
    plan_signos_alarma: '',
    plan_seguimiento: '',
    escala_dolor: '',
    glasgow: '',
    imc: '',
    plantilla_usada: '',
  }
}

export function mapGeneralFromDb(row: Record<string, unknown>): FormConsultaGeneral {
  return {
    rev_cardiovascular: String(row.rev_cardiovascular ?? ''),
    rev_respiratorio: String(row.rev_respiratorio ?? ''),
    rev_digestivo: String(row.rev_digestivo ?? ''),
    rev_neurologico: String(row.rev_neurologico ?? ''),
    rev_urinario: String(row.rev_urinario ?? ''),
    rev_piel: String(row.rev_piel ?? ''),
    rev_musculo_esqueletico: String(row.rev_musculo_esqueletico ?? ''),
    diagnostico_principal: String(row.diagnostico_principal ?? ''),
    diagnosticos_secundarios: String(row.diagnosticos_secundarios ?? ''),
    plan_medicamentos: String(row.plan_medicamentos ?? ''),
    plan_estudios: String(row.plan_estudios ?? ''),
    plan_recomendaciones: String(row.plan_recomendaciones ?? ''),
    plan_signos_alarma: String(row.plan_signos_alarma ?? ''),
    plan_seguimiento: String(row.plan_seguimiento ?? ''),
    escala_dolor: row.escala_dolor != null ? String(row.escala_dolor) : '',
    glasgow: row.glasgow != null ? String(row.glasgow) : '',
    imc: row.imc != null ? String(row.imc) : '',
    plantilla_usada: String(row.plantilla_usada ?? ''),
  }
}

function numOrNull(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

export function payloadConsultaGeneral(consultaId: number, form: FormConsultaGeneral) {
  return {
    consulta_id: consultaId,
    rev_cardiovascular: form.rev_cardiovascular.trim() || null,
    rev_respiratorio: form.rev_respiratorio.trim() || null,
    rev_digestivo: form.rev_digestivo.trim() || null,
    rev_neurologico: form.rev_neurologico.trim() || null,
    rev_urinario: form.rev_urinario.trim() || null,
    rev_piel: form.rev_piel.trim() || null,
    rev_musculo_esqueletico: form.rev_musculo_esqueletico.trim() || null,
    diagnostico_principal: form.diagnostico_principal.trim() || null,
    diagnosticos_secundarios: form.diagnosticos_secundarios.trim() || null,
    plan_medicamentos: form.plan_medicamentos.trim() || null,
    plan_estudios: form.plan_estudios.trim() || null,
    plan_recomendaciones: form.plan_recomendaciones.trim() || null,
    plan_signos_alarma: form.plan_signos_alarma.trim() || null,
    plan_seguimiento: form.plan_seguimiento.trim() || null,
    escala_dolor: numOrNull(form.escala_dolor),
    glasgow: numOrNull(form.glasgow),
    imc: numOrNull(form.imc),
    plantilla_usada: form.plantilla_usada.trim() || null,
  }
}

/** IMC desde peso (kg) y talla (cm o m) */
export function calcularIMC(peso?: string | number | null, talla?: string | number | null): string {
  const p = Number(peso)
  let t = Number(talla)
  if (!p || !t || p <= 0 || t <= 0) return ''
  if (t > 3) t = t / 100
  const imc = p / (t * t)
  return imc > 0 && imc < 100 ? imc.toFixed(1) : ''
}

export function etiquetaIMC(imc: string): string {
  const n = Number(imc)
  if (!n) return ''
  if (n < 18.5) return 'Bajo peso'
  if (n < 25) return 'Normal'
  if (n < 30) return 'Sobrepeso'
  return 'Obesidad'
}
