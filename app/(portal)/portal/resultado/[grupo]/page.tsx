import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { getSesionPortal } from '@/lib/portal/session'
import { cargarPortalPaciente, filasDeGrupo } from '@/lib/portal/data'

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
  if (!res) notFound()

  const { grupo, filas } = res
  const fechaResultado = grupo.ordenes.map(o => o.fecha_resultado).filter(Boolean).sort().pop()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <Link href="/portal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Link>
        <a
          href={`/portal/resultado/${encodeURIComponent(grupoId)}/print`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-4 py-2"
          style={{ backgroundColor: '#0891b2' }}
        >
          <Download className="w-4 h-4" /> Descargar / Imprimir PDF
        </a>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ background: 'linear-gradient(135deg,#003366,#0a4f8a)' }}>
          <p className="text-white font-black">Informe de Resultados</p>
          <p className="text-white/70 text-xs">{BRAND.nombre}</p>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-2 text-sm border-b bg-slate-50">
          <p><span className="text-gray-500">Paciente:</span> <b>{grupo.pacienteNombre}</b></p>
          <p><span className="text-gray-500">Identidad:</span> {grupo.pacienteCodigo || '—'}</p>
          <p><span className="text-gray-500">Fecha orden:</span> {fmtFecha(grupo.fecha)}</p>
          <p><span className="text-gray-500">Fecha resultado:</span> {fmtFecha(fechaResultado ?? undefined)}</p>
        </div>

        <div className="overflow-x-auto">
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

        <div className="px-5 py-3 border-t bg-slate-50 text-xs text-gray-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Resultado validado por el laboratorio. Interpretación a cargo de su médico tratante.
        </div>
      </div>
    </div>
  )
}
