'use client'

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  FlaskConical, Plus, Search, RefreshCw, ClipboardList,
  CheckCircle2, Clock, X, Save, AlertCircle,
  Beaker, Edit2, Printer, MessageCircle,
  LayoutGrid, List, BarChart3, Tag, ShieldCheck, Send,
} from 'lucide-react'
import {
  etiquetaEstadoLab, claseBadgeEstadoLab, type EstadoLab,
} from '@/lib/lab-estado-utils'
import {
  agruparOrdenes, calcularReportesLab, calcularEdad, buscarRangoAplicable,
  evaluarValorRango, computeFechaPrometida, estadoOrdenLab, tuboColorClase,
  type OrdenLab, type PruebaLab, type PacienteLab, type GrupoLab,
  type LabRango, type LabPanelCampo,
} from '@/lib/lab-utils'
import { precioLabLista } from '@/lib/membresia-utils'
import { descontarInsumosLab, type LabInsumo } from '@/lib/lab-insumos'
import {
  imprimirEtiquetasTubo, imprimirResultadoGrupoLab,
  filasPrintDesdeGrupo, whatsappGrupoLab, registrarAuditoriaLab,
} from '@/lib/lab-print'
import BuscarPacienteInput, { type PacienteBusqueda } from '@/components/buscar-paciente-input'
import { buscarPacientesActivos } from '@/lib/buscar-pacientes'
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
  productos: { id: number; nombre: string; codigo?: string }[]
  sucursalId?: number
  esSuperAdmin?: boolean
}

type TabLab = 'cola' | 'ordenes' | 'catalogo' | 'reportes'
type FiltroLab = 'procesar' | 'pendiente_cobro' | 'completadas' | 'atrasadas' | 'todas'

