/** Utilidades — enfoque clínico pediatría / ginecología en consultas */

import type { PacienteConsulta } from '@/lib/consultas-utils'
import { esPacienteEmpresa } from '@/lib/consultas-utils'

export type EnfoqueClinico = 'general' | 'pediatria' | 'ginecologia'

export type VacunasEstado = '' | 'al_dia' | 'pendiente' | 'desconocido'

export interface FormPediatria {
  alimentacion: string
  hidratacion: string
  desarrollo: string
  vacunas_estado: VacunasEstado
  acompanante: string
  fiebre: string
  tos: string
  diarrea: string
  vomitos: string
  convulsiones: boolean
  notas_pediatria: string
  control_nino_sano: string
  hitos_desarrollo: string
  tipo_alimentacion: string
  alarma_fiebre_rn: boolean
  alarma_dificultad_resp: boolean
  alarma_deshidratacion: boolean
  dosis_calculadas: string
}

export type RiesgoPrenatal = '' | 'bajo' | 'alto'

export interface FormGinecologia {
  fum: string
  fpp: string
  semanas_gestacion: string
  embarazo_activo: boolean
  gestas: string
  partos: string
  cesareas: string
  abortos: string
  hijos_vivos: string
  dolor_pelvico: string
  sangrado: string
  flujo_vaginal: string
  planificacion: string
  examen_vulva: string
  examen_especulo: string
  examen_tv: string
  notas_ginecologia: string
  menarquia: string
  ciclos_menstruales: string
  pap: string
  its: string
  mamografia: string
  riesgo_prenatal: RiesgoPrenatal
  alarma_sangrado: boolean
  alarma_cefalea: boolean
  alarma_edema: boolean
  alarma_dolor_epigastrico: boolean
  alarma_mov_fetales: boolean
  checklist_t1: string
  checklist_t2: string
  checklist_t3: string
  plan_parto_hospital: string
  plan_parto_signos: string
  plan_parto_notas: string
}

export interface AntecedentesGoPrefill {
  gestas?: number | null
  partos?: number | null
  cesareas?: number | null
  abortos?: number | null
  hijos_vivos?: number | null
  ultima_regla?: string | null
}

const MS_DIA = 1000 * 60 * 60 * 24

export function edadEnAnios(fechaNac?: string | null): number | null {
  if (!fechaNac) return null
  const nac = new Date(fechaNac)
  if (Number.isNaN(nac.getTime())) return null
  const diff = Date.now() - nac.getTime()
  const años = Math.floor(diff / (MS_DIA * 365.25))
  return años >= 0 ? años : null
}

export function edadDetallada(fechaNac?: string | null): string {
  if (!fechaNac) return ''
  const nac = new Date(fechaNac)
  if (Number.isNaN(nac.getTime())) return ''
  const diffMs = Date.now() - nac.getTime()
  if (diffMs < 0) return ''
  const totalDias = Math.floor(diffMs / MS_DIA)
  const años = Math.floor(totalDias / 365.25)
  if (años >= 2) return `${años} años`
  const meses = Math.floor(totalDias / 30.44)
  if (meses >= 1) return `${meses} meses`
  return `${totalDias} días`
}

export function sugerirEnfoque(paciente?: PacienteConsulta & { genero?: string | null }): EnfoqueClinico {
  if (!paciente || esPacienteEmpresa(paciente)) return 'general'
  const años = edadEnAnios(paciente.fecha_nac)
  if (años != null && años < 18) return 'pediatria'
  const genero = (paciente.genero ?? '').toUpperCase()
  if (genero === 'F' && (años == null || años >= 12)) return 'ginecologia'
  return 'general'
}

export function etiquetaEnfoque(enfoque: EnfoqueClinico): string {
  const map: Record<EnfoqueClinico, string> = {
    general: 'General',
    pediatria: 'Pediatría',
    ginecologia: 'Ginecología',
  }
  return map[enfoque] ?? 'General'
}

export function claseBadgeEnfoque(enfoque: EnfoqueClinico): string {
  const map: Record<EnfoqueClinico, string> = {
    general: 'bg-slate-100 text-slate-600',
    pediatria: 'bg-sky-100 text-sky-800',
    ginecologia: 'bg-pink-100 text-pink-800',
  }
  return map[enfoque] ?? map.general
}

export function formPediatriaVacio(): FormPediatria {
  return {
    alimentacion: '',
    hidratacion: '',
    desarrollo: '',
    vacunas_estado: '',
    acompanante: '',
    fiebre: '',
    tos: '',
    diarrea: '',
    vomitos: '',
    convulsiones: false,
    notas_pediatria: '',
    control_nino_sano: '',
    hitos_desarrollo: '',
    tipo_alimentacion: '',
    alarma_fiebre_rn: false,
    alarma_dificultad_resp: false,
    alarma_deshidratacion: false,
    dosis_calculadas: '',
  }
}

