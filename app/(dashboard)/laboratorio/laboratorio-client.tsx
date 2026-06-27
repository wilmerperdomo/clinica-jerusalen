'use client'

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  FlaskConical, Plus, Search, RefreshCw, ClipboardList,
  CheckCircle2, Clock, X, Save, AlertCircle,
  Beaker, Edit2, Printer, MessageCircle, Trash2,
  LayoutGrid, List, BarChart3, Tag, ShieldCheck, Send, SlidersHorizontal,
  KeyRound, Copy, Stethoscope, Package, Zap, TestTube2, Upload, FileText,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { linkWhatsAppMensaje } from '@/lib/mensajes-paciente'
import { generarAccesoPortal } from './portal-actions'
import {
  etiquetaEstadoLab, claseBadgeEstadoLab, type EstadoLab,
} from '@/lib/lab-estado-utils'
import {
  agruparOrdenes, calcularReportesLab, calcularEdad, buscarRangoAplicable,
  evaluarValorRango, computeFechaPrometida, estadoOrdenLab, tuboColorClase,
  indicadorDesdeRango, textoReferenciaRango,
  type OrdenLab, type PruebaLab, type PacienteLab, type GrupoLab,
  type LabRango, type LabPanelCampo, type Medico, type LabPerfil,
} from '@/lib/lab-utils'
import { precioLabLista } from '@/lib/membresia-utils'
import { useConfirm } from '@/components/confirm-dialog'
import { descontarInsumosLab, type LabInsumo } from '@/lib/lab-insumos'
import {
  calcularCostoEstimadoInsumos, calcularMargenEstimado, claseProcesamiento,
  costoMaquilaAplicable, labelProcesamiento, upsertCostoOrden,
  type LabCostoOrden, type ProcesamientoLab,
} from '@/lib/lab-costos'
import {
  imprimirEtiquetasTubo, imprimirResultadoGrupoLab,
  filasPrintDesdeGrupo, registrarAuditoriaLab,
} from '@/lib/lab-print'
import {
  LAB_RESULTADOS_BUCKET, aceptaArchivoResultadoLab, type LabArchivo,
} from '@/lib/lab-archivos'
import {
  LAB_ENCABEZADO_LABELS,
  LAB_ENCABEZADO_STORAGE_KEY,
  type LabEncabezadoInforme,
} from '@/lib/lab-plantilla-assets'
import BuscarPacienteInput, { type PacienteBusqueda } from '@/components/buscar-paciente-input'
import { buscarPacientesActivos } from '@/lib/buscar-pacientes'
import { normalizarCodigoPaciente, edadPaciente } from '@/lib/paciente-utils'
import { esRolEnfermeria, esRolMedico } from '@/lib/consultas-utils'
import {
  ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost,
} from '@/components/module-layout'
import LabKanban from './components/lab-kanban'
import LabReportesPanel from './components/lab-reportes-panel'
import LabSelectorPruebas from './components/lab-selector-pruebas'

/* ─── tipos props ───────────────────────────────────────── */
interface Props {
  ordenes: OrdenLab[]
  pruebas: PruebaLab[]
  pacientes: PacienteLab[]
  fechaHoy: string
  rangos: LabRango[]
  panelCampos: LabPanelCampo[]
  insumos: LabInsumo[]
  preciosLista: Record<number, Record<number, number>>
  productos: { id: number; nombre: string; codigo?: string; costo?: number }[]
  medicos: Medico[]
  perfiles: LabPerfil[]
  proveedores: { id: number; nombre: string }[]
  costosOrden: LabCostoOrden[]
  sucursalId?: number
  esSuperAdmin?: boolean
  rolUsuario?: string
}

type TabLab = 'cola' | 'ordenes' | 'catalogo' | 'reportes'
type FiltroLab = 'procesar' | 'pendiente_cobro' | 'completadas' | 'atrasadas' | 'todas'

