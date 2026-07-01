/**
 * Siembra canales de agentes IA en Supabase (ejecutar una vez en local/prod)
 * Uso: node scripts/seed-agentes-canales.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  if (!existsSync(path)) return
  let text = readFileSync(path, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key)

const CANALES = [
  { clave: 'whatsapp_principal', nombre: 'Clínica Principal', tipo: 'whatsapp_meta', config: { tono: 'cálido y profesional' } },
  { clave: 'whatsapp_sucursal', nombre: 'Sucursal', tipo: 'whatsapp_meta', config: { tono: 'cercano y práctico' } },
  { clave: 'whatsapp_corporativo', nombre: 'Atención Corporativa', tipo: 'whatsapp_meta', config: { tono: 'formal' } },
  { clave: 'messenger_pagina', nombre: 'Facebook Messenger', tipo: 'messenger', config: { tono: 'amable' } },
]

async function ensureTables() {
  const { error } = await sb.from('agente_canales').select('id').limit(1)
  if (error?.message?.includes('does not exist') || error?.code === '42P01') {
    console.error('\n❌ Tablas no existen. Ejecute primero en Supabase SQL Editor:')
    console.error('   scripts/FIX-MODULO-AGENTES-IA.sql\n')
    process.exit(1)
  }
  if (error) {
    console.error('Error consultando agente_canales:', error.message)
    process.exit(1)
  }
}

async function main() {
  await ensureTables()

  for (const c of CANALES) {
    const { error } = await sb.from('agente_canales').upsert(
      { clave: c.clave, nombre: c.nombre, tipo: c.tipo, activo: true, config: c.config },
      { onConflict: 'clave' },
    )
    if (error) {
      console.error(`Error insertando ${c.clave}:`, error.message)
      process.exit(1)
    }
    console.log(`✓ ${c.clave}`)
  }

  const { data } = await sb.from('agente_canales').select('id, clave, nombre')
  console.log('\nCanales activos:', data)
  console.log('\nListo. Pruebe: npm run test:agentes:local')
}

main()
