import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { PACIENTE_CONSULTA_SELECT } from '@/lib/consultas-utils'
import { buildMembresiasMap } from '@/lib/membresia-utils'
import ConsultasClient from './consultas-client'

export const dynamic = 'force-dynamic'

export default async function ConsultasPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin, sucursalNombre, rol } = await getPerfilSucursal()

  const hoy = new Date().toISOString().split('T')[0]

  const citasQ = supabase
    .from('citas')
    .select(`*, paciente:pacientes(${PACIENTE_CONSULTA_SELECT}), servicio:servicios(id, nombre, tipo, precio)`)
    .eq('fecha', hoy)
    .order('hora')
  if (!esSuperAdmin && sucursalId) citasQ.eq('sucursal_id', sucursalId)

  const consultasQ = supabase
    .from('consultas')
    .select(`*, paciente:pacientes(${PACIENTE_CONSULTA_SELECT}), tipo:consulta_tipo(nombre)`)
    .eq('fecha', hoy)
    .in('estado', ['SIGNOS', 'ATENDIENDO', 'REGISTRO'])
    .order('hora')
  if (!esSuperAdmin && sucursalId) consultasQ.eq('sucursal_id', sucursalId)

  const pagadasQ = supabase
    .from('consultas')
    .select(`*, paciente:pacientes(${PACIENTE_CONSULTA_SELECT}), tipo:consulta_tipo(nombre)`)
    .eq('fecha', hoy)
    .eq('estado', 'FINALIZADO')
    .or('cobrado.eq.true,estado_pago.eq.PAGADO')
    .order('hora')
  if (!esSuperAdmin && sucursalId) pagadasQ.eq('sucursal_id', sucursalId)

  const [
    { data: citasHoy },
    { data: consultasEspera },
    { data: consultasPagadas },
    { data: pacientes },
    { data: productos },
    { data: servicios },
    { data: pruebas },
    { data: sucursales },
    { data: membresiasActivas },
    { data: listasPrecio },
    { data: labValores },
    { data: beneficiosTipos },
  ] = await Promise.all([
    citasQ,
    consultasQ,
    pagadasQ,

    supabase
      .from('pacientes')
      .select(PACIENTE_CONSULTA_SELECT)
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    // medicamentos para autocompletar receta
    supabase
      .from('productos')
      .select('id, codigo, nombre, tipo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    // servicios del catálogo para agregar durante consulta
    supabase
      .from('servicios')
      .select('id, nombre, tipo, precio')
      .eq('activo', true)
      .order('nombre'),

    // catálogo de pruebas de laboratorio
    supabase
      .from('laboratorio_info')
      .select('id, nombre, costo, color, dias')
      .order('nombre'),

    supabase
      .from('sucursales')
      .select('id, nombre')
      .order('nombre'),

    supabase
      .from('membresias')
      .select('paciente_id, tipo_id, fecha_fin, numero_carnet, tipo:membresia_tipos(nombre)')
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy),

    supabase.from('listas_precio').select('id, nombre').eq('activo', true),

    supabase.from('laboratorio_valor').select('id_prueba, id_lista, valor'),

    supabase.from('membresia_beneficios').select('tipo_id, descripcion').eq('activo', true),
  ])

  const beneficiosPorTipo: Record<number, string[]> = {}
  for (const b of beneficiosTipos ?? []) {
    if (!beneficiosPorTipo[b.tipo_id]) beneficiosPorTipo[b.tipo_id] = []
    beneficiosPorTipo[b.tipo_id].push(b.descripcion)
  }

  const membresiasMap = buildMembresiasMap(membresiasActivas ?? [], beneficiosPorTipo)

  const listasMap: Record<number, string> = {}
  for (const l of listasPrecio ?? []) listasMap[l.id] = l.nombre

  const labPreciosLista: Record<number, Record<number, number>> = {}
  for (const v of labValores ?? []) {
    const lista = Number(v.id_lista)
    const prueba = Number(v.id_prueba)
    const valor = Number(v.valor)
    if (!lista || !prueba) continue
    if (!labPreciosLista[lista]) labPreciosLista[lista] = {}
    labPreciosLista[lista][prueba] = valor
  }

  return (
    <ConsultasClient
      citasHoy={citasHoy || []}
      consultasEspera={consultasEspera || []}
      consultasPagadas={consultasPagadas || []}
      pacientes={pacientes || []}
      productos={productos || []}
      servicios={servicios || []}
      pruebas={pruebas || []}
      fechaHoy={hoy}
      sucursalId={sucursalId}
      sucursalNombre={sucursalNombre}
      sucursales={sucursales || []}
      esSuperAdmin={esSuperAdmin}
      rolUsuario={rol}
      membresiasMap={membresiasMap}
      listasMap={listasMap}
      labPreciosLista={labPreciosLista}
    />
  )
}