export function formGinecologiaVacio(prefill?: AntecedentesGoPrefill | null): FormGinecologia {
  const fum = prefill?.ultima_regla?.slice(0, 10) ?? ''
  const fpp = fum ? calcularFPP(fum) : ''
  const semanas = fum ? String(calcularSemanasGestacion(fum) ?? '') : ''
  return {
    fum,
    fpp,
    semanas_gestacion: semanas,
    embarazo_activo: false,
    gestas: prefill?.gestas != null ? String(prefill.gestas) : '',
    partos: prefill?.partos != null ? String(prefill.partos) : '',
    cesareas: prefill?.cesareas != null ? String(prefill.cesareas) : '',
    abortos: prefill?.abortos != null ? String(prefill.abortos) : '',
    hijos_vivos: prefill?.hijos_vivos != null ? String(prefill.hijos_vivos) : '',
    dolor_pelvico: '',
    sangrado: '',
    flujo_vaginal: '',
    planificacion: '',
    examen_vulva: '',
    examen_especulo: '',
    examen_tv: '',
    notas_ginecologia: '',
    menarquia: '',
    ciclos_menstruales: '',
    pap: '',
    its: '',
    mamografia: '',
    riesgo_prenatal: '',
    alarma_sangrado: false,
    alarma_cefalea: false,
    alarma_edema: false,
    alarma_dolor_epigastrico: false,
    alarma_mov_fetales: false,
    checklist_t1: '',
    checklist_t2: '',
    checklist_t3: '',
    plan_parto_hospital: '',
    plan_parto_signos: '',
    plan_parto_notas: '',
  }
}

export function calcularFPP(fum: string): string {
  const base = new Date(fum)
  if (Number.isNaN(base.getTime())) return ''
  const fpp = new Date(base.getTime() + 280 * MS_DIA)
  return fpp.toISOString().slice(0, 10)
}

export function calcularSemanasGestacion(fum: string, ref = new Date()): number | null {
  const base = new Date(fum)
  if (Number.isNaN(base.getTime())) return null
  const diffDias = Math.floor((ref.getTime() - base.getTime()) / MS_DIA)
  if (diffDias < 0) return null
  return Math.round((diffDias / 7) * 10) / 10
}

export function actualizarFechasGestacion(fum: string): Pick<FormGinecologia, 'fpp' | 'semanas_gestacion'> {
  const sem = calcularSemanasGestacion(fum)
  return {
    fpp: calcularFPP(fum),
    semanas_gestacion: sem != null ? String(sem) : '',
  }
}

export function mapPediatriaFromDb(row: Record<string, unknown>): FormPediatria {
  return {
    alimentacion: String(row.alimentacion ?? ''),
    hidratacion: String(row.hidratacion ?? ''),
    desarrollo: String(row.desarrollo ?? ''),
    vacunas_estado: (row.vacunas_estado as VacunasEstado) ?? '',
    acompanante: String(row.acompanante ?? ''),
    fiebre: String(row.fiebre ?? ''),
    tos: String(row.tos ?? ''),
    diarrea: String(row.diarrea ?? ''),
    vomitos: String(row.vomitos ?? ''),
    convulsiones: row.convulsiones === true,
    notas_pediatria: String(row.notas_pediatria ?? ''),
    control_nino_sano: String(row.control_nino_sano ?? ''),
    hitos_desarrollo: String(row.hitos_desarrollo ?? ''),
    tipo_alimentacion: String(row.tipo_alimentacion ?? ''),
    alarma_fiebre_rn: row.alarma_fiebre_rn === true,
    alarma_dificultad_resp: row.alarma_dificultad_resp === true,
    alarma_deshidratacion: row.alarma_deshidratacion === true,
    dosis_calculadas: String(row.dosis_calculadas ?? ''),
  }
}

