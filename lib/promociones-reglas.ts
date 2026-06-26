import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canalesParaDestinatario,
  type PacienteAudiencia,
} from '@/lib/promocion-audiencia'
import { aplicarPlantilla, type PromocionPlantilla } from '@/lib/promociones-plantillas'
import type { CanalCampana, Promocion } from '@/lib/promociones-utils'
import { esEncuesta } from '@/lib/promociones-utils'
import { procesarPromocionesAutomaticas, proveedorAutomaticoPorDefecto } from '@/lib/promociones-sender'

export type TipoDisparadorRegla = 'cumpleanos' | 'inactivo' | 'post_consulta'

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
  horas_post_consulta?: number
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

function consultaDateTime(fecha: string, hora: string): Date {
  const h = hora?.length === 5 ? `${hora}:00` : (hora || '00:00:00')
  return new Date(`${fecha}T${h}`)
}

function consultaElegiblePostEncuesta(
  fecha: string,
  hora: string,
  horasPost: number,
  ahora = new Date(),
): boolean {
  const consultaAt = consultaDateTime(fecha, hora)
  if (Number.isNaN(consultaAt.getTime())) return false
  const enviarDesde = new Date(consultaAt.getTime() + horasPost * 3_600_000)
  const ventanaMs = 12 * 3_600_000
  return ahora >= enviarDesde && (ahora.getTime() - enviarDesde.getTime()) < ventanaMs
}

async function consultasElegiblesPostConsulta(
  supabase: SupabaseClient,
  regla: PromocionRegla,
): Promise<{ consulta_id: number; paciente_id: number }[]> {
  const horas = regla.horas_post_consulta ?? 24

  let cq = supabase
    .from('consultas')
    .select('id, paciente_id, fecha, hora, sucursal_id, estado')
    .in('estado', ['FINALIZADO', 'PAGADO'])
    .order('fecha', { ascending: false })
    .limit(500)

  if (regla.sucursal_id) cq = cq.eq('sucursal_id', regla.sucursal_id)

  const { data: consultas, error } = await cq
  if (error) throw new Error(error.message)

  const { data: yaEnviadas } = await supabase
    .from('promocion_regla_consulta_envios')
    .select('consulta_id')
    .eq('regla_id', regla.id)

  const omitidas = new Set((yaEnviadas ?? []).map(r => r.consulta_id))
  const ahora = new Date()

  return (consultas ?? [])
    .filter(c =>
      !omitidas.has(c.id)
      && consultaElegiblePostEncuesta(c.fecha, c.hora, horas, ahora),
    )
    .map(c => ({ consulta_id: c.id, paciente_id: c.paciente_id }))
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
  } else if (regla.tipo_disparador === 'post_consulta') {
    const elegibles = await consultasElegiblesPostConsulta(supabase, regla)
    const ids = new Set(elegibles.map(e => e.paciente_id))
    lista = lista.filter(p => ids.has(p.id))
  }

  return lista
}

export async function resolverPacientesReglaPostConsulta(
  supabase: SupabaseClient,
  regla: PromocionRegla,
): Promise<{ pacientes: PacienteAudiencia[]; consultas: { consulta_id: number; paciente_id: number }[] }> {
  const consultas = await consultasElegiblesPostConsulta(supabase, regla)
  if (consultas.length === 0) return { pacientes: [], consultas: [] }

  const ids = [...new Set(consultas.map(c => c.paciente_id))]
  let q = supabase
    .from('pacientes')
    .select('id, codigo, nombre, apellido1, apellido2, celular, telefono, correo, activo')
    .eq('activo', true)
    .in('id', ids)

  if (regla.sucursal_id) q = q.eq('sucursal_id', regla.sucursal_id)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return { pacientes: (data ?? []) as PacienteAudiencia[], consultas }
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
    if (await yaEjecutadaHoy(supabase, regla.id) && regla.tipo_disparador !== 'post_consulta') continue

    try {
      let pacientes: PacienteAudiencia[] = []
      let consultasPost: { consulta_id: number; paciente_id: number }[] = []

      if (regla.tipo_disparador === 'post_consulta') {
        const res = await resolverPacientesReglaPostConsulta(supabase, regla)
        pacientes = res.pacientes
        consultasPost = res.consultas
      } else {
        pacientes = await resolverPacientesRegla(supabase, regla)
      }

      if (pacientes.length === 0) {
        if (regla.tipo_disparador !== 'post_consulta') {
          await supabase.from('promocion_regla_ejecuciones').insert({
            regla_id: regla.id, fecha: hoy, total_destinatarios: 0,
          })
        }
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

      const etiqueta = regla.tipo_disparador === 'cumpleanos'
        ? 'Cumpleaños'
        : regla.tipo_disparador === 'post_consulta'
          ? 'Post consulta'
          : 'Inactivos'

      const forzarAsistido = regla.tipo_disparador === 'post_consulta'
        || esEncuesta(regla.promocion!)
      const modoEnvio = forzarAsistido ? 'asistido' : regla.modo_envio
      const proveedorAuto = modoEnvio === 'automatico'
        ? proveedorAutomaticoPorDefecto()
        : 'asistido'

      const { data: campana, error: errC } = await supabase
        .from('promocion_campanas')
        .insert({
          promocion_id: regla.promocion_id,
          nombre: `Auto — ${etiqueta} — ${regla.nombre}`,
          canal: regla.canal,
          modo_envio: modoEnvio,
          proveedor_envio: proveedorAuto,
          estado: modoEnvio === 'automatico' ? 'en_proceso' : 'lista_envio',
          filtro_audiencia: {
            tipo: 'manual',
            paciente_ids: pacientes.map(p => p.id),
            automatico_regla: regla.tipo_disparador,
            consulta_ids: consultasPost.map(c => c.consulta_id),
          },
          mensaje_personalizado: mensajeBase,
          plantilla_id: regla.plantilla_id ?? null,
          regla_id: regla.id,
          total_destinatarios: filasEnvio.length,
          sucursal_id: regla.sucursal_id,
          iniciada_at: modoEnvio === 'automatico' ? new Date().toISOString() : null,
        })
        .select('id')
        .single()

      if (errC || !campana) throw errC ?? new Error('No se creó campaña automática')

      const inserts = filasEnvio.map(f => ({ ...f, campana_id: campana.id }))
      const { error: errE } = await supabase.from('promocion_envios').insert(inserts)
      if (errE) throw errE

      if (regla.tipo_disparador === 'post_consulta' && consultasPost.length > 0) {
        await supabase.from('promocion_regla_consulta_envios').insert(
          consultasPost.map(c => ({
            regla_id: regla.id,
            consulta_id: c.consulta_id,
            campana_id: campana.id,
          })),
        )
      } else {
        await supabase.from('promocion_regla_ejecuciones').insert({
          regla_id: regla.id,
          campana_id: campana.id,
          fecha: hoy,
          total_destinatarios: filasEnvio.length,
        })
      }

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
