import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { LabEncabezadoInforme } from '@/lib/lab-plantilla-assets'
export const LAB_BUCKET = 'lab-resultados'
export const PLANTILLA_REL = '/lab/plantilla-informe.pdf'

/** Ruta absoluta de la plantilla PDF (encabezado + firma/sello de la clínica). */
export function rutaPlantillaInforme(): string {
  return path.join(process.cwd(), 'public', 'lab', 'plantilla-informe.pdf')
}

async function cargarPlantillaBytes(): Promise<Uint8Array | null> {
  try {
    return await readFile(rutaPlantillaInforme())
  } catch {
    return null
  }
}

/**
 * Combina el PDF maquilado con la plantilla de la clínica:
 * - Página 1 de la plantilla = encabezado institucional (carátula)
 * - Todas las páginas del PDF externo (conserva firma/sello del laboratorio referido)
 * - Página 2 de la plantilla = pie con firma y sello de la clínica (si existe)
 */
export async function combinarPdfMaquilaConPlantilla(
  externoBytes: Uint8Array,
  encabezado: LabEncabezadoInforme = 'masterlab',
): Promise<Uint8Array> {
  if (encabezado === 'clinica') return externoBytes

  const plantillaBytes = await cargarPlantillaBytes()
  if (!plantillaBytes) return externoBytes

  const [plantilla, externo] = await Promise.all([
    PDFDocument.load(plantillaBytes),
    PDFDocument.load(externoBytes, { ignoreEncryption: true }),
  ])

  const salida = await PDFDocument.create()
  const pagPlantilla = plantilla.getPageCount()

  if (pagPlantilla >= 1) {
    const [p1] = await salida.copyPages(plantilla, [0])
    salida.addPage(p1)
  }

  const nExt = externo.getPageCount()
  if (nExt > 0) {
    const indices = Array.from({ length: nExt }, (_, i) => i)
    const paginas = await salida.copyPages(externo, indices)
    for (const p of paginas) salida.addPage(p)
  }

  if (pagPlantilla >= 2) {
    const [p2] = await salida.copyPages(plantilla, [1])
    salida.addPage(p2)
  }

  return salida.save()
}

/** Si no es PDF, devuelve los bytes tal cual (imágenes: el visor del navegador las abre). */
export async function prepararDescargaResultado(
  bytes: Uint8Array,
  mimeType: string | null | undefined,
  encabezado: LabEncabezadoInforme = 'masterlab',
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const mime = (mimeType ?? '').toLowerCase()
  if (mime.includes('pdf') || bytes[0] === 0x25 && bytes[1] === 0x50) {
    const merged = await combinarPdfMaquilaConPlantilla(bytes, encabezado)
    return { bytes: merged, contentType: 'application/pdf' }
  }
  return { bytes, contentType: mime || 'application/octet-stream' }
}
