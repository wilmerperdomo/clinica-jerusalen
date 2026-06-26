/** Protocolo de laboratorio de embarazo — agrega pruebas al pedido en un clic */

export interface PruebaLabRef {
  id: number
  nombre: string
  costo: number
}

/** Patrones de búsqueda por nombre (insensible a mayúsculas) */
const PATRONES_PROTOCOLO_EMBARAZO = [
  /hemoglobina|hb\b|hto|hematocrito/i,
  /glicemia|glucosa/i,
  /orina|uroan[aá]lisis|egoo/i,
  /vdrl|s[ií]filis/i,
  /hiv|vih/i,
  /grupo.*rh|factor\s*rh/i,
  /toxoplasma/i,
  /rub[eé]ola|igg.*rub/i,
  /hepatitis\s*b|hbsag/i,
  /tsh|tiroides/i,
  /creatinina|bun|funci[oó]n\s*renal/i,
  /ultrasonido|ecograf[ií]a|usg/i,
]

export function pruebasProtocoloEmbarazo(pruebas: PruebaLabRef[]): PruebaLabRef[] {
  const usados = new Set<number>()
  const resultado: PruebaLabRef[] = []

  for (const patron of PATRONES_PROTOCOLO_EMBARAZO) {
    const match = pruebas.find(p => !usados.has(p.id) && patron.test(p.nombre))
    if (match) {
      usados.add(match.id)
      resultado.push(match)
    }
  }
  return resultado
}

export function nombresProtocoloEmbarazo(): string[] {
  return [
    'Hemoglobina / hematocrito',
    'Glicemia',
    'Orina / uroanálisis',
    'VDRL (sífilis)',
    'VIH',
    'Grupo y Rh',
    'Toxoplasma',
    'Rubéola IgG',
    'Hepatitis B',
    'TSH',
    'Función renal',
    'Ultrasonido obstétrico',
  ]
}

export function resumenProtocoloEmbarazo(agregadas: PruebaLabRef[], faltantes: string[]): string {
  const partes: string[] = []
  if (agregadas.length) partes.push(`${agregadas.length} prueba(s) agregada(s)`)
  if (faltantes.length) partes.push(`${faltantes.length} no encontrada(s) en catálogo`)
  return partes.join(' · ') || 'Sin cambios'
}

export function patronesNoEncontrados(pruebas: PruebaLabRef[]): string[] {
  const encontradas = pruebasProtocoloEmbarazo(pruebas)
  const esperados = nombresProtocoloEmbarazo()
  const faltantes: string[] = []
  for (let i = 0; i < PATRONES_PROTOCOLO_EMBARAZO.length; i++) {
    const ya = encontradas.some(p => PATRONES_PROTOCOLO_EMBARAZO[i].test(p.nombre))
    if (!ya) faltantes.push(esperados[i])
  }
  return faltantes
}
