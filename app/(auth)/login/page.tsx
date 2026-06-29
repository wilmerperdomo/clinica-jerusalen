'use client'



import { useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

import { Eye, EyeOff, Loader2, Lock, Mail, Clock } from 'lucide-react'

import { BRAND } from '@/lib/brand'
import { LOGO_TICKET_CLASS } from '@/lib/brand-logo'

import { asegurarPerfilAlLogin, obtenerRutaInicioPostLogin } from './actions'
import {
  etiquetaRutaRetorno,
  leerRutaRetornoGuardada,
  limpiarRutaRetornoGuardada,
  rutaRetornoSegura,
} from '@/lib/return-url'



export default function LoginPage() {

  const router       = useRouter()

  const searchParams = useSearchParams()

  const supabase     = createClient()



  const [email,    setEmail]    = useState('')

  const [password, setPassword] = useState('')

  const [showPass, setShowPass] = useState(false)

  const [loading,  setLoading]  = useState(false)

  const [error,    setError]    = useState<string | null>(null)



  const motivoTimeout = searchParams.get('motivo') === 'inactividad'
  const returnTo = rutaRetornoSegura(searchParams.get('returnTo')) ?? leerRutaRetornoGuardada()
  const etiquetaRetorno = returnTo ? etiquetaRutaRetorno(returnTo) : null



  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault()

    setError(null)

    setLoading(true)



    const { data, error } = await supabase.auth.signInWithPassword({ email, password })



    if (error) {

      setError(

        error.message === 'Invalid login credentials'

          ? 'Correo o contraseña incorrectos. Si el usuario es nuevo, en Supabase desactive "Confirm email" o ejecute scripts/ARREGLAR-TODO-USUARIOS.sql.'

          : 'Error al iniciar sesión. Intenta de nuevo.'

      )

      setLoading(false)

      return

    }



    if (data.user) {
      const perfil = await asegurarPerfilAlLogin(data.user.id, data.user.email ?? '')
      if (!perfil.ok && perfil.error) {
        setError(perfil.error)
        setLoading(false)
        return
      }
      await supabase.from('acceso_logs' as 'perfiles').insert({
        user_id: data.user.id,
        email:   data.user.email,
        accion:  'login',
      } as never).then(() => {})
    }



    const rutaInicio = returnTo ?? await obtenerRutaInicioPostLogin()
    limpiarRutaRetornoGuardada()
    router.push(rutaInicio)
    router.refresh()

  }



  return (

    <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden min-w-0">



      {/* Panel izquierdo — Branding */}

      <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-[#003366] via-[#004080] to-[#005580] p-8 lg:p-10 text-white border-r-4 border-[#c9a227] min-w-0 overflow-hidden">

        <div className="border-b border-[#c9a227]/35 pb-6">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/85">
            Clínica Médica
          </p>
          <p className="text-3xl font-bold text-[#f0d060] mt-1">Jerusalén</p>
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#e8c547]/90 mt-2">
            {BRAND.tagline}
          </p>
        </div>

        <div>

          <h1 className="text-3xl font-bold leading-tight mb-4">

            Sistema de Gestión Médica

          </h1>

          <p className="text-blue-100 text-sm leading-relaxed">

            Administra consultas, pacientes, inventario y facturación desde un solo lugar.

            Diseñado para equipos médicos modernos.

          </p>



          <div className="mt-8 space-y-3">

            {[

              'Consultas y expedientes digitales',

              'Facturación fiscal integrada',

              'Control de inventario FIFO',

              'Reportes en tiempo real',

            ].map((feat) => (

              <div key={feat} className="flex items-center gap-2 text-sm text-blue-100">

                <div className="w-1.5 h-1.5 rounded-full bg-[#e8c547]" />

                {feat}

              </div>

            ))}

          </div>

        </div>

      </div>



      {/* Panel derecho — Formulario */}

      <div className="flex flex-col justify-center p-8 md:p-12">

        {/* Logo sobre fondo blanco — igual que factura.php / index.php del sistema viejo */}
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND.logoTicket}
            alt={BRAND.nombre}
            width={150}
            className={LOGO_TICKET_CLASS}
            style={{ width: 150, height: 'auto' }}
          />
        </div>

        <h2 className="text-2xl font-bold text-[#003366] mb-1">Bienvenido</h2>

        <p className="text-slate-500 text-sm mb-6">Ingreso a Clínica Médica Jerusalén</p>



        {motivoTimeout && (

          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 mb-4 text-sm">

            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />

            <span>
              Tu sesión se cerró por <strong>30 minutos de inactividad</strong>. Inicia sesión nuevamente.
              {etiquetaRetorno && (
                <> Al entrar volverás a <strong>{etiquetaRetorno}</strong>.</>
              )}
            </span>

          </div>

        )}



        <form onSubmit={handleSubmit} className="space-y-5">

          <div>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">

              Correo electrónico

            </label>

            <div className="relative">

              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input

                type="email"

                required

                value={email}

                onChange={(e) => setEmail(e.target.value)}

                placeholder="usuario@clinica.com"

                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm

                           focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent

                           placeholder:text-slate-400 transition"

              />

            </div>

          </div>



          <div>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">

              Contraseña

            </label>

            <div className="relative">

              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input

                type={showPass ? 'text' : 'password'}

                required

                value={password}

                onChange={(e) => setPassword(e.target.value)}

                placeholder="••••••••"

                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm

                           focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent

                           placeholder:text-slate-400 transition"

              />

              <button

                type="button"

                onClick={() => setShowPass(!showPass)}

                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"

              >

                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}

              </button>

            </div>

          </div>



          {error && (

            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">

              {error}

            </div>

          )}



          <button

            type="submit"

            disabled={loading}

            className="w-full bg-[#003366] hover:bg-[#004080] disabled:bg-[#005580]/60

                       text-white font-semibold py-2.5 px-4 rounded-xl text-sm

                       flex items-center justify-center gap-2 transition"

          >

            {loading ? (

              <><Loader2 className="w-4 h-4 animate-spin" /> Ingresando...</>

            ) : (

              'Iniciar Sesión'

            )}

          </button>

        </form>

      </div>

    </div>

  )

}

