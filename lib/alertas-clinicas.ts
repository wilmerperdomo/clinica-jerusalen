/** Alertas clínicas pediátricas, prenatales y en consulta en vivo */

import { edadEnMeses, alertasVacunas, type VacunaCatalogo, type PacienteVacuna } from '@/lib/vacunas-utils'
import { diasProximoControlPrenatal } from '@/lib/control-prenatal-utils'
import { advertenciasMedicamento } from '@/lib/receta-seguridad'
import { normalizarTexto, contieneTexto } from '@/lib/texto-utils'

export type TipoAlertaClinica =
  | 'vacuna'
  | 'control_pediatrico'
  | 'control_prenatal'
  | 'alergia'
  | 'embarazo'
  | 'fiebre'
  | 'cronico'
  | 'info'

export type SeveridadAlerta = 'info' | 'warning' | 'urgent'

export interface AlertaClinica {
  id: string
  tipo: TipoAlertaClinica
  severidad: SeveridadAlerta
  titulo: string
  mensaje: string
}

interface ConsultaSignos {
  fecha: string
  peso?: string | null
}

interface ControlPrenatalHist {
  fecha: string
  semanas_gestacion?: number | null
}

export function alertasPediatricas(opts: {
  pacienteId: number
  fechaNac?: string | null
  consultas: ConsultaSignos[]
  catalogoVacunas: VacunaCatalogo[]
  vacunasAplicadas: PacienteVacuna[]
}): AlertaClinica[] {
  const alertas: AlertaClinica[] = []
  const edad = edadEnMeses(opts.fechaNac)
  if (edad == null || edad > 216) return alertas

  for (const a of alertasVacunas(opts.catalogoVacunas, opts.vacunasAplicadas, edad)) {
    alertas.push({
      id: `vac-${a.vacuna.id}`,
      tipo: 'vacuna',
      severidad: 'warning',
      titulo: 'Vacuna pendiente',
      mensaje: a.mensaje,
    })
  }

  if (edad <= 24) {
    const ultima = opts.consultas
      .filter(c => c.peso)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    const diasSinControl = ultima
      ? Math.floor((Date.now() - new Date(ultima.fecha).getTime()) / (1000 * 60 * 60 * 24))
      : 999

    const umbralDias = edad < 3 ? 30 : edad < 12 ? 60 : 90
    if (diasSinControl > umbralDias) {
      alertas.push({
        id: 'control-ped',
        tipo: 'control_pediatrico',
        severidad: edad < 3 ? 'urgent' : 'warning',
        titulo: 'Control pediátrico',
        mensaje: edad < 3
          ? `Niño de ${edad} mes(es) sin control reciente (${diasSinControl} días).`
          : `Sin control pediátrico en los últimos ${diasSinControl} días.`,
      })
    }
  }

  return alertas
}

