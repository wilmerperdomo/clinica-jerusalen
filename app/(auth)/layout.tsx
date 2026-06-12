import { Suspense } from 'react'

import AppFooter from '@/components/app-footer'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
