import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, ShieldCheck, FileText } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { getSesionPortal } from '@/lib/portal/session'
import { cargarPortalPaciente, filasDeGrupo, archivosDeGrupo } from '@/lib/portal/data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resultado' }

function fmtFecha(f?: string) {
  if (!f) return '—'
  return new Date(f + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function flag(ind?: string) {
  if (ind === 'ALTO') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">ALTO ↑</span>
  if (ind === 'BAJO') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">BAJO ↓</span>
  if (ind === 'NORMAL') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Normal</span>
  return <span className="text-gray-300">—</span>
}

export default async function PortalResultado({ params }: { params: Promise<{ grupo: string }> }) {
  const sesion = await getSesionPortal()
  if (!sesion) redirect('/portal/login')

  const { grupo: grupoIdRaw } = await params
  const grupoId = decodeURIComponent(grupoIdRaw)

  const data = await cargarPortalPaciente(sesion.pacienteId)
  if (!data) notFound()
  const res = filasDeGrupo(data, grupoId)
  const archivos = archivosDeGrupo(data, grupoId)
  if (!res && archivos.length === 0) notFound()

  const grupo = res?.grupo ?? data.grupos.find(g => g.grupoId === grupoId)
  if (!grupo) notFound()
  const filas = res?.filas ?? []
  const fechaResultado = grupo.ordenes.map(o => o.fecha_resultado).filter(Boolean).sort().pop()
  const soloMaquila = archivos.length > 0 && filas.every(f => !f.valor?.trim())

  const tieneInformeClinica = filas.some(f => f.valor && f.valor !== '—' && f.valor.trim().length > 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <Link href="/portal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Link>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {tieneInformeClinica && (
            <a
              href={`/portal/resultado/${encodeURIComponent(grupoId)}/print?encabezado=clinica`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white rounded-lg px-4 py-2"
              style={{ backgroundColor: '#0891b2' }}
            >
              <Download className="w-4 h-4" /> Descargar informe
            </a>
          )}
          {archivos.map(a => (
            <a
              key={a.id}
              href={`/portal/resultado/${encodeURIComponent(grupoId)}/archivo/${a.id}`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white rounded-lg px-4 py-2"
              style={{ backgroundColor: '#0d9488' }}
            >
              <FileText className="w-4 h-4" /> {a.nombre_archivo}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ background: 'linear-gradient(135deg,#003366,#0a4f8a)' }}>
          <p className="text-white font-black">Informe de Resultados</p>
          <p className="text-white/70 text-xs">{BRAND.nombre}</p>
        </div>

        <div className="px-4 sm:px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm border-b bg-slate-50">
          <p className="break-words"><span className="text-gray-500">Paciente:</span> <b>{grupo.pacienteNombre}</b></p>
          <p className="break-words"><span className="text-gray-500">Identidad:</span> {grupo.pacienteCodigo || '—'}</p>
          <p><span className="text-gray-500">Fecha orden:</span> {fmtFecha(grupo.fecha)}</p>
          <p><span className="text-gray-500">Fecha resultado:</span> {fmtFecha(fechaResultado ?? undefined)}</p>
        </div>

        {!soloMaquila && tieneInformeClinica && (
          <>
        {/* Tabla para tablet/escritorio */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-gray-600 text-xs uppercase">
                <th className="px-4 py-2 text-left">Prueba / Parámetro</th>
                <th className="px-4 py-2 text-left">Resultado</th>
                <th className="px-4 py-2 text-left">Unidad</th>
                <th className="px-4 py-2 text-left">Referencia</th>
                <th className="px-4 py-2 text-center">Indicador</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    {f.campo ? <span className="text-gray-700">{f.campo}</span> : <b>{f.prueba}</b>}
                    {f.campo && <div className="text-[10px] text-gray-400">{f.prueba}</div>}
                  </td>
                  <td className={`px-4 py-2 font-bold ${f.indicador === 'ALTO' ? 'text-red-600' : f.indicador === 'BAJO' ? 'text-blue-600' : 'text-gray-900'}`}>
                    {f.valor || '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{f.unidad || ''}</td>
                  <td className="px-4 py-2 text-gray-500">{f.rango || '—'}</td>
                  <td className="px-4 py-2 text-center">{flag(f.indicador)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tarjetas apiladas para móvil */}
        <div className="md:hidden divide-y">
          {filas.map((f, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {f.campo
                    ? <p className="text-sm font-medium text-gray-700 break-words">{f.campo}</p>
                    : <p className="text-sm font-bold text-gray-900 break-words">{f.prueba}</p>}
                  {f.campo && <p className="text-[11px] text-gray-400 break-words">{f.prueba}</p>}
                </div>
                <div className="shrink-0">{flag(f.indicador)}</div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Resultado</p>
                  <p className={`text-sm font-bold ${f.indicador === 'ALTO' ? 'text-red-600' : f.indicador === 'BAJO' ? 'text-blue-600' : 'text-gray-900'}`}>
                    {f.valor || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Unidad</p>
                  <p className="text-sm text-gray-600 break-words">{f.unidad || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Referencia</p>
                  <p className="text-sm text-gray-600 break-words">{f.rango || '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
          </>
        )}

        <div className="px-5 py-3 border-t bg-slate-50 text-xs text-gray-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Resultado validado por el laboratorio. Interpretación a cargo de su médico tratante.
        </div>
      </div>
    </div>
  )
}
