import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal, rolesTienenPermisoAccion } from '@/lib/get-sucursal'
import {
  PACIENTE_CONSULTA_SELECT,
  esRolMedico,
  filtroSucursalColaConsultas,
  puedeAtenderConsulta,
} from '@/lib/consultas-utils'
import { buildMembresiasMap } from '@/lib/membresia-utils'
import { UMBRAL_CUOTAS_MORA } from '@/lib/membresia-mora'
import ConsultasClient from './consultas-client'

export const dynamic = 'force-dynamic'

export default async function ConsultasPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string; nuevo?: string }>
}) {
  const params = await searchParams
  const pacientePrecarga = params.paciente ? parseInt(params.paciente, 10) || null : null
  const abrirNuevaConsulta = params.nuevo === '1'

  const supabase = await createClient()
  const { userId, sucursalId, esSuperAdmin, esAdmin, sucursalNombre, rol, rolId } =
    await getPerfilSucursal()

  const { data: rolesCatalogo } = await supabase.from('roles').select('id, nombre')
  const rolIdsMedico = (rolesCatalogo ?? [])
    .filter(r => esRolMedico(r.nombre as string))
    .map(r => Number(r.id))

  const rolesUsuario: string[] = rol ? [rol] : []
  const rolIdsUsuario: number[] = rolId != null ? [rolId] : []
  if (userId) {
    const { data: perfilRoles } = await supabase
      .from('perfil_roles')
      .select('rol_id, roles(nombre)')
      .eq('perfil_id', userId)
    for (const pr of perfilRoles ?? []) {
      const nombre = (pr.roles as { nombre?: string } | null)?.nombre
      if (nombre && !rolesUsuario.includes(nombre)) rolesUsuario.push(nombre)
      if (pr.rol_id != null && !rolIdsUsuario.includes(Number(pr.rol_id))) {
        rolIdsUsuario.push(Number(pr.rol_id))
      }
    }
  }

  const puedeAtender =
    esSuperAdmin ||
    esAdmin ||
    rolesUsuario.some(nombre =>
      puedeAtenderConsulta(nombre, { rolIdsMedico }),
    ) ||
    rolIdsUsuario.some(id => rolIdsMedico.includes(id))

  // Crear "Nueva Consulta" es configurable por rol desde Configuración → Permisos.
  // Admin / Super Admin siempre pueden.
  const puedeCrearConsulta =
    esSuperAdmin ||
    esAdmin ||
    (await rolesTienenPermisoAccion(rolIdsUsuario, 'consultas', 'crear'))

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
  if (!esSuperAdmin && sucursalId) {
    filtroSucursalColaConsultas(consultasQ, sucursalId, puedeAtender)
  }

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
      .select('id, paciente_id, tipo_id, fecha_fin, numero_carnet, tipo:membresia_tipos(nombre)')
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

  const { data: cuotasMorosas } = await supabase
    .from('membresia_pagos')
    .select('membresia_id')
    .in('estado', ['pendiente', 'vencido'])
    .lt('fecha_vencimiento', hoy)
  const moraPorMem = new Map<number, number>()
  for (const c of cuotasMorosas ?? []) {
    moraPorMem.set(c.membresia_id, (moraPorMem.get(c.membresia_id) ?? 0) + 1)
  }
  const activasSinMora = (membresiasActivas ?? []).filter(m => {
    const id = (m as { id?: number }).id
    if (!id) return true
    return (moraPorMem.get(id) ?? 0) < UMBRAL_CUOTAS_MORA
  })

  const membresiasMap = buildMembresiasMap(activasSinMora, beneficiosPorTipo)

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
      esAdmin={esAdmin}
      rolUsuario={rol}
      rolId={rolId}
      rolIdsMedico={rolIdsMedico}
      puedeAtenderConsulta={puedeAtender}
      puedeCrearConsulta={puedeCrearConsulta}
      rolesUsuario={rolesUsuario}
      membresiasMap={membresiasMap}
      listasMap={listasMap}
      labPreciosLista={labPreciosLista}
      pacientePrecarga={pacientePrecarga}
      abrirNuevaConsulta={abrirNuevaConsulta}
    />
  )
}
