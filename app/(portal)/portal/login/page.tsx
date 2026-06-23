'use client'

import { useActionState } from 'react'
import { FlaskConical, Lock, User, Loader2, AlertCircle } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { loginPortal, type PortalLoginState } from '../actions'

const estadoInicial: PortalLoginState = {}

export default function PortalLoginPage() {
  const [state, formAction, pending] = useActionState(loginPortal, estadoInicial)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-8 py-7 text-center text-white" style={{ background: 'linear-gradient(135deg,#003366,#0a4f8a)' }}>
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-3">
            <FlaskConical className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black">Portal del Paciente</h1>
          <p className="text-xs text-white/70 mt-1">{BRAND.nombre}</p>
          <p className="text-xs text-white/60 mt-2">Consulte y descargue sus resultados de laboratorio</p>
        </div>

        <form action={formAction} className="p-7 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                name="usuario"
                autoComplete="username"
                required
                placeholder="Identidad o usuario de su comprobante"
                className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Es su número de identidad o el usuario impreso en su factura/comprobante.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Contraseña entregada por la clínica"
                className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {state.error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" /> {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: '#0891b2' }}
          >
            {pending ? <><Loader2 className="w-5 h-5 animate-spin" /> Ingresando…</> : 'Ingresar'}
          </button>

          <p className="text-[11px] text-gray-400 text-center">
            ¿No tiene acceso? Solicítelo en recepción de la clínica.
          </p>
        </form>
      </div>
    </div>
  )
}
