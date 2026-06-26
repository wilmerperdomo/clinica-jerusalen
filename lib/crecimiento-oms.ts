/** Curvas de crecimiento OMS — percentiles peso/edad 0–24 meses (simplificado) */

export type GeneroOMS = 'M' | 'F'

/** Peso (kg) por edad en meses — P3, P50, P97 */
const PESO_OMS: Record<GeneroOMS, Record<number, [number, number, number]>> = {
  M: {
    0: [2.5, 3.3, 4.4], 1: [3.4, 4.5, 5.8], 2: [4.3, 5.6, 7.1], 3: [5.0, 6.4, 8.0],
    4: [5.6, 7.0, 8.7], 5: [6.0, 7.5, 9.3], 6: [6.4, 7.9, 9.8], 9: [7.1, 8.9, 10.9],
    12: [7.7, 9.6, 11.8], 18: [8.4, 10.9, 13.3], 24: [9.0, 12.2, 14.8],
  },
  F: {
    0: [2.4, 3.2, 4.2], 1: [3.2, 4.2, 5.5], 2: [4.0, 5.1, 6.6], 3: [4.6, 5.8, 7.5],
    4: [5.1, 6.4, 8.2], 5: [5.5, 6.9, 8.8], 6: [5.8, 7.3, 9.3], 9: [6.5, 8.2, 10.4],
    12: [7.0, 8.9, 11.3], 18: [7.8, 10.2, 12.9], 24: [8.5, 11.5, 14.4],
  },
}

const MESES_REF = [0, 1, 2, 3, 4, 5, 6, 9, 12, 18, 24]

export interface PuntoCrecimiento {
  fecha: string
  edadMeses: number
  peso: number
  talla?: number | null
  perimCefalico?: number | null
  consultaId?: number
}

export interface CurvaPercentil {
  mes: number
  p3: number
  p50: number
  p97: number
}

function interp(mes: number, genero: GeneroOMS, idx: 0 | 1 | 2): number {
  const tabla = PESO_OMS[genero]
  const meses = MESES_REF.filter(m => tabla[m])
  if (mes <= meses[0]) return tabla[meses[0]][idx]
  if (mes >= meses[meses.length - 1]) return tabla[meses[meses.length - 1]][idx]
  for (let i = 0; i < meses.length - 1; i++) {
    const a = meses[i]
    const b = meses[i + 1]
    if (mes >= a && mes <= b) {
      const t = (mes - a) / (b - a)
      return tabla[a][idx] + t * (tabla[b][idx] - tabla[a][idx])
    }
  }
  return tabla[meses[0]][idx]
}

export function curvaPesoOMS(genero: GeneroOMS): CurvaPercentil[] {
  return MESES_REF.map(mes => ({
    mes,
    p3: interp(mes, genero, 0),
    p50: interp(mes, genero, 1),
    p97: interp(mes, genero, 2),
  }))
}

export function percentilPesoAprox(pesoKg: number, edadMeses: number, genero: GeneroOMS): number | null {
  if (pesoKg <= 0 || edadMeses < 0) return null
  const p3 = interp(edadMeses, genero, 0)
  const p50 = interp(edadMeses, genero, 1)
  const p97 = interp(edadMeses, genero, 2)
  if (pesoKg <= p3) return 3
  if (pesoKg >= p97) return 97
  if (pesoKg <= p50) return Math.round(3 + ((pesoKg - p3) / (p50 - p3)) * 47)
  return Math.round(50 + ((pesoKg - p50) / (p97 - p50)) * 47)
}

export function edadMesesEnFecha(fechaNac: string, fecha: string): number {
  const nac = new Date(fechaNac)
  const f = new Date(fecha)
  const diffMs = f.getTime() - nac.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}

export function puntosDesdeConsultas(
  consultas: { id: number; fecha: string; peso?: string | null; talla?: string | null; perim_cefalico?: string | null }[],
  fechaNac: string,
): PuntoCrecimiento[] {
  return consultas
    .filter(c => c.peso && Number(c.peso) > 0)
    .map(c => ({
      fecha: c.fecha,
      edadMeses: edadMesesEnFecha(fechaNac, c.fecha),
      peso: Number(c.peso),
      talla: c.talla ? Number(c.talla) : null,
      perimCefalico: c.perim_cefalico ? Number(c.perim_cefalico) : null,
      consultaId: c.id,
    }))
    .sort((a, b) => a.edadMeses - b.edadMeses)
}

export function generoOMS(genero?: string | null): GeneroOMS {
  return (genero ?? '').toUpperCase() === 'F' ? 'F' : 'M'
}
