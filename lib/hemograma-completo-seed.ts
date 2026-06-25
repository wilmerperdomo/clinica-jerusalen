/**
 * Catálogo estándar de Hemograma Completo (serie roja, blanca y plaquetas).
 * Ajuste los valores de referencia según su PDF / laboratorio de referencia.
 */
export type HemogramaCampoSeed = {
  codigo: string
  nombre: string
  unidad: string
  orden: number
  seccion?: string
  /** Rango adulto general (ambos sexos). null = solo texto cualitativo. */
  rango_min?: number | null
  rango_max?: number | null
  rango_texto?: string | null
  /** Rangos opcionales por sexo si difieren del general */
  rango_m?: { min: number; max: number; texto?: string }
  rango_f?: { min: number; max: number; texto?: string }
}

export const HEMOGRAMA_COMPLETO_CAMPOS: HemogramaCampoSeed[] = [
  // ── Serie roja ──
  { codigo: 'HGB', nombre: 'Hemoglobina', unidad: 'g/dL', orden: 1, seccion: 'Serie roja',
    rango_m: { min: 13.5, max: 17.5 }, rango_f: { min: 12.0, max: 15.5 } },
  { codigo: 'HCT', nombre: 'Hematocrito', unidad: '%', orden: 2, seccion: 'Serie roja',
    rango_m: { min: 41, max: 53 }, rango_f: { min: 36, max: 46 } },
  { codigo: 'RBC', nombre: 'Eritrocitos', unidad: 'mill/mm³', orden: 3, seccion: 'Serie roja',
    rango_m: { min: 4.5, max: 5.9 }, rango_f: { min: 4.0, max: 5.2 } },
  { codigo: 'MCV', nombre: 'VCM', unidad: 'fL', orden: 4, seccion: 'Serie roja', rango_min: 80, rango_max: 100 },
  { codigo: 'MCH', nombre: 'HCM', unidad: 'pg', orden: 5, seccion: 'Serie roja', rango_min: 27, rango_max: 33 },
  { codigo: 'MCHC', nombre: 'CHCM', unidad: 'g/dL', orden: 6, seccion: 'Serie roja', rango_min: 32, rango_max: 36 },
  { codigo: 'RDW', nombre: 'RDW-CV', unidad: '%', orden: 7, seccion: 'Serie roja', rango_min: 11.5, rango_max: 14.5 },

  // ── Serie blanca ──
  { codigo: 'WBC', nombre: 'Leucocitos', unidad: '/mm³', orden: 10, seccion: 'Serie blanca', rango_min: 4500, rango_max: 11000 },
  { codigo: 'NEU_PCT', nombre: 'Neutrófilos segmentados', unidad: '%', orden: 11, seccion: 'Serie blanca', rango_min: 40, rango_max: 70 },
  { codigo: 'LYM_PCT', nombre: 'Linfocitos', unidad: '%', orden: 12, seccion: 'Serie blanca', rango_min: 20, rango_max: 40 },
  { codigo: 'MON_PCT', nombre: 'Monocitos', unidad: '%', orden: 13, seccion: 'Serie blanca', rango_min: 2, rango_max: 8 },
  { codigo: 'EOS_PCT', nombre: 'Eosinófilos', unidad: '%', orden: 14, seccion: 'Serie blanca', rango_min: 1, rango_max: 4 },
  { codigo: 'BAS_PCT', nombre: 'Basófilos', unidad: '%', orden: 15, seccion: 'Serie blanca', rango_min: 0, rango_max: 1 },
  { codigo: 'NEU_ABS', nombre: 'Neutrófilos (absolutos)', unidad: '/mm³', orden: 16, seccion: 'Serie blanca', rango_min: 1800, rango_max: 7700 },
  { codigo: 'LYM_ABS', nombre: 'Linfocitos (absolutos)', unidad: '/mm³', orden: 17, seccion: 'Serie blanca', rango_min: 1000, rango_max: 4400 },
  { codigo: 'MON_ABS', nombre: 'Monocitos (absolutos)', unidad: '/mm³', orden: 18, seccion: 'Serie blanca', rango_min: 200, rango_max: 880 },
  { codigo: 'EOS_ABS', nombre: 'Eosinófilos (absolutos)', unidad: '/mm³', orden: 19, seccion: 'Serie blanca', rango_min: 45, rango_max: 440 },
  { codigo: 'BAS_ABS', nombre: 'Basófilos (absolutos)', unidad: '/mm³', orden: 20, seccion: 'Serie blanca', rango_min: 0, rango_max: 110 },

  // ── Plaquetas ──
  { codigo: 'PLT', nombre: 'Plaquetas', unidad: '/mm³', orden: 25, seccion: 'Plaquetas', rango_min: 150000, rango_max: 450000 },
  { codigo: 'MPV', nombre: 'VPM', unidad: 'fL', orden: 26, seccion: 'Plaquetas', rango_min: 7.5, rango_max: 11.5 },
  { codigo: 'PDW', nombre: 'PDW', unidad: '%', orden: 27, seccion: 'Plaquetas', rango_min: 10, rango_max: 18 },
]
