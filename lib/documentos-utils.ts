import type { TipoDocCorrelativo } from '@/lib/consulta-correlativo'
import {
  edadPacientePrint,
  imprimirActaDefuncion,
  imprimirConstanciaMedica,
  imprimirRecetaMedica,
  imprimirReferenciaMedica,
  type RecetaPrintItem,
} from '@/lib/consulta-documentos-print'
import { nombrePaciente, textoBusquedaPaciente, type PacienteConsulta } from '@/lib/consultas-utils'

export interface DocumentoHistorial {
  id: number
  tipo: TipoDocCorrelativo
  numero_doc: string
  correlativo: number
  contenido: Record<string, unknown>
  medico_nombre?: string | null
  created_at: string
  updated_at?: string | null
  sucursal_id?: number | null
  consulta_id: number
  paciente_id: number
  paciente?: (PacienteConsulta & { id?: number; codigo?: string; fecha_nac?: string; direccion?: string }) | null
  consulta?: { id: number; fecha?: string } | null
}

export const TIPO_DOC_CFG: Record<TipoDocCorrelativo, { label: string; badge: string; descripcion: string }> = {
  RECETA: {
    label: 'Receta',
    badge: 'bg-purple-100 text-purple-800',
    descripcion: 'Prescripción médica',
  },
  CONSTANCIA: {
    label: 'Constancia',
    badge: 'bg-sky-100 text-sky-800',
    descripcion: 'Constancia / incapacidad',
  },
  DEFUNCION: {
    label: 'Acta defunción',
    badge: 'bg-slate-200 text-slate-800',
    descripcion: 'Acta de defunción',
  },
  REFERENCIA: {
    label: 'Referencia',
    badge: 'bg-teal-100 text-teal-800',
    descripcion: 'Referencia médica',
  },
}

export const TIPOS_DOCUMENTO: TipoDocCorrelativo[] = ['RECETA', 'CONSTANCIA', 'DEFUNCION', 'REFERENCIA']

export function formatearFechaDoc(iso: string): string {
  return new Date(iso).toLocaleDateString('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatearFechaHoraDoc(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function resumenDocumento(doc: DocumentoHistorial): string {
  const c = doc.contenido
  switch (doc.tipo) {
    case 'RECETA': {
      const items = (c.items as RecetaPrintItem[] | undefined) ?? []
      return items.length > 0
        ? `${items.length} medicamento${items.length !== 1 ? 's' : ''}`
        : 'Sin medicamentos'
    }
    case 'CONSTANCIA':
      return String(c.subtitulo ?? 'Constancia médica')
    case 'DEFUNCION':
      return `Muerte ${String(c.tipo_muerte ?? '').toLowerCase() || '—'}`
    case 'REFERENCIA':
      return String(c.destino ?? 'Sin destino')
    default:
      return '—'
  }
}

export function textoBusquedaDocumento(doc: DocumentoHistorial): string {
  const pac = doc.paciente
  const base = [
    doc.numero_doc,
    doc.tipo,
    doc.medico_nombre ?? '',
    resumenDocumento(doc),
    String(doc.consulta_id),
    pac ? textoBusquedaPaciente(pac) : '',
  ].join(' ')
  return base.toLowerCase()
}

export function reimprimirDocumento(doc: DocumentoHistorial, baseUrl?: string) {
  const pac = doc.paciente
  const pacNombre = nombrePaciente(pac ?? undefined)
  const pacCodigo = pac?.codigo ?? ''
  const pacEdad = edadPacientePrint(pac?.fecha_nac)
  const fecha = formatearFechaDoc(doc.created_at)
  const medico = doc.medico_nombre ?? ''
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const c = doc.contenido

  switch (doc.tipo) {
    case 'RECETA':
      imprimirRecetaMedica({
        numero_doc: doc.numero_doc,
        fecha,
        paciente_nombre: pacNombre,
        paciente_codigo: pacCodigo,
        paciente_edad: pacEdad,
        medico_nombre: medico,
        items: (c.items as RecetaPrintItem[] | undefined) ?? [],
        tratamiento: String(c.tratamiento ?? ''),
        dias_reposo: Number(c.dias_reposo ?? 0),
        baseUrl: origin,
      })
      break
    case 'CONSTANCIA':
      imprimirConstanciaMedica({
        numero_doc: doc.numero_doc,
        fecha,
        paciente_nombre: pacNombre,
        paciente_codigo: pacCodigo,
        paciente_edad: pacEdad,
        medico_nombre: medico,
        texto: String(c.texto ?? ''),
        subtitulo: String(c.subtitulo ?? 'INCAPACIDAD'),
        cargo_medico: String(c.cargo_medico ?? 'Médico General'),
        baseUrl: origin,
      })
      break
    case 'DEFUNCION':
      imprimirActaDefuncion({
        numero_doc: doc.numero_doc,
        fecha,
        paciente_nombre: pacNombre,
        paciente_codigo: pacCodigo,
        paciente_edad: pacEdad,
        paciente_fecha_nac: pac?.fecha_nac,
        paciente_direccion: pac?.direccion,
        medico_nombre: medico,
        texto: String(c.texto ?? ''),
        tipo_muerte: String(c.tipo_muerte ?? 'NATURAL'),
        causas: Array.isArray(c.causas) ? c.causas.map(String) : [],
        cargo_medico: String(c.cargo_medico ?? 'Médico General'),
        baseUrl: origin,
      })
      break
    case 'REFERENCIA':
      imprimirReferenciaMedica({
        numero_doc: doc.numero_doc,
        fecha,
        paciente_nombre: pacNombre,
        paciente_codigo: pacCodigo,
        paciente_edad: pacEdad,
        paciente_fecha_nac: pac?.fecha_nac,
        medico_nombre: medico,
        texto: String(c.texto ?? ''),
        destino: String(c.destino ?? ''),
        sospechas: Array.isArray(c.sospechas) ? c.sospechas.map(String) : [],
        cargo_medico: String(c.cargo_medico ?? 'Médico General'),
        baseUrl: origin,
      })
      break
    default:
      alert('Tipo de documento no soportado para reimpresión.')
  }
}
