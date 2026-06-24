'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  FileText, Printer, Search, RefreshCw, Filter, ExternalLink,
  Pill, FileHeart, Skull, Stethoscope, Eye, X, Calendar,
} from 'lucide-react'
import ResponsiveModal from '@/components/responsive-modal'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'
import { nombrePaciente, detallePaciente, PACIENTE_CONSULTA_SELECT } from '@/lib/consultas-utils'
import type { TipoDocCorrelativo } from '@/lib/consulta-correlativo'
import {
  TIPO_DOC_CFG,
  TIPOS_DOCUMENTO,
  formatearFechaHoraDoc,
  reimprimirDocumento,
  resumenDocumento,
  textoBusquedaDocumento,
  type DocumentoHistorial,
} from '@/lib/documentos-utils'

interface SucursalOpt { id: number; nombre: string }

interface Props {
  documentosIniciales: DocumentoHistorial[]
  sucursales: SucursalOpt[]
  esSuperAdmin?: boolean
  sucursalId?: number | null
  sucursalNombre?: string | null
}

const TIPO_ICONO: Record<TipoDocCorrelativo, React.ElementType> = {
  RECETA: Pill,
  CONSTANCIA: FileHeart,
  DEFUNCION: Skull,
  REFERENCIA: Stethoscope,
}

