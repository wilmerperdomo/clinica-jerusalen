/**
 * Pruebas básicas del módulo agentes (sin dependencias externas)
 * Ejecutar: npm run test:agentes
 */
import assert from 'node:assert/strict'

function clasificarHeuristica(texto) {
  const t = texto.toLowerCase()
  const match = (words) => words.some(w => t.includes(w))
  if (match(['humano', 'persona', 'recepcion'])) return 'hablar_humano'
  if (match(['cita', 'agendar', 'agenda'])) return 'agendar_cita'
  if (match(['laboratorio', 'resultado'])) return 'estado_laboratorio'
  if (match(['promo', 'descuento'])) return 'promociones'
  return 'otro'
}

function parseMeta(payload) {
  const msgs = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === 'text' && msg.text?.body) {
          msgs.push({ from: msg.from, texto: msg.text.body })
        }
      }
    }
  }
  return msgs
}

assert.equal(clasificarHeuristica('Quiero agendar cita'), 'agendar_cita')
assert.equal(clasificarHeuristica('hablar con una persona'), 'hablar_humano')
assert.equal(clasificarHeuristica('estado de laboratorio'), 'estado_laboratorio')

const meta = parseMeta({
  entry: [{ changes: [{ value: { messages: [{
    id: '1', from: '50499998888', timestamp: '1', type: 'text',
    text: { body: 'Hola' },
  }] } }] }],
})
assert.equal(meta.length, 1)
assert.equal(meta[0].texto, 'Hola')

console.log('✓ agentes: pruebas básicas OK')
