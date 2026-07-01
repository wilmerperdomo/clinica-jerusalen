import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { fechaHoyHN, fechaSumarDias } from '@/lib/fecha-hn'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import {
  Users, CalendarCheck, Receipt, TrendingUp, Stethoscope,
  FlaskConical, Package, ArrowRight, Activity, CreditCard,
  AlertTriangle, Clock, CheckCircle, XCircle, Wallet,
  BarChart3, Settings, DollarSign, ShoppingBag,
} from 'lucide-react'

export const metadata = { title: 'Inicio — Clínica Jerusalén' }

const fmt = (n: number) =>
  `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const KPI_ICON_COLORS: Record<string, string> = {
  green:  'bg-green-100 text-green-600',
  blue:   'bg-blue-100 text-blue-600',
  red:    'bg-red-100 text-red-600',
  purple: 'bg-purple-100 text-purple-600',
  teal:   'bg-teal-100 text-teal-600',
  amber:  'bg-amber-100 text-amber-600',
  orange: 'bg-orange-100 text-orange-600',
}

function saludo() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-HN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

/* estado badge cita */
function citaBadge(estado: string) {
  switch (estado) {
    case 'pendiente':   return { label: 'Pendiente',   cls: 'bg-amber-100 text-amber-700' }
    case 'en_proceso':  return { label: 'En consulta', cls: 'bg-blue-100 text-blue-700'   }
    case 'atendido':    return { label: 'Atendido',    cls: 'bg-green-100 text-green-700' }
    case 'no_asistio':  return { label: 'No asistió',  cls: 'bg-red-100 text-red-700'     }
    default:            return { label: estado,         cls: 'bg-gray-100 text-gray-600'   }
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const hoy      = fechaHoyHN()
  const mesInicio= `${hoy.slice(0, 7)}-01`

  const perfilAuth = await getPerfilSucursal()
  const nombre     = perfilAuth.nombre || 'Usuario'
  const nombreSucursal = perfilAuth.sucursalNombre
  const [
    { data: citasHoy },
    { data: cajaMov },
    { data: cajaMovMes },
    { data: pacientesMes },
    { data: labPendientes },
    { data: cxcPendientes },
    { data: stockAlertas },
    { data: planesPorVencer },
    { data: cuotasVencidas },
    { data: ultimosMov },
  ] = await Promise.all([
    // citas de hoy
    supabase.from('citas')
      .select('id, hora, estado, tipo_consulta, paciente:pacientes(nombre, apellido1)')
      .eq('fecha', hoy)
      .order('hora'),

    // movimientos de caja hoy
    supabase.from('caja_movimientos')
      .select('tipo, monto, concepto, forma_pago, hora, paciente_nombre')
      .eq('fecha', hoy)
      .eq('anulado', false)
      .order('hora', { ascending: false }),

    // movimientos del mes para total
    supabase.from('caja_movimientos')
      .select('tipo, monto')
      .gte('fecha', mesInicio)
      .lte('fecha', hoy)
      .eq('anulado', false),

    // pacientes nuevos este mes
    supabase.from('pacientes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${mesInicio}T00:00:00`)
      .eq('activo', true),

    // órdenes de laboratorio pendientes
    supabase.from('consulta_analisis')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente'),

    // CXC pendientes
    supabase.from('cxc')
      .select('saldo')
      .in('estado', ['PENDIENTE', 'PARCIAL']),

    // inventario bajo mínimo
    supabase.from('inventario')
      .select('id, cantidad, stock_minimo, producto:productos(nombre)')
      .not('stock_minimo', 'is', null)
      .filter('cantidad', 'lte', 'stock_minimo')
      .limit(5),

    // planes médicos por vencer en 7 días
    supabase.from('membresias')
      .select('id, fecha_fin, paciente:pacientes(nombre, apellido1)')
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy)
      .lte('fecha_fin', fechaSumarDias(7, hoy))
      .order('fecha_fin')
      .limit(5),

    // cuotas de planes vencidas
    supabase.from('membresia_pagos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'vencido'),

    // últimos 6 movimientos de caja hoy
    supabase.from('caja_movimientos')
      .select('id, tipo, monto, concepto, hora, paciente_nombre, forma_pago')
      .eq('fecha', hoy)
      .eq('anulado', false)
      .order('hora', { ascending: false })
      .limit(6),
  ])

  // cálculos
  const ingresosHoy  = (cajaMov ?? []).filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
  const egresosHoy   = (cajaMov ?? []).filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const ingresosMes  = (cajaMovMes ?? []).filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
  const egresosMes   = (cajaMovMes ?? []).filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const netoMes      = ingresosMes - egresosMes
  const totalCxc     = (cxcPendientes ?? []).reduce((s, c) => s + (c.saldo ?? 0), 0)
  const citasPend    = (citasHoy ?? []).filter(c => c.estado === 'pendiente').length
  const citasAtend   = (citasHoy ?? []).filter(c => c.estado === 'atendido').length
  const pacNuevos    = pacientesMes?.length ?? 0
  const labPend      = labPendientes?.length ?? 0
  const stockBajo    = stockAlertas?.length ?? 0
  const cuotasVenc   = cuotasVencidas?.length ?? 0

  /* alertas críticas */
  const alertas: { tipo: 'danger' | 'warning' | 'info'; msg: string; href: string }[] = []
  if (stockBajo > 0)  alertas.push({ tipo: 'danger',  msg: `${stockBajo} producto${stockBajo > 1 ? 's' : ''} con stock bajo mínimo`,        href: '/inventario' })
  if (cuotasVenc > 0) alertas.push({ tipo: 'warning', msg: `${cuotasVenc} cuota${cuotasVenc > 1 ? 's' : ''} de planes médicos vencidas`,    href: '/membresias' })
  if (totalCxc > 0)   alertas.push({ tipo: 'warning', msg: `${fmt(totalCxc)} pendientes en Cuentas por Cobrar`,                              href: '/ventas'     })
  if (labPend > 0)    alertas.push({ tipo: 'info',    msg: `${labPend} orden${labPend > 1 ? 'es' : ''} de laboratorio pendiente${labPend > 1 ? 's' : ''}`, href: '/laboratorio' })

  return (
    <main className="flex-1 min-h-full bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full">

      {/* ── BANNER BIENVENIDA ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)` }}>
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full opacity-10 bg-white blur-3xl" />
        <div className="absolute -left-8 bottom-0 w-32 h-32 rounded-full opacity-10"
          style={{ backgroundColor: BRAND.gold }} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm">{saludo()},</p>
            <h2 className="text-2xl font-bold mt-0.5">{nombre} 👋</h2>
            <p className="text-blue-100 text-sm mt-1 font-medium">{nombreSucursal}</p>
            <p className="text-blue-200 text-xs mt-0.5 capitalize">{fechaHoy()}</p>
          </div>
          <div className="hidden md:flex flex-col items-center gap-3">
            <div className="flex gap-3">
              <div className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-2xl font-bold">{citasHoy?.length ?? 0}</p>
                <p className="text-xs text-blue-200">citas hoy</p>
              </div>
              <div className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-2xl font-bold">{citasPend}</p>
                <p className="text-xs text-blue-200">pendientes</p>
              </div>
              <div className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-2xl font-bold">{citasAtend}</p>
                <p className="text-xs text-blue-200">atendidos</p>
              </div>
            </div>
          </div>
          <div aria-hidden className="hidden lg:block absolute right-6 top-6 pointer-events-none opacity-[0.08]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND.logoTicket}
              alt=""
              width={100}
              className="logo-ticket"
              style={{ width: 100, height: 'auto' }}
            />
          </div>
        </div>
      </div>

      {/* ── ALERTAS ───────────────────────────────────────── */}
      {alertas.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {alertas.map((a, i) => (
            <Link key={i} href={a.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition hover:opacity-90 ${
                a.tipo === 'danger'  ? 'bg-red-50 border-red-200 text-red-700' :
                a.tipo === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                       'bg-blue-50 border-blue-200 text-blue-700'}`}>
              {a.tipo === 'danger'  ? <XCircle       className="w-4 h-4 shrink-0"/> :
               a.tipo === 'warning' ? <AlertTriangle className="w-4 h-4 shrink-0"/> :
                                      <Clock         className="w-4 h-4 shrink-0"/>}
              <span className="flex-1 leading-tight">{a.msg}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0"/>
            </Link>
          ))}
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          {
            label: 'Ingresos hoy',
            value: fmt(ingresosHoy),
            sub:   `Egresos: ${fmt(egresosHoy)}`,
            icon:  <DollarSign  className="w-5 h-5"/>,
            color: 'green',
            href:  '/ventas',
          },
          {
            label: 'Neto del mes',
            value: fmt(netoMes),
            sub:   `Ingresos: ${fmt(ingresosMes)}`,
            icon:  <TrendingUp  className="w-5 h-5"/>,
            color: netoMes >= 0 ? 'blue' : 'red',
            href:  '/reportes',
          },
          {
            label: 'Citas hoy',
            value: citasHoy?.length ?? 0,
            sub:   `${citasPend} pendientes · ${citasAtend} atendidos`,
            icon:  <CalendarCheck className="w-5 h-5"/>,
            color: 'purple',
            href:  '/consultas',
          },
          {
            label: 'Pacientes nuevos',
            value: pacNuevos,
            sub:   'Este mes',
            icon:  <Users       className="w-5 h-5"/>,
            color: 'teal',
            href:  '/pacientes',
          },
          {
            label: 'CXC pendiente',
            value: fmt(totalCxc),
            sub:   `${cxcPendientes?.length ?? 0} cuentas`,
            icon:  <Wallet      className="w-5 h-5"/>,
            color: totalCxc > 0 ? 'amber' : 'green',
            href:  '/ventas',
          },
          {
            label: 'Lab pendientes',
            value: labPend,
            sub:   'Órdenes sin resultado',
            icon:  <FlaskConical className="w-5 h-5"/>,
            color: labPend > 0 ? 'orange' : 'green',
            href:  '/laboratorio',
          },
        ].map(k => (
          <Link key={k.label} href={k.href}
            className="bg-white border rounded-2xl p-4 hover:shadow-md transition group">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${KPI_ICON_COLORS[k.color] ?? KPI_ICON_COLORS.blue}`}>
              {k.icon}
            </div>
            <p className="text-xl font-bold text-gray-900 leading-tight truncate">{k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{k.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── FILA CENTRAL ──────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Agenda del día */}
        <div className="lg:col-span-2 bg-white border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-blue-600"/> Agenda de Hoy
            </h3>
            <Link href="/consultas" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="w-3 h-3"/>
            </Link>
          </div>
          {!citasHoy || citasHoy.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <CalendarCheck className="w-10 h-10 mb-2 opacity-30"/>
              <p className="text-sm">No hay citas registradas para hoy</p>
            </div>
          ) : (
            <div className="divide-y max-h-72 overflow-y-auto">
              {citasHoy.map((c) => {
                const badge  = citaBadge(c.estado)
                const pac    = Array.isArray(c.paciente) ? c.paciente[0] : c.paciente
                return (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <div className="w-14 text-center shrink-0">
                      <p className="text-sm font-bold text-gray-700">{(c.hora ?? '').slice(0,5)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {pac?.nombre ?? '—'} {pac?.apellido1 ?? ''}
                      </p>
                      <p className="text-xs text-gray-400">{c.tipo_consulta ?? 'Consulta'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Panel derecho: alertas + accesos */}
        <div className="space-y-4">

          {/* Planes por vencer */}
          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-500"/> Planes por vencer
              </h3>
              <Link href="/membresias" className="text-xs text-blue-600 hover:underline">Ver todo</Link>
            </div>
            {!planesPorVencer || planesPorVencer.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-xs">
                <CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-400"/>
                Sin vencimientos próximos
              </div>
            ) : (
              <div className="divide-y">
                {planesPorVencer.map(p => {
                  const pac  = Array.isArray(p.paciente) ? p.paciente[0] : p.paciente
                  const dias = Math.ceil((new Date(p.fecha_fin).getTime() - Date.now()) / 86400000)
                  return (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {pac?.nombre} {pac?.apellido1}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${
                        dias <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {dias === 0 ? 'HOY' : `${dias}d`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Accesos rápidos */}
          <div className="bg-white border rounded-2xl p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/consultas',  label: 'Consultas',    icon: Stethoscope,  bg: 'bg-blue-600'   },
                { href: '/pacientes',  label: 'Pacientes',    icon: Users,        bg: 'bg-emerald-600' },
                { href: '/ventas',     label: 'Caja',         icon: Receipt,      bg: 'bg-violet-600'  },
                { href: '/inventario', label: 'Inventario',   icon: Package,      bg: 'bg-amber-600'   },
                { href: '/laboratorio',label: 'Laboratorio',  icon: FlaskConical, bg: 'bg-cyan-600'    },
                { href: '/membresias', label: 'Planes',       icon: CreditCard,   bg: 'bg-rose-600'    },
                { href: '/reportes',   label: 'Reportes',     icon: BarChart3,    bg: 'bg-indigo-600'  },
                { href: '/configuracion',label:'Config.',     icon: Settings,     bg: 'bg-gray-600'    },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 transition group">
                  <div className={`w-7 h-7 ${item.bg} rounded-lg flex items-center justify-center shrink-0`}>
                    <item.icon className="w-3.5 h-3.5 text-white"/>
                  </div>
                  <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ÚLTIMOS MOVIMIENTOS DE CAJA ───────────────────── */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-600"/> Últimos Movimientos del Día
          </h3>
          <Link href="/ventas" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            Ver caja <ArrowRight className="w-3 h-3"/>
          </Link>
        </div>
        {!ultimosMov || ultimosMov.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400">
            <ShoppingBag className="w-10 h-10 mb-2 opacity-30"/>
            <p className="text-sm">No hay movimientos registrados hoy</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Concepto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Forma pago</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ultimosMov.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 text-xs font-mono">{(m.hora ?? '').slice(0,5)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.tipo === 'INGRESO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{m.concepto}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.paciente_nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{m.forma_pago ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-bold text-sm ${
                      m.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-600'}`}>
                      {m.tipo === 'EGRESO' ? '-' : ''}{fmt(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-gray-600">
                    Neto del día:
                  </td>
                  <td className={`px-4 py-3 text-right font-bold text-base ${
                    (ingresosHoy - egresosHoy) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(ingresosHoy - egresosHoy)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      </div>
    </main>
  )
}
