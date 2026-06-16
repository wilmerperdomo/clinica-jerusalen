import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'

import Sidebar from '@/components/sidebar'

import AutoLogout from '@/components/auto-logout'

import TopBar from '@/components/top-bar'

import AppFooter from '@/components/app-footer'
import ConfigEnvError from '@/components/config-env-error'
import { getEnvDiagnostics, hasPublicSupabaseEnv } from '@/lib/supabase/env'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const envDiag = getEnvDiagnostics()
  if (!hasPublicSupabaseEnv()) return <ConfigEnvError {...envDiag} />

  const supabase = await createClient()
  if (!supabase) return <ConfigEnvError {...envDiag} />

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')



  const perfilAuth = await getPerfilSucursal()

  const modulosPermitidos = await getModulosPermitidos(
    perfilAuth.rolId,
    perfilAuth.esSuperAdmin,
    perfilAuth.esAdmin,
  )



  const sucursalNombre = perfilAuth.sucursalNombre



  const sinPerfil = !perfilAuth.rolId && !perfilAuth.esSuperAdmin



  return (

    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">

      <Sidebar

        userName={perfilAuth.nombre}

        userRole={perfilAuth.rol}

        sucursalNombre={sucursalNombre}

        modulosPermitidos={modulosPermitidos}

        sinPerfil={sinPerfil}

        esAdmin={perfilAuth.esAdmin}

      />

      <div className="flex-1 md:ml-[260px] flex flex-col min-h-screen min-w-0 w-full overflow-x-hidden">

        <AutoLogout />

        <TopBar userName={perfilAuth.nombre} sucursalNombre={sucursalNombre} />

        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {children}
          <AppFooter />
        </div>

      </div>

    </div>

  )

}


