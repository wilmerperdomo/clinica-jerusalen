import { nombrePaciente, type PacienteConsulta } from '@/lib/consultas-utils'
import { calcularEdad } from '@/lib/caja-seguridad'

export interface LabOrdenCobroRow {
  id: number
  id_consulta?: string | null
  lab_grupo_id?: string | null
  paciente_id?: number | null
  id_cliente?: string | null
  no_analisis: string
  importe: number
  fecha: string
  hora?: string
  estado_lab?: string
  pagado?: boolean
  paciente?: PacienteConsulta & {
    id: number
    codigo: string
    fecha_nac?: string
    celular?: string
    telefono?: string
    correo?: string
  }
}

export interface LabGrupoCobro {
  grupoId: string
  pacienteId: number
  pacienteNombre: string
  pacienteCodigo: string
  fecha: string
  hora?: string
  ordenes: { id: number; no_analisis: string; importe: number }[]
  total: number
  paciente?: LabOrdenCobroRow['paciente']
}

export function esOrdenLabDirecta(o: { id_consulta?: string | null }): boolean {
  const c = o.id_consulta
  return c == null || String(c).trim() === ''
}

function grupoIdOrden(o: LabOrdenCobroRow): string {
  if (o.lab_grupo_id) return o.lab_grupo_id
  const pid = o.paciente_id ?? o.id_cliente ?? '0'
  return `legacy-${pid}-${o.fecha}-direct`
}

export function agruparLabPorCobrar(ordenes: LabOrdenCobroRow[]): LabGrupoCobro[] {
  const map = new Map<string, LabOrdenCobroRow[]>()
  for (const o of ordenes) {
    if (!esOrdenLabDirecta(o)) continue
    if (o.estado_lab && o.estado_lab !== 'PENDIENTE_COBRO') continue
    if (o.pagado === true) continue
    const gid = grupoIdOrden(o)
    if (!map.has(gid)) map.set(gid, [])
    map.get(gid)!.push(o)
  }

  const grupos: LabGrupoCobro[] = []
  for (const [grupoId, items] of map) {
    const sorted = [...items].sort((a, b) => a.id - b.id)
    const first = sorted[0]
    const pid = Number(first.paciente_id ?? first.id_cliente ?? 0)
    const pac = first.paciente
    grupos.push({
      grupoId,
      pacienteId: pid,
      pacienteNombre: pac ? nombrePaciente(pac) : `#${first.id_cliente ?? pid}`,
      pacienteCodigo: pac?.codigo ?? '',
      fecha: first.fecha,
      hora: first.hora,
      ordenes: sorted.map(o => ({
        id: o.id,
        no_analisis: o.no_analisis,
        importe: Number(o.importe || 0),
      })),
      total: sorted.reduce((s, o) => s + Number(o.importe || 0), 0),
      paciente: pac,
    })
  }

  return grupos.sort((a, b) => b.ordenes[0].id - a.ordenes[0].id)
}

export function calcularDescuentoEdad(
  fechaNac: string | undefined,
  subtotal: number,
  sucursal?: {
    tercera_edad?: number
    cuarta_edad?: number
    por_descuento_tercera?: number
    por_descuento_cuarta?: number
  },
): { pctDesc: number; valDesc: number; total: number; motivo: string; edad: number; fechaSospechosa: boolean } {
  let pctDesc = 0
  let motivo = ''
  let edad = 0
  let fechaSospechosa = false
  if (fechaNac && sucursal) {
    const e = calcularEdad(fechaNac)
    // Blindaje: fecha imposible/sospechosa ⇒ no se aplica descuento por edad.
    if (Number.isNaN(e)) {
      fechaSospechosa = true
    } else {
      edad = e
      if (edad >= (sucursal.cuarta_edad || 80)) {
        pctDesc = sucursal.por_descuento_cuarta || 0
        motivo = `Cuarta Edad (${edad} años)`
      } else if (edad >= (sucursal.tercera_edad || 60)) {
        pctDesc = sucursal.por_descuento_tercera || 0
        motivo = `Tercera Edad (${edad} años)`
      }
    }
  }
  const valDesc = subtotal * (pctDesc / 100)
  return { pctDesc, valDesc, total: subtotal - valDesc, motivo, edad, fechaSospechosa }
}
