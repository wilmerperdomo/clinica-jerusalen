import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import MembresiasClient from './membresias-client'

export const metadata = { title: 'Planes Médicos' }

export default async function MembresiasPage({
  searchParams,
}: {
  searchParams: Promise<{ renovar?: string }>
}) {
  const params = await searchParams
  const renovarId = params.renovar ? parseInt(params.renovar, 10) || null : null

  const supabase = await createClient()
  const { esSuperAdmin, esAdmin } = await getPerfilSucursal()
  const hoy      = new Date().toISOString().split('T')[0]
  const hace90   = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

  // Marcar cuotas vencidas (estado vencido en BD)
  try {
    await supabase.rpc('fn_actualizar_cuotas_vencidas')
  } catch { /* RPC puede no existir en todos los entornos */ }

  const [
    { data: tipos },
    { data: membresias },
    { data: pacientes },
    { data: sucursales },
    { data: pagos },
    { data: perfil },
    { data: descuentosPlan },
  ] = await Promise.all([
    supabase
      .from('membresia_tipos')
      .select('id, nombre, precio, duracion_dias, descripcion, activo, consulta_gratis, pct_consulta, pct_laboratorio, pct_medicamentos, pct_servicios, max_beneficiarios, membresia_beneficios(id, descripcion, activo)')
      .order('nombre'),

    supabase
      .from('membresias')
      .select(`
        id, paciente_id, tipo_id, fecha_inicio, fecha_fin,
        cuotas_pagadas, estado, comentarios, numero_carnet, sucursal_id, created_at,
        tipo:membresia_tipos(nombre, precio, duracion_dias),
        paciente:pacientes(id, nombre, apellido1, apellido2, telefono, foto_url),
        beneficiarios:membresia_beneficiarios(id, nombre, parentesco, activo, fecha_inicio, fecha_fin),
        sucursal:sucursales(nombre)
      `)
      .order('created_at', { ascending: false })
      .limit(300),

    supabase
      .from('pacientes')
      .select('id, nombre, apellido1, apellido2, telefono, foto_url')
      .eq('activo', true)
      .order('nombre'),

    supabase.from('sucursales').select('id, nombre').order('nombre'),

    supabase
      .from('membresia_pagos')
      .select(`
        id, membresia_id, numero_cuota, fecha_vencimiento, monto,
        estado, fecha_pago, forma_pago, cajero_nombre, notas,
        membresia:membresias(
          numero_carnet, tipo_id, paciente_id,
          tipo:membresia_tipos(nombre),
          paciente:pacientes(nombre, apellido1, telefono, foto_url)
        )
      `)
      .gte('fecha_vencimiento', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
      .lte('fecha_vencimiento', new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0])
      .order('fecha_vencimiento'),

    supabase.from('perfiles').select('sucursal_id, nombre, apellido1').single(),

    supabase
      .from('caja_movimientos')
      .select('id, fecha, paciente_id, paciente_nombre, concepto, descuento_monto, descuento_motivo, monto')
      .gt('descuento_monto', 0)
      .or('descuento_motivo.eq.Plan médico,descuento_motivo.eq.Consulta gratis')
      .gte('fecha', hace90)
      .order('fecha', { ascending: false })
      .limit(500),
  ])

  return (
    <MembresiasClient
      tipos={tipos || []}
      membresias={membresias || []}
      pacientes={pacientes || []}
      sucursales={sucursales || []}
      pagos={pagos || []}
      sucursalDefault={perfil?.sucursal_id || null}
      hoy={hoy}
      esSuperAdmin={esSuperAdmin}
      esAdmin={esAdmin || esSuperAdmin}
      renovarIdInicial={renovarId}
      descuentosPlan={descuentosPlan ?? []}
    />
  )
}
