import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import CxpClient from './cxp-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cuentas por Pagar' }

export default async function CxpPage() {
  const supabase = await createClient()
  const { userId, sucursalId, esSuperAdmin, nombre } = await getPerfilSucursal()
  const hoy = new Date().toISOString().split('T')[0]

  const cxpQuery = supabase
    .from('compra_cxp')
    .select('id, compra_id, proveedor_id, proveedor_nombre, fecha, fecha_vencimiento, monto_total, monto_pagado, saldo, estado, notas, sucursal_id, numero_compra')
    .order('fecha', { ascending: false })
    .limit(300)

  if (!esSuperAdmin && sucursalId) cxpQuery.eq('sucursal_id', sucursalId)

  const abonosQuery = supabase
    .from('compra_cxp_abonos')
    .select('id, cxp_id, compra_id, proveedor_nombre, monto, forma_pago, nota, cajero_nombre, fecha, hora, sucursal_id')
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(200)

  if (!esSuperAdmin && sucursalId) abonosQuery.eq('sucursal_id', sucursalId)

  const [
    { data: cxpLista },
    { data: abonos },
    { data: proveedores },
    { data: sucursales },
    { data: sesionActual },
  ] = await Promise.all([
    cxpQuery,
    abonosQuery,
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase
      .from('caja_sesiones')
      .select('id, estado')
      .eq('cajero_id', userId)
      .eq('fecha', hoy)
      .eq('estado', 'ABIERTA')
      .maybeSingle(),
  ])

  return (
    <CxpClient
      cxpLista={cxpLista || []}
      abonos={abonos || []}
      proveedores={proveedores || []}
      sucursales={sucursales || []}
      sucursalDefault={sucursalId}
      cajeroNombre={nombre}
      userId={userId}
      sesionAbierta={sesionActual?.id ?? null}
      hoy={hoy}
    />
  )
}
