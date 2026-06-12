import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { PACIENTE_BUSQUEDA_SELECT } from '@/lib/buscar-pacientes'
import LaboratorioClient from './laboratorio-client'

export const dynamic = 'force-dynamic'

export default async function LaboratorioPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin } = await getPerfilSucursal()
  const hoy = new Date().toISOString().split('T')[0]

  const hace7 = new Date()
  hace7.setDate(hace7.getDate() - 7)
  const desde = hace7.toISOString().split('T')[0]

  const ordenesQuery = supabase
    .from('consulta_analisis')
    .select('*, resultados:lab_resultados(*)')
    .gte('fecha', desde)
    .order('id', { ascending: false })

  if (!esSuperAdmin && sucursalId) ordenesQuery.eq('sucursal_id', sucursalId)

  const { data: ordenes } = await ordenesQuery

  const pacienteIds = [
    ...new Set(
      (ordenes ?? [])
        .map(o => {
          if (o.paciente_id) return Number(o.paciente_id)
          const c = String(o.id_cliente ?? '').replace(/\D/g, '')
          return c ? Number(c) : null
        })
        .filter((id): id is number => id != null && !Number.isNaN(id) && id > 0),
    ),
  ]

  const [
    pacientesRes,
    pruebasRes,
    rangosRes,
    panelRes,
    insumosRes,
    labValoresRes,
    productosRes,
  ] = await Promise.all([
    pacienteIds.length
      ? supabase.from('pacientes').select(PACIENTE_BUSQUEDA_SELECT).in('id', pacienteIds)
      : Promise.resolve({ data: [] as never[], error: null }),

    supabase.from('laboratorio_info').select('*').order('nombre'),

    supabase.from('lab_rangos').select('*'),
    supabase.from('lab_panel_campos').select('*').eq('activo', true).order('orden'),
    supabase.from('laboratorio_insumo').select('id, prueba_id, producto_id, cantidad, producto:productos(id, nombre, codigo)'),
    supabase.from('laboratorio_valor').select('id_prueba, id_lista, valor'),
    supabase
      .from('productos')
      .select('id, nombre, codigo')
      .eq('activo', true)
      .order('nombre')
      .limit(300),
  ])

  const pacientesOrdenes = pacientesRes.error ? [] : (pacientesRes.data ?? [])
  const pruebas = pruebasRes.error ? [] : (pruebasRes.data ?? [])
  const rangos = rangosRes.error ? [] : (rangosRes.data ?? [])
  const panelCampos = panelRes.error ? [] : (panelRes.data ?? [])
  const insumos = insumosRes.error ? [] : (insumosRes.data ?? [])
  const labValores = labValoresRes.error ? [] : (labValoresRes.data ?? [])
  const productos = productosRes.error ? [] : (productosRes.data ?? [])

  const preciosLista: Record<number, Record<number, number>> = {}
  for (const v of labValores ?? []) {
    const lista = Number(v.id_lista)
    const prueba = Number(v.id_prueba)
    const valor = Number(v.valor)
    if (!lista || !prueba) continue
    if (!preciosLista[lista]) preciosLista[lista] = {}
    preciosLista[lista][prueba] = valor
  }

  return (
    <LaboratorioClient
      ordenes={ordenes || []}
      pruebas={pruebas || []}
      pacientes={pacientesOrdenes || []}
      fechaHoy={hoy}
      rangos={rangos || []}
      panelCampos={panelCampos || []}
      insumos={insumos || []}
      preciosLista={preciosLista}
      productos={productos || []}
      sucursalId={sucursalId ?? undefined}
    />
  )
}
