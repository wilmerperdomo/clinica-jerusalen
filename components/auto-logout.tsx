'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TIMEOUT_MS = 30 * 60 * 1000  // 30 minutos de inactividad

export default function AutoLogout() {
  const router   = useRouter()
  const supabase = createClient()
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reset() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        // registrar log de timeout
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

        await supabase.auth.signOut()
        router.push('/login?motivo=inactividad')
      }, TIMEOUT_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    reset()  // iniciar el timer al montar

    return () => {
      if (timer.current) clearTimeout(timer.current)
      events.forEach(ev => window.removeEventListener(ev, reset))
    }
  }, [router, supabase])

  return null  // componente invisible
}
