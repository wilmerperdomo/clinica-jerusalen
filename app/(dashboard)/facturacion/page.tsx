import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import FacturacionClient from './facturacion-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Facturación' }

export default async function FacturacionPage() {
  const supabase  = await createClient()
  const { userId, sucursalId, esSuperAdmin, nombre } = await getPerfilSucursal()
  const hoy       = new Date().toISOString().split('T')[0]
  const mesInicio = `${hoy.slice(0,7)}-01`

  const cajeroNombre = nombre

  const [
    { data: facturas },
    { data: sucursales },
    { data: pacientes },
    { data: correlativos },
    { data: auditoria },
  ] = await Promise.all([
    // facturas recientes — filtradas por sucursal si no es admin
    ((!esSuperAdmin && sucursalId)
      ? supabase.from('facturas').select(`id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, descuento_monto, isv_monto, total, estado, motivo_anulacion, cai, rango_inicio, rango_fin, cajero_nombre, medico_nombre, paciente_id, sucursal_id, items, exento_isv, rtn_emisor, fecha_limite_cai`).gte('fecha', mesInicio).eq('sucursal_id', sucursalId).order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(200)
      : supabase.from('facturas').select(`id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, descuento_monto, isv_monto, total, estado, motivo_anulacion, cai, rango_inicio, rango_fin, cajero_nombre, medico_nombre, paciente_id, sucursal_id, items, exento_isv, rtn_emisor, fecha_limite_cai`).gte('fecha', mesInicio).order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(200)),

    // sucursales con datos fiscales completos
    supabase
      .from('sucursales')
      .select(`
        id, nombre, nombre_corto, direccion, telefono, email,
        rtn, cai, fecha_limite, num_min, num_max, numero_inicial,
        lema, tama, letra
      `)
      .order('nombre'),

    // pacientes para autocompletar
    supabase
      .from('pacientes')
      .select('id, nombre, apellido1, apellido2, correo')
      .eq('activo', true)
      .order('nombre')
      .limit(300),

    // correlativos actuales por sucursal
    supabase
      .from('factura_correlativos')
      .select('sucursal_id, ultimo_numero'),

    // historial de auditoría (solo si es super admin)
    esSuperAdmin
      ? supabase
          .from('facturas_auditoria')
          .select('id, factura_id, numero, accion, motivo, usuario_nombre, fecha, datos_antes')
          .order('fecha', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <FacturacionClient
      facturas={facturas || []}
      sucursales={sucursales || []}
      pacientes={pacientes || []}
      correlativos={correlativos || []}
      sucursalDefault={sucursalId}
      cajeroNombre={cajeroNombre}
      hoy={hoy}
      esSuperAdmin={esSuperAdmin}
      userId={userId}
      auditoria={auditoria || []}
    />
  )
}
