import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import CotizacionesClient from './cotizaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cotizaciones' }

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const { userId, sucursalId, esSuperAdmin, nombre } = await getPerfilSucursal()
  const hoy        = new Date().toISOString().split('T')[0]
  const mesInicio  = `${hoy.slice(0, 7)}-01`

  const cotQuery = supabase
    .from('cotizaciones')
    .select(`
      id, numero, fecha, hora, cliente_nombre, cliente_rtn, cliente_email,
      subtotal, por_descuento, descuento_monto, isv_monto, total,
      estado, nota, validez_dias, fecha_vencimiento, factura_id,
      paciente_id, consulta_id, sucursal_id, items, exento_isv, cajero_nombre
    `)
    .gte('fecha', mesInicio)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(300)

  if (!esSuperAdmin && sucursalId) cotQuery.eq('sucursal_id', sucursalId)

  const [
    { data: cotizaciones },
    { data: sucursales },
    { data: pacientes },
    { data: productos },
    { data: servicios },
    { data: pruebasLab },
    { data: cotCorrs },
    { data: factCorrs },
  ] = await Promise.all([
    cotQuery,
    supabase
      .from('sucursales')
      .select('id, nombre, nombre_corto, direccion, telefono, email, rtn, cai, fecha_limite, num_min, num_max, numero_inicial, lema')
      .order('nombre'),
    supabase
      .from('pacientes')
      .select('id, nombre, apellido1, apellido2, correo')
      .eq('activo', true)
      .order('nombre')
      .limit(300),
    supabase
      .from('productos')
      .select('id, codigo, nombre, precio_venta, unidad, categoria, tipo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),
    supabase
      .from('servicios')
      .select('id, nombre, tipo, precio, descripcion')
      .eq('activo', true)
      .order('nombre')
      .limit(300),
    supabase
      .from('laboratorio_info')
      .select('id, nombre, costo, comision, activo')
      .eq('activo', true)
      .order('nombre')
      .limit(500),
    supabase.from('cotizacion_correlativos').select('sucursal_id, ultimo_numero'),
    supabase.from('factura_correlativos').select('sucursal_id, ultimo_numero'),
  ])

  return (
    <CotizacionesClient
      cotizaciones={cotizaciones || []}
      sucursales={sucursales || []}
      pacientes={pacientes || []}
      productos={productos || []}
      servicios={servicios || []}
      pruebasLab={pruebasLab || []}
      cotCorrelativos={cotCorrs || []}
      factCorrelativos={factCorrs || []}
      sucursalDefault={sucursalId}
      cajeroNombre={nombre}
      hoy={hoy}
      userId={userId}
    />
  )
}
