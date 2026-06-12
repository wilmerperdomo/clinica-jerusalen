type Props = {
  urlOk?: boolean
  anonOk?: boolean
  serviceOk?: boolean
}

function Estado({ ok, nombre }: { ok: boolean; nombre: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="font-mono text-xs sm:text-sm">{nombre}</span>
      <span className={ok ? 'text-green-600 font-semibold text-sm' : 'text-red-600 font-semibold text-sm'}>
        {ok ? '✓ Detectada' : '✗ No detectada'}
      </span>
    </li>
  )
}

export default function ConfigEnvError({ urlOk = false, anonOk = false, serviceOk = false }: Props) {
  const todasOk = urlOk && anonOk

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-2 text-center">
          Falta configurar Supabase en Vercel
        </h1>
        <p className="text-sm text-slate-600 mb-4 text-center">
          El servidor no encuentra las variables. Revise el estado:
        </p>

        <ul className="text-left text-slate-700 space-y-1 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
          <Estado ok={urlOk} nombre="NEXT_PUBLIC_SUPABASE_URL" />
          <Estado ok={anonOk} nombre="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
          <Estado ok={serviceOk} nombre="SUPABASE_SERVICE_ROLE_KEY" />
        </ul>

        {!todasOk && (
          <div className="text-sm text-slate-700 space-y-3 mb-4">
            <p className="font-semibold">Pasos en Vercel:</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-600">
              <li>Proyecto <strong>clinica-jerusalen</strong> → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
              <li>Clic en <strong>Import .env</strong> o agregue las 3 variables manualmente</li>
              <li>Marque <strong>Production</strong>, <strong>Preview</strong> y <strong>Development</strong></li>
              <li><strong>Deployments</strong> → <strong>Redeploy</strong> → desmarque <strong>Use existing Build Cache</strong></li>
            </ol>
          </div>
        )}

        <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-3 font-mono whitespace-pre-wrap">
{`NEXT_PUBLIC_SUPABASE_URL=https://lvaxphzquokmfkgjudnx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(copiar de .env.local)
SUPABASE_SERVICE_ROLE_KEY=(copiar de .env.local)`}
        </div>

        <p className="text-xs text-slate-500 mt-3 text-center">
          Archivo en su PC: <code>C:\Users\PC\Downloads\clinica2026\clinica-nueva\.env.local</code>
        </p>
      </div>
    </main>
  )
}
