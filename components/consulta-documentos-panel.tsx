'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  FileText, FileHeart, Skull, Pill, Printer, Save, Upload,
  FolderOpen, Trash2, Lock, CheckCircle2, Image as ImageIcon, RotateCcw, ExternalLink,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { nombrePaciente, type PacienteConsulta } from '@/lib/consultas-utils'
import { formatearNombreMedico } from '@/lib/medico-utils'
import { reservarCorrelativoDocumento, type TipoDocCorrelativo } from '@/lib/consulta-correlativo'
import {
  imprimirRecetaMedica, imprimirConstanciaMedica, imprimirActaDefuncion,
  imprimirReferenciaMedica, edadPacientePrint,
  type RecetaPrintItem,
} from '@/lib/consulta-documentos-print'
import { plantillaConstancia, plantillaDefuncion, plantillaReferencia } from '@/lib/consulta-plantillas-documentos'

interface RecetaItem extends RecetaPrintItem {}

interface DocRegistro {
  id: number
  tipo: string
  numero_doc: string
  correlativo: number
  contenido: Record<string, unknown>
  updated_at?: string
}

interface ArchivoRegistro {
  id: number
  nombre: string
  categoria: string
  storage_path: string
  mime_type?: string
  tamano_bytes?: number
  nota?: string
  created_at: string
}