interface CampoResultadoForm {
  valor: string
  unidad: string
  rango_texto: string
  rango_min: number | null
  rango_max: number | null
  anormal: boolean
  obs: string
  resultadoId?: number
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function LaboratorioClient({
  ordenes: init, pruebas, pacientes, fechaHoy,
  rangos, panelCampos: initPanelCampos, insumos: initInsumos,
  preciosLista, productos, medicos: initMedicos, perfiles: initPerfiles,
  proveedores, costosOrden: initCostosOrden,
  sucursalId, esSuperAdmin = false, rolUsuario = '',
}: Props) {
  const [tab, setTab] = useState<TabLab>('cola')
  const [filtroLab, setFiltroLab] = useState<FiltroLab>('procesar')
  const [encabezadoInforme, setEncabezadoInforme] = useState<LabEncabezadoInforme>('clinica')
  const [ordenes, setOrdenes] = useState<OrdenLab[]>(init)
  const [busqueda, setBusqueda] = useState('')
  const [isPending, startTransition] = useTransition()

  const [modalOrden, setModalOrden] = useState(false)
  const [modalResultados, setModalResultados] = useState(false)
  const [modalPrueba, setModalPrueba] = useState(false)
  const [grupoActual, setGrupoActual] = useState<GrupoLab | null>(null)
  const [pruebaActual, setPruebaActual] = useState<PruebaLab | null>(null)

  const [formOrden, setFormOrden] = useState({
    paciente_id: '',
    pruebas_ids: [] as number[],
    medico_id: '',
    perfil_id: '',
    observaciones: '',
    entrega_fecha: '',
    entrega_whatsapp: false,
    entrega_email: false,
    entrega_fisico: true,
    urgente: false,
  })
  const [resultForm, setResultForm] = useState<Record<string, CampoResultadoForm>>({})
  const [formPrueba, setFormPrueba] = useState({
    nombre: '', description: '', color: '', dias: '1',
    costo: '0', comision: '0', nota: '', es_panel: false,
    procesamiento: 'INTERNA' as ProcesamientoLab,
    proveedor_id: '',
    costo_maquila: '0',
  })
  const [insumosPrueba, setInsumosPrueba] = useState<{ producto_id: string; cantidad: string }[]>([])
  const [pruebasCatalogo, setPruebasCatalogo] = useState<PruebaLab[]>(pruebas)
  const [costosOrdenState, setCostosOrdenState] = useState<LabCostoOrden[]>(initCostosOrden)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const [pacientesExtra, setPacientesExtra] = useState<PacienteLab[]>([])

  // Estado vivo de rangos y campos de panel (para reflejar ediciones del catálogo sin recargar)
  const [rangosState, setRangosState] = useState<LabRango[]>(rangos)
  const [panelCamposState, setPanelCamposState] = useState<LabPanelCampo[]>(initPanelCampos)
  useEffect(() => { setRangosState(rangos) }, [rangos])
  useEffect(() => { setPanelCamposState(initPanelCampos) }, [initPanelCampos])
  useEffect(() => {
    const saved = localStorage.getItem(LAB_ENCABEZADO_STORAGE_KEY)
    if (saved === 'clinica') setEncabezadoInforme('clinica')
    else if (saved === 'masterlab' || saved === 'maquila') setEncabezadoInforme('masterlab')
  }, [])
  useEffect(() => {
    localStorage.setItem(LAB_ENCABEZADO_STORAGE_KEY, encabezadoInforme)
  }, [encabezadoInforme])

  // Configuración de prueba (rangos de referencia + campos de panel)
  const [modalConfig, setModalConfig] = useState(false)
  const [configPrueba, setConfigPrueba] = useState<PruebaLab | null>(null)
  const [formRango, setFormRango] = useState({
    campo_id: '' as string,
    genero: '', edad_min: '0', edad_max: '120',
    rango_min: '', rango_max: '', rango_texto: '', unidad: '',
  })
  const [formCampo, setFormCampo] = useState({ nombre: '', codigo: '', unidad: '', orden: '' })
  const [guardandoConfig, setGuardandoConfig] = useState(false)

  // Acceso al portal del paciente
  const [modalAcceso, setModalAcceso] = useState(false)
  const [acceso, setAcceso] = useState<{ usuario: string; password: string; telefono: string; nombre: string } | null>(null)
  const [generandoAcceso, setGenerandoAcceso] = useState(false)

  const [archivosGrupo, setArchivosGrupo] = useState<LabArchivo[]>([])
  const [subiendoArchivo, setSubiendoArchivo] = useState(false)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  // Registro rápido de paciente nuevo (directo de laboratorio, sin consulta)
  const [mostrarNuevoPac, setMostrarNuevoPac] = useState(false)
  const [guardandoNuevoPac, setGuardandoNuevoPac] = useState(false)
  const [formNuevoPac, setFormNuevoPac] = useState({
    nombre: '', apellido1: '', apellido2: '',
    fecha_nac: '', genero: '', telefono: '', celular: '', correo: '', cedula: '',
  })

  // Catálogos de médicos y perfiles (estado vivo para CRUD sin recargar)
  const [medicosState, setMedicosState] = useState<Medico[]>(initMedicos)
  const [perfilesState, setPerfilesState] = useState<LabPerfil[]>(initPerfiles)
  useEffect(() => { setMedicosState(initMedicos) }, [initMedicos])
  useEffect(() => { setPerfilesState(initPerfiles) }, [initPerfiles])

  const [catTab, setCatTab] = useState<'pruebas' | 'perfiles' | 'medicos'>('pruebas')

  // Alta rápida de médico desde el modal de orden
  const [mostrarNuevoMedico, setMostrarNuevoMedico] = useState(false)
  const [guardandoMedico, setGuardandoMedico] = useState(false)
  const [formMedicoRapido, setFormMedicoRapido] = useState({ nombre: '', especialidad: '', colegiado: '', telefono: '' })

  // CRUD de médicos (pestaña catálogo)
  const [modalMedico, setModalMedico] = useState(false)
  const [medicoActual, setMedicoActual] = useState<Medico | null>(null)
  const [formMedico, setFormMedico] = useState({ nombre: '', especialidad: '', colegiado: '', telefono: '', correo: '', activo: true })

  // CRUD de perfiles/paquetes (pestaña catálogo)
  const [modalPerfil, setModalPerfil] = useState(false)
  const [perfilActual, setPerfilActual] = useState<LabPerfil | null>(null)
  const [formPerfil, setFormPerfil] = useState({ nombre: '', descripcion: '', precio: '', activo: true, pruebas_ids: [] as number[] })
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  const supabase = useMemo(() => sb(), [])
  const confirmDialog = useConfirm()
  const esRolClinicoBasico = esRolEnfermeria(rolUsuario) || esRolMedico(rolUsuario)
  const puedeVerAdminLab = esSuperAdmin || !esRolClinicoBasico
  const tabsLaboratorio = useMemo(() => {
    const base: { id: TabLab; label: string; icon: React.ElementType }[] = [
      { id: 'cola', label: 'Cola / Kanban', icon: LayoutGrid },
      { id: 'ordenes', label: 'Órdenes agrupadas', icon: List },
    ]
    if (puedeVerAdminLab) {
      base.push(
        { id: 'catalogo', label: `Catálogo (${pruebasCatalogo.length})`, icon: Beaker },
        { id: 'reportes', label: 'Reportes', icon: BarChart3 },
      )
    }
    return base
  }, [puedeVerAdminLab, pruebasCatalogo.length])

  useEffect(() => {
    if (!tabsLaboratorio.some(t => t.id === tab)) setTab('cola')
  }, [tab, tabsLaboratorio])

  const cargarArchivosGrupo = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('lab_archivos')
      .select('*')
      .eq('lab_grupo_id', grupoId)
      .order('created_at', { ascending: false })
    if (error && !/lab_archivos|schema cache/i.test(error.message)) {
      console.warn('lab_archivos:', error.message)
      setArchivosGrupo([])
      return
    }
    setArchivosGrupo((data ?? []) as LabArchivo[])
  }, [supabase])

  useEffect(() => {
    if (grupoActual?.grupoId) cargarArchivosGrupo(grupoActual.grupoId)
    else setArchivosGrupo([])
  }, [grupoActual?.grupoId, cargarArchivosGrupo])

  const pacientesMerged = useMemo(() => {
    const map = new Map<number, PacienteLab>()
    for (const p of pacientes) map.set(p.id, p)
    for (const p of pacientesExtra) map.set(p.id, p)
    return [...map.values()]
  }, [pacientes, pacientesExtra])

  useEffect(() => { setPruebasCatalogo(pruebas) }, [pruebas])

  const cargarCatalogoPruebas = useCallback(async () => {
    setLoadingCatalogo(true)
    const { data } = await supabase.from('laboratorio_info').select('*').order('nombre')
    if (data) setPruebasCatalogo(data as PruebaLab[])
    setLoadingCatalogo(false)
  }, [supabase])

  useEffect(() => {
    if (modalOrden) cargarCatalogoPruebas()
  }, [modalOrden, cargarCatalogoPruebas])

  const panelCamposMap = useMemo(() => {
    const m: Record<number, LabPanelCampo[]> = {}
    for (const c of panelCamposState) {
      if (c.activo === false) continue
      if (!m[c.prueba_id]) m[c.prueba_id] = []
      m[c.prueba_id].push(c)
    }
    for (const k of Object.keys(m)) m[Number(k)].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    return m
  }, [panelCamposState])

  const insumosMap = useMemo(() => {
    const m: Record<number, LabInsumo[]> = {}
    for (const i of initInsumos) {
      if (!m[i.prueba_id]) m[i.prueba_id] = []
      m[i.prueba_id].push(i)
    }
    return m
  }, [initInsumos])

  const costosProductoMap = useMemo(() => {
    const m: Record<number, number> = {}
    for (const p of productos) m[p.id] = Number(p.costo) || 0
    return m
  }, [productos])

  const pruebasMap = useMemo(() => {
    const m: Record<number, { nombre: string }> = {}
    for (const p of pruebasCatalogo) m[p.id] = { nombre: p.nombre }
    return m
  }, [pruebasCatalogo])

  const proveedoresMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const p of proveedores) m[p.id] = p.nombre
    return m
  }, [proveedores])

  const pruebasCostosMap = useMemo(() => {
    const m: Record<number, PruebaLab> = {}
    for (const p of pruebasCatalogo) m[p.id] = p
    return m
  }, [pruebasCatalogo])

  function costoEstimadoInsumosPrueba(pruebaId: number) {
    return calcularCostoEstimadoInsumos(insumosMap[pruebaId] ?? [], costosProductoMap)
  }

  function resetFormPrueba() {
    setFormPrueba({
      nombre: '', description: '', color: '', dias: '1',
      costo: '0', comision: '0', nota: '', es_panel: false,
      procesamiento: 'INTERNA', proveedor_id: '', costo_maquila: '0',
    })
  }

  const pacientesBusqueda: PacienteBusqueda[] = useMemo(
    () => pacientesMerged as PacienteBusqueda[],
    [pacientesMerged],
  )

  const buscarPacienteRemoto = useCallback(
    (termino: string) => buscarPacientesActivos(supabase, termino),
    [supabase],
  )

  function registrarPacienteSeleccionado(p: PacienteBusqueda) {
    const row = p as PacienteLab
    setFormOrden(prev => ({ ...prev, paciente_id: String(row.id) }))
    setPacientesExtra(prev => {
      if (prev.some(x => x.id === row.id) || pacientes.some(x => x.id === row.id)) return prev
      return [...prev, row]
    })
  }

  /** Selecciona un paciente recién registrado/encontrado en el formulario de orden. */
  function usarPacienteEnOrden(p: PacienteLab) {
    setPacientesExtra(prev =>
      prev.some(x => x.id === p.id) || pacientes.some(x => x.id === p.id) ? prev : [...prev, p],
    )
    setFormOrden(prev => ({ ...prev, paciente_id: String(p.id) }))
    setMostrarNuevoPac(false)
    setFormNuevoPac({
      nombre: '', apellido1: '', apellido2: '',
      fecha_nac: '', genero: '', telefono: '', celular: '', correo: '', cedula: '',
    })
  }

  /** Genera un código secuencial tipo LAB000001 para pacientes sin cédula. */
  async function generarCodigoLab(): Promise<string> {
    const { data } = await supabase
      .from('pacientes')
      .select('codigo')
      .like('codigo', 'LAB%')
      .order('codigo', { ascending: false })
      .limit(1)
    let next = 1
    const last = (data?.[0]?.codigo as string | undefined) ?? ''
    const num = parseInt(last.replace(/\D/g, ''), 10)
    if (!Number.isNaN(num)) next = num + 1
    return 'LAB' + String(next).padStart(6, '0')
  }

  const PAC_SELECT =
    'id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, rtn_empresa, contacto, fecha_nac, lista_id, celular, telefono, correo, genero'

  /** Registro completo de un paciente nuevo desde laboratorio (sin pasar por consulta). */
  async function registrarPacienteRapido() {
    const nombre = formNuevoPac.nombre.trim()
    const apellido1 = formNuevoPac.apellido1.trim()
    const fechaNac = formNuevoPac.fecha_nac
    const genero = formNuevoPac.genero

    if (!nombre || !apellido1) {
      alert('Ingrese nombre y apellido del paciente.')
      return
    }
    if (!fechaNac) {
      alert('La fecha de nacimiento es obligatoria (se usa para los rangos de laboratorio por edad).')
      return
    }
    if (!genero) {
      alert('Seleccione el género del paciente.')
      return
    }
    const edad = edadPaciente(fechaNac)
    if (edad === null) {
      alert('La fecha de nacimiento no es válida (no puede ser futura ni imposible).')
      return
    }

    setGuardandoNuevoPac(true)
    const cedula = normalizarCodigoPaciente(formNuevoPac.cedula)

    // Anti-duplicado: si dieron cédula y ya existe ese paciente, se reutiliza.
    if (cedula) {
      const { data: existente } = await supabase
        .from('pacientes')
        .select(PAC_SELECT)
        .eq('codigo', cedula)
        .maybeSingle()
      if (existente) {
        setGuardandoNuevoPac(false)
        usarPacienteEnOrden(existente as PacienteLab)
        alert('Ya existía un paciente con esa cédula/código. Se seleccionó ese expediente.')
        return
      }
    }

    const payload: Record<string, unknown> = {
      tipo: 'persona',
      codigo: cedula || (await generarCodigoLab()),
      nombre,
      apellido1,
      apellido2: formNuevoPac.apellido2.trim() || null,
      genero,
      fecha_nac: fechaNac,
      telefono: formNuevoPac.telefono.trim() || null,
      celular: formNuevoPac.celular.trim() || null,
      correo: formNuevoPac.correo.trim() || null,
      lista_id: 1,
      activo: true,
      sucursal_id: sucursalId ?? null,
    }

    let res = await supabase.from('pacientes').insert(payload).select(PAC_SELECT).single()

    // Si el código autogenerado colisionó (carrera), reintenta con uno basado en timestamp.
    if (res.error && !cedula && /unique|duplicate|llave duplicada/i.test(res.error.message)) {
      payload.codigo = 'LAB' + Date.now().toString().slice(-10)
      res = await supabase.from('pacientes').insert(payload).select(PAC_SELECT).single()
    }

    setGuardandoNuevoPac(false)

    if (res.error || !res.data) {
      const esUnico = res.error && /unique|duplicate|llave duplicada/i.test(res.error.message)
      alert(esUnico
        ? 'Ya existe un paciente con esa cédula/código. No se permiten duplicados.'
        : 'No se pudo registrar el paciente: ' + (res.error?.message ?? 'error desconocido'))
      return
    }

    usarPacienteEnOrden(res.data as PacienteLab)
  }

  /* ── Perfiles: al elegir uno, agrega sus pruebas a la selección ── */
  function aplicarPerfil(perfilId: string) {
    setFormOrden(prev => {
      const next = { ...prev, perfil_id: perfilId }
      const perfil = perfilesState.find(p => String(p.id) === perfilId)
      if (perfil?.pruebas_ids?.length) {
        const set = new Set<number>(prev.pruebas_ids)
        for (const id of perfil.pruebas_ids) set.add(id)
        next.pruebas_ids = [...set]
      }
      return next
    })
  }

  /* ── Alta rápida de médico desde el modal de orden ── */
  async function registrarMedicoRapido() {
    const nombre = formMedicoRapido.nombre.trim()
    if (!nombre) { alert('Ingrese el nombre del médico.'); return }
    setGuardandoMedico(true)
    const { data, error } = await supabase
      .from('medicos')
      .insert({
        nombre,
        especialidad: formMedicoRapido.especialidad.trim() || null,
        colegiado: formMedicoRapido.colegiado.trim() || null,
        telefono: formMedicoRapido.telefono.trim() || null,
        activo: true,
      })
      .select('*')
      .single()
    setGuardandoMedico(false)
    if (error || !data) {
      alert('No se pudo registrar el médico: ' + (error?.message ?? 'error desconocido'))
      return
    }
    setMedicosState(prev => [...prev, data as Medico].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setFormOrden(prev => ({ ...prev, medico_id: String((data as Medico).id) }))
    setMostrarNuevoMedico(false)
    setFormMedicoRapido({ nombre: '', especialidad: '', colegiado: '', telefono: '' })
  }

  /* ── CRUD de médicos (catálogo) ── */
  function abrirModalMedico(m: Medico | null) {
    setMedicoActual(m)
    setFormMedico(m
      ? { nombre: m.nombre, especialidad: m.especialidad ?? '', colegiado: m.colegiado ?? '', telefono: m.telefono ?? '', correo: m.correo ?? '', activo: m.activo !== false }
      : { nombre: '', especialidad: '', colegiado: '', telefono: '', correo: '', activo: true })
    setModalMedico(true)
  }

  async function guardarMedico() {
    const nombre = formMedico.nombre.trim()
    if (!nombre) { alert('El nombre del médico es obligatorio.'); return }
    const payload = {
      nombre,
      especialidad: formMedico.especialidad.trim() || null,
      colegiado: formMedico.colegiado.trim() || null,
      telefono: formMedico.telefono.trim() || null,
      correo: formMedico.correo.trim() || null,
      activo: formMedico.activo,
    }
    if (medicoActual) {
      const { data, error } = await supabase.from('medicos').update(payload).eq('id', medicoActual.id).select('*').single()
      if (error || !data) { alert('No se pudo guardar: ' + (error?.message ?? '')); return }
      setMedicosState(prev => prev.map(m => m.id === medicoActual.id ? (data as Medico) : m))
    } else {
      const { data, error } = await supabase.from('medicos').insert(payload).select('*').single()
      if (error || !data) { alert('No se pudo guardar: ' + (error?.message ?? '')); return }
      setMedicosState(prev => [...prev, data as Medico].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    }
    setModalMedico(false)
    setMedicoActual(null)
  }

  async function eliminarMedico(m: Medico) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar médico',
      message: `¿Está seguro que desea eliminar al médico "${m.nombre}"? Las órdenes ya guardadas conservan su nombre.`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('medicos').delete().eq('id', m.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setMedicosState(prev => prev.filter(x => x.id !== m.id))
  }

  /* ── CRUD de perfiles / paquetes (catálogo) ── */
  function abrirModalPerfil(p: LabPerfil | null) {
    setPerfilActual(p)
    setFormPerfil(p
      ? { nombre: p.nombre, descripcion: p.descripcion ?? '', precio: p.precio != null ? String(p.precio) : '', activo: p.activo !== false, pruebas_ids: p.pruebas_ids ?? [] }
      : { nombre: '', descripcion: '', precio: '', activo: true, pruebas_ids: [] })
    setModalPerfil(true)
  }

  async function guardarPerfil() {
    const nombre = formPerfil.nombre.trim()
    if (!nombre) { alert('El nombre del perfil es obligatorio.'); return }
    if (formPerfil.pruebas_ids.length === 0) { alert('Agregue al menos una prueba al perfil.'); return }
    setGuardandoPerfil(true)
    const precioNum = formPerfil.precio.trim() === '' ? null : Number(formPerfil.precio)
    const payload = {
      nombre,
      descripcion: formPerfil.descripcion.trim() || null,
      precio: precioNum != null && !Number.isNaN(precioNum) ? precioNum : null,
      activo: formPerfil.activo,
    }

    let perfilId: number
    if (perfilActual) {
      const { error } = await supabase.from('lab_perfiles').update(payload).eq('id', perfilActual.id)
      if (error) { setGuardandoPerfil(false); alert('No se pudo guardar: ' + error.message); return }
      perfilId = perfilActual.id
      await supabase.from('lab_perfil_pruebas').delete().eq('perfil_id', perfilId)
    } else {
      const { data, error } = await supabase.from('lab_perfiles').insert(payload).select('id').single()
      if (error || !data) { setGuardandoPerfil(false); alert('No se pudo guardar: ' + (error?.message ?? '')); return }
      perfilId = (data as { id: number }).id
    }

    const filas = formPerfil.pruebas_ids.map(pid => ({ perfil_id: perfilId, prueba_id: pid }))
    if (filas.length) {
      const { error: errPP } = await supabase.from('lab_perfil_pruebas').insert(filas)
      if (errPP) { setGuardandoPerfil(false); alert('Perfil guardado, pero falló asignar pruebas: ' + errPP.message); return }
    }

    const perfilGuardado: LabPerfil = {
      id: perfilId, nombre, descripcion: payload.descripcion, precio: payload.precio,
      activo: payload.activo, pruebas_ids: formPerfil.pruebas_ids,
    }
    setPerfilesState(prev => {
      const exists = prev.some(p => p.id === perfilId)
      const next = exists ? prev.map(p => p.id === perfilId ? perfilGuardado : p) : [...prev, perfilGuardado]
      return next.sort((a, b) => a.nombre.localeCompare(b.nombre))
    })
    setGuardandoPerfil(false)
    setModalPerfil(false)
    setPerfilActual(null)
  }

  async function eliminarPerfil(p: LabPerfil) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar perfil',
      message: `¿Está seguro que desea eliminar el perfil "${p.nombre}"? No afecta las órdenes ya creadas.`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('lab_perfiles').delete().eq('id', p.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setPerfilesState(prev => prev.filter(x => x.id !== p.id))
  }

  const hace7 = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  }, [])

  const recargar = useCallback(async () => {
    let q = supabase
      .from('consulta_analisis')
      .select('*, resultados:lab_resultados(*)')
      .gte('fecha', hace7)
      .order('id', { ascending: false })
    if (!esSuperAdmin && sucursalId) q = q.eq('sucursal_id', sucursalId)
    const { data, error } = await q
    if (error) {
      console.warn('recargar lab:', error.message)
      return
    }
    if (data) setOrdenes(data as OrdenLab[])
    const { data: costos } = await supabase
      .from('lab_costos_orden')
      .select('*')
      .gte('created_at', `${hace7}T00:00:00`)
    if (costos) setCostosOrdenState(costos as LabCostoOrden[])
  }, [supabase, hace7, sucursalId, esSuperAdmin])

  const recargarRef = useRef(recargar)
  recargarRef.current = recargar

  useEffect(() => {
    const ch = supabase
      .channel('lab-ordenes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consulta_analisis' }, () => {
        recargarRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase])

  const grupos = useMemo(() => agruparOrdenes(ordenes, pacientesMerged), [ordenes, pacientesMerged])
  const reportes = useMemo(
    () => calcularReportesLab(ordenes, grupos, fechaHoy, costosOrdenState, pruebasMap, proveedoresMap),
    [ordenes, grupos, fechaHoy, costosOrdenState, pruebasMap, proveedoresMap],
  )

  const stats = useMemo(() => ({
    total: ordenes.length,
    procesar: grupos.filter(g => ['PAGADO', 'EN_PROCESO', 'BORRADOR', 'RESULTADO_LISTO', 'VALIDADO'].includes(g.estado)).length,
    pendCobro: grupos.filter(g => g.estado === 'PENDIENTE_COBRO').length,
    entregado: grupos.filter(g => g.estado === 'ENTREGADO').length,
    atrasadas: grupos.filter(g => g.atrasado).length,
  }), [ordenes.length, grupos])

  function precioPruebaParaPaciente(pruebaId: number, pacienteId?: string): number {
    const pac = pacienteId ? pacientesMerged.find(p => String(p.id) === pacienteId) : undefined
    const prueba = pruebasCatalogo.find(p => p.id === pruebaId)
    if (!prueba) return 0
    return precioLabLista(pruebaId, pac?.lista_id, preciosLista, Number(prueba.costo))
  }

  /**
   * Importe a cobrar por cada prueba seleccionada. Si hay un perfil con precio
   * propio, distribuye ese precio proporcionalmente entre las pruebas del perfil
   * (la suma queda exacta); las pruebas fuera del perfil mantienen su precio.
   */
  function importesOrden(): Record<number, number> {
    const out: Record<number, number> = {}
    for (const pid of formOrden.pruebas_ids) out[pid] = precioPruebaParaPaciente(pid, formOrden.paciente_id)

    const perfil = formOrden.perfil_id ? perfilesState.find(p => String(p.id) === formOrden.perfil_id) : undefined
    if (perfil && perfil.precio != null && perfil.pruebas_ids?.length) {
      const enPerfil = formOrden.pruebas_ids.filter(pid => perfil.pruebas_ids!.includes(pid))
      if (enPerfil.length) {
        const sumBase = enPerfil.reduce((s, pid) => s + out[pid], 0)
        const objetivo = Number(perfil.precio)
        let acum = 0
        enPerfil.forEach((pid, i) => {
          let v = sumBase > 0
            ? Math.round((out[pid] / sumBase) * objetivo * 100) / 100
            : Math.round((objetivo / enPerfil.length) * 100) / 100
          if (i === enPerfil.length - 1) v = Math.round((objetivo - acum) * 100) / 100
          acum += v
          out[pid] = v
        })
      }
    }
    return out
  }

  const totalOrdenModal = (() => {
    const imp = importesOrden()
    return formOrden.pruebas_ids.reduce((s, pid) => s + (imp[pid] ?? 0), 0)
  })()

  async function crearOrden() {
    if (!formOrden.paciente_id || formOrden.pruebas_ids.length === 0) {
      alert('Seleccione un paciente y al menos una prueba de laboratorio')
      return
    }

    let paciente = pacientesMerged.find(p => String(p.id) === formOrden.paciente_id)
    if (!paciente?.id) {
      const { data: pDb } = await supabase
        .from('pacientes')
        .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, fecha_nac, lista_id, celular, telefono, genero')
        .eq('id', Number(formOrden.paciente_id))
        .maybeSingle()
      if (pDb) {
        paciente = pDb as PacienteLab
        setPacientesExtra(prev => prev.some(x => x.id === pDb.id) ? prev : [...prev, paciente!])
      }
    }
    if (!paciente?.id) {
      alert('Seleccione un paciente válido')
      return
    }

    if (!sucursalId) {
      alert('Su usuario no tiene sucursal asignada. Asigne una en Configuración → Usuarios.')
      return
    }

    const medicoSel = formOrden.medico_id
      ? medicosState.find(m => String(m.id) === formOrden.medico_id)
      : undefined
    const perfilIdNum = formOrden.perfil_id ? Number(formOrden.perfil_id) : null

    const grupoId = crypto.randomUUID()
    const hora = new Date().toTimeString().slice(0, 8)
    const imp = importesOrden()
    const filas = formOrden.pruebas_ids.flatMap(pid => {
      const prueba = pruebasCatalogo.find(p => p.id === pid)
      if (!prueba) return []
      const precio = imp[pid] ?? precioPruebaParaPaciente(pid, formOrden.paciente_id)
      return [{
        id_consulta: null as null,
        id_cliente: String(paciente.id),
        paciente_id: paciente.id,
        id_analisis: String(pid),
        no_analisis: prueba.nombre,
        valor: precio,
        cant: 1,
        importe: precio,
        fecha: fechaHoy,
        hora,
        entregado: false,
        pagado: false,
        estado_lab: 'PENDIENTE_COBRO',
        lab_grupo_id: grupoId,
        fecha_prometida: computeFechaPrometida(fechaHoy, prueba.dias ?? 1),
        sucursal_id: sucursalId,
        // Campos extra (migración 068)
        medico_id: medicoSel?.id ?? null,
        medico_nombre: medicoSel?.nombre ?? null,
        perfil_id: perfilIdNum,
        observaciones: formOrden.observaciones.trim() || null,
        entrega_fecha: formOrden.entrega_fecha ? new Date(formOrden.entrega_fecha).toISOString() : null,
        entrega_whatsapp: formOrden.entrega_whatsapp,
        entrega_email: formOrden.entrega_email,
        entrega_fisico: formOrden.entrega_fisico,
        urgente: formOrden.urgente,
      }]
    })

    if (filas.length === 0) {
      alert('No se encontraron pruebas válidas en el catálogo')
      return
    }

    setGuardandoOrden(true)
    let error = (await supabase.from('consulta_analisis').insert(filas)).error

    if (error && /lab_grupo_id|fecha_prometida|estado_lab|paciente_id|sucursal_id|medico_id|medico_nombre|perfil_id|observaciones|entrega_|urgente|schema cache/i.test(error.message)) {
      const filasBase = filas.map(({
        lab_grupo_id, fecha_prometida, estado_lab, paciente_id, sucursal_id,
        medico_id, medico_nombre, perfil_id, observaciones, entrega_fecha,
        entrega_whatsapp, entrega_email, entrega_fisico, urgente,
        ...rest
      }) => rest)
      error = (await supabase.from('consulta_analisis').insert(filasBase)).error
    }

    setGuardandoOrden(false)

    if (error) {
      alert('Error al generar la orden: ' + error.message)
      return
    }

    cerrarModalOrden()
    setTab('cola')
    setFiltroLab('todas')
    await recargar()
    alert(
      `Orden generada correctamente (${filas.length} prueba${filas.length !== 1 ? 's' : ''}).\n\n` +
      'Aparece en la columna «Sin cobrar» del Kanban. Cobre en Ventas → Lab por cobrar.',
    )
  }

  function claveCampo(ordenId: number, campoId?: number | null) {
    return campoId ? `${ordenId}-${campoId}` : `${ordenId}-simple`
  }

  function campoIdDesdeClave(key: string): number | null {
    const parts = key.split('-')
    if (parts.length < 2 || parts[1] === 'simple') return null
    const id = Number(parts[1])
    return Number.isFinite(id) ? id : null
  }

  function initFormResultados(grupo: GrupoLab) {
    const pac = pacientesMerged.find(p => p.id === grupo.pacienteId)
    const edad = calcularEdad(pac?.fecha_nac)
    const pre: Record<string, CampoResultadoForm> = {}

    for (const orden of grupo.ordenes) {
      const pid = Number(orden.id_analisis)
      const prueba = pruebasCatalogo.find(p => p.id === pid)
      const campos = prueba?.es_panel ? panelCamposMap[pid] : null

      if (campos?.length) {
        for (const campo of campos) {
          const exist = orden.resultados?.find(r => r.campo_id === campo.id)
          const rango = buscarRangoAplicable(rangosState, pid, edad, pac?.genero, campo.id)
          pre[claveCampo(orden.id, campo.id)] = {
            valor: exist?.valor_resultado ?? '',
            unidad: exist?.unidad ?? campo.unidad ?? rango?.unidad ?? '',
            rango_texto: exist?.rango_texto ?? rango?.rango_texto ?? '',
            rango_min: exist?.rango_min ?? rango?.rango_min ?? null,
            rango_max: exist?.rango_max ?? rango?.rango_max ?? null,
            anormal: exist?.anormal ?? false,
            obs: exist?.observacion ?? '',
            resultadoId: exist?.id,
          }
        }
      } else {
        const exist = orden.resultados?.[0]
        const rango = buscarRangoAplicable(rangosState, pid, edad, pac?.genero)
        pre[claveCampo(orden.id)] = {
          valor: exist?.valor_resultado ?? '',
          unidad: exist?.unidad ?? rango?.unidad ?? '',
          rango_texto: exist?.rango_texto ?? rango?.rango_texto ?? '',
          rango_min: exist?.rango_min ?? rango?.rango_min ?? null,
          rango_max: exist?.rango_max ?? rango?.rango_max ?? null,
          anormal: exist?.anormal ?? false,
          obs: exist?.observacion ?? '',
          resultadoId: exist?.id,
        }
      }
    }
    setResultForm(pre)
  }

  async function abrirGrupo(grupo: GrupoLab) {
    setGrupoActual(grupo)
    initFormResultados(grupo)

    const idsPendientes = grupo.ordenes
      .filter(o => estadoOrdenLab(o) === 'PAGADO')
      .map(o => o.id)
    if (idsPendientes.length) {
      await supabase.from('consulta_analisis')
        .update({ estado_lab: 'EN_PROCESO' })
        .in('id', idsPendientes)
      const { data: { user } } = await supabase.auth.getUser()
      const ordenesConsumo = grupo.ordenes
        .filter(o => idsPendientes.includes(o.id))
        .map(o => ({
          ordenId: o.id,
          pruebaId: Number(o.id_analisis),
          ingreso: Number(o.importe || o.valor || 0),
        }))
        .filter(o => Number.isFinite(o.pruebaId) && o.pruebaId > 0)
      const { errores } = await descontarInsumosLab(supabase, ordenesConsumo, sucursalId, user?.id, pruebasCostosMap)
      if (errores.length) alert('Aviso de inventario:\n' + errores.join('\n'))
    }
    setModalResultados(true)
    startTransition(() => { recargar() })
  }

  function onValorChange(key: string, field: keyof CampoResultadoForm, value: string | boolean, ordenId: number, pruebaId: number) {
    setResultForm(prev => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } }
      if (field === 'valor' && typeof value === 'string') {
        const pac = grupoActual ? pacientesMerged.find(p => p.id === grupoActual.pacienteId) : undefined
        const campoId = campoIdDesdeClave(key)
        const rango = buscarRangoAplicable(rangosState, pruebaId, calcularEdad(pac?.fecha_nac), pac?.genero, campoId)
        const ev = evaluarValorRango(value, rango)
        next[key] = {
          ...next[key],
          anormal: ev.anormal,
          rango_texto: next[key].rango_texto || ev.rangoTexto,
          unidad: next[key].unidad || ev.unidad,
          rango_min: next[key].rango_min ?? ev.rangoMin,
          rango_max: next[key].rango_max ?? ev.rangoMax,
        }
      }
      return next
    })
  }

  async function upsertResultado(payload: Record<string, unknown>, resultadoId?: number) {
    const run = (p: Record<string, unknown>) => resultadoId
      ? supabase.from('lab_resultados').update(p).eq('id', resultadoId)
      : supabase.from('lab_resultados').insert(p)
    let { error } = await run(payload)
    if (error && /rango_min|rango_max|schema cache/i.test(error.message)) {
      const { rango_min, rango_max, ...base } = payload
      error = (await run(base)).error
    }
    return error
  }

  async function subirArchivoMaquila(file: File) {
    if (!grupoActual) return
    if (!aceptaArchivoResultadoLab(file)) {
      alert('Seleccione un archivo PDF o imagen (JPG/PNG).')
      return
    }
    setSubiendoArchivo(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const path = `${grupoActual.pacienteId}/${grupoActual.grupoId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from(LAB_RESULTADOS_BUCKET).upload(path, file, {
        cacheControl: '3600', upsert: false,
      })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('lab_archivos').insert({
        lab_grupo_id: grupoActual.grupoId,
        paciente_id: grupoActual.pacienteId,
        nombre_archivo: file.name,
        storage_path: path,
        mime_type: file.type || null,
        tamano_bytes: file.size,
        tipo: 'EXTERNO',
        subido_por: user?.id ?? null,
      })
      if (dbErr) throw dbErr
      const ids = grupoActual.ordenes.map(o => o.id)
      await supabase.from('consulta_analisis').update({
        resultado_externo: true,
        updated_at: new Date().toISOString(),
      }).in('id', ids)
      await cargarArchivosGrupo(grupoActual.grupoId)
    } catch (e) {
      alert('Error al subir: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setSubiendoArchivo(false)
      if (inputArchivoRef.current) inputArchivoRef.current.value = ''
    }
  }

  async function eliminarArchivoMaquila(archivo: LabArchivo) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar archivo',
      message: `¿Está seguro que desea eliminar "${archivo.nombre_archivo}"?`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    await supabase.storage.from(LAB_RESULTADOS_BUCKET).remove([archivo.storage_path])
    await supabase.from('lab_archivos').delete().eq('id', archivo.id)
    if (grupoActual) await cargarArchivosGrupo(grupoActual.grupoId)
  }

  function abrirArchivoMaquila(archivo: LabArchivo, encabezado: LabEncabezadoInforme = encabezadoInforme) {
    window.open(`/api/lab/archivo/${archivo.id}?encabezado=${encabezado}`, '_blank')
  }

  async function registrarCostosOrdenesSinConsumir(ordenesLab: OrdenLab[]) {
    for (const orden of ordenesLab) {
      const pid = Number(orden.id_analisis)
      const prueba = pruebasCostosMap[pid]
      if (!prueba) continue
      const { data: consumos } = await supabase
        .from('lab_consumos_orden')
        .select('costo_total')
        .eq('orden_id', orden.id)
      const costoInsumos = (consumos ?? []).reduce((s, r) => s + Number(r.costo_total || 0), 0)
      await upsertCostoOrden(supabase, {
        ordenId: orden.id,
        prueba,
        ingreso: Number(orden.importe || orden.valor || 0),
        costoInsumos,
        costoMaquila: costoMaquilaAplicable(prueba),
      })
    }
  }

  async function persistirResultadosMaquila(modo: 'borrador' | 'validar' | 'entregar') {
    if (!grupoActual) return
    const pac = pacientesMerged.find(p => p.id === grupoActual.pacienteId)
    const estado: EstadoLab = modo === 'entregar' ? 'ENTREGADO' : modo === 'validar' ? 'VALIDADO' : 'RESULTADO_LISTO'
    const ids = grupoActual.ordenes.map(o => o.id)
    const upd: Record<string, unknown> = {
      estado_lab: estado,
      resultado_externo: true,
      resultado_resumen: 'Ver archivo adjunto',
      updated_at: new Date().toISOString(),
    }
    if (modo === 'validar') upd.validado_at = new Date().toISOString()
    if (modo === 'entregar') {
      upd.entregado = true
      upd.fecha_resultado = fechaHoy
      upd.notificado_at = new Date().toISOString()
    }
    const { error } = await supabase.from('consulta_analisis').update(upd).in('id', ids)
    if (error) return alert('Error: ' + error.message)
    for (const orden of grupoActual.ordenes) {
      await registrarAuditoriaLab(supabase, orden.id, modo, 'Resultado externo PDF')
    }
    await registrarCostosOrdenesSinConsumir(grupoActual.ordenes)
    if (modo === 'entregar') {
      const tel = pac?.celular || pac?.telefono || grupoActual.telefono
      if (tel && confirm('¿Notificar al paciente por WhatsApp con el enlace al portal?')) {
        await enviarResultadosWhatsApp({ ...grupoActual, telefono: tel })
      }
    }
    setModalResultados(false)
    setGrupoActual(null)
    startTransition(() => { recargar() })
  }

  async function persistirResultados(modo: 'borrador' | 'validar' | 'entregar') {
    if (!grupoActual) return
    if (archivosGrupo.length > 0) {
      if (modo === 'validar' || modo === 'entregar') {
        return persistirResultadosMaquila(modo)
      }
      if (modo === 'borrador') {
        return persistirResultadosMaquila('borrador')
      }
    }
    const pac = pacientesMerged.find(p => p.id === grupoActual.pacienteId)

    for (const orden of grupoActual.ordenes) {
      const pid = Number(orden.id_analisis)
      const prueba = pruebasCatalogo.find(p => p.id === pid)
      const campos = prueba?.es_panel ? panelCamposMap[pid] : null

      if (campos?.length) {
        for (const campo of campos) {
          const key = claveCampo(orden.id, campo.id)
          const vals = resultForm[key]
          if (!vals) continue
          const payload = {
            orden_id: orden.id,
            paciente_id: grupoActual.pacienteId,
            prueba_id: pid,
            campo_id: campo.id,
            nombre_prueba: campo.nombre,
            valor_resultado: vals.valor,
            unidad: vals.unidad,
            rango_texto: vals.rango_texto,
            rango_min: vals.rango_min,
            rango_max: vals.rango_max,
            anormal: vals.anormal,
            observacion: vals.obs,
            fecha: fechaHoy,
          }
          const error = await upsertResultado(payload, vals.resultadoId)
          if (error) return alert('Error: ' + error.message)
        }
      } else {
        const key = claveCampo(orden.id)
        const vals = resultForm[key]
        if (!vals) continue
        const payload = {
          orden_id: orden.id,
          paciente_id: grupoActual.pacienteId,
          prueba_id: pid,
          nombre_prueba: orden.no_analisis,
          valor_resultado: vals.valor,
          unidad: vals.unidad,
          rango_texto: vals.rango_texto,
          rango_min: vals.rango_min,
          rango_max: vals.rango_max,
          anormal: vals.anormal,
          observacion: vals.obs,
          fecha: fechaHoy,
        }
        const error = await upsertResultado(payload, vals.resultadoId)
        if (error) return alert('Error: ' + error.message)
      }

      const keysOrden = Object.keys(resultForm).filter(k => k.startsWith(`${orden.id}-`))
      const todosLlenos = keysOrden.every(k => resultForm[k]?.valor?.trim())
      const algunoLleno = keysOrden.some(k => resultForm[k]?.valor?.trim())
      const resumen = keysOrden.map(k => resultForm[k]?.valor).filter(Boolean).join(' · ')

      let estado: EstadoLab = 'EN_PROCESO'
      if (modo === 'entregar') estado = 'ENTREGADO'
      else if (modo === 'validar') estado = 'VALIDADO'
      else if (todosLlenos) estado = 'RESULTADO_LISTO'
      else if (algunoLleno) estado = 'BORRADOR'

      const upd: Record<string, unknown> = {
        estado_lab: estado,
        resultado_resumen: resumen || null,
        updated_at: new Date().toISOString(),
      }
      if (modo === 'validar') {
        upd.validado_at = new Date().toISOString()
      }
      if (modo === 'entregar') {
        upd.entregado = true
        upd.fecha_resultado = fechaHoy
        upd.notificado_at = new Date().toISOString()
      }

      const { error: errO } = await supabase.from('consulta_analisis').update(upd).eq('id', orden.id)
      if (errO) return alert('Error orden: ' + errO.message)

      await registrarAuditoriaLab(supabase, orden.id, modo, resumen)
    }

    await registrarCostosOrdenesSinConsumir(grupoActual.ordenes)

    if (modo === 'validar') {
      const tel = pac?.celular || pac?.telefono || grupoActual.telefono
      if (tel && confirm('¿Avisar al paciente por WhatsApp que su resultado de laboratorio está listo?')) {
        await enviarResultadosWhatsApp({ ...grupoActual, telefono: tel })
      }
    }

    if (modo === 'entregar') {
      const tel = pac?.celular || pac?.telefono || grupoActual.telefono
      if (tel && confirm('¿Notificar al paciente por WhatsApp con el enlace al portal?')) {
        await enviarResultadosWhatsApp({ ...grupoActual, telefono: tel })
      }
    }

    setModalResultados(false)
    setGrupoActual(null)
    startTransition(() => { recargar() })
  }

  async function moverGrupo(grupo: GrupoLab, nuevoEstado: EstadoLab) {
    const ids = grupo.ordenes.map(o => o.id)
    const upd: Record<string, unknown> = { estado_lab: nuevoEstado, updated_at: new Date().toISOString() }
    if (nuevoEstado === 'ENTREGADO') { upd.entregado = true; upd.fecha_resultado = fechaHoy }
    if (nuevoEstado === 'PAGADO' || nuevoEstado === 'PENDIENTE_COBRO') upd.entregado = false
    const { error } = await supabase.from('consulta_analisis').update(upd).in('id', ids)
    if (error) {
      alert('No se pudo mover la orden: ' + error.message)
      return
    }
    if (nuevoEstado === 'EN_PROCESO') {
      const { data: { user } } = await supabase.auth.getUser()
      const ordenesConsumo = grupo.ordenes
        .map(o => ({
          ordenId: o.id,
          pruebaId: Number(o.id_analisis),
          ingreso: Number(o.importe || o.valor || 0),
        }))
        .filter(o => Number.isFinite(o.pruebaId) && o.pruebaId > 0)
      const { errores } = await descontarInsumosLab(supabase, ordenesConsumo, sucursalId, user?.id, pruebasCostosMap)
      if (errores.length) alert('Aviso de inventario:\n' + errores.join('\n'))
    }
    startTransition(() => { recargar() })
  }

  async function imprimirGrupo(grupo: GrupoLab, encabezado: LabEncabezadoInforme = encabezadoInforme) {
    if (encabezado === 'masterlab') {
      const { data } = await supabase
        .from('lab_archivos')
        .select('id')
        .eq('lab_grupo_id', grupo.grupoId)
        .order('created_at', { ascending: false })
        .limit(1)
      const archivoId = data?.[0]?.id
      if (archivoId) {
        window.open(`/api/lab/archivo/${archivoId}?encabezado=masterlab`, '_blank')
        return
      }
      alert('No hay PDF de Masterlab subido para esta orden. Suba el archivo en Resultados o elija informe Clínica Jerusalén.')
    }

    const filas = filasPrintDesdeGrupo(grupo, pruebasCatalogo, panelCamposMap)
    const pac = pacientesMerged.find(p => p.id === grupo.pacienteId)
    const fechaResultado = grupo.ordenes.map(o => o.fecha_resultado).filter(Boolean).sort().pop()
    imprimirResultadoGrupoLab(grupo, filas, {
      edad: calcularEdad(pac?.fecha_nac),
      sexo: pac?.genero,
      fechaResultado: fechaResultado ?? undefined,
      portalUrl: portalBaseUrl(),
      medicoNombre: grupo.medicoNombre,
      urgente: grupo.urgente,
      observaciones: grupo.observaciones,
      encabezado,
    })
  }

  function portalBaseUrl(): string {
    const env = process.env.NEXT_PUBLIC_APP_URL
    if (env) return env.replace(/\/$/, '') + '/portal'
    if (typeof window !== 'undefined') return window.location.origin + '/portal'
    return '/portal'
  }

  async function generarAcceso(grupo: GrupoLab) {
    setGenerandoAcceso(true)
    const r = await generarAccesoPortal(grupo.pacienteId)
    setGenerandoAcceso(false)
    if (!r.ok || !r.usuario || !r.password) {
      alert(r.error || 'No se pudo generar el acceso al portal.')
      return
    }
    setAcceso({ usuario: r.usuario, password: r.password, telefono: grupo.telefono, nombre: grupo.pacienteNombre })
    setModalAcceso(true)
  }

  function enviarAccesoWhatsApp() {
    if (!acceso) return
    const msg = `Hola ${acceso.nombre}, su acceso al Portal del Paciente de ${BRAND.nombre}:\n\n`
      + `Portal: ${portalBaseUrl()}\n`
      + `Usuario: ${acceso.usuario}\n`
      + `Contraseña: ${acceso.password}\n\n`
      + `Sus resultados de laboratorio ya están disponibles para descargar.`
    const link = linkWhatsAppMensaje(acceso.telefono, undefined, msg)
    if (!link) { alert('El paciente no tiene un celular válido registrado.'); return }
    window.open(link, '_blank')
  }

  async function enviarResultadosWhatsApp(grupo: GrupoLab) {
    if (!grupo.telefono) { alert('El paciente no tiene un celular válido registrado.'); return }
    const msg = `Hola ${grupo.pacienteNombre}, sus resultados de laboratorio (${grupo.pruebas.join(', ')}) ya están listos en ${BRAND.nombre}.\n\n`
      + `Descárguelos en línea: ${portalBaseUrl()}\n`
      + `Usuario: el que aparece en su comprobante de la clínica.\n\n`
      + `Si aún no tiene contraseña, solicítela en la clínica.`
    const link = linkWhatsAppMensaje(grupo.telefono, undefined, msg)
    if (!link) { alert('El paciente no tiene un celular válido registrado.'); return }
    window.open(link, '_blank')
    const ids = grupo.ordenes.map(o => o.id)
    await supabase.from('consulta_analisis').update({ notificado_at: new Date().toISOString() }).in('id', ids)
  }

  async function guardarPrueba() {
    if (!formPrueba.nombre) return
    const payload = {
      nombre: formPrueba.nombre,
      description: formPrueba.description,
      color: formPrueba.color,
      dias: Number(formPrueba.dias),
      costo: Number(formPrueba.costo),
      comision: Number(formPrueba.comision),
      nota: formPrueba.nota,
      es_panel: formPrueba.es_panel,
      procesamiento: formPrueba.procesamiento,
      proveedor_id: formPrueba.proveedor_id ? Number(formPrueba.proveedor_id) : null,
      costo_maquila: Number(formPrueba.costo_maquila) || 0,
      activo: true,
    }
    let pruebaId = pruebaActual?.id
    if (pruebaActual) {
      await supabase.from('laboratorio_info').update(payload).eq('id', pruebaActual.id)
    } else {
      const { data } = await supabase.from('laboratorio_info').insert(payload).select('id').single()
      pruebaId = data?.id
    }

    if (pruebaId && insumosPrueba.length) {
      await supabase.from('laboratorio_insumo').delete().eq('prueba_id', pruebaId)
      for (const ins of insumosPrueba) {
        if (!ins.producto_id) continue
        await supabase.from('laboratorio_insumo').insert({
          prueba_id: pruebaId,
          producto_id: Number(ins.producto_id),
          cantidad: Number(ins.cantidad) || 1,
        })
      }
    }

    setModalPrueba(false)
    setPruebaActual(null)
    resetFormPrueba()
    setInsumosPrueba([])
    await cargarCatalogoPruebas()
    startTransition(() => { recargar() })
  }

  /* ── configuración: rangos de referencia y campos de panel ── */
  function abrirConfig(prueba: PruebaLab) {
    setConfigPrueba(prueba)
    setFormRango({ campo_id: '', genero: '', edad_min: '0', edad_max: '120', rango_min: '', rango_max: '', rango_texto: '', unidad: '' })
    setFormCampo({ nombre: '', codigo: '', unidad: '', orden: '' })
    setModalConfig(true)
  }

  async function guardarRango() {
    if (!configPrueba) return
    if (configPrueba.es_panel && !formRango.campo_id) {
      alert('Seleccione el parámetro (análisis) al que aplica este rango.')
      return
    }
    const min = formRango.rango_min.trim() === '' ? null : Number(formRango.rango_min.replace(',', '.'))
    const max = formRango.rango_max.trim() === '' ? null : Number(formRango.rango_max.replace(',', '.'))
    const texto = formRango.rango_texto.trim() || null
    if (min == null && max == null && !texto) {
      alert('Defina un rango numérico (mín/máx) o un valor de referencia en texto (ej. "Negativo").')
      return
    }
    setGuardandoConfig(true)
    const payload = {
      prueba_id: configPrueba.id,
      campo_id: formRango.campo_id ? Number(formRango.campo_id) : null,
      genero: formRango.genero || null,
      edad_min: Number(formRango.edad_min) || 0,
      edad_max: Number(formRango.edad_max) || 120,
      rango_min: min,
      rango_max: max,
      rango_texto: texto,
      unidad: formRango.unidad.trim() || null,
    }
    const { data, error } = await supabase.from('lab_rangos').insert(payload).select('*').single()
    setGuardandoConfig(false)
    if (error) {
      alert(/unique|duplicate/i.test(error.message)
        ? 'Ya existe un rango para ese sexo y rango de edad. Edite o elimine el existente.'
        : 'No se pudo guardar: ' + error.message)
      return
    }
    if (data) setRangosState(prev => [...prev, data as LabRango])
    setFormRango({ campo_id: '', genero: '', edad_min: '0', edad_max: '120', rango_min: '', rango_max: '', rango_texto: '', unidad: '' })
  }

  async function eliminarRango(id: number) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar rango de referencia',
      message: '¿Está seguro que desea eliminar este rango de referencia?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('lab_rangos').delete().eq('id', id)
    if (error) return alert('No se pudo eliminar: ' + error.message)
    setRangosState(prev => prev.filter(r => r.id !== id))
  }

  function camposPanelOrdenados(pruebaId: number) {
    return panelCamposState
      .filter(c => c.prueba_id === pruebaId)
      .slice()
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }

  function seleccionarCampoRango(campo: LabPanelCampo) {
    const existente = rangosState.find(r => r.prueba_id === configPrueba?.id && r.campo_id === campo.id)
    setFormRango({
      campo_id: String(campo.id),
      genero: existente?.genero ?? '',
      edad_min: String(existente?.edad_min ?? 0),
      edad_max: String(existente?.edad_max ?? 120),
      rango_min: existente?.rango_min != null ? String(existente.rango_min) : '',
      rango_max: existente?.rango_max != null ? String(existente.rango_max) : '',
      rango_texto: existente?.rango_texto ?? '',
      unidad: existente?.unidad ?? campo.unidad ?? '',
    })
  }

  async function guardarCampo() {
    if (!configPrueba) return
    const nombre = formCampo.nombre.trim()
    if (!nombre) return alert('Escriba el nombre del parámetro')
    setGuardandoConfig(true)
    const payload = {
      prueba_id: configPrueba.id,
      nombre,
      codigo: formCampo.codigo.trim() || null,
      unidad: formCampo.unidad.trim() || null,
      orden: Number(formCampo.orden) || (panelCamposState.filter(c => c.prueba_id === configPrueba.id).length + 1),
      activo: true,
    }
    const { data, error } = await supabase.from('lab_panel_campos').insert(payload).select('*').single()
    setGuardandoConfig(false)
    if (error) return alert('No se pudo guardar: ' + error.message)
    if (data) setPanelCamposState(prev => [...prev, data as LabPanelCampo])
    setFormCampo({ nombre: '', codigo: '', unidad: '', orden: '' })
  }

  async function eliminarCampo(id: number) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar parámetro',
      message: '¿Está seguro que desea eliminar este parámetro del panel?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('lab_panel_campos').delete().eq('id', id)
    if (error) return alert('No se pudo eliminar: ' + error.message)
    setPanelCamposState(prev => prev.filter(c => c.id !== id))
  }

  const emptyFormOrden = {
    paciente_id: '', pruebas_ids: [] as number[], medico_id: '', perfil_id: '',
    observaciones: '', entrega_fecha: '',
    entrega_whatsapp: false, entrega_email: false, entrega_fisico: true, urgente: false,
  }

  function resetNuevoPac() {
    setMostrarNuevoPac(false)
    setFormNuevoPac({
      nombre: '', apellido1: '', apellido2: '',
      fecha_nac: '', genero: '', telefono: '', celular: '', correo: '', cedula: '',
    })
    setMostrarNuevoMedico(false)
    setFormMedicoRapido({ nombre: '', especialidad: '', colegiado: '', telefono: '' })
  }

  function abrirModalOrden() {
    setFormOrden({ ...emptyFormOrden })
    resetNuevoPac()
    setModalOrden(true)
  }

  function cerrarModalOrden() {
    setModalOrden(false)
    setFormOrden({ ...emptyFormOrden })
    resetNuevoPac()
  }

  const gruposBusqueda = useMemo(() => {
    const q = busqueda.toLowerCase()
    if (!q) return grupos
    return grupos.filter(g =>
      g.pacienteNombre.toLowerCase().includes(q) ||
      g.pruebas.some(p => p.toLowerCase().includes(q)) ||
      g.pacienteCodigo.toLowerCase().includes(q),
    )
  }, [grupos, busqueda])

  const gruposFiltrados = useMemo(() => {
    return gruposBusqueda.filter(g => {
      if (filtroLab === 'procesar' && !['PAGADO', 'EN_PROCESO', 'BORRADOR', 'RESULTADO_LISTO', 'VALIDADO'].includes(g.estado)) return false
      if (filtroLab === 'pendiente_cobro' && g.estado !== 'PENDIENTE_COBRO') return false
      if (filtroLab === 'completadas' && g.estado !== 'ENTREGADO') return false
      if (filtroLab === 'atrasadas' && !g.atrasado) return false
      return true
    })
  }, [gruposBusqueda, filtroLab])

  const fechaLabel = new Date(fechaHoy + 'T12:00:00').toLocaleDateString('es-HN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <ModuleShell tint="cyan">
      <ModuleHero
        title="Laboratorio"
        subtitle={fechaLabel}
        badge="Laboratorio Clínico"
        icon={FlaskConical}
        gradient="cyan"
        kpis={[
          { label: 'Lotes (7 días)', value: stats.total, icon: ClipboardList },
          { label: 'Por procesar', value: stats.procesar, icon: Beaker },
          { label: 'Sin cobrar', value: stats.pendCobro, icon: Clock },
          { label: 'Atrasadas SLA', value: stats.atrasadas, icon: AlertCircle },
        ]}
        actions={
          <>
            <ModuleBtnGhost onClick={() => startTransition(() => recargar())}>
              <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
              Actualizar
            </ModuleBtnGhost>
            <ModuleBtnPrimary onClick={abrirModalOrden}>
              <Plus className="w-4 h-4" /> Nueva Orden
            </ModuleBtnPrimary>
          </>
        }
      />
      <ModuleContent>
        <div className="bg-white rounded-xl border">
          <div className="flex border-b overflow-x-auto">
            {tabsLaboratorio.map(({ id: t, label, icon: Icon }) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab !== 'reportes' && (
              <div className="relative mb-4 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar paciente, prueba, código…"
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
            )}

            {tab === 'cola' && (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-50 border rounded-lg">
                  <label htmlFor="lab-encabezado-cola" className="text-xs font-semibold text-gray-700">
                    Tipo de informe:
                  </label>
                  <select
                    id="lab-encabezado-cola"
                    value={encabezadoInforme}
                    onChange={e => setEncabezadoInforme(e.target.value as LabEncabezadoInforme)}
                    className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="clinica">{LAB_ENCABEZADO_LABELS.clinica}</option>
                    <option value="masterlab">{LAB_ENCABEZADO_LABELS.masterlab}</option>
                  </select>
                  <span className="text-xs text-gray-500">
                    Clínica = encabezado Jerusalén + sello Masterlab · Masterlab = PDF subido con plantilla Masterlab
                  </span>
                </div>
                <LabKanban
                  grupos={gruposBusqueda}
                  onAbrirGrupo={abrirGrupo}
                  onEtiquetas={g => imprimirEtiquetasTubo(g, pruebasCatalogo)}
                  onImprimir={g => imprimirGrupo(g)}
                  onMoverGrupo={moverGrupo}
                />
              </>
            )}

            {tab === 'ordenes' && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    ['procesar', `Por procesar (${stats.procesar})`],
                    ['pendiente_cobro', `Sin cobrar (${stats.pendCobro})`],
                    ['atrasadas', `Atrasadas SLA (${stats.atrasadas})`],
                    ['completadas', `Entregadas (${stats.entregado})`],
                    ['todas', 'Todas'],
                  ] as const).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setFiltroLab(id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        filtroLab === id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="space-y-3">
                  {gruposFiltrados.length === 0 && (
                    <p className="text-center py-10 text-gray-400">No hay lotes en este filtro</p>
                  )}
                  {gruposFiltrados.map(g => (
                    <div key={g.grupoId} className={`border rounded-xl p-4 ${g.atrasado ? 'border-red-200 bg-red-50/30' : 'bg-gray-50/50'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-gray-900 flex items-center gap-2">
                            {g.pacienteNombre}
                            {g.urgente && (
                              <span className="text-[10px] font-extrabold bg-red-600 text-white px-2 py-0.5 rounded inline-flex items-center gap-1">
                                <Zap className="w-3 h-3" /> URGENTE
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {g.pacienteCodigo} · {g.fecha} · {g.ordenes.length} prueba(s)
                            {g.medicoNombre ? ` · Dr(a). ${g.medicoNombre}` : ''}
                          </p>
                          {g.atrasado && (
                            <p className="text-xs text-red-600 font-medium mt-0.5">
                              <AlertCircle className="w-3 h-3 inline" /> Atrasada {g.diasAtraso}d — prometida {g.fechaPrometida}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${claseBadgeEstadoLab(g.estado)}`}>
                            {etiquetaEstadoLab(g.estado)}
                          </span>
                          <span className="font-semibold text-sm">L. {g.totalImporte.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {g.ordenes.map(o => (
                          <span key={o.id} className="text-xs bg-white border px-2 py-1 rounded-lg">
                            {o.no_analisis}
                            {o.resultado_resumen && <span className="text-teal-700 ml-1">· {o.resultado_resumen}</span>}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['PAGADO', 'EN_PROCESO', 'BORRADOR', 'RESULTADO_LISTO', 'VALIDADO', 'ENTREGADO'].includes(g.estado) && (
                          <button type="button" onClick={() => abrirGrupo(g)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700">
                            Resultados
                          </button>
                        )}
                        <button type="button" onClick={() => imprimirEtiquetasTubo(g, pruebasCatalogo)}
                          className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 hover:bg-gray-200">
                          <Tag className="w-3 h-3 inline" /> Etiquetas
                        </button>
                        {g.tieneResultados && (
                          <>
                            <button type="button" onClick={() => imprimirGrupo(g)}
                              className="p-1.5 rounded bg-gray-100 hover:bg-gray-200"
                              title={`Imprimir informe (${LAB_ENCABEZADO_LABELS[encabezadoInforme]})`}>
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {(g.estado === 'VALIDADO' || g.estado === 'ENTREGADO') && (
                              <button type="button" onClick={() => generarAcceso(g)} disabled={generandoAcceso}
                                className="p-1.5 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200 disabled:opacity-50" title="Acceso al portal del paciente">
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {g.telefono && (
                              <button type="button"
                                onClick={() => enviarResultadosWhatsApp(g)}
                                className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200" title="Avisar por WhatsApp (con enlace al portal)">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        {g.estado === 'PENDIENTE_COBRO' && (
                          <span className="text-xs text-amber-600 self-center">Cobrar en Caja → Lab por cobrar</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {puedeVerAdminLab && tab === 'catalogo' && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    ['pruebas', `Pruebas (${pruebasCatalogo.length})`, Beaker],
                    ['perfiles', `Perfiles (${perfilesState.length})`, Package],
                    ['medicos', `Médicos (${medicosState.length})`, Stethoscope],
                  ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setCatTab(id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        catTab === id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {puedeVerAdminLab && tab === 'catalogo' && catTab === 'pruebas' && (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={() => {
                    setPruebaActual(null)
                    resetFormPrueba()
                    setInsumosPrueba([])
                    setModalPrueba(true)
                  }} className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /> Nueva Prueba
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                        <th className="px-4 py-3 text-left">Nombre</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-left">Proceso</th>
                        <th className="px-4 py-3 text-left">Tubo</th>
                        <th className="px-4 py-3 text-center">SLA</th>
                        <th className="px-4 py-3 text-right">Venta</th>
                        <th className="px-4 py-3 text-right">Costo est.</th>
                        <th className="px-4 py-3 text-right">Utilidad est.</th>
                        <th className="px-4 py-3 text-center">Insumos</th>
                        <th className="px-4 py-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pruebasCatalogo.filter(p => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())).map(p => {
                        const costoInsumos = costoEstimadoInsumosPrueba(p.id)
                        const costoMaquila = costoMaquilaAplicable(p)
                        const margen = calcularMargenEstimado(Number(p.costo), costoInsumos, costoMaquila, Number(p.comision))
                        return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{p.nombre}</p>
                            <p className="text-xs text-gray-400">{p.description || '—'}</p>
                          </td>
                          <td className="px-4 py-3">
                            {p.es_panel
                              ? <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Panel</span>
                              : <span className="text-xs text-gray-500">Simple</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${claseProcesamiento(p.procesamiento)}`}>
                              {labelProcesamiento(p.procesamiento)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {p.color && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tuboColorClase(p.color)}`}>{p.color}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{p.dias || 1}d</td>
                          <td className="px-4 py-3 text-right font-medium">L. {Number(p.costo).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-amber-700">L. {margen.costoTotal.toFixed(2)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${margen.utilidad >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            L. {margen.utilidad.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">
                            {(insumosMap[p.id]?.length ?? 0) || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button title="Rangos / parámetros" onClick={() => abrirConfig(p)}
                                className="p-1.5 rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>
                              <button title="Editar prueba" onClick={() => {
                                setPruebaActual(p)
                                setFormPrueba({
                                  nombre: p.nombre, description: p.description || '',
                                  color: p.color || '', dias: String(p.dias || 1),
                                  costo: String(p.costo), comision: String(p.comision),
                                  nota: '', es_panel: !!p.es_panel,
                                  procesamiento: (p.procesamiento ?? 'INTERNA') as ProcesamientoLab,
                                  proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
                                  costo_maquila: String(p.costo_maquila ?? 0),
                                })
                                setInsumosPrueba((insumosMap[p.id] ?? []).map(i => ({
                                  producto_id: String(i.producto_id),
                                  cantidad: String(i.cantidad),
                                })))
                                setModalPrueba(true)
                              }} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {puedeVerAdminLab && tab === 'catalogo' && catTab === 'perfiles' && (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={() => abrirModalPerfil(null)}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /> Nuevo Perfil / Paquete
                  </button>
                </div>
                {perfilesState.length === 0 ? (
                  <p className="text-center py-10 text-gray-400">
                    No hay perfiles. Cree paquetes que agrupen varias pruebas (ej. &quot;Perfil prenatal&quot;).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {perfilesState.filter(p => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())).map(p => (
                      <div key={p.id} className="border rounded-xl p-4 bg-gray-50/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{p.nombre}</p>
                            <p className="text-xs text-gray-500">{p.descripcion || '—'}</p>
                          </div>
                          {p.activo === false && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 my-2">
                          {(p.pruebas_ids ?? []).slice(0, 6).map(pid => {
                            const pr = pruebasCatalogo.find(x => x.id === pid)
                            return <span key={pid} className="text-[10px] bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded">{pr?.nombre ?? `#${pid}`}</span>
                          })}
                          {(p.pruebas_ids?.length ?? 0) > 6 && <span className="text-[10px] text-gray-400">+{(p.pruebas_ids!.length - 6)}</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-cyan-700">
                            {p.precio != null ? `L. ${Number(p.precio).toFixed(2)}` : 'Suma de pruebas'}
                          </span>
                          <div className="flex gap-1.5">
                            <button onClick={() => abrirModalPerfil(p)} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200" title="Editar">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => eliminarPerfil(p)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100" title="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {puedeVerAdminLab && tab === 'catalogo' && catTab === 'medicos' && (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={() => abrirModalMedico(null)}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm">
                    <Plus className="w-4 h-4" /> Nuevo Médico
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                        <th className="px-4 py-3 text-left">Nombre</th>
                        <th className="px-4 py-3 text-left">Especialidad</th>
                        <th className="px-4 py-3 text-left">Colegiado</th>
                        <th className="px-4 py-3 text-left">Contacto</th>
                        <th className="px-4 py-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {medicosState.filter(m => !busqueda || m.nombre.toLowerCase().includes(busqueda.toLowerCase())).map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{m.nombre}</p>
                            {m.activo === false && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.especialidad || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{m.colegiado || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{m.telefono || m.correo || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => abrirModalMedico(m)} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200" title="Editar">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => eliminarMedico(m)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100" title="Eliminar">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {medicosState.length === 0 && (
                    <p className="text-center py-10 text-gray-400">No hay médicos registrados.</p>
                  )}
                </div>
              </>
            )}

            {puedeVerAdminLab && tab === 'reportes' && <LabReportesPanel stats={reportes} />}
          </div>
        </div>

        {/* Modal nueva orden */}
        {modalOrden && (
          <LabModal title="Nueva Orden de Laboratorio" onClose={cerrarModalOrden} wide full>
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
              {/* ── Sección: Paciente ── */}
              <section className="rounded-xl border border-gray-100 bg-gradient-to-r from-slate-50 to-cyan-50/40 p-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 mb-3 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" /> Paciente
                </h4>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Buscar paciente *</label>
                <BuscarPacienteInput
                  pacientes={pacientesBusqueda}
                  value={formOrden.paciente_id}
                  onChange={id => setFormOrden(p => ({ ...p, paciente_id: id }))}
                  onSelectPaciente={registrarPacienteSeleccionado}
                  buscarRemoto={buscarPacienteRemoto}
                  placeholder="Buscar paciente registrado: nombre, código, RTN, teléfono…"
                  required
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Busca en todos los pacientes activos del sistema (mínimo 2 caracteres).
                </p>

                {!mostrarNuevoPac ? (
                  <button
                    type="button"
                    onClick={() => setMostrarNuevoPac(true)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 hover:text-cyan-800"
                  >
                    <Plus size={16} /> Registrar paciente nuevo
                  </button>
                ) : (
                  <div className="mt-3 rounded-xl border border-cyan-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-800">Registrar paciente nuevo</h4>
                      <button
                        type="button"
                        onClick={() => setMostrarNuevoPac(false)}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Cerrar"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                        <input
                          value={formNuevoPac.nombre}
                          onChange={e => setFormNuevoPac(p => ({ ...p, nombre: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Nombre"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Primer apellido *</label>
                        <input
                          value={formNuevoPac.apellido1}
                          onChange={e => setFormNuevoPac(p => ({ ...p, apellido1: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Apellido"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Segundo apellido</label>
                        <input
                          value={formNuevoPac.apellido2}
                          onChange={e => setFormNuevoPac(p => ({ ...p, apellido2: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Género *</label>
                        <select
                          value={formNuevoPac.genero}
                          onChange={e => setFormNuevoPac(p => ({ ...p, genero: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Seleccione…</option>
                          <option value="M">Masculino</option>
                          <option value="F">Femenino</option>
                          <option value="O">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Fecha de nacimiento *
                          {(() => {
                            const ed = formNuevoPac.fecha_nac ? edadPaciente(formNuevoPac.fecha_nac) : null
                            return ed !== null
                              ? <span className="ml-2 font-bold text-cyan-700">{ed} años</span>
                              : null
                          })()}
                        </label>
                        <input
                          type="date"
                          max={fechaHoy}
                          value={formNuevoPac.fecha_nac}
                          onChange={e => setFormNuevoPac(p => ({ ...p, fecha_nac: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Cédula / código</label>
                        <input
                          value={formNuevoPac.cedula}
                          onChange={e => setFormNuevoPac(p => ({ ...p, cedula: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Opcional (se autogenera si no tiene)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Celular</label>
                        <input
                          value={formNuevoPac.celular}
                          onChange={e => setFormNuevoPac(p => ({ ...p, celular: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Para enviar el portal por WhatsApp"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                        <input
                          value={formNuevoPac.telefono}
                          onChange={e => setFormNuevoPac(p => ({ ...p, telefono: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Correo</label>
                        <input
                          type="email"
                          value={formNuevoPac.correo}
                          onChange={e => setFormNuevoPac(p => ({ ...p, correo: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => setMostrarNuevoPac(false)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={registrarPacienteRapido}
                        disabled={
                          guardandoNuevoPac ||
                          !formNuevoPac.nombre.trim() ||
                          !formNuevoPac.apellido1.trim() ||
                          !formNuevoPac.fecha_nac ||
                          !formNuevoPac.genero
                        }
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {guardandoNuevoPac ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        Registrar y seleccionar
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* ── Sección: Datos de la orden ── */}
              <section className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" /> Datos de la orden
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    <Stethoscope className="w-4 h-4 inline mr-1 text-cyan-600" /> Médico solicitante
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formOrden.medico_id}
                      onChange={e => setFormOrden(p => ({ ...p, medico_id: e.target.value }))}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Sin médico / mostrador</option>
                      {medicosState.filter(m => m.activo !== false).map(m => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}{m.especialidad ? ` — ${m.especialidad}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setMostrarNuevoMedico(v => !v)}
                      className="px-2.5 rounded-lg border border-cyan-200 text-cyan-700 hover:bg-cyan-50 text-sm font-semibold whitespace-nowrap"
                    >
                      <Plus size={15} className="inline" /> Nuevo
                    </button>
                  </div>

                  {mostrarNuevoMedico && (
                    <div className="mt-3 rounded-lg border border-cyan-200 bg-white p-3 space-y-2">
                      <input
                        value={formMedicoRapido.nombre}
                        onChange={e => setFormMedicoRapido(p => ({ ...p, nombre: e.target.value }))}
                        placeholder="Nombre del médico *"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={formMedicoRapido.especialidad}
                          onChange={e => setFormMedicoRapido(p => ({ ...p, especialidad: e.target.value }))}
                          placeholder="Especialidad"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                        <input
                          value={formMedicoRapido.colegiado}
                          onChange={e => setFormMedicoRapido(p => ({ ...p, colegiado: e.target.value }))}
                          placeholder="Colegiado / registro"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setMostrarNuevoMedico(false)}
                          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
                        <button type="button" onClick={registrarMedicoRapido} disabled={guardandoMedico || !formMedicoRapido.nombre.trim()}
                          className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                          {guardandoMedico ? 'Guardando…' : 'Guardar médico'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-4">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    <Package className="w-4 h-4 inline mr-1 text-cyan-600" /> Perfil / paquete
                  </label>
                  <select
                    value={formOrden.perfil_id}
                    onChange={e => aplicarPerfil(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Ninguno (pruebas sueltas)</option>
                    {perfilesState.filter(p => p.activo !== false).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}{p.precio != null ? ` — L. ${Number(p.precio).toFixed(2)}` : ' (suma de pruebas)'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Al elegir un perfil se agregan sus pruebas a la selección. Si el perfil tiene precio propio, se usa ese precio.
                  </p>
                </div>
                </div>

                {/* Entrega y urgencia */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Fecha/hora de entrega</label>
                    <input
                      type="datetime-local"
                      value={formOrden.entrega_fecha}
                      onChange={e => setFormOrden(p => ({ ...p, entrega_fecha: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Entrega de resultados</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={formOrden.entrega_whatsapp}
                          onChange={e => setFormOrden(p => ({ ...p, entrega_whatsapp: e.target.checked }))} />
                        WhatsApp
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={formOrden.entrega_email}
                          onChange={e => setFormOrden(p => ({ ...p, entrega_email: e.target.checked }))} />
                        Email
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={formOrden.entrega_fisico}
                          onChange={e => setFormOrden(p => ({ ...p, entrega_fisico: e.target.checked }))} />
                        Físico
                      </label>
                    </div>
                  </div>
                </div>
                <label className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg cursor-pointer w-full sm:w-auto ${formOrden.urgente ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white border border-gray-200 text-gray-700'}`}>
                  <input type="checkbox" checked={formOrden.urgente}
                    onChange={e => setFormOrden(p => ({ ...p, urgente: e.target.checked }))} />
                  <Zap className={`w-4 h-4 ${formOrden.urgente ? 'text-red-600' : 'text-gray-400'}`} /> Marcar como URGENTE / Emergencia
                </label>
              </section>

              {/* ── Sección: Exámenes ── */}
              <section className="rounded-xl border border-gray-100 bg-white p-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 mb-3 flex items-center gap-1.5">
                  <TestTube2 className="w-3.5 h-3.5" /> Exámenes *
                </h4>
                <LabSelectorPruebas
                  pruebas={pruebasCatalogo}
                  selectedIds={formOrden.pruebas_ids}
                  onChange={ids => setFormOrden(p => ({ ...p, pruebas_ids: ids }))}
                  pacienteId={formOrden.paciente_id}
                  precioParaPaciente={precioPruebaParaPaciente}
                  loading={loadingCatalogo}
                />

                {/* Referencia y unidad informativas por examen seleccionado */}
                {formOrden.pruebas_ids.length > 0 && (() => {
                  const pacSel = pacientesMerged.find(p => String(p.id) === formOrden.paciente_id)
                  const edad = calcularEdad(pacSel?.fecha_nac)
                  return (
                    <div className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[420px]">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 uppercase">
                              <th className="px-3 py-2 text-left">Examen</th>
                              <th className="px-3 py-2 text-left">Valor de referencia</th>
                              <th className="px-3 py-2 text-left">Unidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {formOrden.pruebas_ids.map(pid => {
                              const prueba = pruebasCatalogo.find(p => p.id === pid)
                              const rango = buscarRangoAplicable(rangosState, pid, edad, pacSel?.genero)
                              const ev = evaluarValorRango('', rango)
                              return (
                                <tr key={pid}>
                                  <td className="px-3 py-1.5">{prueba?.nombre ?? `#${pid}`}</td>
                                  <td className="px-3 py-1.5 text-gray-600">{ev.rangoTexto || '—'}</td>
                                  <td className="px-3 py-1.5 text-gray-600">{ev.unidad || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-gray-400 px-3 py-1.5 bg-gray-50/60">
                        Referencia y unidad según edad/sexo del paciente (definidas en el catálogo). Informativo.
                      </p>
                    </div>
                  )
                })()}
              </section>

              {/* ── Sección: Observaciones ── */}
              <section className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 mb-3">Observaciones</h4>
                <textarea
                  value={formOrden.observaciones}
                  onChange={e => setFormOrden(p => ({ ...p, observaciones: e.target.value }))}
                  rows={2}
                  placeholder="Indicaciones, ayuno, notas para el laboratorio…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                />
              </section>
              </div>

              {/* Footer fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 pt-3 mt-3 border-t shrink-0">
                <div className="text-sm text-gray-600 text-center sm:text-left">
                  {formOrden.pruebas_ids.length > 0 ? (
                    <span>
                      <strong className="text-gray-900">{formOrden.pruebas_ids.length}</strong> prueba(s) ·{' '}
                      <strong className="text-cyan-700">
                        L. {totalOrdenModal.toFixed(2)}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-gray-400">Seleccione al menos una prueba</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={cerrarModalOrden} className="px-4 py-2 border rounded-lg text-sm order-2 sm:order-1">Cancelar</button>
                  <button onClick={crearOrden}
                    disabled={guardandoOrden || !formOrden.paciente_id || formOrden.pruebas_ids.length === 0}
                    className="px-5 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-sm order-1 sm:order-2">
                    <FlaskConical className="w-4 h-4 inline mr-1" />
                    {guardandoOrden ? 'Generando…' : 'Generar Orden'}
                  </button>
                </div>
              </div>
            </div>
          </LabModal>
        )}

        {/* Modal resultados grupo */}
        {modalResultados && grupoActual && (
          <LabModal title={`Resultados — ${grupoActual.pacienteNombre}`} onClose={() => { setModalResultados(false); setGrupoActual(null) }} wide full>
            <div className="space-y-4 max-h-[70dvh] overflow-y-auto pr-1">
              <div className="bg-cyan-50 rounded-lg p-3 text-sm flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold text-cyan-900">{grupoActual.pacienteNombre} ({grupoActual.pacienteCodigo})</p>
                  <p className="text-cyan-700">{grupoActual.pruebas.join(' · ')}</p>
                </div>
                <span className={`self-start px-2 py-1 rounded-full text-xs font-medium ${claseBadgeEstadoLab(grupoActual.estado)}`}>
                  {etiquetaEstadoLab(grupoActual.estado)}
                </span>
              </div>

              {grupoActual.ordenes.map(orden => {
                const pid = Number(orden.id_analisis)
                const prueba = pruebasCatalogo.find(p => p.id === pid)
                const campos = prueba?.es_panel ? panelCamposMap[pid] : null

                return (
                  <div key={orden.id} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{orden.no_analisis}</p>
                      {prueba?.color && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tuboColorClase(prueba.color)}`}>{prueba.color}</span>
                      )}
                      {prueba?.es_panel && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Panel multiparamétrico</span>
                      )}
                    </div>

                    {campos?.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {campos.map(campo => {
                          const key = claveCampo(orden.id, campo.id)
                          const vals = resultForm[key] ?? { valor: '', unidad: '', rango_texto: '', rango_min: null, rango_max: null, anormal: false, obs: '' }
                          const ind = indicadorDesdeRango(vals.valor, vals.rango_min, vals.rango_max)
                          return (
                            <div key={campo.id} className={`rounded-lg border p-3 space-y-2 ${vals.anormal ? 'border-red-300 bg-red-50/50' : ''}`}>
                              <p className="text-xs font-semibold text-gray-700">{campo.nombre} {campo.codigo && <span className="text-gray-400">({campo.codigo})</span>}</p>
                              <input value={vals.valor}
                                onChange={e => onValorChange(key, 'valor', e.target.value, orden.id, pid)}
                                placeholder="Valor"
                                className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <input value={vals.unidad} onChange={e => onValorChange(key, 'unidad', e.target.value, orden.id, pid)}
                                  placeholder="Unidad" className="border rounded px-2 py-1" />
                                <input value={vals.rango_texto} onChange={e => onValorChange(key, 'rango_texto', e.target.value, orden.id, pid)}
                                  placeholder="Referencia" className="border rounded px-2 py-1" />
                              </div>
                              {vals.anormal && (
                                <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {ind === 'ALTO' ? 'Alto ↑' : ind === 'BAJO' ? 'Bajo ↓' : 'Fuera de rango'}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${resultForm[claveCampo(orden.id)]?.anormal ? 'bg-red-50/50 rounded-lg p-2' : ''}`}>
                        {(() => {
                          const key = claveCampo(orden.id)
                          const vals = resultForm[key] ?? { valor: '', unidad: '', rango_texto: '', rango_min: null, rango_max: null, anormal: false, obs: '' }
                          return (
                            <>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Resultado *</label>
                                <input value={vals.valor}
                                  onChange={e => onValorChange(key, 'valor', e.target.value, orden.id, pid)}
                                  className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                                <input value={vals.unidad} onChange={e => onValorChange(key, 'unidad', e.target.value, orden.id, pid)}
                                  className="w-full border rounded px-2 py-1.5 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Referencia</label>
                                <input value={vals.rango_texto} onChange={e => onValorChange(key, 'rango_texto', e.target.value, orden.id, pid)}
                                  className="w-full border rounded px-2 py-1.5 text-sm" />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Observación</label>
                                <input value={vals.obs} onChange={e => onValorChange(key, 'obs', e.target.value, orden.id, pid)}
                                  className="w-full border rounded px-2 py-1.5 text-sm" />
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={vals.anormal}
                                    onChange={e => onValorChange(key, 'anormal', e.target.checked, orden.id, pid)} className="rounded" />
                                  <span className="text-sm text-red-600 font-medium">Anormal</span>
                                </label>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <section className="mt-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-sm font-bold text-teal-900 flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Resultado externo (Masterlab)
                  </h4>
                  <p className="text-xs text-teal-800/80 mt-0.5">
                    Suba el PDF de Masterlab. Al imprimir con tipo Masterlab se abre ese PDF con la plantilla;
                    el informe de clínica usa encabezado Jerusalén con el mismo sello y firma.
                  </p>
                </div>
                <div className="shrink-0">
                  <input
                    ref={inputArchivoRef}
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) subirArchivoMaquila(f)
                    }}
                  />
                  <button
                    type="button"
                    disabled={subiendoArchivo}
                    onClick={() => inputArchivoRef.current?.click()}
                    className="w-full sm:w-auto px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {subiendoArchivo ? 'Subiendo…' : 'Subir PDF / imagen'}
                  </button>
                </div>
              </div>
              {archivosGrupo.length > 0 ? (
                <ul className="space-y-2">
                  {archivosGrupo.map(a => (
                    <li key={a.id} className="flex items-center gap-2 bg-white border border-teal-100 rounded-lg px-3 py-2 text-sm">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="flex-1 min-w-0 truncate font-medium text-gray-800">{a.nombre_archivo}</span>
                      <button type="button" onClick={() => abrirArchivoMaquila(a)}
                        className="text-xs text-cyan-700 font-semibold hover:underline shrink-0">Ver</button>
                      <button type="button" onClick={() => eliminarArchivoMaquila(a)}
                        className="text-red-500 hover:text-red-700 shrink-0 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500 italic">Sin archivos adjuntos. Puede validar y entregar después de subir el PDF.</p>
              )}
            </section>

            <div className="flex flex-wrap items-center gap-2 pt-4 border-t mt-4">
              {grupoActual && (grupoActual.estado === 'VALIDADO' || grupoActual.estado === 'ENTREGADO') && (
                <button onClick={() => generarAcceso(grupoActual)} disabled={generandoAcceso}
                  className="px-3 py-2 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                  <KeyRound className="w-4 h-4" /> Acceso al portal
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => { setModalResultados(false); setGrupoActual(null) }} className="px-4 py-2 border rounded-lg text-sm">Cerrar</button>
              <button onClick={() => persistirResultados('borrador')}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium">
                <Save className="w-4 h-4 inline mr-1" /> Guardar borrador
              </button>
              <button onClick={() => persistirResultados('validar')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
                <ShieldCheck className="w-4 h-4 inline mr-1" /> Validar
              </button>
              <button onClick={() => persistirResultados('entregar')}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium">
                <Send className="w-4 h-4 inline mr-1" /> Entregar
              </button>
            </div>
          </LabModal>
        )}

        {/* Modal catálogo */}
        {modalPrueba && (
          <LabModal title={pruebaActual ? 'Editar Prueba' : 'Nueva Prueba'} onClose={() => setModalPrueba(false)} wide>
            <div className="space-y-3 max-h-[65dvh] overflow-y-auto">
              {[
                { key: 'nombre', label: 'Nombre *', type: 'text', ph: 'Hemograma Completo' },
                { key: 'description', label: 'Descripción', type: 'text', ph: '' },
                { key: 'color', label: 'Color del Tubo', type: 'text', ph: 'Lila / Rojo…' },
                { key: 'dias', label: 'Días SLA entrega', type: 'number', ph: '1' },
                { key: 'costo', label: 'Costo base (L.)', type: 'number', ph: '0' },
                { key: 'comision', label: 'Comisión (%)', type: 'number', ph: '0' },
                { key: 'nota', label: 'Observaciones', type: 'text', ph: '' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} value={(formPrueba as Record<string, string | boolean>)[f.key] as string}
                    onChange={e => setFormPrueba(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                </div>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formPrueba.es_panel}
                  onChange={e => setFormPrueba(p => ({ ...p, es_panel: e.target.checked }))} className="rounded" />
                <span className="text-sm font-medium">Panel multiparamétrico (hemograma, perfil, etc.)</span>
              </label>

              <div className="border-t pt-3">
                <p className="text-sm font-semibold text-gray-800 mb-2">Costos y maquila</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tipo de procesamiento</label>
                    <select value={formPrueba.procesamiento}
                      onChange={e => setFormPrueba(p => ({ ...p, procesamiento: e.target.value as ProcesamientoLab }))}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="INTERNA">Interna</option>
                      <option value="MAQUILADA">Maquilada</option>
                      <option value="MIXTA">Mixta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Proveedor externo</label>
                    <select value={formPrueba.proveedor_id}
                      onChange={e => setFormPrueba(p => ({ ...p, proveedor_id: e.target.value }))}
                      disabled={formPrueba.procesamiento === 'INTERNA'}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100">
                      <option value="">Sin proveedor</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Costo maquila (L.)</label>
                    <input type="number" min="0" step="0.01" value={formPrueba.costo_maquila}
                      onChange={e => setFormPrueba(p => ({ ...p, costo_maquila: e.target.value }))}
                      disabled={formPrueba.procesamiento === 'INTERNA'}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100" />
                  </div>
                </div>
                {(() => {
                  const costoInsumos = insumosPrueba.reduce((sum, ins) => {
                    const prod = productos.find(p => String(p.id) === ins.producto_id)
                    return sum + (Number(prod?.costo) || 0) * (Number(ins.cantidad) || 1)
                  }, 0)
                  const costoMaquila = formPrueba.procesamiento === 'INTERNA' ? 0 : Number(formPrueba.costo_maquila) || 0
                  const margen = calcularMargenEstimado(Number(formPrueba.costo), costoInsumos, costoMaquila, Number(formPrueba.comision))
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Costo insumos</span><p className="font-bold">L. {costoInsumos.toFixed(2)}</p></div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Costo maquila</span><p className="font-bold">L. {costoMaquila.toFixed(2)}</p></div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Utilidad est.</span><p className={`font-bold ${margen.utilidad >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>L. {margen.utilidad.toFixed(2)}</p></div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Margen</span><p className="font-bold">{margen.margenPct != null ? `${margen.margenPct}%` : '—'}</p></div>
                    </div>
                  )
                })()}
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-semibold text-gray-800 mb-2">Insumos / reactivos (descuento inventario)</p>
                {insumosPrueba.map((ins, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select value={ins.producto_id}
                      onChange={e => setInsumosPrueba(prev => prev.map((x, i) => i === idx ? { ...x, producto_id: e.target.value } : x))}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm">
                      <option value="">Producto…</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <input type="number" min="0.001" step="0.001" value={ins.cantidad}
                      onChange={e => setInsumosPrueba(prev => prev.map((x, i) => i === idx ? { ...x, cantidad: e.target.value } : x))}
                      className="w-20 border rounded-lg px-2 py-1.5 text-sm" placeholder="Cant." />
                    <button type="button" onClick={() => setInsumosPrueba(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 px-2">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setInsumosPrueba(prev => [...prev, { producto_id: '', cantidad: '1' }])}
                  className="text-xs text-cyan-700 font-medium">+ Agregar insumo</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <button onClick={() => setModalPrueba(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarPrueba} className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium">
                <Save className="w-4 h-4 inline mr-1" /> {pruebaActual ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </LabModal>
        )}

        {/* Modal configuración: rangos de referencia + campos de panel */}
        {modalConfig && configPrueba && (
          <LabModal title={`Configurar: ${configPrueba.nombre}`} onClose={() => setModalConfig(false)} wide>
            <div className="space-y-5 max-h-[72dvh] overflow-y-auto pr-1">
              {/* Rangos de referencia */}
              <section>
                <h4 className="text-sm font-bold text-gray-800 mb-1">Rangos de referencia</h4>
                <p className="text-xs text-gray-500 mb-2">
                  {configPrueba.es_panel
                    ? 'Cada parámetro del panel tiene su propio valor de referencia (como en el reporte de hemograma).'
                    : 'Defina el valor normal por sexo y edad. Use mín/máx para numéricos o texto para cualitativos (ej. "Negativo").'}
                </p>

                {configPrueba.es_panel ? (
                  <>
                    <div className="overflow-x-auto border rounded-lg mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Análisis</th>
                            <th className="text-left px-3 py-2 font-semibold w-24">Unidad</th>
                            <th className="text-left px-3 py-2 font-semibold">Valor de referencia</th>
                            <th className="w-16" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {camposPanelOrdenados(configPrueba.id).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">
                                Sin parámetros. Agregue los campos del hemograma en la sección inferior.
                              </td>
                            </tr>
                          ) : camposPanelOrdenados(configPrueba.id).map(campo => {
                            const rangosCampo = rangosState.filter(r => r.prueba_id === configPrueba.id && r.campo_id === campo.id)
                            return (
                              <tr key={campo.id} className="hover:bg-cyan-50/30">
                                <td className="px-3 py-2 font-medium text-gray-800">{campo.nombre}</td>
                                <td className="px-3 py-2 text-gray-600">{campo.unidad || '—'}</td>
                                <td className="px-3 py-2 text-gray-700">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {rangosCampo.length === 0 ? '—' : rangosCampo.map(r => (
                                      <span key={r.id} className="inline-flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                                        {r.genero === 'M' ? 'M: ' : r.genero === 'F' ? 'F: ' : ''}
                                        {textoReferenciaRango(r)}
                                        <button type="button" onClick={() => eliminarRango(r.id)}
                                          className="text-red-500 hover:text-red-700 ml-0.5" title="Eliminar rango">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <button type="button" onClick={() => seleccionarCampoRango(campo)}
                                    className="text-cyan-700 hover:text-cyan-900 font-medium">
                                    {rangosCampo.length ? 'Editar' : 'Agregar'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {formRango.campo_id && (
                      <p className="text-xs text-cyan-800 mb-2 font-medium">
                        Editando: {panelCamposState.find(c => String(c.id) === formRango.campo_id)?.nombre}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {rangosState.filter(r => r.prueba_id === configPrueba.id && r.campo_id == null).length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin rangos definidos. Agregue uno abajo.</p>
                    ) : rangosState.filter(r => r.prueba_id === configPrueba.id && r.campo_id == null).map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-xs bg-gray-50 border rounded-lg px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-white border text-gray-600">
                          {r.genero === 'M' ? 'Masculino' : r.genero === 'F' ? 'Femenino' : 'Ambos'}
                        </span>
                        <span className="text-gray-500">{r.edad_min ?? 0}–{r.edad_max ?? 120} años</span>
                        <span className="font-medium text-gray-800">
                          {textoReferenciaRango(r)}
                          {r.unidad ? ` ${r.unidad}` : ''}
                        </span>
                        <button onClick={() => eliminarRango(r.id)} className="ml-auto text-red-500 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-cyan-50/40 border border-cyan-100 rounded-lg p-3">
                  {configPrueba.es_panel && (
                    <div className="col-span-2 sm:col-span-4">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Parámetro *</label>
                      <select value={formRango.campo_id} onChange={e => {
                        const id = e.target.value
                        const campo = panelCamposState.find(c => String(c.id) === id)
                        if (campo) seleccionarCampoRango(campo)
                        else setFormRango(p => ({ ...p, campo_id: '' }))
                      }}
                        className="w-full border rounded px-2 py-1.5 text-sm">
                        <option value="">Seleccione análisis…</option>
                        {camposPanelOrdenados(configPrueba.id).map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Sexo</label>
                    <select value={formRango.genero} onChange={e => setFormRango(p => ({ ...p, genero: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm">
                      <option value="">Ambos</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Edad mín</label>
                    <input type="number" value={formRango.edad_min} onChange={e => setFormRango(p => ({ ...p, edad_min: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Edad máx</label>
                    <input type="number" value={formRango.edad_max} onChange={e => setFormRango(p => ({ ...p, edad_max: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Unidad</label>
                    <input value={formRango.unidad} onChange={e => setFormRango(p => ({ ...p, unidad: e.target.value }))}
                      placeholder="mg/dL" className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Mín</label>
                    <input type="number" step="0.0001" value={formRango.rango_min} onChange={e => setFormRango(p => ({ ...p, rango_min: e.target.value }))}
                      placeholder="70" className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Máx</label>
                    <input type="number" step="0.0001" value={formRango.rango_max} onChange={e => setFormRango(p => ({ ...p, rango_max: e.target.value }))}
                      placeholder="100" className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Referencia en texto (cualitativo)</label>
                    <input value={formRango.rango_texto} onChange={e => setFormRango(p => ({ ...p, rango_texto: e.target.value }))}
                      placeholder="Negativo / A·B·AB·O…" className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div className="col-span-2 sm:col-span-4 flex justify-end">
                    <button onClick={guardarRango} disabled={guardandoConfig}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                      <Plus className="w-4 h-4" /> Agregar rango
                    </button>
                  </div>
                </div>
              </section>

              {/* Campos de panel */}
              {configPrueba.es_panel && (
                <section className="border-t pt-4">
                  <h4 className="text-sm font-bold text-gray-800 mb-1">Parámetros del panel</h4>
                  <p className="text-xs text-gray-500 mb-2">
                    Sub-parámetros que se capturan dentro de esta prueba (ej. en un Hemograma: WBC, HGB, HCT…).
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {panelCamposState.filter(c => c.prueba_id === configPrueba.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin parámetros. Agregue al menos uno para capturar resultados.</p>
                    ) : panelCamposState.filter(c => c.prueba_id === configPrueba.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs bg-gray-50 border rounded-lg px-3 py-2">
                        <span className="text-gray-400">{c.orden ?? 0}</span>
                        <span className="font-medium text-gray-800">{c.nombre}</span>
                        {c.codigo && <span className="text-gray-400">({c.codigo})</span>}
                        {c.unidad && <span className="text-gray-500">· {c.unidad}</span>}
                        <button onClick={() => eliminarCampo(c.id)} className="ml-auto text-red-500 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
                    <div className="col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Nombre *</label>
                      <input value={formCampo.nombre} onChange={e => setFormCampo(p => ({ ...p, nombre: e.target.value }))}
                        placeholder="Hemoglobina" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Código</label>
                      <input value={formCampo.codigo} onChange={e => setFormCampo(p => ({ ...p, codigo: e.target.value }))}
                        placeholder="HGB" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Unidad</label>
                      <input value={formCampo.unidad} onChange={e => setFormCampo(p => ({ ...p, unidad: e.target.value }))}
                        placeholder="g/dL" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div className="col-span-2 sm:col-span-4 flex justify-end">
                      <button onClick={guardarCampo} disabled={guardandoConfig}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                        <Plus className="w-4 h-4" /> Agregar parámetro
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <button onClick={() => setModalConfig(false)} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium">Listo</button>
            </div>
          </LabModal>
        )}

        {/* Modal acceso al portal del paciente */}
        {modalAcceso && acceso && (
          <LabModal title="Acceso al Portal del Paciente" onClose={() => setModalAcceso(false)}>
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                Anote o envíe estas credenciales ahora. La contraseña <b>no se vuelve a mostrar</b>; si se pierde, deberá regenerarla.
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase">Usuario</p>
                    <p className="font-mono font-bold text-gray-900">{acceso.usuario}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(acceso.usuario)} className="p-2 rounded hover:bg-gray-200 text-gray-500" title="Copiar">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase">Contraseña</p>
                    <p className="font-mono font-bold text-2xl tracking-widest text-cyan-700">{acceso.password}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(acceso.password)} className="p-2 rounded hover:bg-gray-200 text-gray-500" title="Copiar">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Portal: <span className="font-medium text-gray-700">{portalBaseUrl()}</span>
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <button onClick={() => setModalAcceso(false)} className="px-4 py-2 border rounded-lg text-sm">Cerrar</button>
              <button onClick={enviarAccesoWhatsApp}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
              </button>
            </div>
          </LabModal>
        )}

        {/* Modal CRUD médico */}
        {modalMedico && (
          <LabModal title={medicoActual ? 'Editar Médico' : 'Nuevo Médico'} onClose={() => setModalMedico(false)}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input value={formMedico.nombre} onChange={e => setFormMedico(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Dr(a). Nombre y apellido" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Especialidad</label>
                  <input value={formMedico.especialidad} onChange={e => setFormMedico(p => ({ ...p, especialidad: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Colegiado / registro</label>
                  <input value={formMedico.colegiado} onChange={e => setFormMedico(p => ({ ...p, colegiado: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
                  <input value={formMedico.telefono} onChange={e => setFormMedico(p => ({ ...p, telefono: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Correo</label>
                  <input type="email" value={formMedico.correo} onChange={e => setFormMedico(p => ({ ...p, correo: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={formMedico.activo} onChange={e => setFormMedico(p => ({ ...p, activo: e.target.checked }))} />
                Activo
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <button onClick={() => setModalMedico(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarMedico} disabled={!formMedico.nombre.trim()}
                className="px-5 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Guardar</button>
            </div>
          </LabModal>
        )}

        {/* Modal CRUD perfil/paquete */}
        {modalPerfil && (
          <LabModal title={perfilActual ? 'Editar Perfil' : 'Nuevo Perfil / Paquete'} onClose={() => setModalPerfil(false)} wide full>
            <div className="space-y-4 max-h-[72dvh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre del perfil *</label>
                  <input value={formPerfil.nombre} onChange={e => setFormPerfil(p => ({ ...p, nombre: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ej. Perfil prenatal" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Precio del paquete</label>
                  <input type="number" step="0.01" min="0" value={formPerfil.precio}
                    onChange={e => setFormPerfil(p => ({ ...p, precio: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Vacío = suma de pruebas" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                <input value={formPerfil.descripcion} onChange={e => setFormPerfil(p => ({ ...p, descripcion: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Pruebas incluidas * ({formPerfil.pruebas_ids.length} seleccionadas)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto border rounded-lg p-2">
                  {pruebasCatalogo.map(pr => {
                    const checked = formPerfil.pruebas_ids.includes(pr.id)
                    return (
                      <label key={pr.id} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer ${checked ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setFormPerfil(p => ({
                            ...p,
                            pruebas_ids: e.target.checked
                              ? [...p.pruebas_ids, pr.id]
                              : p.pruebas_ids.filter(x => x !== pr.id),
                          }))} />
                        <span className="truncate">{pr.nombre}</span>
                        <span className="ml-auto text-xs text-gray-400">L. {Number(pr.costo).toFixed(0)}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={formPerfil.activo} onChange={e => setFormPerfil(p => ({ ...p, activo: e.target.checked }))} />
                Activo
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <button onClick={() => setModalPerfil(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarPerfil} disabled={guardandoPerfil || !formPerfil.nombre.trim() || formPerfil.pruebas_ids.length === 0}
                className="px-5 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {guardandoPerfil ? 'Guardando…' : 'Guardar perfil'}
              </button>
            </div>
          </LabModal>
        )}
      </ModuleContent>
    </ModuleShell>
  )
}

function LabModal({ title, children, onClose, wide, full }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; full?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full flex flex-col max-h-[96dvh] ${
        full ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'
      }`}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 overflow-hidden flex flex-col flex-1">{children}</div>
      </div>
    </div>
  )
}
