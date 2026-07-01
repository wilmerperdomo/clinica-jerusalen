/**
 * Prueba local del orquestador vía API (requiere npm run dev en otra terminal)
 * Uso: node scripts/test-agentes-local.mjs
 */
const BASE = process.env.AGENTES_LOCAL_URL ?? 'http://localhost:3000'

const casos = [
  { nombre: 'Saludo', texto: 'Hola buenos días' },
  { nombre: 'Cita', texto: 'Quiero agendar una cita para mañana' },
  { nombre: 'Laboratorio', texto: '¿Ya está listo mi examen de laboratorio?' },
  { nombre: 'Humano', texto: 'Necesito hablar con una persona por favor' },
]

async function post(texto) {
  const res = await fetch(`${BASE}/api/agentes/mensajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canalClave: 'whatsapp_principal',
      contactoExterno: '50499998877',
      contactoNombre: 'Prueba Local',
      texto,
    }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  console.log(`\n🔍 Healthcheck ${BASE}/api/agentes/mensajes`)
  const health = await fetch(`${BASE}/api/agentes/mensajes`)
  const h = await health.json()
  console.log(JSON.stringify(h, null, 2))

  if (!h.ok) {
    console.error('\n❌ El servidor no responde. Ejecute: npm run dev')
    process.exit(1)
  }

  console.log('\n--- Simulando mensajes WhatsApp (sin envío real) ---\n')

  for (const c of casos) {
    console.log(`\n📩 [${c.nombre}] "${c.texto}"`)
    const { status, json } = await post(c.texto)
    if (status !== 200) {
      console.error(`   ❌ HTTP ${status}`, json)
      if (json?.error?.includes?.('Canal no registrado') || String(json).includes('Canal')) {
        console.error('\n   → Ejecute: node scripts/seed-agentes-canales.mjs')
        console.error('   → (Si falla seed: pegue scripts/FIX-MODULO-AGENTES-IA.sql en Supabase)\n')
      }
      continue
    }
    console.log(`   Agente: ${json.agente} | Intención: ${json.intencion}`)
    const resp = json.respuestas?.[0]?.texto ?? '(sin texto)'
    console.log(`   Respuesta: ${resp.slice(0, 200)}${resp.length > 200 ? '…' : ''}`)
    if (json.conversacionId) console.log(`   Conversación: ${json.conversacionId}`)
  }

  console.log('\n✅ Prueba local terminada\n')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
