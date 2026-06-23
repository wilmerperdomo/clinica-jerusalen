import { createAdminClient } from '@/lib/supabase/server'
import {
  agruparOrdenes, type OrdenLab, type PacienteLab, type GrupoLab, type LabPanelCampo, type PruebaLab,
} from '@/lib/lab-utils'
import { filasPrintDesdeGrupo, type FilaResultadoPrint } from '@/lib/lab-print'

const ESTADOS_VISIBLES = ['VALIDADO', 'ENTREGADO']

export interface PortalData {
  paciente: PacienteLab | null
  grupos: GrupoLab[]
  pruebas: { id: number; nombre: string; es_panel?: boolean }[]
  panelCamposMap: Record<number, LabPanelCampo[]>
}

/** Carga los grupos de laboratorio visibles (validados/entregados) de un paciente. */
export async function cargarPortalPaciente(pacienteId: number): Promise<PortalData | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const [pacRes, ordRes, pruebasRes, camposRes] = await Promise.all([
    admin.from('pacientes')
      .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, fecha_nac, celular, telefono, genero')
      .eq('id', pacienteId).maybeSingle(),
    admin.from('consulta_analisis')
      .select('*, resultados:lab_resultados(*)')
      .eq('paciente_id', pacienteId)
      .in('estado_lab', ESTADOS_VISIBLES)
      .order('id', { ascending: false }),
    admin.from('laboratorio_info').select('id, nombre, es_panel'),
    admin.from('lab_panel_campos').select('*'),
  ])

  const paciente = (pacRes.data as PacienteLab) ?? null
  const ordenes = (ordRes.data as OrdenLab[]) ?? []
  const pruebas = (pruebasRes.data as { id: number; nombre: string; es_panel?: boolean }[]) ?? []

  const panelCamposMap: Record<number, LabPanelCampo[]> = {}
  for (const c of (camposRes.data as LabPanelCampo[]) ?? []) {
    if (c.activo === false) continue
    if (!panelCamposMap[c.prueba_id]) panelCamposMap[c.prueba_id] = []
    panelCamposMap[c.prueba_id].push(c)
  }
  for (const k of Object.keys(panelCamposMap)) {
    panelCamposMap[Number(k)].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }

  const grupos = paciente ? agruparOrdenes(ordenes, [paciente]) : []
  return { paciente, grupos, pruebas, panelCamposMap }
}

/** Construye las filas de impresión para un grupo específico del paciente. */
export function filasDeGrupo(
  data: PortalData,
  grupoId: string,
): { grupo: GrupoLab; filas: FilaResultadoPrint[] } | null {
  const grupo = data.grupos.find(g => g.grupoId === grupoId)
  if (!grupo) return null
  const filas = filasPrintDesdeGrupo(grupo, data.pruebas as unknown as PruebaLab[], data.panelCamposMap)
  return { grupo, filas }
}
