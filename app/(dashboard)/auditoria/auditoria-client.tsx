'use client'

import { useState } from 'react'
import {
  ShieldCheck, History, Database, BarChart3, FileText,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'
import type { RespaldoRow, ResumenAuditoria } from '@/lib/auditoria-utils'
import AuditoriaResumenPanel from '@/components/auditoria/auditoria-resumen-panel'
import AuditoriaBitacoraPanel from '@/components/auditoria/auditoria-bitacora-panel'
import AuditoriaFacturasPanel from '@/components/auditoria/auditoria-facturas-panel'
import AuditoriaRespaldosPanel from '@/components/auditoria/auditoria-respaldos-panel'

type Tab = 'resumen' | 'bitacora' | 'facturas' | 'respaldos'

interface Props {
  respaldos: RespaldoRow[]
  resumen: ResumenAuditoria
  tablas: string[]
  usuarios: string[]
  accesos: { id: number; accion: string; detalle?: string | null; usuario_nombre?: string | null; ip_address?: string | null; fecha: string }[]
  serviceRoleDisponible: boolean
}

const TABS: { key: Tab; label: string; icon: typeof History }[] = [
  { key: 'resumen', label: 'Resumen', icon: BarChart3 },
  { key: 'bitacora', label: 'Bitácora', icon: History },
  { key: 'facturas', label: 'Facturación', icon: FileText },
  { key: 'respaldos', label: 'Respaldos', icon: Database },
]

export default function AuditoriaClient({
  respaldos, resumen, tablas, usuarios, accesos, serviceRoleDisponible,
}: Props) {
  const [tab, setTab] = useState<Tab>('resumen')

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Auditoría y Respaldos"
        subtitle="Control de cambios, facturación fiscal y copias de seguridad"
        badge="Super Admin"
        icon={ShieldCheck}
        kpis={[
          { label: 'Eventos totales', value: resumen.totalEventos, icon: History },
          { label: 'Eliminaciones hoy', value: resumen.eliminacionesHoy, icon: ShieldCheck },
          {
            label: 'Respaldo auto',
            value: resumen.respaldoSaludable ? 'OK' : 'Revisar',
            icon: Database,
          },
          { label: 'Copias guardadas', value: respaldos.length, icon: Database },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {TABS.map(t => (
              <ModuleBtnGhost key={t.key} onClick={() => setTab(t.key)}>
                <t.icon className="w-4 h-4" /> {t.label}
              </ModuleBtnGhost>
            ))}
          </div>
        }
      />
      <ModuleContent>
        <div className="flex flex-wrap gap-2 mb-4 lg:hidden">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-violet-600 text-white' : 'bg-white border text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' && <AuditoriaResumenPanel resumen={resumen} accesos={accesos} />}
        {tab === 'bitacora' && <AuditoriaBitacoraPanel tablasInicial={tablas} usuariosInicial={usuarios} />}
        {tab === 'facturas' && <AuditoriaFacturasPanel />}
        {tab === 'respaldos' && (
          <AuditoriaRespaldosPanel respaldosInicial={respaldos} serviceRoleDisponible={serviceRoleDisponible} />
        )}
      </ModuleContent>
    </ModuleShell>
  )
}
