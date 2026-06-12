import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'

export type AlertaTipo = 'danger' | 'warning' | 'info'

export interface Alerta {
  id:        string
  tipo:      AlertaTipo
  categoria: string
  titulo:    string
  mensaje:   string
  href:      string
  fecha?:    string
}

function fmt(n: number) {
  return `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

export async function getAlertas(): Promise<Alerta[]> {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin } = await getPerfilSucursal()

  const hoy     = new Date().toISOString().split('T')[0]
  const manana  = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const en7dias = new Date(Date.now() + 7  * 86400000).toISOString().split('T')[0]
  const en30dias= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const filtroSuc = <T extends { eq: (col: string, val: number) => T }>(q: T) =>
    !esSuperAdmin && sucursalId ? q.eq('sucursal_id', sucursalId) : q

  const [
    { data: inventario },
    { data: citasHoy },
    { data: citasManana },
    { data: citasHoyProximas },
    { data: cxcLista },
    { data: planesVencer },
    { data: cuotasVencidas },
    { data: labPendientes },
    { data: cxpVencidas },
    { data: consultasCobrar },
  ] = await Promise.all([
    filtroSuc(supabase
      .from('inventario')
      .select('id, cantidad, fecha_vencimiento, sucursal_id, producto:productos(nombre, stock_minimo, tipo)')
      .gt('cantidad', 0)),

    filtroSuc(supabase
      .from('citas')
      .select('id, hora, estado, recordatorio_estado, paciente:pacientes(nombre, apellido1, celular)')
      .eq('fecha', hoy)
      .eq('estado', 'ACTIVO')
      .order('hora')),

    filtroSuc(supabase
      .from('citas')
      .select('id, hora, fecha, recordatorio_estado, paciente:pacientes(nombre, apellido1, celular)')
      .eq('fecha', manana)
      .eq('estado', 'ACTIVO')
      .order('hora')),

    filtroSuc(supabase
      .from('citas')
      .select('id, hora, recordatorio_estado, paciente:pacientes(nombre, apellido1, celular)')
      .eq('fecha', hoy)
      .eq('estado', 'ACTIVO')
      .order('hora')),

    filtroSuc(supabase
      .from('cxc')
      .select('id, paciente_nombre, saldo, estado, fecha')
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('fecha')),

    supabase
      .from('membresias')
      .select('id, fecha_fin, paciente:pacientes(nombre, apellido1)')
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy)
      .lte('fecha_fin', en7dias)
      .order('fecha_fin')
      .limit(10),

    supabase
      .from('membresia_pagos')
      .select('id, fecha_vencimiento, monto, membresia:membresias(paciente:pacientes(nombre, apellido1))')
      .in('estado', ['vencido', 'pendiente'])
      .lte('fecha_vencimiento', hoy)
      .limit(15),

    supabase
      .from('consulta_analisis')
      .select('id, no_analisis, fecha, pagado, entregado')
      .eq('fecha', hoy)
      .eq('pagado', true)
      .eq('entregado', false)
      .limit(20),

    // CXP vencidas (tabla puede no existir aún)
    (async () => {
      try {
        let q = supabase
          .from('compra_cxp')
          .select('id, proveedor_nombre, saldo, fecha_vencimiento')
          .in('estado', ['PENDIENTE', 'PARCIAL'])
          .lt('fecha_vencimiento', hoy)
        if (!esSuperAdmin && sucursalId) q = q.eq('sucursal_id', sucursalId)
        return await q.limit(10)
      } catch { return { data: [] } }
    })(),

    filtroSuc(supabase
      .from('consultas')
      .select('id, fecha, paciente:pacientes(nombre, apellido1)')
      .eq('estado', 'FINALIZADO')
      .eq('fecha', hoy)
      .limit(20)),
  ])

  const alertas: Alerta[] = []

  // ── Stock bajo ───────────────────────────────────────────────
  for (const inv of inventario ?? []) {
    const prod = inv.producto as { nombre: string; stock_minimo?: number; tipo?: string } | null
    const min  = prod?.stock_minimo ?? 0
    if (min > 0 && inv.cantidad <= min) {
      alertas.push({
        id: `stock-${inv.id}`,
        tipo: inv.cantidad === 0 ? 'danger' : 'warning',
        categoria: 'Inventario',
        titulo: 'Stock bajo',
        mensaje: `${prod?.nombre ?? 'Producto'}: ${inv.cantidad} unidades (mín. ${min})`,
        href: '/inventario',
      })
    }
  }

  // ── Medicamentos por vencer (30 días) ────────────────────────
  for (const inv of inventario ?? []) {
    if (!inv.fecha_vencimiento || inv.fecha_vencimiento > en30dias) continue
    const prod = inv.producto as { nombre: string; tipo?: string } | null
    const dias = Math.ceil((new Date(inv.fecha_vencimiento).getTime() - Date.now()) / 86400000)
    alertas.push({
      id: `vence-${inv.id}`,
      tipo: dias <= 7 ? 'danger' : 'warning',
      categoria: 'Inventario',
      titulo: dias <= 0 ? 'Medicamento vencido' : 'Por vencer',
      mensaje: `${prod?.nombre ?? 'Producto'} vence ${inv.fecha_vencimiento} (${inv.cantidad} uds.)`,
      href: '/inventario',
      fecha: inv.fecha_vencimiento,
    })
  }

  // ── Recordatorios: llamar / WhatsApp a pacientes ───────────────
  const sinConfirmarManana = (citasManana ?? []).filter(c =>
    !c.recordatorio_estado || c.recordatorio_estado === 'pendiente' || c.recordatorio_estado === 'no_contacto'
  )
  if (sinConfirmarManana.length > 0) {
    alertas.push({
      id: 'citas-recordar-manana',
      tipo: 'warning',
      categoria: 'Agenda',
      titulo: `Llamar pacientes — citas de mañana`,
      mensaje: `${sinConfirmarManana.length} cita(s) sin confirmar. Contacte hoy por teléfono o WhatsApp.`,
      href: '/agenda',
      fecha: manana,
    })
    for (const c of sinConfirmarManana.slice(0, 5)) {
      const pac = c.paciente as { nombre: string; apellido1: string; celular?: string } | null
      alertas.push({
        id: `cita-rec-${c.id}`,
        tipo: 'warning',
        categoria: 'Agenda',
        titulo: 'Confirmar cita mañana',
        mensaje: `${pac?.nombre ?? ''} ${pac?.apellido1 ?? ''} — ${String(c.hora).slice(0, 5)}${pac?.celular ? ` · ${pac.celular}` : ''}`,
        href: '/agenda',
        fecha: manana,
      })
    }
  }

  // Citas de hoy próximas sin confirmar (próximas 3 horas)
  const ahora = new Date()
  const minsDesdeMedianoche = ahora.getHours() * 60 + ahora.getMinutes()
  for (const c of citasHoyProximas ?? []) {
    const [h, m] = String(c.hora).slice(0, 5).split(':').map(Number)
    const minsCita = h * 60 + (m || 0)
    const diff = minsCita - minsDesdeMedianoche
    if (diff < 0 || diff > 180) continue
    if (c.recordatorio_estado === 'confirmado') continue
    const pac = c.paciente as { nombre: string; apellido1: string; celular?: string } | null
    alertas.push({
      id: `cita-hoy-${c.id}`,
      tipo: diff <= 60 ? 'danger' : 'warning',
      categoria: 'Agenda',
      titulo: diff <= 60 ? 'Cita en menos de 1 hora' : 'Cita hoy sin confirmar',
      mensaje: `${pac?.nombre ?? ''} ${pac?.apellido1 ?? ''} — ${String(c.hora).slice(0, 5)}. ${c.recordatorio_estado === 'pendiente' ? '¡Llamar ahora!' : 'Verificar asistencia.'}`,
      href: '/agenda',
      fecha: hoy,
    })
  }

  // ── CXC pendientes ───────────────────────────────────────────
  const totalCxc = (cxcLista ?? []).reduce((s, c) => s + (c.saldo ?? 0), 0)
  if (totalCxc > 0) {
    alertas.push({
      id: 'cxc-total',
      tipo: 'warning',
      categoria: 'Caja',
      titulo: 'Cuentas por cobrar',
      mensaje: `${cxcLista!.length} cuenta(s) pendiente(s) por ${fmt(totalCxc)}`,
      href: '/ventas',
    })
  }
  // CXC antiguas (>30 días)
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  for (const c of (cxcLista ?? []).filter(c => c.fecha && c.fecha < hace30)) {
    alertas.push({
      id: `cxc-ant-${c.id}`,
      tipo: 'danger',
      categoria: 'Caja',
      titulo: 'CXC vencida',
      mensaje: `${c.paciente_nombre ?? 'Paciente'} debe ${fmt(c.saldo)} desde ${c.fecha}`,
      href: '/ventas',
      fecha: c.fecha,
    })
  }

  // ── Consultas por cobrar hoy ─────────────────────────────────
  if ((consultasCobrar ?? []).length > 0) {
    alertas.push({
      id: 'consultas-cobrar',
      tipo: 'info',
      categoria: 'Caja',
      titulo: 'Consultas por cobrar',
      mensaje: `${consultasCobrar!.length} consulta(s) finalizada(s) esperando cobro`,
      href: '/ventas',
      fecha: hoy,
    })
  }

  // ── Planes médicos por vencer ────────────────────────────────
  for (const p of planesVencer ?? []) {
    const pac = p.paciente as { nombre: string; apellido1: string } | null
    alertas.push({
      id: `plan-${p.id}`,
      tipo: 'warning',
      categoria: 'Planes Médicos',
      titulo: 'Plan por vencer',
      mensaje: `${pac?.nombre ?? ''} ${pac?.apellido1 ?? ''} — vence ${p.fecha_fin}`,
      href: '/membresias',
      fecha: p.fecha_fin,
    })
  }

  // ── Cuotas vencidas ──────────────────────────────────────────
  for (const cu of cuotasVencidas ?? []) {
    const mem = cu.membresia as { paciente: { nombre: string; apellido1: string } } | null
    const pac = mem?.paciente
    alertas.push({
      id: `cuota-${cu.id}`,
      tipo: 'danger',
      categoria: 'Planes Médicos',
      titulo: 'Cuota vencida',
      mensaje: `${pac?.nombre ?? ''} ${pac?.apellido1 ?? ''} — ${fmt(cu.monto)} venció ${cu.fecha_vencimiento}`,
      href: '/membresias',
      fecha: cu.fecha_vencimiento,
    })
  }

  // ── Lab pendiente de entrega ─────────────────────────────────
  if ((labPendientes ?? []).length > 0) {
    alertas.push({
      id: 'lab-pendientes',
      tipo: 'info',
      categoria: 'Laboratorio',
      titulo: 'Resultados pendientes',
      mensaje: `${labPendientes!.length} orden(es) de lab pagadas sin entregar`,
      href: '/laboratorio',
      fecha: hoy,
    })
  }

  // ── CXP vencidas ─────────────────────────────────────────────
  for (const cx of cxpVencidas ?? []) {
    alertas.push({
      id: `cxp-${cx.id}`,
      tipo: 'danger',
      categoria: 'Cuentas por Pagar',
      titulo: 'Deuda vencida a proveedor',
      mensaje: `${cx.proveedor_nombre} — saldo ${fmt(cx.saldo)} (venció ${cx.fecha_vencimiento})`,
      href: '/cxp',
      fecha: cx.fecha_vencimiento,
    })
  }

  // Ordenar: danger primero, luego warning, luego info
  const orden: Record<AlertaTipo, number> = { danger: 0, warning: 1, info: 2 }
  return alertas.sort((a, b) => orden[a.tipo] - orden[b.tipo])
}
