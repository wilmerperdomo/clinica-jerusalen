import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import MembresiasClient from './membresias-client'

export const metadata = { title: 'Planes Médicos' }

export default async function MembresiasPage() {
  const supabase = await createClient()
  const { esSuperAdmin, esAdmin } = await getPerfilSucursal()
  const hoy      = new Date().toISOString().split('T')[0]

  const [
    { data: tipos },
    { data: membresias },
    { data: pacientes },
    { data: sucursales },
    { data: pagos },
    { data: perfil },
  ] = await Promise.all([
    // planes disponibles con beneficios
    supabase
      .from('membresia_tipos')
      .select('id, nombre, precio, duracion_dias, descripcion, activo, consulta_gratis, pct_consulta, pct_laboratorio, pct_medicamentos, pct_servicios, membresia_beneficios(id, descripcion, activo)')
      .order('nombre'),

    // membresías con todo el detalle
    supabase
      .from('membresias')
      .select(`
        id, paciente_id, tipo_id, fecha_inicio, fecha_fin,
        cuotas_pagadas, estado, comentarios, numero_carnet, sucursal_id, created_at,
        tipo:membresia_tipos(nombre, precio, duracion_dias),
        paciente:pacientes(id, nombre, apellido1, apellido2, telefono, foto_url),
        beneficiarios:membresia_beneficiarios(id, nombre, parentesco, activo),
        sucursal:sucursales(nombre)
      `)
      .order('created_at', { ascending: false })
      .limit(300),

    // pacientes activos
    supabase
      .from('pacientes')
      .select('id, nombre, apellido1, apellido2, telefono, foto_url')
      .eq('activo', true)
      .order('nombre'),

    // sucursales
    supabase.from('sucursales').select('id, nombre').order('nombre'),

    // pagos / cuotas de los últimos 90 días y próximos 60
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
    />
  )
}
