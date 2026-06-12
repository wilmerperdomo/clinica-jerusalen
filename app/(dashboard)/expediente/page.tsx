import { createClient } from '@/lib/supabase/server'

import ExpedienteIndexClient from './expediente-index-client'



export const metadata = { title: 'Expediente Clínico' }



export default async function ExpedienteIndexPage({

  searchParams,

}: {

  searchParams: Promise<{ q?: string }>

}) {

  const { q } = await searchParams

  const supabase = await createClient()



  let query = supabase

    .from('pacientes')

    .select('id, codigo, nombre, apellido1, apellido2, fecha_nac, genero, celular, foto_url')

    .eq('activo', true)

    .order('nombre')

    .limit(50)



  if (q?.trim()) {

    query = query.or(

      `nombre.ilike.%${q}%,apellido1.ilike.%${q}%,apellido2.ilike.%${q}%,codigo.ilike.%${q}%`

    )

  }



  const { data: pacientes } = await query



  return <ExpedienteIndexClient pacientes={pacientes ?? []} q={q} />

}


