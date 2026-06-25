import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canalesParaDestinatario,
  type PacienteAudiencia,
} from '@/lib/promocion-audiencia'
import { aplicarPlantilla, type PromocionPlantilla } from '@/lib/promociones-plantillas'
import type { CanalCampana, Promocion } from '@/lib/promociones-utils'
import { procesarPromocionesAutomaticas } from '@/lib/promociones-sender'

export type TipoDisparadorRegla = 'cumpleanos' | 'inactivo'

export interface PromocionRegla {
  id: number
  nombre: string
  tipo_disparador: TipoDisparadorRegla
  promocion_id: number
  plantilla_id?: number | null
  canal: CanalCampana
  modo_envio: 'asistido' | 'automatico'
  dias_anticipacion: number
  meses_inactivo: number
  activa: boolean
  sucursal_id?: number | null
  promocion?: Promocion | null
  plantilla?: PromocionPlantilla | null
}

export interface ProcesarReglasResultado {
  reglasProcesadas: number
  campanasCreadas: number
  destinatarios: number
  errores: string[]
}

function fechaObjetivoCumple(diasAnticipacion: number): { mes: number; dia: number } {
  const d = new Date()
  d.setDate(d.getDate() + diasAnticipacion)
  return { mes: d.getMonth() + 1, dia: d.getDate() }
}

function coincideCumple(fechaNac: string, diasAnticipacion: number): boolean {
  const nac = new Date(fechaNac)
  if (Number.isNaN(nac.getTime())) return false
  const obj = fechaObjetivoCumple(diasAnticipacion)
  return nac.getMonth() + 1 === obj.mes && nac.getDate() === obj.dia
}

