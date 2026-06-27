import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ExpedienteClient from './expediente-client'

export const metadata = { title: 'Expediente Clínico' }

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pacienteId = parseInt(id)
  if (isNaN(pacienteId)) notFound()

  const supabase = await createClient()

  const [
    { data: paciente },
    { data: consultas },
    { data: analisisOrds },
    { data: antecedentes },
    { data: problemas },
  ] = await Promise.all([
    // datos completos del paciente
    supabase
      .from('pacientes')
      .select('*, colonias(id, nombre)')
      .eq('id', pacienteId)
      .single(),

    // todas las consultas del paciente (completas)
    supabase
      .from('consultas')
      .select(`
        id, fecha, hora, estado, tipo_nombre, doctor, enfoque_clinico,
        presion, temperatura, peso, talla, frecuencia, perim_cefalico, pulso,
        saturacion_oxigeno, dolor_eva, glucosa_capilar,
        cabeza, cuello, ojos, orl, pulmonar, abdomen,
        genito, extremidades, sistema, oste, piel,
        sintoma, historia, impresion, tratamiento,
        estudios_complementarios, dias_reposo, nota,
        consulta_detalle(
          id, no_producto, indicacion, cant, via
        ),
        consulta_diagnosticos(
          cie10_codigo, descripcion, principal
        )
      `)
      .eq('paciente_id', pacienteId)
      .in('estado', ['FINALIZADO', 'ATENDIENDO', 'SIGNOS'])
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(100),

    // órdenes de laboratorio del paciente
    supabase
      .from('consulta_analisis')
      .select(`
        id, id_consulta, no_analisis, fecha, fecha_resultado,
        estado_lab, pagado, entregado, resultado_resumen,
        resultados:lab_resultados(valor_resultado, unidad, rango_texto, observacion, anormal, fecha)
      `)
      .or(`id_cliente.eq.${pacienteId},paciente_id.eq.${pacienteId}`)
      .order('fecha', { ascending: false })
      .limit(100),

    supabase
      .from('paciente_antecedentes')
      .select('alergias, personal, familiares, hospitalario')
      .eq('paciente_id', pacienteId)
      .maybeSingle(),

    supabase
      .from('paciente_problema_activo')
      .select('descripcion, cie10_codigo, estado')
      .eq('paciente_id', pacienteId)
      .neq('estado', 'resuelto')
      .order('created_at', { ascending: false }),
  ])

  if (!paciente) notFound()

  const coloniaJoin = paciente.colonias
  const coloniaNombre = Array.isArray(coloniaJoin)
    ? coloniaJoin[0]?.nombre
    : (coloniaJoin as { nombre: string } | null)?.nombre

  const pacienteConAntecedentes = {
    ...paciente,
    alergias: antecedentes?.alergias ?? null,
    tipo_sangre: paciente.grupo_sanguineo ?? null,
    colonia_nombre: coloniaNombre ?? null,
  }

  return (
    <ExpedienteClient
      paciente={pacienteConAntecedentes}
      antecedentes={antecedentes}
      consultas={consultas || []}
      analisis={analisisOrds || []}
      problemasActivos={problemas || []}
    />
  )
}
