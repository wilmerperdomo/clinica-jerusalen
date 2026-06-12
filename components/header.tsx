'use client'

import { Bell, Search } from 'lucide-react'

interface HeaderProps {
  title:    string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-100 px-6 flex items-center justify-between sticky top-0 z-30">

      {/* Título de página */}
      <div>
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      {/* Acciones del header */}
      <div className="flex items-center gap-3">

        {/* Búsqueda global */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar paciente, factura..."
            className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       placeholder:text-slate-400 w-56 bg-slate-50"
          />
        </div>

        {/* Notificaciones */}
        <button className="relative p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  )
}
