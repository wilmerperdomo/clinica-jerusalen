/** Utilidades — módulo Consultas Médicas */

/** Campos de paciente usados en consultas (persona o empresa) */
export interface PacienteConsulta {
  id?: number
  codigo?: string
  tipo?: string
  nombre?: string
  apellido1?: string
  apellido2?: string
  nombre_empresa?: string | null
  rtn_empresa?: string | null
  contacto?: string | null
  fecha_nac?: string
  genero?: string | null
  celular?: string
  telefono?: string
  lista_id?: number | null
}

/** Select Supabase estándar para joins de paciente en consultas */
export const PACIENTE_CONSULTA_SELECT =
  'id,codigo,tipo,nombre,apellido1,apellido2,nombre_empresa,rtn_empresa,contacto,fecha_nac,genero,celular,telefono,lista_id'

export function esPacienteEmpresa(p?: { tipo?: string }): boolean {
  return (p?.tipo ?? '').toLowerCase() === 'empresa'
}

export function calcularEdad(fechaNac?: string): string {
  if (!fechaNac) return ''
  const diff = Date.now() - new Date(fechaNac).getTime()
  const años = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  return años >= 0 ? `${años} años` : ''
}

/** Nombre visible: empresa → razón social; persona → nombre completo */
export function nombrePaciente(p?: PacienteConsulta): string {
  if (!p) return ''
  if (esPacienteEmpresa(p)) {
    return (p.nombre_empresa ?? p.nombre ?? '').trim() || 'Empresa'
  }
  return [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ')
}

/** Segunda línea en listas: código, RTN/contacto o edad */
export function detallePaciente(p?: PacienteConsulta): string {
  if (!p) return ''
  if (esPacienteEmpresa(p)) {
    return [
      p.codigo,
      p.rtn_empresa ? `RTN ${p.rtn_empresa}` : '',
      p.contacto ? `Contacto: ${p.contacto}` : '',
    ].filter(Boolean).join(' · ')
  }
  const edad = calcularEdad(p.fecha_nac)
  return [p.codigo, edad].filter(Boolean).join(' · ')
}

export function textoBusquedaPaciente(p: PacienteConsulta): string {
  return [
    p.codigo, p.nombre, p.apellido1, p.apellido2,
    p.nombre_empresa, p.rtn_empresa, p.contacto,
    p.celular, p.telefono,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function estadoBadgeClase(estado: string): string {
  const map: Record<string, string> = {
    ACTIVO:      'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
    'ASISTIÓ':    'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    'NO ASISTIÓ': 'bg-red-100 text-red-800 ring-1 ring-red-200',
    CANCELADO:   'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    SIGNOS:      'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    ATENDIENDO:  'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    FINALIZADO:  'bg-teal-100 text-teal-800 ring-1 ring-teal-200',
    PAGADO:      'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
    REGISTRO:    'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  }
  return map[estado] ?? 'bg-gray-100 text-gray-600'
}

export function etiquetaEstadoConsulta(estado: string): string {
  const map: Record<string, string> = {
    REGISTRO: 'Registro', SIGNOS: 'Listo para médico', ATENDIENDO: 'En consulta',
    FINALIZADO: 'Finalizada', PAGADO: 'Pagada', CANCELADO: 'Cancelada',
  }
  return map[estado] ?? estado
}

/** Tiempo de espera desde hora de registro (HH:MM:SS) */
export function tiempoEspera(hora?: string, fechaRef?: string): string {
  if (!hora) return '—'
  const hoy = fechaRef ?? new Date().toISOString().slice(0, 10)
  const inicio = new Date(`${hoy}T${hora.slice(0, 8)}`)
  if (Number.isNaN(inicio.getTime())) return '—'
  const diff = Math.max(0, Date.now() - inicio.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

/** Colores de tubo de laboratorio — clases Tailwind fijas */
export function colorLabClase(color?: string | null): string {
  const c = (color ?? '').toLowerCase().trim()
  const map: Record<string, string> = {
    rojo: 'bg-red-500', red: 'bg-red-500',
    azul: 'bg-blue-500', blue: 'bg-blue-500',
    verde: 'bg-green-500', green: 'bg-green-500',
    amarillo: 'bg-yellow-400', yellow: 'bg-yellow-400',
    morado: 'bg-purple-500', purple: 'bg-purple-500',
    naranja: 'bg-orange-500', orange: 'bg-orange-500',
    rosa: 'bg-pink-500', pink: 'bg-pink-500',
    gris: 'bg-gray-400', gray: 'bg-gray-400',
    negro: 'bg-gray-800', black: 'bg-gray-800',
  }
  return map[c] ?? 'bg-slate-400'
}

export interface FormMedicoValidar {
  sintoma: string
  historia: string
  impresion: string
  tratamiento: string
}

export function validarExamenMedico(form: FormMedicoValidar): string | null {
  if (!form.sintoma.trim()) return 'Indique el síntoma principal del paciente.'
  if (!form.historia.trim()) return 'Indique la historia clínica.'
  if (!form.impresion.trim()) return 'Indique la impresión diagnóstica.'
  if (!form.tratamiento.trim()) return 'Indique el tratamiento médico.'
  return null
}

export function fmtFechaLarga(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-HN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function normalizarRol(rol: string): string {
  return rol.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Médico / Doctor (tolera acentos y variantes de nombre de rol) */
export function esRolMedico(rol?: string): boolean {
  if (!rol) return false
  return /medico|doctor/.test(normalizarRol(rol))
}

/** Personal de enfermería / recepción (toma signos vitales) */
export function esRolEnfermeria(rol?: string): boolean {
  if (!rol) return false
  return /enfermera|cajero|recepcion/.test(normalizarRol(rol))
}

export interface OpcionesAtenderConsulta {
  esAdmin?: boolean
  esSuperAdmin?: boolean
  rolId?: number | null
  rolIdsMedico?: number[]
}

/** Quién puede abrir el examen médico (no tomar signos vitales) */
export function puedeAtenderConsulta(
  rol?: string,
  opciones: OpcionesAtenderConsulta = {},
): boolean {
  if (opciones.esSuperAdmin || opciones.esAdmin) return true
  if (esRolMedico(rol)) return true
  if (
    opciones.rolId != null &&
    opciones.rolIdsMedico?.some(id => Number(id) === Number(opciones.rolId))
  ) {
    return true
  }
  return !esRolEnfermeria(rol)
}

/**
 * Cola de espera: quien atiende consultas ve todas las del día.
 * Enfermería solo ve su sucursal.
 */
export function filtroSucursalColaConsultas<T extends { eq: (col: string, val: number) => T }>(
  query: T,
  sucursalId: number,
  puedeAtender: boolean,
): T {
  if (puedeAtender) return query
  return query.eq('sucursal_id', sucursalId)
}
