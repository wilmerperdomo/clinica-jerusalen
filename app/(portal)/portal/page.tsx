import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical, FileText, LogOut, ChevronRight, CalendarDays, ShieldCheck } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { getSesionPortal } from '@/lib/portal/session'
import { cargarPortalPaciente } from '@/lib/portal/data'
import { logoutPortal } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mis resultados' }

function fmtFecha(f: string) {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function PortalHome() {
  const sesion = await getSesionPortal()
  if (!sesion) redirect('/portal/login')

  const data = await cargarPortalPaciente(sesion.pacienteId)
  const paciente = data?.paciente
  const grupos = data?.grupos ?? []

  const nombre = paciente
    ? [paciente.nombre, paciente.apellido1, paciente.apellido2].filter(Boolean).join(' ') || paciente.nombre_empresa || 'Paciente'
    : 'Paciente'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: '#0891b2' }}>
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-gray-900 leading-tight">{nombre}</p>
            <p className="text-xs text-gray-500">{BRAND.nombre} · Portal del paciente</p>
          </div>
        </div>
        <form action={logoutPortal}>
          <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border rounded-lg px-3 py-1.5">
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </form>
      </header>

      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Mis resultados de laboratorio</h2>

      {grupos.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Aún no hay resultados disponibles para descargar.</p>
          <p className="text-xs mt-1">Cuando su laboratorio esté validado, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => (
            <Link
              key={g.grupoId}
              href={`/portal/resultado/${encodeURIComponent(g.grupoId)}`}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm hover:border-cyan-200 transition"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{g.pruebas.join(', ')}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {fmtFecha(g.fecha)}</span>
                  {g.estado === 'ENTREGADO' || g.estado === 'VALIDADO'
                    ? <span className="flex items-center gap-1 text-emerald-600"><ShieldCheck className="w-3 h-3" /> Validado</span>
                    : null}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-8">
        Los resultados deben ser interpretados por su médico tratante.
      </p>
    </div>
  )
}
