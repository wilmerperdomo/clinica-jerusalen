'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { Alerta, AlertaTipo } from '@/lib/get-alertas'
import {
  Bell, RefreshCw, AlertTriangle, XCircle, Info,
  Package, CalendarDays, Receipt, CreditCard, FlaskConical,
  Stethoscope, ChevronRight, Filter,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'

const CATEGORIA_ICONO: Record<string, React.ReactNode> = {
  'Inventario':        <Package      className="w-5 h-5" />,
  'Agenda':            <CalendarDays className="w-5 h-5" />,
  'Caja':              <Receipt      className="w-5 h-5" />,
  'Planes Médicos':    <CreditCard   className="w-5 h-5" />,
  'Laboratorio':       <FlaskConical className="w-5 h-5" />,
  'Cuentas por Pagar': <CreditCard   className="w-5 h-5" />,
}

const TIPO_STYLE: Record<AlertaTipo, { bg: string; border: string; badge: string; icon: React.ReactNode }> = {
  danger:  { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',    icon: <XCircle       className="w-5 h-5 text-red-500" /> },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   icon: <Info          className="w-5 h-5 text-blue-500" /> },
}

const POLL_MS = 60_000

interface Props { alertasIniciales: Alerta[] }

export default function NotificacionesClient({ alertasIniciales }: Props) {
  const [alertas,  setAlertas]  = useState<Alerta[]>(alertasIniciales)
  const [filtro,   setFiltro]   = useState<AlertaTipo | 'todas'>('todas')
  const [filtroCat,setFiltroCat]= useState('')
  const [cargando, setCargando] = useState(false)
  const [ultima,   setUltima]   = useState(new Date())

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res  = await fetch('/api/alertas', { cache: 'no-store' })
      const data = await res.json()
      setAlertas(data.alertas ?? [])
      setUltima(new Date())
    } catch { /* silencioso */ }
    setCargando(false)
  }, [])

  useEffect(() => {
    const id = setInterval(cargar, POLL_MS)
    return () => clearInterval(id)
  }, [cargar])

  const categorias = useMemo(() =>
    [...new Set(alertas.map(a => a.categoria))].sort(),
  [alertas])

  const lista = useMemo(() => alertas.filter(a => {
    if (filtro !== 'todas' && a.tipo !== filtro) return false
    if (filtroCat && a.categoria !== filtroCat) return false
    return true
  }), [alertas, filtro, filtroCat])

  const kpis = useMemo(() => ({
    total:      alertas.length,
    criticas:   alertas.filter(a => a.tipo === 'danger').length,
    advertencias: alertas.filter(a => a.tipo === 'warning').length,
    info:       alertas.filter(a => a.tipo === 'info').length,
  }), [alertas])

  // Agrupar por categoría
  const agrupadas = useMemo(() => {
    const map = new Map<string, Alerta[]>()
    for (const a of lista) {
      if (!map.has(a.categoria)) map.set(a.categoria, [])
      map.get(a.categoria)!.push(a)
    }
    return [...map.entries()]
  }, [lista])

  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Centro de Notificaciones"
        subtitle="Alertas en tiempo real · actualiza cada 60 seg"
        badge="Alertas del sistema"
        icon={Bell}
        kpis={[
          { label: 'Total alertas', value: kpis.total, icon: Bell },
          { label: 'Críticas', value: kpis.criticas, icon: XCircle },
          { label: 'Advertencias', value: kpis.advertencias, icon: AlertTriangle },
          { label: 'Informativas', value: kpis.info, icon: Info },
        ]}
        actions={
          <ModuleBtnGhost onClick={cargar} disabled={cargando}>
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            {cargando ? 'Actualizando…' : 'Actualizar ahora'}
          </ModuleBtnGhost>
        }
      />
      <ModuleContent>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['todas', 'danger', 'warning', 'info'] as const).map(t => (
          <button key={t} onClick={() => setFiltro(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filtro === t
                ? t === 'danger' ? 'bg-red-600 text-white' :
                  t === 'warning' ? 'bg-amber-500 text-white' :
                  t === 'info' ? 'bg-blue-600 text-white' :
                  'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {t === 'todas' ? 'Todas' : t === 'danger' ? 'Críticas' : t === 'warning' ? 'Advertencias' : 'Info'}
          </button>
        ))}
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="ml-2 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">
          Última actualización: {ultima.toLocaleTimeString('es-HN')}
        </span>
      </div>

      {/* Sin alertas */}
      {lista.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="font-medium text-slate-600">Sin alertas activas</p>
          <p className="text-sm text-slate-400 mt-1">Todo está bajo control en este momento</p>
        </div>
      )}

      {/* Alertas agrupadas por categoría */}
      {agrupadas.map(([categoria, items]) => (
        <div key={categoria} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">
            <span className="text-slate-500">{CATEGORIA_ICONO[categoria] ?? <Stethoscope className="w-5 h-5" />}</span>
            <h2 className="font-semibold text-slate-800">{categoria}</h2>
            <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {items.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map(a => {
              const st = TIPO_STYLE[a.tipo]
              return (
                <div key={a.id} className={`flex items-start gap-4 px-4 py-3.5 hover:bg-slate-50 transition group ${st.bg}`}>
                  <div className="mt-0.5">{st.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800">{a.titulo}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>
                        {a.tipo === 'danger' ? 'Crítica' : a.tipo === 'warning' ? 'Advertencia' : 'Info'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{a.mensaje}</p>
                    {a.fecha && <p className="text-xs text-slate-400 mt-1">{a.fecha}</p>}
                    {(a.acciones?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {a.acciones!.map((ac, i) => (
                          <Link key={i} href={ac.href}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                              ac.variant === 'primary'
                                ? 'bg-slate-800 text-white hover:bg-slate-900'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}>
                            {ac.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link href={a.href} className="mt-1 flex-shrink-0 text-slate-300 hover:text-slate-500 transition">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Leyenda de tipos de alerta */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Tipos de alerta monitoreados</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-slate-600">
          {[
            ['Stock bajo mínimo', 'Inventario'],
            ['Medicamentos por vencer / vencidos', 'Inventario'],
            ['Citas pendientes hoy', 'Agenda'],
            ['Cuentas por cobrar pendientes', 'Caja'],
            ['CXC vencidas (+30 días)', 'Caja'],
            ['Consultas finalizadas sin cobrar', 'Caja'],
            ['Planes médicos por vencer (7 días)', 'Planes'],
            ['Cuotas de planes vencidas', 'Planes'],
            ['Lab pagado sin entregar', 'Laboratorio'],
            ['Deudas vencidas a proveedores', 'CXP'],
          ].map(([desc, cat]) => (
            <div key={desc} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
              <span><strong>{cat}:</strong> {desc}</span>
            </div>
          ))}
        </div>
      </div>
      </ModuleContent>
    </ModuleShell>
  )
}