export function alertasPrenatales(opts: {
  embarazoActivo: boolean
  fpp?: string | null
  ultimoControl?: ControlPrenatalHist | null
  semanasActuales?: number | null
}): AlertaClinica[] {
  if (!opts.embarazoActivo) return []
  const alertas: AlertaClinica[] = []
  const sem = opts.semanasActuales ?? opts.ultimoControl?.semanas_gestacion ?? null

  if (sem != null && sem >= 36) {
    alertas.push({
      id: 'prenatal-36',
      tipo: 'control_prenatal',
      severidad: 'urgent',
      titulo: 'Control prenatal',
      mensaje: `Embarazo de ${sem} semanas — controles semanales recomendados.`,
    })
  }

  if (opts.ultimoControl?.fecha && sem != null) {
    const dias = Math.floor(
      (Date.now() - new Date(opts.ultimoControl.fecha).getTime()) / (1000 * 60 * 60 * 24),
    )
    const esperado = diasProximoControlPrenatal(sem)
    if (dias > esperado + 3) {
      alertas.push({
        id: 'prenatal-vencido',
        tipo: 'control_prenatal',
        severidad: 'warning',
        titulo: 'Control prenatal vencido',
        mensaje: `Último control hace ${dias} días (esperado cada ${esperado} días).`,
      })
    }
  }

  if (opts.fpp) {
    const fpp = new Date(opts.fpp)
    const diasFpp = Math.floor((fpp.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diasFpp >= 0 && diasFpp <= 14) {
      alertas.push({
        id: 'prenatal-fpp',
        tipo: 'info',
        severidad: 'info',
        titulo: 'FPP próxima',
        mensaje: `Fecha probable de parto en ${diasFpp} día(s).`,
      })
    }
  }

  return alertas
}

export function claseSeveridadAlerta(s: SeveridadAlerta): string {
  const map: Record<SeveridadAlerta, string> = {
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    urgent: 'bg-red-50 border-red-200 text-red-900',
  }
  return map[s]
}

interface LabHistorial {
  nombre: string
  fecha: string
}

/** Alertas en tiempo real dentro del modal de consulta */
export function alertasConsultaEnVivo(opts: {
  alergias?: string | null
  personal?: string | null
  recetaItems: { no_producto: string }[]
  fechaNac?: string | null
  temperatura?: string | null
  presion?: string | null
  embarazoActivo?: boolean
  semanasGestacion?: number | null
  fpp?: string | null
  ultimoControlPrenatal?: ControlPrenatalHist | null
  catalogoVacunas?: VacunaCatalogo[]
  vacunasAplicadas?: PacienteVacuna[]
  consultasConPeso?: ConsultaSignos[]
  diagnosticos?: { cie10_codigo?: string | null; descripcion: string }[]
  labsRecientes?: LabHistorial[]
}): AlertaClinica[] {
  const alertas: AlertaClinica[] = []

  for (const med of opts.recetaItems) {
    for (const adv of advertenciasMedicamento({
      medicamento: med.no_producto,
      alergias: opts.alergias,
      embarazoActivo: opts.embarazoActivo,
    })) {
      alertas.push({
        id: `alergia-${normalizarTexto(med.no_producto)}`,
        tipo: adv.severidad === 'urgent' ? 'alergia' : 'embarazo',
        severidad: adv.severidad,
        titulo: adv.severidad === 'urgent' ? 'Alerta medicamento' : 'Riesgo en embarazo',
        mensaje: adv.mensaje,
      })
    }
  }

  const edad = edadEnMeses(opts.fechaNac)
  const temp = Number(opts.temperatura)
  if (edad != null && edad < 3 && temp >= 38) {
    alertas.push({
      id: 'fiebre-rn',
      tipo: 'fiebre',
      severidad: 'urgent',
      titulo: 'Fiebre en lactante',
      mensaje: `Menor de 3 meses con fiebre (${temp}°C). Valoración urgente.`,
    })
  } else if (edad != null && edad < 12 && temp >= 39) {
    alertas.push({
      id: 'fiebre-ped',
      tipo: 'fiebre',
      severidad: 'warning',
      titulo: 'Fiebre pediátrica',
      mensaje: `Lactante menor de 1 año con fiebre alta (${temp}°C).`,
    })
  }

  if (opts.embarazoActivo && opts.presion) {
    const m = opts.presion.match(/(\d+)\s*\/\s*(\d+)/)
    if (m) {
      const sist = Number(m[1])
      const diast = Number(m[2])
      if (sist >= 140 || diast >= 90) {
        alertas.push({
          id: 'hta-embarazo',
          tipo: 'embarazo',
          severidad: 'urgent',
          titulo: 'HTA en embarazo',
          mensaje: `PA ${opts.presion} — descartar preeclampsia.`,
        })
      }
    }
  }

  const textoCronico = [
    opts.personal ?? '',
    ...(opts.diagnosticos ?? []).map(d => `${d.cie10_codigo ?? ''} ${d.descripcion}`),
  ].join(' ')
  const esDiabetico = /E11|E10|diabet/i.test(textoCronico)
  if (esDiabetico && opts.labsRecientes) {
    const hace = (nombre: string, dias: number) => {
      const lab = opts.labsRecientes!
        .filter(l => contieneTexto(l.nombre, nombre))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
      if (!lab) return true
      const diff = Math.floor((Date.now() - new Date(lab.fecha).getTime()) / (86400000))
      return diff > dias
    }
    if (hace('glucosa', 180) && hace('glicemia', 180) && hace('hba1c', 180)) {
      alertas.push({
        id: 'dm-sin-labs',
        tipo: 'cronico',
        severidad: 'warning',
        titulo: 'Diabetes — labs pendientes',
        mensaje: 'Paciente diabético sin glucosa/HbA1c reciente en los últimos 6 meses.',
      })
    }
  }

  if (opts.catalogoVacunas?.length && opts.vacunasAplicadas && edad != null && edad <= 216) {
    alertas.push(...alertasPediatricas({
      pacienteId: 0,
      fechaNac: opts.fechaNac,
      consultas: opts.consultasConPeso ?? [],
      catalogoVacunas: opts.catalogoVacunas,
      vacunasAplicadas: opts.vacunasAplicadas,
    }))
  }

  if (opts.embarazoActivo) {
    alertas.push(...alertasPrenatales({
      embarazoActivo: true,
      fpp: opts.fpp,
      ultimoControl: opts.ultimoControlPrenatal,
      semanasActuales: opts.semanasGestacion,
    }))
  }

  return deduplicarAlertas(alertas)
}

function deduplicarAlertas(alertas: AlertaClinica[]): AlertaClinica[] {
  const vistos = new Set<string>()
  return alertas.filter(a => {
    if (vistos.has(a.id)) return false
    vistos.add(a.id)
    return true
  })
}
