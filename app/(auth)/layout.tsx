import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import AppFooter from '@/components/app-footer'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
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
