import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import AppFooter from '@/components/app-footer'
import ConfigEnvError from '@/components/config-env-error'
import { createClient } from '@/lib/supabase/server'
import { hasPublicSupabaseEnv } from '@/lib/supabase/env'

export const dynamic = 'force-dynamic'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!hasPublicSupabaseEnv()) return <ConfigEnvError />

  const supabase = await createClient()
  if (!supabase) return <ConfigEnvError />

  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')
  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50 flex items-center justify-center p-4 pb-20">
        <Suspense fallback={<div className="text-slate-500 text-sm">Cargando...</div>}>
          {children}
        </Suspense>
      </main>
      <AppFooter variant="fixed" />
    </>
  )
}
