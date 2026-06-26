/** Checklists prenatales por trimestre */

export const CHECKLIST_T1_ITEMS = [
  'Labs iniciales (BH, VDRL, VIH, grupo Rh, orina)',
  'Ácido fólico',
  'USG primer trimestre / translucencia',
  'Vacuna influenza si temporada',
] as const

export const CHECKLIST_T2_ITEMS = [
  'USG anatómico (18-22 sem)',
  'Prueba de glucosa / curva',
  'Control de movimientos fetales (educación)',
] as const

export const CHECKLIST_T3_ITEMS = [
  'Proteinuria / PA cada control',
  'Bienestar fetal / FCF',
  'Estreptococo grupo B (36-37 sem)',
  'Plan de parto revisado',
] as const

export function parseChecklist(json?: string | null): Record<string, boolean> {
  if (!json?.trim()) return {}
  try {
    return JSON.parse(json) as Record<string, boolean>
  } catch {
    return {}
  }
}

export function stringifyChecklist(items: Record<string, boolean>): string {
  return JSON.stringify(items)
}

export function checklistVacio(items: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(items.map(i => [i, false]))
}

export function checklistResumen(json?: string | null): string {
  const m = parseChecklist(json)
  const done = Object.entries(m).filter(([, v]) => v).map(([k]) => k)
  return done.length ? done.join('; ') : ''
}