function fechaCorteInactivo(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

async function ultimaActividadPacientes(
  supabase: SupabaseClient,
  sucursalId?: number | null,
): Promise<Map<number, string>> {
  const mapa = new Map<number, string>()

  let cq = supabase.from('consultas').select('paciente_id, fecha').neq('estado', 'CANCELADO')
  if (sucursalId) cq = cq.eq('sucursal_id', sucursalId)
  const { data: consultas } = await cq
  for (const c of consultas ?? []) {
    const prev = mapa.get(c.paciente_id)
    if (!prev || c.fecha > prev) mapa.set(c.paciente_id, c.fecha)
  }

  let lq = supabase.from('consulta_analisis').select('paciente_id, id_cliente, fecha').not('fecha', 'is', null)
  if (sucursalId) lq = lq.eq('sucursal_id', sucursalId)
  const { data: labs } = await lq
  for (const l of labs ?? []) {
    const pid = l.paciente_id ?? Number.parseInt(String(l.id_cliente ?? ''), 10)
    if (!Number.isFinite(pid) || pid <= 0 || !l.fecha) continue
    const prev = mapa.get(pid)
    if (!prev || l.fecha > prev) mapa.set(pid, l.fecha)
  }

  return mapa
}

export async function resolverPacientesRegla(
  supabase: SupabaseClient,
  regla: PromocionRegla,
): Promise<PacienteAudiencia[]> {
  let q = supabase
    .from('pacientes')
    .select('id, codigo, nombre, apellido1, apellido2, celular, telefono, correo, activo, fecha_nac')
    .eq('activo', true)
    .limit(8000)

  if (regla.sucursal_id) q = q.eq('sucursal_id', regla.sucursal_id)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let lista = (data ?? []) as (PacienteAudiencia & { fecha_nac?: string | null })[]

  if (regla.tipo_disparador === 'cumpleanos') {
    lista = lista.filter(p => p.fecha_nac && coincideCumple(p.fecha_nac, regla.dias_anticipacion))
  } else if (regla.tipo_disparador === 'inactivo') {
    const corte = fechaCorteInactivo(regla.meses_inactivo)
    const actividad = await ultimaActividadPacientes(supabase, regla.sucursal_id)
    lista = lista.filter(p => {
      const ultima = actividad.get(p.id)
      return !ultima || ultima < corte
    })
  }

  return lista
}

async function yaEjecutadaHoy(supabase: SupabaseClient, reglaId: number): Promise<boolean> {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('promocion_regla_ejecuciones')
    .select('id')
    .eq('regla_id', reglaId)
    .eq('fecha', hoy)
    .maybeSingle()
  return !!data
}

export async function procesarReglasPromociones(
  supabase: SupabaseClient,
): Promise<ProcesarReglasResultado> {
  const errores: string[] = []
  let campanasCreadas = 0
  let destinatarios = 0
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: reglas, error } = await supabase
    .from('promocion_reglas')
    .select('*, promocion:promociones(*), plantilla:promocion_plantillas(*)')
    .eq('activa', true)

  if (error) {
    return { reglasProcesadas: 0, campanasCreadas: 0, destinatarios: 0, errores: [error.message] }
  }

  for (const regla of (reglas ?? []) as PromocionRegla[]) {
    if (!regla.promocion?.activa) {
      errores.push(`Regla ${regla.id}: promoción inactiva`)
      continue
    }
    if (await yaEjecutadaHoy(supabase, regla.id)) continue

    try {
      const pacientes = await resolverPacientesRegla(supabase, regla)
      if (pacientes.length === 0) {
        await supabase.from('promocion_regla_ejecuciones').insert({
          regla_id: regla.id, fecha: hoy, total_destinatarios: 0,
        })
        continue
      }

      const mensajeBase = regla.plantilla?.contenido ?? null
      const filasEnvio: {
        paciente_id: number
        contacto_id: null
        canal: string
        estado: string
      }[] = []

      for (const p of pacientes) {
        for (const canal of canalesParaDestinatario(p, regla.canal)) {
          filasEnvio.push({ paciente_id: p.id, contacto_id: null, canal, estado: 'pendiente' })
        }
      }

      if (filasEnvio.length === 0) {
        await supabase.from('promocion_regla_ejecuciones').insert({
          regla_id: regla.id, fecha: hoy, total_destinatarios: 0,
        })
        continue
      }

      const etiqueta = regla.tipo_disparador === 'cumpleanos' ? 'Cumpleaños' : 'Inactivos'
      const { data: campana, error: errC } = await supabase
        .from('promocion_campanas')
        .insert({
          promocion_id: regla.promocion_id,
          nombre: `Auto — ${etiqueta} — ${regla.nombre}`,
          canal: regla.canal,
          modo_envio: regla.modo_envio,
          estado: regla.modo_envio === 'automatico' ? 'en_proceso' : 'lista_envio',
          filtro_audiencia: {
            tipo: 'manual',
            paciente_ids: pacientes.map(p => p.id),
            automatico_regla: regla.tipo_disparador,
          },
          mensaje_personalizado: mensajeBase,
          plantilla_id: regla.plantilla_id ?? null,
          regla_id: regla.id,
          total_destinatarios: filasEnvio.length,
          sucursal_id: regla.sucursal_id,
          iniciada_at: regla.modo_envio === 'automatico' ? new Date().toISOString() : null,
        })
        .select('id')
        .single()

      if (errC || !campana) throw errC ?? new Error('No se creó campaña automática')

      const inserts = filasEnvio.map(f => ({ ...f, campana_id: campana.id }))
      const { error: errE } = await supabase.from('promocion_envios').insert(inserts)
      if (errE) throw errE

      await supabase.from('promocion_regla_ejecuciones').insert({
        regla_id: regla.id,
        campana_id: campana.id,
        fecha: hoy,
        total_destinatarios: filasEnvio.length,
      })

      campanasCreadas++
      destinatarios += filasEnvio.length
    } catch (e) {
      errores.push(`Regla ${regla.id}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return {
    reglasProcesadas: (reglas ?? []).length,
    campanasCreadas,
    destinatarios,
    errores,
  }
}

export async function procesarPromocionesCompleto(supabase: SupabaseClient) {
  const reglas = await procesarReglasPromociones(supabase)
  const campanas = await procesarPromocionesAutomaticas(supabase)
  return {
    ...campanas,
    reglasProcesadas: reglas.reglasProcesadas,
    reglasCampanas: reglas.campanasCreadas,
    reglasDestinatarios: reglas.destinatarios,
    errores: [...reglas.errores, ...campanas.errores],
    ok: reglas.errores.length === 0 && campanas.ok,
  }
}

export function mensajeDesdeRegla(
  plantilla: PromocionPlantilla | null | undefined,
  promo: Promocion,
  paciente: PacienteAudiencia & { fecha_nac?: string | null },
  fallback?: string | null,
): string | null {
  if (plantilla?.contenido) {
    return aplicarPlantilla(plantilla.contenido, { paciente, promo })
  }
  return fallback ?? null
}
