import fs from 'node:fs'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdfPath = String.raw`c:\Users\PC\Downloads\HEMOGRAMA COMPLETO.pdf`
const data = new Uint8Array(fs.readFileSync(pdfPath))
const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i)
  const content = await page.getTextContent()
  const text = content.items.map((it) => ('str' in it ? it.str : '')).join('\n')
  console.log(`--- PAGE ${i} ---`)
  console.log(text)
}
