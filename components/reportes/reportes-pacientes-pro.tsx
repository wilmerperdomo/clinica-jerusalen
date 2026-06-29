'use client'

import { useState } from 'react'
import {
  Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts'
import { Users, Phone, FileDown, RefreshCw } from 'lucide-react'
import { ChartCard } from './chart-card'
import { exportarCSV, fmtReporte } from '@/lib/reporte-utils'
import {
  analizarRecurrencia,
  type CitaHistorial,
  type PacienteBasico,
  type MovimientoPaciente,
  type LabOrdenPaciente,
} from '@/lib/reportes-recurrencia'

const fmt = fmtReporte

function BtnExport({ headers, rows, nombre }: { headers: string[]; rows: (string | number)[][]; nombre: string }) {
  return (
    <button
      onClick={() => exportarCSV(nombre, headers, rows)}
      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white"
    >
      <FileDown className="w-3.5 h-3.5" /> CSV
    </button>
  )
}

interface Props {
  citasHistorial: CitaHistorial[]
  citasPeriodo: CitaHistorial[]
  pacientes: PacienteBasico[]
  movimientos: MovimientoPaciente[]
  labOrdenes: LabOrdenPaciente[]
  desde: string
  hasta: string
}

type SubTab = 'recurrencia' | 'perfil' | 'tendencia' | 'recaptacion'

export default function ReportesPacientesPro({
  citasHistorial, citasPeriodo, pacientes, movimientos, labOrdenes, desde, hasta,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('recurrencia')
  const [mesesInactivo, setMesesInactivo] = useState<3 | 6>(6)

  const analisis = analizarRecurrencia({
    citasHistorial,
    citasPeriodo,
    pacientes,
    movimientos,
    labOrdenes,
    desde,
    hasta,
    mesesInactivo,
  })

  const inactivos = mesesInactivo === 3 ? analisis.inactivos3 : analisis.inactivos6

  const SUBTABS: { id: SubTab; label: string }[] = [
    { id: 'recurrencia', label: 'Recurrencia' },
    { id: 'perfil', label: 'A qué vino' },
    { id: 'tendencia', label: 'Tendencia mensual' },
    { id: 'recaptacion', label: 'Re-captación' },
  ]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pacientes atendidos', value: analisis.filas.length, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: '🆕 Nuevos', value: analisis.totalNuevos, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: '🔁 Recurrentes', value: analisis.totalRecurrentes, color: 'text-violet-700', bg: 'bg-violet-50' },
          { label: 'Prom. visitas/paciente', value: analisis.promedioVisitasPorPaciente.toFixed(1), color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              subTab === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RECURRENCIA ── */}
      {subTab === 'recurrencia' && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" /> Recurrencia de pacientes
            </h2>
            <BtnExport
              nombre="recurrencia_pacientes"
              headers={['Paciente', 'Visitas período', 'Tipo', 'Etiqueta', 'Primera visita', 'Última visita', 'Celular']}
              rows={analisis.filas.map(f => [
                f.nombre, f.visitasPeriodo, f.tipo, f.etiqueta, f.primeraVisita, f.ultimaVisita, f.celular,
              ])}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Visitas</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Etiqueta</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">1ª visita</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Última</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analisis.filas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                      Sin visitas atendidas en el período
                    </td>
                  </tr>
                ) : analisis.filas.map(f => (
                  <tr key={f.pacienteId} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{f.nombre}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-blue-700">{f.visitasPeriodo}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm">{f.etiqueta}</span>
                      <span className="ml-1 text-xs text-gray-400">({f.tipo})</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{f.primeraVisita}</td>
                    <td className="px-3 py-2.5 text-gray-500">{f.ultimaVisita}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{f.celular || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PERFIL DE USO ── */}
      {subTab === 'perfil' && (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard title="Top 10 por gasto" subtitle="Monto total en caja del período">
              <div className="space-y-2">
                {analisis.topGasto.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                ) : analisis.topGasto.map((p, i) => (
                  <div key={p.pacienteId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate pr-2">
                      {i + 1}. {p.nombre}
                    </span>
                    <span className="font-bold text-green-700 shrink-0">{fmt(p.montoGastado)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Top 10 por frecuencia" subtitle="Consultas atendidas en el período">
              <div className="space-y-2">
                {analisis.topFrecuencia.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                ) : analisis.topFrecuencia.map((p, i) => (
                  <div key={p.pacienteId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate pr-2">{i + 1}. {p.nombre}</span>
                    <span className="font-bold text-blue-700 shrink-0">{p.consultas} visitas</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
              <h2 className="font-bold text-gray-800">Perfil de uso por paciente</h2>
              <BtnExport
                nombre="perfil_uso_pacientes"
                headers={['Paciente', 'Consultas', 'Lab', 'Farmacia', 'Monto total', 'Celular']}
                rows={analisis.perfiles.map(p => [
                  p.nombre, p.consultas, p.labOrdenes, p.comprasFarmacia, p.montoGastado.toFixed(2), p.celular,
                ])}
              />
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Consultas</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Lab</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Farmacia</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Monto total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analisis.perfiles.map(p => (
                    <tr key={p.pacienteId} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium">{p.nombre}</td>
                      <td className="px-3 py-2.5 text-center">{p.consultas}</td>
                      <td className="px-3 py-2.5 text-center">{p.labOrdenes}</td>
                      <td className="px-3 py-2.5 text-center">{p.comprasFarmacia}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmt(p.montoGastado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TENDENCIA MENSUAL ── */}
      {subTab === 'tendencia' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-center">
              <p className="text-xs text-violet-600 font-semibold uppercase">Tasa de retención</p>
              <p className="text-3xl font-black text-violet-800 mt-1">{analisis.tasaRetencion.toFixed(1)}%</p>
              <p className="text-xs text-violet-500 mt-1">Visitas recurrentes / total visitas</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 font-semibold uppercase">Promedio visitas/paciente</p>
              <p className="text-3xl font-black text-blue-800 mt-1">{analisis.promedioVisitasPorPaciente.toFixed(1)}</p>
              <p className="text-xs text-blue-500 mt-1">En el período seleccionado</p>
            </div>
          </div>

          <ChartCard
            title="Visitas por mes"
            subtitle="Nuevos vs recurrentes"
          >
            {analisis.tendenciaMensual.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin visitas en el período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={analisis.tendenciaMensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="nuevos" name="🆕 Nuevos" stackId="a" fill="#10b981" />
                  <Bar dataKey="recurrentes" name="🔁 Recurrentes" stackId="a" fill="#6366f1" />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <BtnExport
            nombre="tendencia_visitas_mensual"
            headers={['Mes', 'Nuevos', 'Recurrentes', 'Total']}
            rows={analisis.tendenciaMensual.map(m => [m.label, m.nuevos, m.recurrentes, m.total])}
          />
        </div>
      )}

      {/* ── RE-CAPTACIÓN ── */}
      {subTab === 'recaptacion' && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b bg-gray-50">
            <div>
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-600" /> Pacientes que no regresan
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Para llamar o enviar WhatsApp</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={mesesInactivo}
                onChange={e => setMesesInactivo(Number(e.target.value) as 3 | 6)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value={3}>Sin visita ≥ 3 meses</option>
                <option value={6}>Sin visita ≥ 6 meses</option>
              </select>
              <BtnExport
                nombre={`pacientes_inactivos_${mesesInactivo}m`}
                headers={['Paciente', 'Última visita', 'Meses sin visita', 'Celular']}
                rows={inactivos.map(p => [p.nombre, p.ultimaVisita, p.mesesSinVisita, p.celular])}
              />
            </div>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Última visita</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Meses</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inactivos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-gray-400">
                      No hay pacientes inactivos por {mesesInactivo} meses o más
                    </td>
                  </tr>
                ) : inactivos.map(p => (
                  <tr key={p.pacienteId} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium">
                      <span className="mr-1">⚠️</span>{p.nombre}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{p.ultimaVisita}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                        {p.mesesSinVisita}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.celular ? (
                        <a
                          href={`https://wa.me/504${p.celular.replace(/\D/g, '').slice(-8)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-700 hover:underline text-xs"
                        >
                          <Phone className="w-3.5 h-3.5" /> {p.celular}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-gray-400 border-t">
            {inactivos.length} paciente{inactivos.length !== 1 ? 's' : ''} sin visita en {mesesInactivo}+ meses
          </p>
        </div>
      )}
    </div>
  )
}
