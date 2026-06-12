'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Bell, X, AlertTriangle, XCircle, Info, ChevronRight, RefreshCw,
} from 'lucide-react'
import type { Alerta } from '@/lib/get-alertas'

const ICONO: Record<string, React.ReactNode> = {
  danger:  <XCircle       className="w-4 h-4 text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
  info:    <Info          className="w-4 h-4 text-blue-500 flex-shrink-0" />,
}

const POLL_MS = 60_000  // actualizar cada 60 segundos

export default function NotificationBell() {
  const [alertas,   setAlertas]   = useState<Alerta[]>([])
  const [criticas,  setCriticas]  = useState(0)
  const [abierto,   setAbierto]   = useState(false)
  const [cargando,  setCargando]  = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res  = await fetch('/api/alertas', { cache: 'no-store' })
      const data = await res.json()
      setAlertas(data.alertas ?? [])
      setCriticas(data.criticas ?? 0)
    } catch { /* silencioso */ }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, POLL_MS)
    return () => clearInterval(id)
  }, [cargar])

  // Cerrar al click fuera
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  const badge = criticas > 0 ? criticas : alertas.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(v => !v)}
        className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Notificaciones</p>
              <p className="text-xs text-slate-400">{alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={cargar} disabled={cargando}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition">
                <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setAbierto(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {alertas.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Sin alertas activas
              </div>
            ) : alertas.slice(0, 8).map(a => (
              <Link key={a.id} href={a.href} onClick={() => setAbierto(false)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition ${
                  a.tipo === 'danger' ? 'bg-red-50/30' : ''
                }`}>
                {ICONO[a.tipo]}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase">{a.categoria}</p>
                  <p className="text-sm font-medium text-slate-800 leading-tight">{a.titulo}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.mensaje}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-1 flex-shrink-0" />
              </Link>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t bg-slate-50">
            <Link href="/notificaciones" onClick={() => setAbierto(false)}
              className="block text-center text-sm font-medium text-blue-600 hover:text-blue-700 transition">
              Ver todas las alertas →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