interface CampoResultadoForm {
  valor: string
  unidad: string
  rango_texto: string
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
  preciosLista, productos, sucursalId, esSuperAdmin = false,
}: Props) {
  const [tab, setTab] = useState<TabLab>('cola')
  const [filtroLab, setFiltroLab] = useState<FiltroLab>('procesar')
  const [ordenes, setOrdenes] = useState<OrdenLab[]>(init)
  const [busqueda, setBusqueda] = useState('')
  const [isPending, startTransition] = useTransition()

  const [modalOrden, setModalOrden] = useState(false)
  const [modalResultados, setModalResultados] = useState(false)
  const [modalPrueba, setModalPrueba] = useState(false)
  const [grupoActual, setGrupoActual] = useState<GrupoLab | null>(null)
  const [pruebaActual, setPruebaActual] = useState<PruebaLab | null>(null)

  const [formOrden, setFormOrden] = useState({ paciente_id: '', pruebas_ids: [] as number[] })
  const [resultForm, setResultForm] = useState<Record<string, CampoResultadoForm>>({})
  const [formPrueba, setFormPrueba] = useState({
    nombre: '', description: '', color: '', dias: '1',
    costo: '0', comision: '0', nota: '', es_panel: false,
  })
  const [insumosPrueba, setInsumosPrueba] = useState<{ producto_id: string; cantidad: string }[]>([])
  const [pruebasCatalogo, setPruebasCatalogo] = useState<PruebaLab[]>(pruebas)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const [pacientesExtra, setPacientesExtra] = useState<PacienteLab[]>([])

  const supabase = useMemo(() => sb(), [])

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
    for (const c of initPanelCampos) {
      if (!m[c.prueba_id]) m[c.prueba_id] = []
      m[c.prueba_id].push(c)
    }
    for (const k of Object.keys(m)) m[Number(k)].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    return m
  }, [initPanelCampos])

  const insumosMap = useMemo(() => {
    const m: Record<number, LabInsumo[]> = {}
    for (const i of initInsumos) {
      if (!m[i.prueba_id]) m[i.prueba_id] = []
      m[i.prueba_id].push(i)
    }
    return m
  }, [initInsumos])

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
    setPacientesExtra(prev => {
      if (prev.some(x => x.id === row.id) || pacientes.some(x => x.id === row.id)) return prev
      return [...prev, row]
    })
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
  const reportes = useMemo(() => calcularReportesLab(ordenes, grupos, fechaHoy), [ordenes, grupos, fechaHoy])

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

  async function crearOrden() {
    if (!formOrden.paciente_id || formOrden.pruebas_ids.length === 0) return
    const paciente = pacientesMerged.find(p => String(p.id) === formOrden.paciente_id)
    if (!paciente?.id) {
      alert('Seleccione un paciente válido')
      return
    }

    const grupoId = crypto.randomUUID()
    const hora = new Date().toTimeString().slice(0, 8)
    const filas = formOrden.pruebas_ids.flatMap(pid => {
      const prueba = pruebasCatalogo.find(p => p.id === pid)
      if (!prueba) return []
      const precio = precioPruebaParaPaciente(pid, formOrden.paciente_id)
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
        sucursal_id: sucursalId ?? null,
      }]
    })

    if (filas.length === 0) {
      alert('No se encontraron pruebas válidas en el catálogo')
      return
    }

    setGuardandoOrden(true)
    const { error } = await supabase.from('consulta_analisis').insert(filas)
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
          const rango = buscarRangoAplicable(rangos, pid, edad, pac?.genero)
          pre[claveCampo(orden.id, campo.id)] = {
            valor: exist?.valor_resultado ?? '',
            unidad: exist?.unidad ?? campo.unidad ?? rango?.unidad ?? '',
            rango_texto: exist?.rango_texto ?? rango?.rango_texto ?? '',
            anormal: exist?.anormal ?? false,
            obs: exist?.observacion ?? '',
            resultadoId: exist?.id,
          }
        }
      } else {
        const exist = orden.resultados?.[0]
        const rango = buscarRangoAplicable(rangos, pid, edad, pac?.genero)
        pre[claveCampo(orden.id)] = {
          valor: exist?.valor_resultado ?? '',
          unidad: exist?.unidad ?? rango?.unidad ?? '',
          rango_texto: exist?.rango_texto ?? rango?.rango_texto ?? '',
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
      const pruebaIds = grupo.ordenes.map(o => Number(o.id_analisis)).filter(Boolean)
      const { errores } = await descontarInsumosLab(supabase, pruebaIds)
      if (errores.length) console.warn('Insumos:', errores.join('; '))
    }
    setModalResultados(true)
    startTransition(() => { recargar() })
  }

  function onValorChange(key: string, field: keyof CampoResultadoForm, value: string | boolean, ordenId: number, pruebaId: number) {
    setResultForm(prev => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } }
      if (field === 'valor' && typeof value === 'string') {
        const pac = grupoActual ? pacientesMerged.find(p => p.id === grupoActual.pacienteId) : undefined
        const rango = buscarRangoAplicable(rangos, pruebaId, calcularEdad(pac?.fecha_nac), pac?.genero)
        const ev = evaluarValorRango(value, rango)
        next[key] = {
          ...next[key],
          anormal: ev.anormal,
          rango_texto: next[key].rango_texto || ev.rangoTexto,
          unidad: next[key].unidad || ev.unidad,
        }
      }
      return next
    })
  }

  async function persistirResultados(modo: 'borrador' | 'validar' | 'entregar') {
    if (!grupoActual) return
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
            anormal: vals.anormal,
            observacion: vals.obs,
            fecha: fechaHoy,
          }
          const { error } = vals.resultadoId
            ? await supabase.from('lab_resultados').update(payload).eq('id', vals.resultadoId)
            : await supabase.from('lab_resultados').insert(payload)
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
          anormal: vals.anormal,
          observacion: vals.obs,
          fecha: fechaHoy,
        }
        const { error } = vals.resultadoId
          ? await supabase.from('lab_resultados').update(payload).eq('id', vals.resultadoId)
          : await supabase.from('lab_resultados').insert(payload)
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

    if (modo === 'entregar' && pac) {
      const filas = filasPrintDesdeGrupo(grupoActual, pruebasCatalogo, panelCamposMap)
      const link = whatsappGrupoLab({ ...grupoActual, telefono: pac.celular || pac.telefono || '' }, filas)
      if (link && confirm('¿Notificar al paciente por WhatsApp?')) window.open(link, '_blank')
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
    await supabase.from('consulta_analisis').update(upd).in('id', ids)
    if (nuevoEstado === 'EN_PROCESO') {
      const pruebaIds = grupo.ordenes.map(o => Number(o.id_analisis)).filter(Boolean)
      await descontarInsumosLab(supabase, pruebaIds)
    }
    startTransition(() => { recargar() })
  }

  function imprimirGrupo(grupo: GrupoLab) {
    const filas = filasPrintDesdeGrupo(grupo, pruebasCatalogo, panelCamposMap)
    imprimirResultadoGrupoLab(grupo, filas)
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
    setFormPrueba({ nombre: '', description: '', color: '', dias: '1', costo: '0', comision: '0', nota: '', es_panel: false })
    setInsumosPrueba([])
    await cargarCatalogoPruebas()
    startTransition(() => { recargar() })
  }

  function abrirModalOrden() {
    setFormOrden({ paciente_id: '', pruebas_ids: [] })
    setModalOrden(true)
  }

  function cerrarModalOrden() {
    setModalOrden(false)
    setFormOrden({ paciente_id: '', pruebas_ids: [] })
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
            {([
              ['cola', 'Cola / Kanban', LayoutGrid],
              ['ordenes', 'Órdenes agrupadas', List],
              ['catalogo', `Catálogo (${pruebasCatalogo.length})`, Beaker],
              ['reportes', 'Reportes', BarChart3],
            ] as const).map(([t, label, Icon]) => (
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
              <LabKanban
                grupos={gruposBusqueda}
                onAbrirGrupo={abrirGrupo}
                onEtiquetas={g => imprimirEtiquetasTubo(g, pruebasCatalogo)}
                onMoverGrupo={moverGrupo}
              />
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
                          <p className="font-semibold text-gray-900">{g.pacienteNombre}</p>
                          <p className="text-xs text-gray-500">{g.pacienteCodigo} · {g.fecha} · {g.ordenes.length} prueba(s)</p>
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
                              className="p-1.5 rounded bg-gray-100 hover:bg-gray-200" title="PDF">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {g.telefono && (
                              <button type="button"
                                onClick={() => window.open(whatsappGrupoLab(g, filasPrintDesdeGrupo(g, pruebasCatalogo, panelCamposMap)), '_blank')}
                                className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200" title="WhatsApp">
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

            {tab === 'catalogo' && (
              <>
                <div className="flex justify-end mb-3">
                  <button onClick={() => {
                    setPruebaActual(null)
                    setFormPrueba({ nombre: '', description: '', color: '', dias: '1', costo: '0', comision: '0', nota: '', es_panel: false })
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
                        <th className="px-4 py-3 text-left">Tubo</th>
                        <th className="px-4 py-3 text-center">SLA</th>
                        <th className="px-4 py-3 text-right">Costo</th>
                        <th className="px-4 py-3 text-center">Insumos</th>
                        <th className="px-4 py-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pruebasCatalogo.filter(p => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())).map(p => (
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
                            {p.color && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tuboColorClase(p.color)}`}>{p.color}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{p.dias || 1}d</td>
                          <td className="px-4 py-3 text-right font-medium">L. {Number(p.costo).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">
                            {(insumosMap[p.id]?.length ?? 0) || '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => {
                              setPruebaActual(p)
                              setFormPrueba({
                                nombre: p.nombre, description: p.description || '',
                                color: p.color || '', dias: String(p.dias || 1),
                                costo: String(p.costo), comision: String(p.comision),
                                nota: '', es_panel: !!p.es_panel,
                              })
                              setInsumosPrueba((insumosMap[p.id] ?? []).map(i => ({
                                producto_id: String(i.producto_id),
                                cantidad: String(i.cantidad),
                              })))
                              setModalPrueba(true)
                            }} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'reportes' && <LabReportesPanel stats={reportes} />}
          </div>
        </div>

        {/* Modal nueva orden */}
        {modalOrden && (
          <LabModal title="Nueva Orden de Laboratorio" onClose={cerrarModalOrden} wide full>
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <div className="rounded-xl border border-gray-100 bg-gradient-to-r from-slate-50 to-cyan-50/40 p-4">
                <label className="block text-sm font-semibold text-gray-800 mb-2">Paciente *</label>
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
              </div>

              <div className="flex-1 min-h-0">
                <label className="block text-sm font-semibold text-gray-800 mb-2">Catálogo de pruebas *</label>
                <LabSelectorPruebas
                  pruebas={pruebasCatalogo}
                  selectedIds={formOrden.pruebas_ids}
                  onChange={ids => setFormOrden(p => ({ ...p, pruebas_ids: ids }))}
                  pacienteId={formOrden.paciente_id}
                  precioParaPaciente={precioPruebaParaPaciente}
                  loading={loadingCatalogo}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t shrink-0">
                <div className="text-sm text-gray-600">
                  {formOrden.pruebas_ids.length > 0 ? (
                    <span>
                      <strong className="text-gray-900">{formOrden.pruebas_ids.length}</strong> prueba(s) ·{' '}
                      <strong className="text-cyan-700">
                        L. {formOrden.pruebas_ids.reduce((s, id) => s + precioPruebaParaPaciente(id, formOrden.paciente_id), 0).toFixed(2)}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-gray-400">Seleccione al menos una prueba</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={cerrarModalOrden} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button onClick={crearOrden}
                    disabled={guardandoOrden || !formOrden.paciente_id || formOrden.pruebas_ids.length === 0}
                    className="px-5 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-sm">
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
                          const vals = resultForm[key] ?? { valor: '', unidad: '', rango_texto: '', anormal: false, obs: '' }
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
                              {vals.anormal && <p className="text-xs text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Fuera de rango</p>}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${resultForm[claveCampo(orden.id)]?.anormal ? 'bg-red-50/50 rounded-lg p-2' : ''}`}>
                        {(() => {
                          const key = claveCampo(orden.id)
                          const vals = resultForm[key] ?? { valor: '', unidad: '', rango_texto: '', anormal: false, obs: '' }
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

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t mt-4">
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
