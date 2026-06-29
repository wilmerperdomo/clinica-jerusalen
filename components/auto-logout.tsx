'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { tieneCajaSesionAbierta } from '@/lib/caja-sesion-activa'
import { guardarRutaRetorno } from '@/lib/return-url'

const TIMEOUT_MS = 30 * 60 * 1000  // 30 minutos de inactividad

export default function AutoLogout() {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function ejecutarTimeout() {
      // No cerrar sesión mientras haya caja abierta (turno activo del cajero).
      try {
        if (await tieneCajaSesionAbierta(supabase)) {
          reset()
          return
        }
      } catch { /* si falla la consulta, aplicar timeout normal */ }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('acceso_logs').insert({
            user_id: user.id,
            email:   user.email,
            accion:  'timeout',
          })
        }
      } catch { /* silencioso */ }

      const dest = `${window.location.pathname}${window.location.search}`
      guardarRutaRetorno(dest)

      await supabase.auth.signOut()
      router.push(`/login?motivo=inactividad&returnTo=${encodeURIComponent(dest)}`)
    }

    function reset() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { void ejecutarTimeout() }, TIMEOUT_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    reset()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      events.forEach(ev => window.removeEventListener(ev, reset))
    }
  }, [router, supabase, pathname])

  return null
}
