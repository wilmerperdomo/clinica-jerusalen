import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { fechaHoyHN } from '@/lib/fecha-hn'
import ComprasClient from './compras-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compras' }

export default async function ComprasPage() {
  const supabase = await createClient()
  const hoy      = fechaHoyHN()
  const mesInicio= `${hoy.slice(0,7)}-01`

  const { userId, sucursalId, esSuperAdmin, nombre } = await getPerfilSucursal()
  const cajeroNombre = nombre

  const comprasQuery = supabase
    .from('compras')
    .select(`id, numero, proveedor_id, proveedor_nombre, sucursal_id, fecha, hora, numero_factura_proveedor, nota, contado, credito, total, estado, tipo_costo, cajero_nombre, compra_detalles(id, producto_id, codigo_producto, nombre_producto, lote, fecha_vencimiento, precio_costo, cantidad, importe)`)
    .gte('fecha', mesInicio)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(200)

  if (!esSuperAdmin && sucursalId) comprasQuery.eq('sucursal_id', sucursalId)

  const [
    { data: compras },
    { data: proveedores },
    { data: productos },
    { data: sucursales },
    { data: cxpPendientes },
  ] = await Promise.all([
    comprasQuery,

    // proveedores activos
    supabase
      .from('proveedores')
      .select('id, nombre, contacto, telefono, email, dias_credito')
      .eq('activo', true)
      .order('nombre'),

    // productos activos con su costo
    supabase
      .from('productos')
      .select('id, codigo, nombre, costo, precio_venta, unidad, categoria, tipo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    // sucursales
    supabase.from('sucursales').select('id, nombre').order('nombre'),

    // CXP pendientes de pago a proveedores
    supabase
      .from('compra_cxp')
      .select('id, compra_id, proveedor_nombre, monto_total, monto_pagado, saldo, estado, fecha')
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('fecha', { ascending: false })
      .limit(50),
  ])

  return (
    <ComprasClient
      compras={compras || []}
      proveedores={proveedores || []}
      productos={productos || []}
      sucursales={sucursales || []}
      cxpPendientes={cxpPendientes || []}
      sucursalDefault={sucursalId}
      cajeroNombre={cajeroNombre}
      hoy={hoy}
    />
  )
}