export function mapGinecologiaFromDb(row: Record<string, unknown>): FormGinecologia {
  const fum = row.fum ? String(row.fum).slice(0, 10) : ''
  return {
    fum,
    fpp: row.fpp ? String(row.fpp).slice(0, 10) : (fum ? calcularFPP(fum) : ''),
    semanas_gestacion: row.semanas_gestacion != null
      ? String(row.semanas_gestacion)
      : (fum ? String(calcularSemanasGestacion(fum) ?? '') : ''),
    embarazo_activo: row.embarazo_activo === true,
    gestas: row.gestas != null ? String(row.gestas) : '',
    partos: row.partos != null ? String(row.partos) : '',
    cesareas: row.cesareas != null ? String(row.cesareas) : '',
    abortos: row.abortos != null ? String(row.abortos) : '',
    hijos_vivos: row.hijos_vivos != null ? String(row.hijos_vivos) : '',
    dolor_pelvico: String(row.dolor_pelvico ?? ''),
    sangrado: String(row.sangrado ?? ''),
    flujo_vaginal: String(row.flujo_vaginal ?? ''),
    planificacion: String(row.planificacion ?? ''),
    examen_vulva: String(row.examen_vulva ?? ''),
    examen_especulo: String(row.examen_especulo ?? ''),
    examen_tv: String(row.examen_tv ?? ''),
    notas_ginecologia: String(row.notas_ginecologia ?? ''),
    menarquia: String(row.menarquia ?? ''),
    ciclos_menstruales: String(row.ciclos_menstruales ?? ''),
    pap: String(row.pap ?? ''),
    its: String(row.its ?? ''),
    mamografia: String(row.mamografia ?? ''),
    riesgo_prenatal: (row.riesgo_prenatal as RiesgoPrenatal) ?? '',
    alarma_sangrado: row.alarma_sangrado === true,
    alarma_cefalea: row.alarma_cefalea === true,
    alarma_edema: row.alarma_edema === true,
    alarma_dolor_epigastrico: row.alarma_dolor_epigastrico === true,
    alarma_mov_fetales: row.alarma_mov_fetales === true,
    checklist_t1: String(row.checklist_t1 ?? ''),
    checklist_t2: String(row.checklist_t2 ?? ''),
    checklist_t3: String(row.checklist_t3 ?? ''),
    plan_parto_hospital: String(row.plan_parto_hospital ?? ''),
    plan_parto_signos: String(row.plan_parto_signos ?? ''),
    plan_parto_notas: String(row.plan_parto_notas ?? ''),
  }
}

function numOrNull(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

export function payloadPediatria(consultaId: number, form: FormPediatria) {
  return {
    consulta_id: consultaId,
    alimentacion: form.alimentacion.trim() || null,
    hidratacion: form.hidratacion.trim() || null,
    desarrollo: form.desarrollo.trim() || null,
    vacunas_estado: form.vacunas_estado || null,
    acompanante: form.acompanante.trim() || null,
    fiebre: form.fiebre.trim() || null,
    tos: form.tos.trim() || null,
    diarrea: form.diarrea.trim() || null,
    vomitos: form.vomitos.trim() || null,
    convulsiones: form.convulsiones,
    notas_pediatria: form.notas_pediatria.trim() || null,
    control_nino_sano: form.control_nino_sano.trim() || null,
    hitos_desarrollo: form.hitos_desarrollo.trim() || null,
    tipo_alimentacion: form.tipo_alimentacion.trim() || null,
    alarma_fiebre_rn: form.alarma_fiebre_rn,
    alarma_dificultad_resp: form.alarma_dificultad_resp,
    alarma_deshidratacion: form.alarma_deshidratacion,
    dosis_calculadas: form.dosis_calculadas.trim() || null,
  }
}

export function payloadGinecologia(consultaId: number, form: FormGinecologia) {
  const fum = form.fum.trim() || null
  const fpp = form.fpp.trim() || (fum ? calcularFPP(fum) : null)
  const sem = form.semanas_gestacion.trim()
    ? Number(form.semanas_gestacion)
    : (fum ? calcularSemanasGestacion(fum) : null)
  return {
    consulta_id: consultaId,
    fum,
    fpp,
    semanas_gestacion: sem,
    embarazo_activo: form.embarazo_activo,
    gestas: numOrNull(form.gestas),
    partos: numOrNull(form.partos),
    cesareas: numOrNull(form.cesareas),
    abortos: numOrNull(form.abortos),
    hijos_vivos: numOrNull(form.hijos_vivos),
    dolor_pelvico: form.dolor_pelvico.trim() || null,
    sangrado: form.sangrado.trim() || null,
    flujo_vaginal: form.flujo_vaginal.trim() || null,
    planificacion: form.planificacion.trim() || null,
    examen_vulva: form.examen_vulva.trim() || null,
    examen_especulo: form.examen_especulo.trim() || null,
    examen_tv: form.examen_tv.trim() || null,
    notas_ginecologia: form.notas_ginecologia.trim() || null,
    menarquia: form.menarquia.trim() || null,
    ciclos_menstruales: form.ciclos_menstruales.trim() || null,
    pap: form.pap.trim() || null,
    its: form.its.trim() || null,
    mamografia: form.mamografia.trim() || null,
    riesgo_prenatal: form.riesgo_prenatal || null,
    alarma_sangrado: form.alarma_sangrado,
    alarma_cefalea: form.alarma_cefalea,
    alarma_edema: form.alarma_edema,
    alarma_dolor_epigastrico: form.alarma_dolor_epigastrico,
    alarma_mov_fetales: form.alarma_mov_fetales,
    checklist_t1: form.checklist_t1.trim() || null,
    checklist_t2: form.checklist_t2.trim() || null,
    checklist_t3: form.checklist_t3.trim() || null,
    plan_parto_hospital: form.plan_parto_hospital.trim() || null,
    plan_parto_signos: form.plan_parto_signos.trim() || null,
    plan_parto_notas: form.plan_parto_notas.trim() || null,
  }
}