interface Props {
  consultaId: number
  pacienteId: number
  paciente?: PacienteConsulta & { id?: number; codigo?: string; fecha_nac?: string }
  sucursalId?: number | null
  estadoPago?: string | null
  cobrado?: boolean
  recetaItems: RecetaItem[]
  tratamiento?: string
  diasReposo?: number
  impresionDiagnostica?: string
  esSuperAdmin?: boolean
  fechaConsulta?: string
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const CATEGORIAS_ARCHIVO = ['Laboratorio', 'Radiografía', 'Ultrasonido', 'Tomografía', 'Otro']

export default function ConsultaDocumentosPanel({
  consultaId, pacienteId, paciente, sucursalId,
  estadoPago, cobrado, recetaItems, tratamiento, diasReposo, impresionDiagnostica,
  esSuperAdmin = false,
  fechaConsulta,
}: Props) {
  const sb = supabase()
  const [subTab, setSubTab] = useState<'documentos' | 'archivos'>('documentos')
  const [docs, setDocs] = useState<DocRegistro[]>([])
  const [archivos, setArchivos] = useState<ArchivoRegistro[]>([])
  const [pacienteExtra, setPacienteExtra] = useState<{ direccion?: string }>({})
  const [medicoNombre, setMedicoNombre] = useState('')
  const [medicoRegistro, setMedicoRegistro] = useState('')
  const [textoConstancia, setTextoConstancia] = useState('')
  const [subtituloConstancia, setSubtituloConstancia] = useState('INCAPACIDAD')
  const [cargoMedico, setCargoMedico] = useState('Médico General')
  const [textoDefuncion, setTextoDefuncion] = useState('')
  const [tipoMuerte, setTipoMuerte] = useState('NATURAL')
  const [causasDefuncion, setCausasDefuncion] = useState('')
  const [cargoDefuncion, setCargoDefuncion] = useState('Médico General')
  const [textoReferencia, setTextoReferencia] = useState('')
  const [destinoReferencia, setDestinoReferencia] = useState('')
  const [sospechasReferencia, setSospechasReferencia] = useState('')
  const [cargoReferencia, setCargoReferencia] = useState('Médico General')
  const [notaArchivo, setNotaArchivo] = useState('')
  const [catArchivo, setCatArchivo] = useState('Laboratorio')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const estaPagada = estadoPago === 'PAGADO' || cobrado === true
  const puedeConstanciaDefuncion = estaPagada || esSuperAdmin

  const cargar = useCallback(async () => {
    const [{ data: d }, { data: a }] = await Promise.all([
      sb.from('consulta_documentos').select('id,tipo,numero_doc,correlativo,contenido,updated_at')
        .eq('consulta_id', consultaId).order('created_at', { ascending: false }),
      sb.from('consulta_archivos').select('*')
        .eq('consulta_id', consultaId).order('created_at', { ascending: false }),
    ])
    setDocs((d ?? []) as DocRegistro[])
    setArchivos((a ?? []) as ArchivoRegistro[])

    const cm = (d ?? []).find(x => x.tipo === 'CONSTANCIA')
    const cd = (d ?? []).find(x => x.tipo === 'DEFUNCION')
    const cr = (d ?? []).find(x => x.tipo === 'REFERENCIA')
    if (cm?.contenido) {
      const c = cm.contenido as { texto?: string; subtitulo?: string; cargo_medico?: string }
      setTextoConstancia(String(c.texto ?? ''))
      if (c.subtitulo) setSubtituloConstancia(c.subtitulo)
      if (c.cargo_medico) setCargoMedico(c.cargo_medico)
    } else {
      setTextoConstancia('')
    }
    if (cd?.contenido) {
      const c = cd.contenido as { texto?: string; tipo_muerte?: string; causas?: string[]; cargo_medico?: string }
      setTextoDefuncion(String(c.texto ?? ''))
      if (c.tipo_muerte) setTipoMuerte(c.tipo_muerte)
      if (Array.isArray(c.causas)) setCausasDefuncion(c.causas.join('\n'))
      if (c.cargo_medico) setCargoDefuncion(c.cargo_medico)
    } else {
      setTextoDefuncion('')
    }
    if (cr?.contenido) {
      const c = cr.contenido as { texto?: string; destino?: string; sospechas?: string[]; cargo_medico?: string }
      setTextoReferencia(String(c.texto ?? ''))
      if (c.destino) setDestinoReferencia(c.destino)
      if (Array.isArray(c.sospechas)) setSospechasReferencia(c.sospechas.join('\n'))
      if (c.cargo_medico) setCargoReferencia(c.cargo_medico)
    } else {
      setTextoReferencia('')
    }
  }, [sb, consultaId])

  const pacienteCompleto = paciente
    ? { ...paciente, direccion: pacienteExtra.direccion ?? (paciente as { direccion?: string }).direccion }
    : undefined

  const ctxPlantilla = {
    paciente: pacienteCompleto,
    medicoNombre,
    impresionDiagnostica,
    fecha: fechaConsulta,
  }

  useEffect(() => {
    if (docs.some(d => d.tipo === 'CONSTANCIA')) return
    setTextoConstancia(plantillaConstancia(ctxPlantilla))
  }, [docs, consultaId, pacienteCompleto, medicoNombre, impresionDiagnostica, fechaConsulta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (docs.some(d => d.tipo === 'DEFUNCION')) return
    setTextoDefuncion(plantillaDefuncion(ctxPlantilla))
  }, [docs, consultaId, pacienteCompleto, medicoNombre, impresionDiagnostica, fechaConsulta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (docs.some(d => d.tipo === 'REFERENCIA')) return
    setTextoReferencia(plantillaReferencia(ctxPlantilla))
  }, [docs, consultaId, pacienteCompleto, medicoNombre, impresionDiagnostica, fechaConsulta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargar()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: p } = await sb.from('perfiles').select('nombre,apellido,genero')
        .eq('id', user.id).maybeSingle()
      if (p) {
        setMedicoNombre(formatearNombreMedico(p.nombre, p.apellido, p.genero))
      }
    })
    if (pacienteId) {
      sb.from('pacientes').select('direccion').eq('id', pacienteId).maybeSingle()
        .then(({ data }) => { if (data?.direccion) setPacienteExtra({ direccion: data.direccion }) })
    }
  }, [cargar, sb, pacienteId])

  const pacNombre = nombrePaciente(paciente)
  const pacCodigo = paciente?.codigo ?? ''
  const pacEdad = edadPacientePrint(paciente?.fecha_nac)
  const fechaHoy = new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })

  async function registrarDocumento(
    tipo: TipoDocCorrelativo,
    contenido: Record<string, unknown>,
    reutilizarId?: number,
  ): Promise<DocRegistro | null> {
    if (!sucursalId) {
      alert('La consulta no tiene sucursal asignada.')
      return null
    }
    setGuardando(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (reutilizarId) {
        const { data, error } = await sb.from('consulta_documentos').update({
          contenido, medico_nombre: medicoNombre, updated_at: new Date().toISOString(),
        }).eq('id', reutilizarId).select().single()
        if (error) throw error
        await cargar()
        return data as DocRegistro
      }

      const { correlativo, numero_doc } = await reservarCorrelativoDocumento(sb, sucursalId, tipo)
      const { data, error } = await sb.from('consulta_documentos').insert({
        consulta_id: consultaId,
        paciente_id: pacienteId,
        sucursal_id: sucursalId,
        tipo,
        correlativo,
        numero_doc,
        contenido,
        medico_id: user?.id ?? null,
        medico_nombre: medicoNombre,
      }).select().single()
      if (error) throw error
      await cargar()
      return data as DocRegistro
    } catch (e) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string }
      const detalle = err?.message || err?.details || err?.hint || (typeof e === 'string' ? e : JSON.stringify(e))
      const esTipoNoPermitido = /tipo_check|check constraint/i.test(detalle)
      alert(
        'Error al registrar documento: ' + detalle +
        (esTipoNoPermitido
          ? '\n\nLa base de datos aún no acepta este tipo de documento. Aplique la migración 070_referencia_medica.sql en Supabase.'
          : ''),
      )
      return null
    } finally {
      setGuardando(false)
    }
  }

  const printBase = typeof window !== 'undefined' ? window.location.origin : ''

  async function imprimirReceta() {
    const existentes = docs.filter(d => d.tipo === 'RECETA')
    let doc = existentes[0]
    if (!doc) {
      doc = await registrarDocumento('RECETA', {
        items: recetaItems,
        tratamiento: tratamiento ?? '',
        dias_reposo: diasReposo ?? 0,
      }) ?? undefined
    }
    if (!doc) return
    imprimirRecetaMedica({
      numero_doc: doc.numero_doc,
      fecha: fechaHoy,
      paciente_nombre: pacNombre,
      paciente_codigo: pacCodigo,
      paciente_edad: pacEdad,
      medico_nombre: medicoNombre,
      items: recetaItems,
      tratamiento,
      dias_reposo: diasReposo,
      baseUrl: printBase,
    })
  }

  async function nuevaReceta() {
    const doc = await registrarDocumento('RECETA', {
      items: recetaItems,
      tratamiento: tratamiento ?? '',
      dias_reposo: diasReposo ?? 0,
    })
    if (!doc) return
    imprimirRecetaMedica({
      numero_doc: doc.numero_doc,
      fecha: fechaHoy,
      paciente_nombre: pacNombre,
      paciente_codigo: pacCodigo,
      paciente_edad: pacEdad,
      medico_nombre: medicoNombre,
      items: recetaItems,
      tratamiento,
      dias_reposo: diasReposo,
      baseUrl: printBase,
    })
  }

  async function guardarEImprimirConstancia() {
    if (!textoConstancia.trim()) { alert('Escriba el texto de la constancia.'); return }
    const prev = docs.find(d => d.tipo === 'CONSTANCIA')
    const doc = await registrarDocumento('CONSTANCIA', {
      texto: textoConstancia,
      subtitulo: subtituloConstancia,
      cargo_medico: cargoMedico,
    }, prev?.id)
    if (!doc) return
    imprimirConstanciaMedica({
      numero_doc: doc.numero_doc,
      fecha: fechaHoy,
      paciente_nombre: pacNombre,
      paciente_codigo: pacCodigo,
      paciente_edad: pacEdad,
      medico_nombre: medicoNombre,
      medico_registro: medicoRegistro,
      texto: textoConstancia,
      subtitulo: subtituloConstancia,
      cargo_medico: cargoMedico,
      baseUrl: printBase,
    })
  }

  async function guardarEImprimirDefuncion() {
    if (!textoDefuncion.trim()) { alert('Escriba el motivo o narrativa de defunción.'); return }
    const causasArr = causasDefuncion.split('\n').map(c => c.trim()).filter(Boolean)
    const prev = docs.find(d => d.tipo === 'DEFUNCION')
    const doc = await registrarDocumento('DEFUNCION', {
      texto: textoDefuncion,
      tipo_muerte: tipoMuerte,
      causas: causasArr,
      cargo_medico: cargoDefuncion,
    }, prev?.id)
    if (!doc) return
    imprimirActaDefuncion({
      numero_doc: doc.numero_doc,
      fecha: fechaHoy,
      paciente_nombre: pacNombre,
      paciente_codigo: pacCodigo,
      paciente_edad: pacEdad,
      paciente_fecha_nac: paciente?.fecha_nac,
      paciente_direccion: pacienteCompleto?.direccion,
      medico_nombre: medicoNombre,
      texto: textoDefuncion,
      tipo_muerte: tipoMuerte,
      causas: causasArr,
      cargo_medico: cargoDefuncion,
      baseUrl: printBase,
    })
  }

  async function guardarEImprimirReferencia() {
    if (!textoReferencia.trim()) { alert('Escriba la narrativa de la referencia médica.'); return }
    if (!destinoReferencia.trim()) { alert('Indique el hospital o especialidad de destino.'); return }
    const sospechasArr = sospechasReferencia.split('\n').map(s => s.trim()).filter(Boolean)
    const prev = docs.find(d => d.tipo === 'REFERENCIA')
    const doc = await registrarDocumento('REFERENCIA', {
      texto: textoReferencia,
      destino: destinoReferencia,
      sospechas: sospechasArr,
      cargo_medico: cargoReferencia,
    }, prev?.id)
    if (!doc) return
    imprimirReferenciaMedica({
      numero_doc: doc.numero_doc,
      fecha: fechaHoy,
      paciente_nombre: pacNombre,
      paciente_codigo: pacCodigo,
      paciente_edad: pacEdad,
      paciente_fecha_nac: paciente?.fecha_nac,
      medico_nombre: medicoNombre,
      texto: textoReferencia,
      destino: destinoReferencia,
      sospechas: sospechasArr,
      cargo_medico: cargoReferencia,
      baseUrl: printBase,
    })
  }

  async function subirArchivo(file: File) {
    if (!file) return
    setSubiendo(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${pacienteId}/${consultaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await sb.storage.from('consulta-archivos').upload(path, file, {
        cacheControl: '3600', upsert: false,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await sb.from('consulta_archivos').insert({
        consulta_id: consultaId,
        paciente_id: pacienteId,
        nombre: file.name,
        categoria: catArchivo,
        storage_path: path,
        mime_type: file.type,
        tamano_bytes: file.size,
        nota: notaArchivo.trim() || null,
        subido_por: user?.id ?? null,
      })
      if (dbErr) throw dbErr
      setNotaArchivo('')
      await cargar()
    } catch (e) {
      alert('Error al subir: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setSubiendo(false)
    }
  }

  async function eliminarArchivo(a: ArchivoRegistro) {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return
    await sb.storage.from('consulta-archivos').remove([a.storage_path])
    await sb.from('consulta_archivos').delete().eq('id', a.id)
    await cargar()
  }

  async function abrirArchivo(a: ArchivoRegistro) {
    const { data } = await sb.storage.from('consulta-archivos').createSignedUrl(a.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const recetasEmitidas = docs.filter(d => d.tipo === 'RECETA')
  const docReferencia = docs.find(d => d.tipo === 'REFERENCIA')
  const docConstancia = docs.find(d => d.tipo === 'CONSTANCIA')
  const docDefuncion = docs.find(d => d.tipo === 'DEFUNCION')

  return (
    <div className="border-t pt-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5" style={{ color: BRAND.navy }} />
        <p className="text-sm font-bold text-gray-800">Documentos clínicos y exámenes</p>
      </div>

      <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-xl w-fit">
        {(['documentos', 'archivos'] as const).map(t => (
          <button key={t} type="button" onClick={() => setSubTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              subTab === t ? 'bg-white shadow text-[#003366]' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t === 'documentos' ? 'Recetas y constancias' : `Exámenes (${archivos.length})`}
          </button>
        ))}
      </div>

      {subTab === 'documentos' && (
        <div className="space-y-4">
          {/* RECETA — siempre disponible */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-purple-900">Receta médica</span>
                <span className="text-[10px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-bold">Sin restricción de pago</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={imprimirReceta} disabled={guardando}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                  <Printer className="w-3.5 h-3.5" /> {recetasEmitidas.length ? 'Reimprimir' : 'Generar e imprimir'}
                </button>
                {recetasEmitidas.length > 0 && (
                  <button type="button" onClick={nuevaReceta} disabled={guardando}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-300 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-100">
                  <Printer className="w-3.5 h-3.5" /> Nueva receta (otro correlativo)
                  </button>
                )}
              </div>
            </div>
            {recetasEmitidas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {recetasEmitidas.map(r => (
                  <span key={r.id} className="text-xs font-mono bg-white border border-purple-100 px-2 py-1 rounded-lg text-purple-800">
                    {r.numero_doc}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-purple-700/80 mt-2">
              {recetaItems.length} medicamento(s) · media carta horizontal · correlativo al imprimir
            </p>
          </div>

          {/* REFERENCIA MÉDICA — siempre disponible */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="w-4 h-4 text-sky-600" />
              <span className="font-semibold text-sky-900">Referencia médica</span>
              {docReferencia && (
                <span className="text-[10px] font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded">{docReferencia.numero_doc}</span>
              )}
              <span className="text-[10px] bg-sky-200 text-sky-800 px-2 py-0.5 rounded-full font-bold ml-auto">Sin restricción de pago</span>
            </div>
            <p className="text-[11px] text-sky-700/80 mb-2">
              Para pacientes que requieren valoración hospitalaria o especializada.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-sky-800">Destino (hospital / especialidad)</label>
                <input
                  value={destinoReferencia}
                  onChange={e => setDestinoReferencia(e.target.value)}
                  placeholder="Hospital Escuela Universitario / Cardiología"
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-sky-300 outline-none bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-sky-800">Cargo del médico</label>
                <input
                  value={cargoReferencia}
                  onChange={e => setCargoReferencia(e.target.value)}
                  placeholder="Médico General"
                  className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-sky-300 outline-none bg-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-sky-700/80">Use <b>**texto**</b> para resaltar en negrita.</span>
              <button type="button" onClick={() => setTextoReferencia(plantillaReferencia(ctxPlantilla))}
                className="flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 font-medium">
                <RotateCcw className="w-3 h-3" /> Restaurar plantilla
              </button>
            </div>
            <textarea
              value={textoReferencia}
              onChange={e => setTextoReferencia(e.target.value)}
              rows={8}
              placeholder="Antecedentes, hallazgos clínicos, signos vitales y motivo de referencia..."
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-sky-300 outline-none bg-white font-[inherit] leading-relaxed"
            />
            <div className="mt-2">
              <label className="text-[11px] font-medium text-sky-800">Sospecha diagnóstica (una por línea)</label>
              <textarea
                value={sospechasReferencia}
                onChange={e => setSospechasReferencia(e.target.value)}
                rows={4}
                placeholder={'Fibrilación auricular\nNeuropatía periférica'}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 focus:ring-2 focus:ring-sky-300 outline-none bg-white leading-relaxed"
              />
            </div>
            <button type="button" onClick={guardarEImprimirReferencia} disabled={guardando}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              {docReferencia ? 'Actualizar e imprimir' : 'Generar e imprimir'}
            </button>
          </div>

          {/* CONSTANCIA — pagada o super administrador */}
          <div className={`rounded-xl border p-4 ${puedeConstanciaDefuncion ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50 opacity-90'}`}>
            <div className="flex items-center gap-2 mb-2">
              <FileHeart className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-emerald-900">Constancia médica</span>
              {docConstancia && (
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{docConstancia.numero_doc}</span>
              )}
              {!puedeConstanciaDefuncion && <Lock className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
            </div>
            {!puedeConstanciaDefuncion ? (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Disponible cuando el paciente haya pagado en caja.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  <div>
                    <label className="text-[11px] font-medium text-emerald-800">Tipo de constancia (subtítulo)</label>
                    <input
                      value={subtituloConstancia}
                      onChange={e => setSubtituloConstancia(e.target.value)}
                      placeholder="INCAPACIDAD"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-emerald-300 outline-none bg-white uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-emerald-800">Cargo del médico</label>
                    <input
                      value={cargoMedico}
                      onChange={e => setCargoMedico(e.target.value)}
                      placeholder="Médico General"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-emerald-300 outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-emerald-700/80">Use <b>**texto**</b> para resaltar en negrita.</span>
                  <button type="button" onClick={() => setTextoConstancia(plantillaConstancia(ctxPlantilla))}
                    className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 font-medium">
                    <RotateCcw className="w-3 h-3" /> Restaurar plantilla
                  </button>
                </div>
                <textarea
                  value={textoConstancia}
                  onChange={e => setTextoConstancia(e.target.value)}
                  rows={10}
                  placeholder="Historia clínica, diagnóstico, días de incapacidad y fechas de reposo..."
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-emerald-300 outline-none bg-white font-[inherit] leading-relaxed"
                />
                <button type="button" onClick={guardarEImprimirConstancia} disabled={guardando}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" />
                  {docConstancia ? 'Actualizar e imprimir' : 'Generar e imprimir'}
                </button>
              </>
            )}
          </div>

          {/* DEFUNCIÓN — pagada o super administrador */}
          <div className={`rounded-xl border p-4 ${puedeConstanciaDefuncion ? 'border-slate-300 bg-slate-50' : 'border-gray-200 bg-gray-50 opacity-90'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Skull className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-slate-800">Acta / constancia de defunción</span>
              {docDefuncion && (
                <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded">{docDefuncion.numero_doc}</span>
              )}
              {!puedeConstanciaDefuncion && <Lock className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
            </div>
            {!puedeConstanciaDefuncion ? (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Disponible cuando el paciente haya pagado en caja.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-slate-500">Datos del paciente se completan automáticamente. Use <b>**texto**</b> para negrita.</span>
                  <button type="button" onClick={() => setTextoDefuncion(plantillaDefuncion(ctxPlantilla))}
                    className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 font-medium">
                    <RotateCcw className="w-3 h-3" /> Restaurar plantilla
                  </button>
                </div>
                <textarea
                  value={textoDefuncion}
                  onChange={e => setTextoDefuncion(e.target.value)}
                  rows={8}
                  placeholder="Narrativa médica del deceso: antecedentes, hallazgos, signos vitales, hora y lugar de muerte..."
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-slate-300 outline-none bg-white font-[inherit] leading-relaxed"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-700">Tipo de muerte</label>
                    <input
                      value={tipoMuerte}
                      onChange={e => setTipoMuerte(e.target.value)}
                      placeholder="NATURAL"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-slate-300 outline-none bg-white uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700">Cargo del médico</label>
                    <input
                      value={cargoDefuncion}
                      onChange={e => setCargoDefuncion(e.target.value)}
                      placeholder="Médico General"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-slate-300 outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-[11px] font-medium text-slate-700">Causas de fallecimiento (una por línea)</label>
                  <textarea
                    value={causasDefuncion}
                    onChange={e => setCausasDefuncion(e.target.value)}
                    rows={5}
                    placeholder={'Paro cardiorespiratorio secundario\nInfarto agudo de miocardio\nInsuficiencia cardiaca congestiva'}
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 focus:ring-2 focus:ring-slate-300 outline-none bg-white leading-relaxed"
                  />
                </div>
                <button type="button" onClick={guardarEImprimirDefuncion} disabled={guardando}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" />
                  {docDefuncion ? 'Actualizar e imprimir' : 'Generar e imprimir'}
                </button>
              </>
            )}
          </div>

          {estaPagada && (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Consulta pagada — puede modificar constancia y acta de defunción cuantas veces necesite.
            </p>
          )}
          {esSuperAdmin && !estaPagada && (
            <p className="text-xs text-amber-800 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Super administrador: acceso a constancia y acta de defunción aunque la consulta no esté cobrada.
            </p>
          )}
        </div>
      )}

      {subTab === 'archivos' && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-sky-200 bg-sky-50/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="w-4 h-4 text-sky-600" />
              <span className="font-semibold text-sky-900 text-sm">Subir examen o resultado</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-600">Categoría</label>
                <select value={catArchivo} onChange={e => setCatArchivo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 bg-white">
                  {CATEGORIAS_ARCHIVO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Nota (opcional)</label>
                <input value={notaArchivo} onChange={e => setNotaArchivo(e.target.value)}
                  placeholder="Ej: Hemograma del 08/06/2026"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-0.5 bg-white" />
              </div>
            </div>
            <label className="flex flex-col items-center justify-center gap-2 py-6 border border-sky-200 rounded-xl bg-white cursor-pointer hover:bg-sky-50/80 transition">
              <ImageIcon className="w-8 h-8 text-sky-400" />
              <span className="text-sm text-gray-600">{subiendo ? 'Subiendo...' : 'PDF, JPG, PNG — clic para seleccionar'}</span>
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                disabled={subiendo}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirArchivo(f); e.target.value = '' }} />
            </label>
          </div>

          {archivos.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Sin archivos adjuntos en esta consulta</p>
          ) : (
            <div className="space-y-2">
              {archivos.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-white border rounded-xl px-3 py-2.5 hover:border-sky-200 transition">
                  <FolderOpen className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.nombre}</p>
                    <p className="text-[11px] text-gray-500">
                      {a.categoria}{a.nota ? ` · ${a.nota}` : ''}
                      {a.tamano_bytes ? ` · ${(a.tamano_bytes / 1024).toFixed(0)} KB` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => abrirArchivo(a)}
                    className="text-xs text-[#003366] hover:underline font-medium">Ver</button>
                  <button type="button" onClick={() => eliminarArchivo(a)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
