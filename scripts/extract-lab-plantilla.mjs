/**
 * Extrae del PDF plantilla-informe.pdf las imágenes de encabezado y firma/sello.
 * Ejecutar: npm run extract:lab-plantilla
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'lab')
const pdfPath = path.join(outDir, 'plantilla-informe.pdf')

const SCALE = 2
const SEAL_SCALE = 4
/** Solo logo y datos del laboratorio referido (sin paciente) */
const HEADER_RATIO = 0.12
/**
 * Pág. 2: sello circular + firma manuscrita (zona media-derecha, sin QR ni texto Masterlab).
 * Coordenadas relativas a la página completa.
 */
const SEAL_X_RATIO = 0.42
const SEAL_Y_RATIO = 0.56
const SEAL_W_RATIO = 0.48
const SEAL_H_RATIO = 0.20

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

const canvasFactory = new NodeCanvasFactory()

async function renderPage(pdf, pageNum, scale = SCALE) {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)
  await page.render({
    canvasContext: canvasAndContext.context,
    viewport,
    canvasFactory,
  }).promise
  return canvasAndContext.canvas
}

function cropCanvas(source, sx, sy, sw, sh) {
  const canvas = createCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas
}

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('No se encontró', pdfPath)
    process.exit(1)
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
  const pages = pdf.numPages
  console.log('Páginas en plantilla:', pages)

  const p1 = await renderPage(pdf, 1)
  const headerH = Math.round(p1.height * HEADER_RATIO)
  const header = cropCanvas(p1, 0, 0, p1.width, headerH)
  fs.writeFileSync(path.join(outDir, 'plantilla-encabezado.png'), header.toBuffer('image/png'))
  console.log('OK plantilla-encabezado.png', header.width, 'x', headerH)

  const pageSeal = pages >= 2 ? 2 : 1
  const pSeal = await renderPage(pdf, pageSeal, SEAL_SCALE)
  const sealX = Math.round(pSeal.width * SEAL_X_RATIO)
  const sealY = Math.round(pSeal.height * SEAL_Y_RATIO)
  const sealW = Math.round(pSeal.width * SEAL_W_RATIO)
  const sealH = Math.round(pSeal.height * SEAL_H_RATIO)
  const seal = cropCanvas(pSeal, sealX, sealY, sealW, sealH)
  fs.writeFileSync(path.join(outDir, 'plantilla-firma-sello.png'), seal.toBuffer('image/png'))
  console.log('OK plantilla-firma-sello.png', seal.width, 'x', seal.height, `(pág ${pageSeal})`)

  // Vista previa de página 2 completa (depuración opcional)
  if (process.env.DEBUG_PLANTILLA === '1') {
    fs.writeFileSync(path.join(outDir, '_debug-pagina2.png'), pSeal.toBuffer('image/png'))
    console.log('DEBUG _debug-pagina2.png')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
