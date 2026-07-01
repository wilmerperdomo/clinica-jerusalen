/**
 * Migra clientes createBrowserClient locales al singleton lib/supabase/client.ts
 */
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')

const files = [
  'app/(dashboard)/usuarios/usuarios-client.tsx',
  'components/cie10-buscador.tsx',
  'components/consulta-diagnosticos-panel.tsx',
  'components/consulta-problemas-panel.tsx',
  'components/consulta-historial-panel.tsx',
  'app/(dashboard)/promociones/promociones-reportes-panel.tsx',
  'app/(dashboard)/promociones/promociones-plantillas-panel.tsx',
  'app/(dashboard)/agenda/agenda-client.tsx',
  'components/expediente-pediatria-panel.tsx',
  'app/(dashboard)/documentos/documentos-client.tsx',
  'app/(dashboard)/productos/productos-client.tsx',
  'app/(dashboard)/consultas/consultas-client.tsx',
  'components/consulta-contexto-clinico-panel.tsx',
  'components/expediente-prenatal-panel.tsx',
  'app/(dashboard)/laboratorio/laboratorio-client.tsx',
  'app/(dashboard)/inventario/inventario-client.tsx',
  'app/(dashboard)/promociones/promociones-automatizaciones-panel.tsx',
  'app/(dashboard)/configuracion/config-client.tsx',
  'components/inventario/inventario-reposicion-panel.tsx',
  'app/(dashboard)/fidelidad/fidelidad-client.tsx',
  'components/inventario/inventario-conteo-panel.tsx',
  'components/consulta-documentos-panel.tsx',
  'app/(dashboard)/promociones/promociones-client.tsx',
]

const helperRe = /function (sb|supabase)\(\) \{\s*return createBrowserClient\([\s\S]*?\)\s*\}\s*\n/g

for (const rel of files) {
  const fp = path.join(root, rel)
  let src = fs.readFileSync(fp, 'utf8')
  if (!src.includes('createBrowserClient')) {
    console.log('SKIP (already fixed):', rel)
    continue
  }

  src = src.replace(
    /import \{ createBrowserClient \} from '@supabase\/ssr'/,
    "import { createClient } from '@/lib/supabase/client'",
  )

  // Inline createBrowserClient(...) → createClient()
  src = src.replace(
    /createBrowserClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY!,?\s*\)/g,
    'createClient()',
  )

  src = src.replace(helperRe, '')

  // sb() / supabase() calls → createClient()
  src = src.replace(/\bsb\(\)/g, 'createClient()')
  src = src.replace(/\bsupabase\(\)/g, 'createClient()')

  fs.writeFileSync(fp, src)
  console.log('FIXED:', rel)
}
