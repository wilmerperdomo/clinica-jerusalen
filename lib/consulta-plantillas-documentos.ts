import { calcularEdad, nombrePaciente, type PacienteConsulta } from '@/lib/consultas-utils'

/**
 * Plantillas editables de constancia y acta de defunción.
 * Reemplace el texto de PLANTILLA_* cuando el usuario comparta las versiones oficiales.
 *
 * Marcadores disponibles:
 * {{PACIENTE}} {{IDENTIDAD}} {{EDAD}} {{FECHA_NAC}} {{DIRECCION}}
 * {{FECHA}} {{MEDICO}} {{DIAGNOSTICO}}
 */

export const PLANTILLA_CONSTANCIA = `Por medio de la presente se hace constar **{{PACIENTE}}** de {{EDAD}} de edad, con número de identidad **{{IDENTIDAD}}**, acudió a este centro asistencial el día **{{FECHA}}**, con historia de [describa los síntomas, días de evolución e intensidad del cuadro clínico].

Se realizó al paciente interrogatorio y exploración física completa, diagnosticándose con: **{{DIAGNOSTICO}}** Se indica farmacoterapia, exámenes complementarios e hidratación. Además, se indica reposo en casa por **[N] días** válidos a partir de **[indique las fechas exactas]**.

Para los fines que el interesado convenga, se extiende la presente constancia el día {{FECHA}} en Tegucigalpa, M.D.C., Francisco Morazán.`

export const PLANTILLA_DEFUNCION = `Mediante el presente documento médico constato que {{PACIENTE}}, con número de identidad {{IDENTIDAD}}, de {{EDAD}} de edad, residente en {{DIRECCION}}, cuya fecha de nacimiento fue el {{FECHA_NAC}}, en fecha {{FECHA}}:

[Describa la narrativa del deceso: causa médica, circunstancias, lugar, hora aproximada y demás datos relevantes.]`

export interface ContextoPlantillaDoc {
  paciente?: PacienteConsulta & { direccion?: string; fecha_nac?: string }
  medicoNombre?: string
  impresionDiagnostica?: string
  fecha?: string
}

function fmtFechaNac(fecha?: string): string {
  if (!fecha) return '—'
  try {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return fecha
  }
}

function fmtFechaHoy(fecha?: string): string {
  if (fecha) {
    try {
      return new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    } catch { /* fall through */ }
  }
  return new Date().toLocaleDateString('es-HN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function aplicarPlantilla(
  plantilla: string,
  ctx: ContextoPlantillaDoc,
): string {
  const p = ctx.paciente
  const diagnostico = (ctx.impresionDiagnostica ?? '').trim()
    || '[Completar diagnóstico, incapacidad, reposo o recomendaciones médicas.]'

  const mapa: Record<string, string> = {
    '{{PACIENTE}}': nombrePaciente(p) || '[Nombre del paciente]',
    '{{IDENTIDAD}}': p?.codigo?.trim() || '—',
    '{{EDAD}}': calcularEdad(p?.fecha_nac) || '—',
    '{{FECHA_NAC}}': fmtFechaNac(p?.fecha_nac),
    '{{DIRECCION}}': (p as { direccion?: string })?.direccion?.trim() || '[Dirección del paciente]',
    '{{FECHA}}': fmtFechaHoy(ctx.fecha),
    '{{MEDICO}}': ctx.medicoNombre?.trim() || '[Médico tratante]',
    '{{DIAGNOSTICO}}': diagnostico,
  }

  let out = plantilla
  for (const [k, v] of Object.entries(mapa)) {
    out = out.split(k).join(v)
  }
  return out
}

export function plantillaConstancia(ctx: ContextoPlantillaDoc): string {
  return aplicarPlantilla(PLANTILLA_CONSTANCIA, ctx)
}

export function plantillaDefuncion(ctx: ContextoPlantillaDoc): string {
  return aplicarPlantilla(PLANTILLA_DEFUNCION, ctx)
}
