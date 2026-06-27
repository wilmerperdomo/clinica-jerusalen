import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { esRolEnfermeria, esRolMedico } from '@/lib/consultas-utils'
import { redirect } from 'next/navigation'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reportes' }

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string; tab?: string }>
}) {
  const supabase  = await createClient()
  const { sucursalId: sucursalUsuario, esSuperAdmin, rol } = await getPerfilSucursal()
  if (!esSuperAdmin && (esRolEnfermeria(rol) || esRolMedico(rol))) redirect('/')
  const params    = await searchParams
  const hoy       = new Date().toISOString().split('T')[0]
  const desde     = params.desde    || hoy
  const hasta     = params.hasta    || hoy
  // No-admin users are forced to their own sucursal
  const sucursalId = !esSuperAdmin && sucursalUsuario
    ? String(sucursalUsuario)
    : (params.sucursal || '')
  const tabActivo  = params.tab || 'resumen'

  // ── Movimientos de caja en el período ──────────────────
  let cajaMov = supabase
    .from('caja_movimientos')
    .select('tipo, concepto, forma_pago, monto, monto_bruto, descuento_monto, descuento_motivo, paciente_nombre, fecha, hora, anulado, sucursal_id')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .eq('anulado', false)
    .order('fecha')
    .order('hora')

  if (sucursalId) cajaMov = cajaMov.eq('sucursal_id', Number(sucursalId))

  // ── Sesiones de caja en el período ──────────────────────
  let cajaSes = supabase
    .from('caja_sesiones')
    .select('id, fecha, cajero_nombre, monto_inicial, total_ingresos, total_egresos, estado, hora_apertura, hora_cierre, sucursal_id, sucursal:sucursales(nombre)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })

  if (sucursalId) cajaSes = cajaSes.eq('sucursal_id', Number(sucursalId))

  // ── Consultas en el período ──────────────────────────────
  let consultas = supabase
    .from('citas')
    .select('id, estado, tipo_consulta, fecha, hora, paciente:pacientes(nombre, apellido1)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')

  if (sucursalId) consultas = consultas.eq('sucursal_id', Number(sucursalId))

  // ── Órdenes de laboratorio en el período ────────────────
  let labOrdenes = supabase
    .from('consulta_analisis')
    .select('id, estado, pagado, entregado, fecha_orden, paciente:pacientes(nombre, apellido1), analisis:laboratorio_info(nombre, costo)')
    .gte('fecha_orden', desde)
    .lte('fecha_orden', hasta)

  // ── Movimientos de inventario (salidas/ventas/consumos) ─
  let invMovs = supabase
    .from('inventario_movimientos')
    .select('producto_id, cantidad, tipo, fecha, sucursal_id, producto:productos(id, nombre, codigo, categoria, unidad, precio_venta, costo)')
    .in('tipo', ['SALIDA', 'VENTA', 'CONSUMO'])
    .gte('fecha', desde)
    .lte('fecha', hasta)

  if (sucursalId) invMovs = invMovs.eq('sucursal_id', Number(sucursalId))

  // ── CXC pendientes ──────────────────────────────────────
  const cxcQuery = supabase
    .from('cxc')
    .select('id, paciente_nombre, concepto, monto_total, monto_pagado, saldo, estado, fecha')
    .in('estado', ['PENDIENTE', 'PARCIAL'])
    .order('fecha', { ascending: false })
    .limit(100)

  // ── Nuevos pacientes en el período ──────────────────────
  let pacientes = supabase
    .from('pacientes')
    .select('id, nombre, apellido1, fecha_nacimiento, sexo, created_at')
    .gte('created_at', `${desde}T00:00:00`)
    .lte('created_at', `${hasta}T23:59:59`)
    .order('created_at', { ascending: false })

  // ── Facturas fiscales en el período ─────────────────────
  let facturasQ = supabase
    .from('facturas')
    .select('id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, descuento_monto, isv_monto, total, estado, motivo_anulacion, cai, cajero_nombre, sucursal_id, exento_isv')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('hora')

  if (sucursalId) facturasQ = facturasQ.eq('sucursal_id', Number(sucursalId))

  // ── Compras en el período ───────────────────────────────
  let comprasQ = supabase
    .from('compras')
    .select('id, numero, proveedor_nombre, fecha, hora, contado, credito, total, estado, tipo_costo, cajero_nombre, sucursal_id')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })

  if (sucursalId) comprasQ = comprasQ.eq('sucursal_id', Number(sucursalId))

  // ── CXP generadas en el período ─────────────────────────
  let cxpQ = supabase
    .from('compra_cxp')
    .select('id, compra_id, proveedor_nombre, fecha, fecha_vencimiento, monto_total, monto_pagado, saldo, estado, numero_compra, sucursal_id')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })

  if (sucursalId) cxpQ = cxpQ.eq('sucursal_id', Number(sucursalId))

  // ── Abonos CXP en el período ────────────────────────────
  let abonosQ = supabase
    .from('compra_cxp_abonos')
    .select('id, cxp_id, proveedor_nombre, monto, forma_pago, nota, cajero_nombre, fecha, hora, sucursal_id')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })

  if (sucursalId) abonosQ = abonosQ.eq('sucursal_id', Number(sucursalId))

  // ── Sucursales ──────────────────────────────────────────
  const sucursalesQ = supabase
    .from('sucursales')
    .select('id, nombre')
    .order('nombre')

  const [
    { data: movimientos },
    { data: sesiones },
    { data: citasDia },
    { data: labData },
    { data: cxc },
    { data: nuevosPacientes },
    { data: sucursales },
    { data: invMovimientos },
    { data: facturas },
    { data: compras },
    { data: cxpLista },
    { data: cxpAbonos },
  ] = await Promise.all([
    cajaMov, cajaSes, consultas, labOrdenes, cxcQuery, pacientes, sucursalesQ, invMovs,
    facturasQ, comprasQ, cxpQ, abonosQ,
  ])

  return (
    <ReportesClient
      movimientos={movimientos || []}
      sesiones={sesiones || []}
      citas={citasDia || []}
      labOrdenes={labData || []}
      cxc={cxc || []}
      nuevosPacientes={nuevosPacientes || []}
      sucursales={sucursales || []}
      invMovimientos={invMovimientos || []}
      facturas={facturas || []}
      compras={compras || []}
      cxpLista={cxpLista || []}
      cxpAbonos={cxpAbonos || []}
      desde={desde}
      hasta={hasta}
      sucursalFiltro={sucursalId}
      tabInicial={tabActivo}
    />
  )
}
