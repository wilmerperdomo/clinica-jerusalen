/** Conectar plan médico escrito → receta / laboratorio real */

export function lineasPlan(texto: string): string[] {
  return texto
    .split(/[\n;]+/)
    .map(s => s.replace(/^[\s•\-–*]+/, '').trim())
    .filter(Boolean)
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

export interface PruebaMatch {
  id: number
  nombre: string
}

/** Busca pruebas del catálogo mencionadas en el texto del plan */
export function estudiosPlanAMatchear(
  planEstudios: string,
  pruebas: PruebaMatch[],
): PruebaMatch[] {
  const lineas = lineasPlan(planEstudios)
  if (!lineas.length) return []
  const encontradas: PruebaMatch[] = []
  const usados = new Set<number>()

  for (const linea of lineas) {
    const nl = normalizar(linea)
    let mejor: PruebaMatch | null = null
    let mejorScore = 0

    for (const p of pruebas) {
      if (usados.has(p.id)) continue
      const np = normalizar(p.nombre)
      if (nl.includes(np) || np.includes(nl)) {
        const score = np.length
        if (score > mejorScore) { mejor = p; mejorScore = score }
        continue
      }
      const palabras = np.split(/\s+/).filter(w => w.length > 3)
      const hits = palabras.filter(w => nl.includes(w)).length
      if (hits >= 2 && hits > mejorScore) { mejor = p; mejorScore = hits }
    }

    if (mejor) {
      encontradas.push(mejor)
      usados.add(mejor.id)
    }
  }
  return encontradas
}

export interface RecetaDesdePlan {
  no_producto: string
  indicacion: string
  cant: number
  via: string
}

/** Convierte líneas del plan de medicamentos en ítems de receta */
export function medicamentosPlanAReceta(planMedicamentos: string): RecetaDesdePlan[] {
  return lineasPlan(planMedicamentos).map(linea => {
    const partes = linea.split(/\s*[-–:]\s*/)
    if (partes.length >= 2) {
      return {
        no_producto: partes[0].trim(),
        indicacion: partes.slice(1).join(' — ').trim() || linea,
        cant: 1,
        via: 'Oral',
      }
    }
    return { no_producto: linea, indicacion: linea, cant: 1, via: 'Oral' }
  })
}
