import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { PACIENTE_BUSQUEDA_SELECT } from '@/lib/buscar-pacientes'
import { agruparLabPorCobrar, type LabOrdenCobroRow } from '@/lib/lab-cobro-utils'
import CajaClient from './caja-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Caja / Ventas' }

export default async function VentasPage() {
  const supabase = await createClient()
  const perfilAuth = await getPerfilSucursal()
  const { userId: uid, esSuperAdmin, esAdmin, nombre } = perfilAuth
  let sucursalId = perfilAuth.sucursalId
  // dummy user object for compat
  const user = { id: uid }
  const hoy = new Date().toISOString().split('T')[0]


  async function getSucursales() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, direccion, telefono, rtn, cai, num_min, num_max, numero_inicial, fecha_limite, lema, tercera_edad, cuarta_edad, por_descuento_tercera, por_descuento_cuarta')
      .order('nombre')
    if (error) {
      const { data: base } = await supabase
        .from('sucursales')
        .select('id, nombre, tercera_edad')
        .order('nombre')
      return base || []
    }
    return data || []
  }

  const [
    { data: sesionActual },
    { data: conceptos },
    { data: pacientes },
    sucursales,
    { data: cxcPendientes },
    { data: servicios },
    { data: productos },
    { data: pruebasLab },
    consultasResult,
    { data: correlativos },
    { data: membresiaPagosRaw },
  ] = await Promise.all([
    supabase
      .from('caja_sesiones')
      .select('*, movimientos:caja_movimientos(*)')
      .eq('cajero_id', user?.id)
      .eq('fecha', hoy)
      .eq('estado', 'ABIERTA')
      .maybeSingle(),

    supabase
      .from('caja_conceptos')
      .select('*')
      .eq('activo', true)
      .order('tipo')
      .order('nombre'),

    supabase
      .from('pacientes')
      .select(PACIENTE_BUSQUEDA_SELECT)
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    getSucursales(),

    ((!esSuperAdmin && sucursalId)
      ? supabase.from('cxc').select('*').in('estado', ['PENDIENTE','PARCIAL']).eq('sucursal_id', sucursalId).order('fecha', { ascending: false }).limit(50)
      : supabase.from('cxc').select('*').in('estado', ['PENDIENTE','PARCIAL']).order('fecha', { ascending: false }).limit(50)),

    supabase
      .from('servicios')
      .select('id, nombre, tipo, precio')
      .eq('activo', true)
      .order('nombre'),

    supabase
      .from('productos')
      .select('id, codigo, nombre, precio_venta, tipo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    supabase
      .from('laboratorio_info')
      .select('id, nombre, costo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    // Consultas FINALIZADAS pendientes de cobro
    ((!esSuperAdmin && sucursalId)
      ? supabase.from('consultas').select('id, paciente_id, fecha, hora, estado, cobrado').eq('estado', 'FINALIZADO').eq('sucursal_id', sucursalId).or('cobrado.eq.false,cobrado.is.null').order('fecha', { ascending: false }).limit(100)
      : supabase.from('consultas').select('id, paciente_id, fecha, hora, estado, cobrado').eq('estado', 'FINALIZADO').or('cobrado.eq.false,cobrado.is.null').order('fecha', { ascending: false }).limit(100)),

    supabase
      .from('factura_correlativos')
      .select('sucursal_id, ultimo_numero'),

    supabase
      .from('membresia_pagos')
      .select(`
        id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado,
        membresia:membresias(
          numero_carnet, paciente_id, sucursal_id,
          tipo:membresia_tipos(nombre),
          paciente:pacientes(id, codigo, nombre, apellido1, apellido2, telefono, celular, correo)
        )
      `)
      .in('estado', ['pendiente', 'vencido'])
      .order('fecha_vencimiento')
      .limit(100),
  ])

  let consultasPorCobrar = consultasResult.data ?? []
  if (consultasResult.error) {
    const fallback = await supabase
      .from('consultas')
      .select('id, paciente_id, fecha, hora, estado')
      .eq('estado', 'FINALIZADO')
      .order('fecha', { ascending: false })
      .limit(100)
    consultasPorCobrar = (fallback.data ?? []).map(c => ({ ...c, cobrado: false }))
  } else {
    consultasPorCobrar = consultasPorCobrar.filter(
      c => c.cobrado !== true,
    )
  }

  // Órdenes de laboratorio directas (sin consulta) pendientes de cobro
  let labOrdenesPendientes: LabOrdenCobroRow[] = []
  const labBase = supabase
    .from('consulta_analisis')
    .select('id, id_consulta, lab_grupo_id, paciente_id, id_cliente, no_analisis, importe, fecha, hora, estado_lab, pagado, sucursal_id')
    .order('id', { ascending: false })
    .limit(300)

  const { data: labRaw, error: labErr } = await labBase.eq('estado_lab', 'PENDIENTE_COBRO')

  if (!labErr && labRaw) {
    const pacIds = [
      ...new Set(
        labRaw.map(o => o.paciente_id).filter((id): id is number => id != null && id > 0),
      ),
    ]
    const pacMap = new Map<number, LabOrdenCobroRow['paciente']>()
    if (pacIds.length) {
      const { data: pacs } = await supabase
        .from('pacientes')
        .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, rtn_empresa, contacto, fecha_nac, celular, telefono, correo')
        .in('id', pacIds)
      for (const p of pacs ?? []) pacMap.set(Number(p.id), p as LabOrdenCobroRow['paciente'])
    }
    labOrdenesPendientes = labRaw.map(o => ({
      ...o,
      paciente: o.paciente_id ? pacMap.get(Number(o.paciente_id)) : undefined,
    })) as LabOrdenCobroRow[]
  }

  const labGruposPorCobrar = agruparLabPorCobrar(labOrdenesPendientes)

  let membresiaPagosPorCobrar = membresiaPagosRaw ?? []
  if (!esSuperAdmin && sucursalId) {
    membresiaPagosPorCobrar = membresiaPagosPorCobrar.filter(
      p => (p.membresia as { sucursal_id?: number } | null)?.sucursal_id === sucursalId,
    )
  }

  if (!sucursalId && sucursales.length > 0) {
    sucursalId = sucursales[0].id
  }

  const perfil = {
    nombre: nombre.split(' ')[0] ?? '',
    apellido: nombre.split(' ').slice(1).join(' ') ?? '',
    sucursal_id: sucursalId,
  }

  return (
    <CajaClient
      sesionActual={sesionActual}
      conceptos={conceptos || []}
      pacientes={pacientes || []}
      sucursales={sucursales}
      perfil={perfil}
      userId={user?.id || ''}
      esAdmin={esAdmin || esSuperAdmin}
      fechaHoy={hoy}
      cxcPendientes={cxcPendientes || []}
      servicios={servicios || []}
      productos={productos || []}
      pruebasLab={pruebasLab || []}
      consultasPorCobrar={consultasPorCobrar || []}
      labGruposPorCobrar={labGruposPorCobrar}
      membresiaPagosPorCobrar={membresiaPagosPorCobrar}
      correlativos={correlativos || []}
    />
  )
}
