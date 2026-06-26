/** Sugerencias de órdenes según diagnóstico CIE-10 */

export interface SugerenciaOrden {
  tipo: 'lab' | 'servicio' | 'seguimiento' | 'referencia'
  etiqueta: string
  patronesLab?: string[]
  motivoSeguimiento?: string
  diasSeguimiento?: number
}

const REGLAS: { match: RegExp; sugerencias: SugerenciaOrden[] }[] = [
  {
    match: /^E11|^E10|diabet/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'Glucosa / HbA1c', patronesLab: ['glucosa', 'glicemia', 'hba1c', 'hemoglobina glicosilada'] },
      { tipo: 'seguimiento', etiqueta: 'Control metabólico', motivoSeguimiento: 'Control diabetes', diasSeguimiento: 90 },
    ],
  },
  {
    match: /^I10|hipertens/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'Perfil renal / lípidos', patronesLab: ['creatinina', 'urea', 'perfil lipidico', 'colesterol'] },
      { tipo: 'seguimiento', etiqueta: 'Control PA', motivoSeguimiento: 'Control hipertensión', diasSeguimiento: 30 },
    ],
  },
  {
    match: /^N39|infeccion urin|itu/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'EGO / urocultivo', patronesLab: ['orina', 'urocultivo', 'ego', 'elemental'] },
    ],
  },
  {
    match: /^J18|^J20|neumon|bronqu/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'Rx / labs respiratorios', patronesLab: ['radiografia', 'hemograma', 'proteina c'] },
    ],
  },
  {
    match: /^O26|^Z34|embaraz/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'Protocolo prenatal', patronesLab: ['vdrl', 'vih', 'hemoglobina', 'glucosa', 'orina'] },
      { tipo: 'seguimiento', etiqueta: 'Control prenatal', motivoSeguimiento: 'Control prenatal', diasSeguimiento: 28 },
    ],
  },
  {
    match: /^R50|fiebre/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'Hemograma', patronesLab: ['hemograma', 'biometria'] },
    ],
  },
  {
    match: /^K29|gastrit/i,
    sugerencias: [
      { tipo: 'lab', etiqueta: 'H. pylori / labs digestivos', patronesLab: ['helicobacter', 'amilasa'] },
    ],
  },
]

export function sugerenciasDesdeDiagnosticos(
  diagnosticos: { cie10_codigo?: string | null; descripcion: string }[],
): SugerenciaOrden[] {
  const out: SugerenciaOrden[] = []
  const vistos = new Set<string>()

  for (const d of diagnosticos) {
    const texto = `${d.cie10_codigo ?? ''} ${d.descripcion}`
    for (const regla of REGLAS) {
      if (!regla.match.test(texto)) continue
      for (const s of regla.sugerencias) {
        const key = `${s.tipo}-${s.etiqueta}`
        if (vistos.has(key)) continue
        vistos.add(key)
        out.push(s)
      }
    }
  }
  return out
}

export function labsDesdeSugerencias(
  sugerencias: SugerenciaOrden[],
  pruebas: { id: number; nombre: string }[],
): { id: number; nombre: string }[] {
  const patrones = sugerencias.flatMap(s => s.patronesLab ?? [])
  if (!patrones.length) return []
  const encontradas: { id: number; nombre: string }[] = []
  const usados = new Set<number>()

  for (const pat of patrones) {
    const p = pat.toLowerCase()
    for (const prueba of pruebas) {
      if (usados.has(prueba.id)) continue
      if (prueba.nombre.toLowerCase().includes(p) || p.includes(prueba.nombre.toLowerCase().slice(0, 5))) {
        encontradas.push(prueba)
        usados.add(prueba.id)
      }
    }
  }
  return encontradas
}
