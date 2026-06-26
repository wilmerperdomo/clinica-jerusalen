import { tokensAlergia, normalizarTexto, contieneTexto } from '@/lib/texto-utils'

export interface AdvertenciaReceta {
  severidad: 'warning' | 'urgent'
  medicamento: string
  mensaje: string
}

/** Medicamentos de alto riesgo en embarazo (lista simplificada) */
const MEDICAMENTOS_RIESGO_EMBARAZO = [
  'warfarina', 'metotrexato', 'isotretinoina', 'acitretina', 'enalapril', 'losartan',
  'atorvastatina', 'simvastatina', 'fluconazol', 'ibuprofeno', 'naproxeno', 'diclofenaco',
  'tetraciclina', 'doxiciclina', 'valproato', 'carbamazepina', 'fenitoina', 'lisinopril',
  'atenolol', 'misoprostol', 'cloroquina alta',
]

export function advertenciasMedicamento(opts: {
  medicamento: string
  alergias?: string | null
  embarazoActivo?: boolean
}): AdvertenciaReceta[] {
  const adv: AdvertenciaReceta[] = []
  const med = opts.medicamento.trim()
  if (!med) return adv

  for (const al of tokensAlergia(opts.alergias)) {
    if (contieneTexto(med, al) || contieneTexto(al, med)) {
      adv.push({
        severidad: 'urgent',
        medicamento: med,
        mensaje: `Posible alergia cruzada con "${al}" registrada en expediente.`,
      })
    }
  }

  if (opts.embarazoActivo) {
    const nm = normalizarTexto(med)
    for (const riesgo of MEDICAMENTOS_RIESGO_EMBARAZO) {
      if (nm.includes(normalizarTexto(riesgo))) {
        adv.push({
          severidad: 'urgent',
          medicamento: med,
          mensaje: `Medicamento de riesgo en embarazo: ${riesgo}.`,
        })
      }
    }
  }

  return adv
}

export const VIAS_RECETA = [
  'Oral', 'IV', 'IM', 'SC', 'Tópica', 'Sublingual', 'Inhalatoria', 'Oftálmica', 'Ótica', 'Rectal',
] as const

export const FRECUENCIAS_RECETA = [
  '', 'c/24h', 'c/12h', 'c/8h', 'c/6h', 'c/4h', 'PRN', '1 vez al día', '2 veces al día', '3 veces al día',
] as const

export interface CamposReceta {
  no_producto: string
  dosis?: string
  frecuencia?: string
  duracion?: string
  cant: number
  via: string
  indicacion?: string
}

export function construirIndicacionReceta(c: CamposReceta): string {
  const partes: string[] = []
  if (c.dosis?.trim()) partes.push(c.dosis.trim())
  if (c.frecuencia?.trim()) partes.push(c.frecuencia.trim())
  if (c.duracion?.trim()) partes.push(`por ${c.duracion.trim()}`)
  if (c.indicacion?.trim()) partes.push(c.indicacion.trim())
  return partes.join(' — ') || c.no_producto
}