const DOCUMENTOS_SELECT = `
  id, tipo, numero_doc, correlativo, contenido, medico_nombre,
  created_at, updated_at, sucursal_id, consulta_id, paciente_id,
  consulta:consultas(id, fecha),
  paciente:pacientes(${PACIENTE_CONSULTA_SELECT}, direccion)
`

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function DocumentosClient({
  documentosIniciales,
  sucursales,
  esSuperAdmin = false,
  sucursalId,
  sucursalNombre,
}: Props) {
  const sb = supabase()
  const [documentos, setDocumentos] = useState<DocumentoHistorial[]>(documentosIniciales)
  const [buscar, setBuscar] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoDocCorrelativo | 'todos'>('todos')
  const [filtroSucursal, setFiltroSucursal] = useState<number | 'todas'>(sucursalId ?? 'todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [docVer, setDocVer] = useState<DocumentoHistorial | null>(null)

  const mapaSucursales = useMemo(
    () => Object.fromEntries(sucursales.map(s => [s.id, s.nombre])),
    [sucursales],
  )

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const hace90 = new Date()
      hace90.setDate(hace90.getDate() - 90)
      let q = sb
        .from('consulta_documentos')
        .select(DOCUMENTOS_SELECT)
        .gte('created_at', hace90.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000)

      if (!esSuperAdmin && sucursalId) {
        q = q.eq('sucursal_id', sucursalId)
      } else if (esSuperAdmin && filtroSucursal !== 'todas') {
        q = q.eq('sucursal_id', filtroSucursal)
      }

      const { data, error } = await q
      if (error) throw error
      setDocumentos((data ?? []) as DocumentoHistorial[])
    } catch (e) {
      alert('Error al cargar documentos: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setCargando(false)
    }
  }, [sb, esSuperAdmin, sucursalId, filtroSucursal])

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return documentos.filter(d => {
      if (filtroTipo !== 'todos' && d.tipo !== filtroTipo) return false
      if (esSuperAdmin && filtroSucursal !== 'todas' && d.sucursal_id !== filtroSucursal) return false
      if (desde && d.created_at.slice(0, 10) < desde) return false
      if (hasta && d.created_at.slice(0, 10) > hasta) return false
      if (q && !textoBusquedaDocumento(d).includes(q)) return false
      return true
    })
  }, [documentos, buscar, filtroTipo, filtroSucursal, desde, hasta, esSuperAdmin])

  const kpis = useMemo(() => ({
    total: lista.length,
    recetas: lista.filter(d => d.tipo === 'RECETA').length,
    constancias: lista.filter(d => d.tipo === 'CONSTANCIA').length,
    defunciones: lista.filter(d => d.tipo === 'DEFUNCION').length,
    referencias: lista.filter(d => d.tipo === 'REFERENCIA').length,
  }), [lista])

  function limpiarFiltros() {
    setBuscar('')
    setFiltroTipo('todos')
    setDesde('')
    setHasta('')
    if (esSuperAdmin) setFiltroSucursal('todas')
  }

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Documentos Médicos"
        subtitle={
          esSuperAdmin
            ? 'Historial, auditoría y reimpresión · todas las sucursales'
            : `Historial y reimpresión · ${sucursalNombre ?? 'sucursal'}`
        }
        badge="Archivo clínico"
        icon={FileText}
        gradient="violet"
        kpis={[
          { label: 'En vista', value: kpis.total, icon: FileText },
          { label: 'Recetas', value: kpis.recetas, icon: Pill },
          { label: 'Constancias', value: kpis.constancias, icon: FileHeart },
          { label: 'Defunciones', value: kpis.defunciones, icon: Skull },
          { label: 'Referencias', value: kpis.referencias, icon: Stethoscope },
        ]}
        actions={
          <ModuleBtnGhost onClick={recargar} disabled={cargando}>
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </ModuleBtnGhost>
        }
      />

      <ModuleContent>
        <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={buscar}
                onChange={e => setBuscar(e.target.value)}
                placeholder="Buscar por paciente, código, número de documento, médico o consulta…"
                className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-violet-200 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
                title="Desde"
              />
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
                title="Hasta"
              />
              {esSuperAdmin && sucursales.length > 0 && (
                <select
                  value={filtroSucursal === 'todas' ? 'todas' : String(filtroSucursal)}
                  onChange={e => {
                    const v = e.target.value
                    setFiltroSucursal(v === 'todas' ? 'todas' : Number(v))
                  }}
                  className="border rounded-xl px-3 py-2 text-sm min-w-[140px]"
                >
                  <option value="todas">Todas las sucursales</option>
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
              {(buscar || filtroTipo !== 'todos' || desde || hasta || (esSuperAdmin && filtroSucursal !== 'todas')) && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="px-3 py-2 text-sm border rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Tipo
            </span>
            <button
              type="button"
              onClick={() => setFiltroTipo('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filtroTipo === 'todos'
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              Todos
            </button>
            {TIPOS_DOCUMENTO.map(t => {
              const cfg = TIPO_DOC_CFG[t]
              const Icon = TIPO_ICONO[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFiltroTipo(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                    filtroTipo === t
                      ? 'bg-[#003366] text-white border-[#003366]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="mt-6 text-center py-16 bg-white rounded-2xl border">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay documentos con los filtros actuales</p>
            <p className="text-sm text-gray-400 mt-1">
              Los documentos emitidos desde el examen médico aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Resumen</th>
                    <th className="px-4 py-3">Médico</th>
                    <th className="px-4 py-3">Emitido</th>
                    {esSuperAdmin && <th className="px-4 py-3">Sucursal</th>}
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lista.map(doc => {
                    const cfg = TIPO_DOC_CFG[doc.tipo]
                    const Icon = TIPO_ICONO[doc.tipo]
                    return (
                      <tr key={doc.id} className="hover:bg-violet-50/40 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                            <span className="font-mono text-xs text-[#003366] font-semibold">{doc.numero_doc}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">Consulta #{doc.consulta_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{nombrePaciente(doc.paciente ?? undefined)}</p>
                          <p className="text-xs text-gray-500">{detallePaciente(doc.paciente ?? undefined)}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{resumenDocumento(doc)}</td>
                        <td className="px-4 py-3 text-gray-600">{doc.medico_nombre || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {formatearFechaHoraDoc(doc.created_at)}
                        </td>
                        {esSuperAdmin && (
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {doc.sucursal_id ? mapaSucursales[doc.sucursal_id] ?? '—' : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setDocVer(doc)}
                              className="p-2 rounded-lg hover:bg-sky-50 text-sky-700"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => reimprimirDocumento(doc)}
                              className="p-2 rounded-lg hover:bg-violet-50 text-violet-700"
                              title="Reimprimir"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {doc.paciente_id && (
                              <Link
                                href={`/expediente/${doc.paciente_id}`}
                                className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-700"
                                title="Expediente"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {lista.map(doc => {
                const cfg = TIPO_DOC_CFG[doc.tipo]
                const Icon = TIPO_ICONO[doc.tipo]
                return (
                  <div key={doc.id} className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                        <p className="font-mono text-sm font-bold text-[#003366] mt-1">{doc.numero_doc}</p>
                      </div>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatearFechaHoraDoc(doc.created_at)}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">{nombrePaciente(doc.paciente ?? undefined)}</p>
                    <p className="text-xs text-gray-500">{detallePaciente(doc.paciente ?? undefined)}</p>
                    <p className="text-xs text-gray-600 mt-1">{resumenDocumento(doc)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {doc.medico_nombre || 'Sin médico'} · Consulta #{doc.consulta_id}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setDocVer(doc)}
                        className="flex-1 py-2 text-xs font-semibold border rounded-lg text-sky-700 bg-sky-50"
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => reimprimirDocumento(doc)}
                        className="flex-1 py-2 text-xs font-semibold border rounded-lg text-violet-700 bg-violet-50 flex items-center justify-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Reimprimir
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-gray-400 mt-4 pb-2">
          Mostrando documentos de los últimos 90 días · máximo 1 000 registros
        </p>
      </ModuleContent>

      {docVer && (
        <ResponsiveModal
          title={TIPO_DOC_CFG[docVer.tipo].label}
          subtitle={`${docVer.numero_doc} · ${nombrePaciente(docVer.paciente ?? undefined)}`}
          onClose={() => setDocVer(null)}
          size="lg"
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 w-full">
              <div className="flex gap-2">
                {docVer.paciente_id && (
                  <Link
                    href={`/expediente/${docVer.paciente_id}`}
                    className="px-3 py-2 border rounded-xl text-xs flex items-center gap-1 text-emerald-700 hover:bg-emerald-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Expediente
                  </Link>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDocVer(null)}
                  className="px-4 py-2.5 border rounded-xl text-sm"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => reimprimirDocumento(docVer)}
                  className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-semibold flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" /> Reimprimir
                </button>
              </div>
            </div>
          }
        >
          <DetalleDocumento doc={docVer} mapaSucursales={mapaSucursales} esSuperAdmin={esSuperAdmin} />
        </ResponsiveModal>
      )}
    </ModuleShell>
  )
}

function DetalleDocumento({
  doc,
  mapaSucursales,
  esSuperAdmin,
}: {
  doc: DocumentoHistorial
  mapaSucursales: Record<number, string>
  esSuperAdmin: boolean
}) {
  const c = doc.contenido
  const cfg = TIPO_DOC_CFG[doc.tipo]

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-violet-50/60 border border-violet-100">
        <div>
          <p className="text-[10px] uppercase text-gray-400">Número</p>
          <p className="font-mono font-bold text-[#003366]">{doc.numero_doc}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400">Tipo</p>
          <p className="font-medium">{cfg.label}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400">Emitido</p>
          <p>{formatearFechaHoraDoc(doc.created_at)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400">Consulta</p>
          <p>#{doc.consulta_id}{doc.consulta?.fecha ? ` · ${doc.consulta.fecha}` : ''}</p>
        </div>
        <div className="col-span-2">
          <p className="text-[10px] uppercase text-gray-400">Médico</p>
          <p>{doc.medico_nombre || '—'}</p>
        </div>
        {esSuperAdmin && doc.sucursal_id && (
          <div className="col-span-2">
            <p className="text-[10px] uppercase text-gray-400">Sucursal</p>
            <p>{mapaSucursales[doc.sucursal_id] ?? doc.sucursal_id}</p>
          </div>
        )}
      </div>

      {doc.tipo === 'RECETA' && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Medicamentos</p>
          {((c.items as { no_producto: string; indicacion?: string; cant?: number; via?: string }[]) ?? []).length === 0 ? (
            <p className="text-gray-400 italic">Sin medicamentos registrados</p>
          ) : (
            <ul className="space-y-2">
              {((c.items as { no_producto: string; indicacion?: string; cant?: number; via?: string }[]) ?? []).map((it, i) => (
                <li key={i} className="p-2 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="font-medium">{it.no_producto}</p>
                  <p className="text-xs text-gray-500">
                    Cant: {it.cant ?? 1} · Vía: {it.via ?? 'Oral'}
                    {it.indicacion ? ` · ${it.indicacion}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {!!c.tratamiento && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Tratamiento</p>
              <p className="text-gray-700 whitespace-pre-wrap">{String(c.tratamiento)}</p>
            </div>
          )}
          {Number(c.dias_reposo) > 0 && (
            <p className="text-xs text-amber-700 mt-2">Reposo: {String(c.dias_reposo)} día(s)</p>
          )}
        </div>
      )}

      {(doc.tipo === 'CONSTANCIA' || doc.tipo === 'DEFUNCION' || doc.tipo === 'REFERENCIA') && (
        <div className="space-y-3">
          {doc.tipo === 'CONSTANCIA' && c.subtitulo && (
            <p className="text-xs font-bold text-sky-800 uppercase">{String(c.subtitulo)}</p>
          )}
          {doc.tipo === 'DEFUNCION' && (
            <p className="text-xs text-gray-500">Tipo de muerte: <strong>{String(c.tipo_muerte ?? '—')}</strong></p>
          )}
          {doc.tipo === 'REFERENCIA' && c.destino && (
            <p className="text-xs text-gray-500">Destino: <strong>{String(c.destino)}</strong></p>
          )}
          {c.texto && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Contenido</p>
              <div className="p-3 rounded-xl bg-gray-50 border text-gray-800 whitespace-pre-wrap text-sm leading-relaxed max-h-64 overflow-y-auto">
                {String(c.texto)}
              </div>
            </div>
          )}
          {doc.tipo === 'DEFUNCION' && Array.isArray(c.causas) && c.causas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Causas</p>
              <ul className="list-disc list-inside text-gray-700">
                {c.causas.map((ca, i) => <li key={i}>{String(ca)}</li>)}
              </ul>
            </div>
          )}
          {doc.tipo === 'REFERENCIA' && Array.isArray(c.sospechas) && c.sospechas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sospechas diagnósticas</p>
              <ul className="list-disc list-inside text-gray-700">
                {c.sospechas.map((s, i) => <li key={i}>{String(s)}</li>)}
              </ul>
            </div>
          )}
          {c.cargo_medico && (
            <p className="text-xs text-gray-500">Cargo: {String(c.cargo_medico)}</p>
          )}
        </div>
      )}
    </div>
  )
}
