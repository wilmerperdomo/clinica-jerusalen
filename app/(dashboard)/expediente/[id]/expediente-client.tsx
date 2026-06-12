'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Activity, FlaskConical, Printer,
  ChevronDown, ChevronUp, Pill,
  Heart, Stethoscope, FileText, Search, AlertTriangle, Megaphone, MessageCircle,
  ClipboardList, UserRound, ExternalLink,
} from 'lucide-react'
import { etiquetaEstadoLab, claseBadgeEstadoLab, inferirEstadoLab } from '@/lib/lab-estado-utils'
import { imprimirResultadoLaboratorio, linkWhatsAppResultado } from '@/lib/lab-resultado-print'
import { imprimirRecetaMedica, edadPacientePrint } from '@/lib/consulta-documentos-print'
import { imprimirExpedienteClinico } from '@/lib/expediente-print'
import ContactoPacienteButtons from '@/components/contacto-paciente-buttons'
import { BRAND } from '@/lib/brand'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'
import { linkWhatsAppMensaje, linkEmailMensaje, mensajePublicidad, nombrePaciente } from '@/lib/mensajes-paciente'

/* ── Tipos ─────────────────────────────────────────────────────── */
interface Paciente {
  id: number; codigo: string
  nombre: string; apellido1: string; apellido2?: string
  fecha_nac?: string; genero?: string; correo?: string
  celular?: string; telefono?: string; direccion?: string; colonia_nombre?: string
  responsable?: string; telefono_responsable?: string
  tipo_sangre?: string; alergias?: string
  foto_url?: string; activo: boolean
}
interface DetalleMed {
  id: number; no_producto: string; indicacion?: string; cant?: number; via?: string
}
interface Consulta {
  id: number; fecha: string; hora: string; estado: string
  tipo_nombre?: string; doctor?: string
  presion?: string; temperatura?: string; peso?: string
  talla?: string; frecuencia?: string; perim_cefalico?: string; pulso?: string
  cabeza?: string; cuello?: string; ojos?: string; orl?: string
  pulmonar?: string; abdomen?: string; genito?: string
  extremidades?: string; sistema?: string; oste?: string; piel?: string
  sintoma?: string; historia?: string; impresion?: string; tratamiento?: string
  estudios_complementarios?: string; dias_reposo?: number; nota?: string
  consulta_detalle?: DetalleMed[]
}
interface LabResultado {
  valor_resultado?: string; unidad?: string; rango_texto?: string
  observacion?: string; anormal?: boolean; fecha?: string
}
interface Analisis {
  id: number; id_consulta?: string; no_analisis: string
  fecha?: string; fecha_resultado?: string
  estado_lab?: string; pagado?: boolean; entregado?: boolean
  resultado_resumen?: string
  resultados?: LabResultado[]
}

interface Antecedentes {
  personal?: string | null
  alergias?: string | null
  familiares?: string | null
  hospitalario?: string | null
}

interface Props {
  paciente: Paciente
  antecedentes: Antecedentes | null
  consultas: Consulta[]
  analisis:  Analisis[]
}

