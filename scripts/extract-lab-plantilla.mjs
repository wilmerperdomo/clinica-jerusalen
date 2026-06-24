/**
 * Extrae del PDF plantilla-informe.pdf las imágenes de encabezado y firma/sello.
 * Ejecutar: node scripts/extract-lab-plantilla.mjs
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
/** Porción superior de la página 1 = solo logo y datos del laboratorio */
const HEADER_RATIO = 0.12
/** Porción inferior de la página 2 = firma y sello */
const FOOTER_RATIO = 0.42

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

async function renderPage(pdf, pageNum) {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: SCALE })
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

  if (pages >= 2) {
    const p2 = await renderPage(pdf, 2)
    const footerH = Math.round(p2.height * FOOTER_RATIO)
    const footerY = p2.height - footerH
    const footer = cropCanvas(p2, 0, footerY, p2.width, footerH)
    fs.writeFileSync(path.join(outDir, 'plantilla-firma-sello.png'), footer.toBuffer('image/png'))
    console.log('OK plantilla-firma-sello.png', p2.width, 'x', footerH)
  } else {
    const footerH = Math.round(p1.height * FOOTER_RATIO)
    const footerY = p1.height - footerH
    const footer = cropCanvas(p1, 0, footerY, p1.width, footerH)
    fs.writeFileSync(path.join(outDir, 'plantilla-firma-sello.png'), footer.toBuffer('image/png'))
    console.log('OK plantilla-firma-sello.png (desde pág. 1)', p1.width, 'x', footerH)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