/* ── Helpers ────────────────────────────────────────────────────── */
function calcEdad(fecha?: string) {
  if (!fecha) return ''
  const diff = Date.now() - new Date(fecha + 'T00:00:00').getTime()
  const años = Math.floor(diff / (365.25 * 24 * 3600 * 1000))
  return `${años} años`
}
function fmtDate(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('es-HN', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}
function fmtDateTime(d: string, h?: string) {
  const fecha = new Date(d + 'T00:00:00').toLocaleDateString('es-HN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  })
  return h ? `${fecha} — ${h.slice(0,5)}` : fecha
}

function NLBadge({ val }: { val?: string }) {
  if (!val) return <span className="text-gray-300">—</span>
  const color = val === 'NL' ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{val}</span>
}

function imprimirReceta(paciente: Paciente, consulta: Consulta) {
  const nombrePac = `${paciente.nombre} ${paciente.apellido1} ${paciente.apellido2 ?? ''}`.trim()
  imprimirRecetaMedica({
    numero_doc: String(consulta.id),
    fecha: fmtDate(consulta.fecha),
    paciente_nombre: nombrePac,
    paciente_codigo: paciente.codigo,
    paciente_edad: edadPacientePrint(paciente.fecha_nac),
    medico_nombre: consulta.doctor,
    items: (consulta.consulta_detalle ?? []).map(m => ({
      no_producto: m.no_producto,
      indicacion: m.indicacion,
      cant: m.cant,
      via: m.via,
    })),
    tratamiento: consulta.tratamiento,
    dias_reposo: Number(consulta.dias_reposo) > 0 ? Number(consulta.dias_reposo) : undefined,
  })
}

function BotonPublicidad({ paciente, compacto }: { paciente: Paciente; compacto?: boolean }) {
  const nombre = nombrePaciente(paciente)
  const msg = mensajePublicidad(nombre)
  const wa = linkWhatsAppMensaje(paciente.celular, paciente.telefono, msg)
  const mail = linkEmailMensaje(paciente.correo, `Promociones — ${BRAND.nombre}`, msg)

  if (compacto) {
    return wa ? (
      <a href={wa} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition min-h-[44px] sm:min-h-0">
        <Megaphone className="w-3.5 h-3.5" /> Enviar Publicidad
      </a>
    ) : (
      <button type="button" disabled
        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-400 min-h-[44px] sm:min-h-0 cursor-not-allowed">
        <Megaphone className="w-3.5 h-3.5" /> Sin teléfono
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 sm:p-4">
      <p className="text-sm font-bold text-violet-900 flex items-center gap-2 mb-2">
        <Megaphone className="w-4 h-4" /> Enviar Publicidad
      </p>
      <p className="text-xs text-violet-800 mb-3">Promociones y servicios del mes a {nombre}</p>
      <ContactoPacienteButtons
        celular={paciente.celular}
        telefono={paciente.telefono}
        correo={paciente.correo}
        mensajeWhatsApp={msg}
        asuntoEmail={`Promociones — ${BRAND.nombre}`}
        cuerpoEmail={msg}
        labelWa="WhatsApp — Publicidad"
        labelEmail="Correo — Publicidad"
      />
      {!wa && !mail && (
        <p className="text-xs text-amber-700 mt-2">Registre teléfono o correo del paciente para enviar promociones.</p>
      )}
    </div>
  )
}

/* ── Tarjeta de consulta expandible ─────────────────────────────── */
function ConsultaCard({ consulta, paciente }: { consulta: Consulta; paciente: Paciente }) {
  const [abierta, setAbierta] = useState(false)
  const meds = consulta.consulta_detalle ?? []
  const tieneDatos = consulta.sintoma || consulta.impresion || consulta.tratamiento || meds.length > 0
  const examFisico = [
    { label: 'Cabeza', val: consulta.cabeza },
    { label: 'Cuello', val: consulta.cuello },
    { label: 'Ojos', val: consulta.ojos },
    { label: 'ORL', val: consulta.orl },
    { label: 'C. Pulmonar', val: consulta.pulmonar },
    { label: 'Abdomen', val: consulta.abdomen },
    { label: 'Génito-urinario', val: consulta.genito },
    { label: 'Extremidades', val: consulta.extremidades },
    { label: 'S.N.C.', val: consulta.sistema },
    { label: 'Osteomuscular', val: consulta.oste },
    { label: 'Piel y faneras', val: consulta.piel },
  ]

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Cabecera clickable */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
        onClick={() => setAbierta(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{fmtDateTime(consulta.fecha, consulta.hora)}</p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {consulta.tipo_nombre && (
                <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{consulta.tipo_nombre}</span>
              )}
              {consulta.doctor && (
                <span className="text-xs text-slate-500">Dr(a). {consulta.doctor}</span>
              )}
              {consulta.impresion && (
                <span className="text-xs text-gray-600 truncate max-w-[250px]">{consulta.impresion}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Signos resumen */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
            {consulta.presion      && <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400"/>{consulta.presion}</span>}
            {consulta.temperatura  && <span>🌡 {consulta.temperatura}°C</span>}
            {consulta.peso         && <span>⚖ {consulta.peso} kg</span>}
          </div>
          {meds.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Pill className="w-3 h-3" />{meds.length}
            </span>
          )}
          {abierta ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Detalle expandido */}
      {abierta && (
        <div className="border-t bg-gray-50 p-4 space-y-4">

          {/* Signos vitales */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Activity className="w-3.5 h-3.5"/>Signos Vitales</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Presión', val: consulta.presion,      unit: 'mmHg' },
                { label: 'Temp.',   val: consulta.temperatura,  unit: '°C'   },
                { label: 'Peso',    val: consulta.peso,         unit: 'kg'   },
                { label: 'Talla',   val: consulta.talla,        unit: 'cm'   },
                { label: 'F.C.',    val: consulta.frecuencia,   unit: 'lpm'  },
                { label: 'Pulso',   val: consulta.pulso,        unit: 'bpm'  },
                { label: 'P. Cef.', val: consulta.perim_cefalico, unit: 'cm' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg px-3 py-2 border text-center">
                  <p className="text-[10px] text-gray-400 uppercase">{s.label}</p>
                  <p className="text-sm font-bold text-gray-800">{s.val ? `${s.val} ${s.unit}` : <span className="text-gray-300">—</span>}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Examen físico */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Examen Físico</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
              {examFisico.map(e => (
                <div key={e.label} className="flex items-center justify-between border-b py-1">
                  <span className="text-gray-500 text-xs">{e.label}</span>
                  <NLBadge val={e.val} />
                </div>
              ))}
            </div>
          </div>

          {/* Notas clínicas */}
          {tieneDatos && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {consulta.sintoma && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Síntoma Principal</p>
                  <p className="text-sm text-gray-800">{consulta.sintoma}</p>
                </div>
              )}
              {consulta.historia && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Historia</p>
                  <p className="text-sm text-gray-800">{consulta.historia}</p>
                </div>
              )}
              {consulta.impresion && (
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-400 uppercase font-semibold mb-1">Impresión Diagnóstica</p>
                  <p className="text-sm text-gray-800 font-medium">{consulta.impresion}</p>
                </div>
              )}
              {consulta.tratamiento && (
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-xs text-green-500 uppercase font-semibold mb-1">Tratamiento</p>
                  <p className="text-sm text-gray-800">{consulta.tratamiento}</p>
                </div>
              )}
              {consulta.estudios_complementarios && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Estudios Complementarios</p>
                  <p className="text-sm text-gray-800">{consulta.estudios_complementarios}</p>
                </div>
              )}
              {consulta.nota && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Observaciones</p>
                  <p className="text-sm text-gray-800">{consulta.nota}</p>
                </div>
              )}
              {Number(consulta.dias_reposo) > 0 && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 uppercase font-semibold mb-1">Días de Reposo</p>
                  <p className="text-sm font-bold text-amber-800">{consulta.dias_reposo} días</p>
                </div>
              )}
            </div>
          )}

          {/* Medicamentos prescritos */}
          {meds.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Pill className="w-3.5 h-3.5 text-purple-500"/>Medicamentos Prescritos
              </p>
              <div className="space-y-2">
                {meds.map(m => (
                  <div key={m.id} className="bg-white border rounded-lg px-3 py-2.5 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Pill className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900">{m.no_producto}</p>
                      <div className="flex flex-wrap gap-3 mt-0.5">
                        {m.cant   && <span className="text-xs text-gray-500">Cant: <b>{m.cant}</b></span>}
                        {m.via    && <span className="text-xs text-gray-500">Vía: <b>{m.via}</b></span>}
                        {m.indicacion && <span className="text-xs text-gray-500">{m.indicacion}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
            <Link
              href="/consultas"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-xs font-semibold border rounded-lg hover:bg-gray-100 transition min-h-[44px] sm:min-h-0"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Módulo consultas
            </Link>
            <button
              onClick={() => imprimirReceta(paciente, consulta)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-xs font-semibold border border-[#003366]/20 text-[#003366] rounded-lg hover:bg-[#003366]/5 transition min-h-[44px] sm:min-h-0"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir receta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════ */
function BloqueAntecedente({ titulo, texto }: { titulo: string; texto?: string | null }) {
  if (!texto?.trim()) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{titulo}</p>
        <p className="text-sm text-slate-400 italic mt-1">Sin registro</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-bold text-[#003366] uppercase tracking-wide">{titulo}</p>
      <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap leading-relaxed">{texto}</p>
    </div>
  )
}

export default function ExpedienteClient({ paciente, antecedentes, consultas, analisis }: Props) {
  const [tab, setTab]         = useState<'resumen'|'historial'|'laboratorio'>('resumen')
  const [buscar, setBuscar]   = useState('')
  const [fechaI, setFechaI]   = useState('')
  const [fechaF, setFechaF]   = useState('')

  const nombreCompleto = `${paciente.nombre} ${paciente.apellido1} ${paciente.apellido2 ?? ''}`.trim()
  const iniciales = `${paciente.nombre[0]}${paciente.apellido1[0]}`.toUpperCase()
  const edad = calcEdad(paciente.fecha_nac)
  const ultimaConsulta = consultas[0] ?? null
  const alergiasTexto = antecedentes?.alergias || paciente.alergias

  /* filtrar consultas */
  const consultasFilt = useMemo(() => {
    return consultas.filter(c => {
      const q = buscar.toLowerCase()
      const matchQ = !q || [c.impresion, c.sintoma, c.tratamiento, c.tipo_nombre]
        .some(v => v?.toLowerCase().includes(q))
      const matchFI = !fechaI || c.fecha >= fechaI
      const matchFF = !fechaF || c.fecha <= fechaF
      return matchQ && matchFI && matchFF
    })
  }, [consultas, buscar, fechaI, fechaF])

  return (
    <ModuleShell tint="cyan">
      <ModuleHero
        title="Expediente Clínico"
        subtitle={nombreCompleto}
        badge={`${paciente.codigo}${edad ? ` · ${edad}` : ''}`}
        icon={FileText}
        gradient="cyan"
        backLink={{ href: '/expediente', label: '← Buscar otro paciente' }}
        kpis={[
          { label: 'Consultas', value: consultas.length, icon: Stethoscope },
          { label: 'Recetas', value: consultas.reduce((s, c) => s + (c.consulta_detalle?.length ?? 0), 0), icon: Pill },
          { label: 'Laboratorio', value: analisis.length, icon: FlaskConical },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <ModuleBtnGhost
              onClick={() => imprimirExpedienteClinico(paciente, antecedentes, consultas)}
              className="!text-white/90 !border-white/30 hover:!bg-white/10"
            >
              <Printer className="w-4 h-4" /> Imprimir expediente
            </ModuleBtnGhost>
            <Link href={`/pacientes/${paciente.id}`}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-white/30 text-white/90 hover:bg-white/10 transition">
              <UserRound className="w-4 h-4" /> Ficha del paciente
            </Link>
          </div>
        }
      />
      <ModuleContent maxWidth="5xl">

      {/* HEADER PACIENTE */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
          <div className="flex items-center gap-4">
            {paciente.foto_url
              ? <img src={paciente.foto_url} alt="" className="w-20 h-20 rounded-full object-cover border-4 border-white/50" />
              : <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/50 flex items-center justify-center text-white text-2xl font-bold">
                  {iniciales}
                </div>
            }
            <div className="text-white">
              <h1 className="text-2xl font-bold">{nombreCompleto}</h1>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-blue-100">
                <span>Código: <b className="text-white">{paciente.codigo}</b></span>
                {edad && <span>Edad: <b className="text-white">{edad}</b></span>}
                {paciente.genero && <span>Género: <b className="text-white">{paciente.genero}</b></span>}
                {paciente.fecha_nac && <span>Nacimiento: <b className="text-white">{fmtDate(paciente.fecha_nac)}</b></span>}
              </div>
            </div>
          </div>
        </div>

        {/* Info secundaria */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 px-6 py-4 border-b bg-gray-50">
          <div>
            <p className="text-xs text-gray-400 uppercase">Teléfono</p>
            <p className="text-sm font-medium">{paciente.celular || paciente.telefono || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Correo</p>
            <p className="text-sm font-medium">{paciente.correo || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Colonia</p>
            <p className="text-sm font-medium">{paciente.colonia_nombre || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Tipo de Sangre</p>
            <p className="text-sm font-bold text-red-600">{paciente.tipo_sangre || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Responsable</p>
            <p className="text-sm font-medium">{paciente.responsable || '—'}</p>
          </div>
        </div>
        {paciente.direccion && (
          <div className="px-6 py-2 border-b bg-gray-50 text-sm text-gray-600">
            <span className="text-xs text-gray-400 uppercase mr-2">Dirección:</span>
            {paciente.direccion}
          </div>
        )}

        {/* Alerta clínica */}
        {alergiasTexto && (
          <div className="px-6 py-3 bg-amber-50 border-b flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs font-bold text-amber-700 uppercase">Alerta — Alergias: </span>
              <span className="text-sm text-amber-900 font-medium">{alergiasTexto}</span>
            </div>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {([
            { id: 'resumen',      label: 'Resumen clínico',                                icon: ClipboardList },
            { id: 'historial',    label: `Consultas (${consultas.length})`,                icon: Stethoscope },
            { id: 'laboratorio',  label: `Laboratorio (${analisis.length})`,               icon: FlaskConical },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition ${
                tab === t.id
                  ? 'border-b-2 border-blue-500 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.id === 'resumen' ? 'Resumen' : t.id === 'historial' ? 'Consultas' : 'Lab'}</span>
            </button>
          ))}
        </div>

        {/* ── RESUMEN CLÍNICO ───────────────────────────────────── */}
        {tab === 'resumen' && (
          <div className="p-4 sm:p-5 space-y-5">
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              Vista de consulta del historial médico. Los datos se registran en <strong>Consultas</strong> y
              los antecedentes se editan en la <Link href={`/pacientes/${paciente.id}`} className="text-[#003366] hover:underline">ficha del paciente</Link>.
            </p>

            {/* Última consulta */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Stethoscope className="w-4 h-4" /> Última atención
              </h3>
              {ultimaConsulta ? (
                <div className="rounded-xl border border-[#003366]/15 bg-gradient-to-br from-slate-50 to-white p-4">
                  <div className="flex flex-wrap justify-between gap-2 mb-3">
                    <p className="font-semibold text-[#003366]">{fmtDateTime(ultimaConsulta.fecha, ultimaConsulta.hora)}</p>
                    {ultimaConsulta.doctor && (
                      <p className="text-sm text-slate-500">Atendido por: <b>{ultimaConsulta.doctor}</b></p>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {ultimaConsulta.sintoma && (
                      <div><span className="text-xs text-slate-400 uppercase">Motivo</span><p className="text-slate-800 mt-0.5">{ultimaConsulta.sintoma}</p></div>
                    )}
                    {ultimaConsulta.impresion && (
                      <div><span className="text-xs text-slate-400 uppercase">Diagnóstico</span><p className="text-slate-800 font-medium mt-0.5">{ultimaConsulta.impresion}</p></div>
                    )}
                    {ultimaConsulta.tratamiento && (
                      <div className="sm:col-span-2"><span className="text-xs text-slate-400 uppercase">Tratamiento</span><p className="text-slate-800 mt-0.5">{ultimaConsulta.tratamiento}</p></div>
                    )}
                  </div>
                  {(ultimaConsulta.presion || ultimaConsulta.temperatura || ultimaConsulta.peso) && (
                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t text-xs text-slate-600">
                      {ultimaConsulta.presion && <span>PA: <b>{ultimaConsulta.presion}</b></span>}
                      {ultimaConsulta.temperatura && <span>Temp: <b>{ultimaConsulta.temperatura}°C</b></span>}
                      {ultimaConsulta.peso && <span>Peso: <b>{ultimaConsulta.peso} kg</b></span>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">El paciente aún no tiene consultas finalizadas.</p>
              )}
            </div>

            {/* Antecedentes */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4" /> Antecedentes clínicos
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <BloqueAntecedente titulo="Personales" texto={antecedentes?.personal} />
                <BloqueAntecedente titulo="Familiares" texto={antecedentes?.familiares} />
                <BloqueAntecedente titulo="Hospitalarios / quirúrgicos" texto={antecedentes?.hospitalario} />
                <BloqueAntecedente titulo="Alergias" texto={alergiasTexto} />
              </div>
            </div>

            {/* Contacto (secundario) */}
            <details className="rounded-xl border border-slate-200 bg-white">
              <summary className="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer select-none">
                Contacto y comunicación con el paciente
              </summary>
              <div className="px-4 pb-4 border-t">
                <BotonPublicidad paciente={paciente} />
              </div>
            </details>
          </div>
        )}

        {/* ── HISTORIAL ─────────────────────────────────────────── */}
        {tab === 'historial' && (
          <div className="p-4 space-y-3">
            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
                  placeholder="Buscar diagnóstico, síntoma..."
                  value={buscar} onChange={e => setBuscar(e.target.value)}
                />
              </div>
              <input type="date" className="border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                value={fechaI} onChange={e => setFechaI(e.target.value)} title="Desde" />
              <input type="date" className="border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                value={fechaF} onChange={e => setFechaF(e.target.value)} title="Hasta" />
              {(buscar || fechaI || fechaF) && (
                <button onClick={() => { setBuscar(''); setFechaI(''); setFechaF('') }}
                  className="text-xs text-gray-400 hover:text-red-500">Limpiar</button>
              )}
            </div>

            {consultasFilt.length === 0
              ? <div className="text-center py-14 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No se encontraron consultas</p>
                </div>
              : <div className="space-y-2">
                  {consultasFilt.map(c => (
                    <ConsultaCard key={c.id} consulta={c} paciente={paciente} />
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── LABORATORIO ───────────────────────────────────────── */}
        {tab === 'laboratorio' && (
          <div className="overflow-x-auto p-4">
            {analisis.length === 0
              ? <div className="text-center py-14 text-gray-400">
                  <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No hay órdenes de laboratorio</p>
                </div>
              : <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                      <th className="px-4 py-3 text-left">Análisis</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-left">Resultado</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {analisis.map(a => {
                      const est = inferirEstadoLab({
                        estado_lab: a.estado_lab,
                        pagado: a.pagado,
                        entregado: a.entregado,
                        tieneResultado: (a.resultados?.length ?? 0) > 0,
                      })
                      const resultados = a.resultados ?? []
                      const r = resultados[0]
                      const resumen = r?.valor_resultado ?? a.resultado_resumen
                      const nombreCompleto = `${paciente.nombre} ${paciente.apellido1} ${paciente.apellido2 ?? ''}`.trim()
                      return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{a.no_analisis}</p>
                          {a.id_consulta && <p className="text-[10px] text-gray-400">Consulta #{a.id_consulta}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${claseBadgeEstadoLab(est)}`}>
                            {etiquetaEstadoLab(est)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {resultados.length > 1 ? (
                            <div className="space-y-0.5">
                              {resultados.map((rr, ri) => (
                                <div key={rr.id ?? ri} className="text-xs leading-snug">
                                  {rr.nombre_prueba && <span className="text-gray-500">{rr.nombre_prueba}: </span>}
                                  <span className={rr.anormal ? 'font-semibold text-red-600' : 'font-medium'}>
                                    {rr.valor_resultado || '—'}
                                  </span>
                                  {rr.unidad && <span className="text-gray-400"> {rr.unidad}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              {resumen || <span className="text-gray-300">—</span>}
                              {r?.unidad && <span className="text-gray-500 text-xs"> {r.unidad}</span>}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {a.fecha_resultado ? fmtDate(a.fecha_resultado) : a.fecha ? fmtDate(a.fecha) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {(a.resultados?.length ?? 0) > 0 && (
                            <div className="flex justify-center gap-1">
                              <button type="button"
                                onClick={() => imprimirResultadoLaboratorio({
                                  paciente_nombre: nombreCompleto,
                                  paciente_codigo: paciente.codigo,
                                  prueba_nombre: a.no_analisis,
                                  fecha: a.fecha_resultado ?? a.fecha ?? '',
                                  valor_resultado: r?.valor_resultado,
                                  unidad: r?.unidad,
                                  rango_texto: r?.rango_texto,
                                  observacion: r?.observacion,
                                  anormal: r?.anormal,
                                })}
                                className="p-1.5 rounded bg-gray-100 hover:bg-gray-200" title="Imprimir">
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {(paciente.celular || paciente.telefono) && (
                                <button type="button"
                                  onClick={() => window.open(
                                    linkWhatsAppResultado(
                                      paciente.celular || paciente.telefono || '',
                                      nombreCompleto,
                                      a.no_analisis,
                                      resumen ?? undefined,
                                    ), '_blank')}
                                  className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200" title="WhatsApp">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
            }
          </div>
        )}
      </div>
      </ModuleContent>
    </ModuleShell>
  )
}
