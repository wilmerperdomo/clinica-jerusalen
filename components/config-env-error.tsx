export default function ConfigEnvError() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm text-center">
        <h1 className="text-xl font-bold text-slate-800 mb-3">
          Falta configurar Supabase en Vercel
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Agregue estas variables en <strong>Vercel → Settings → Environment Variables</strong>
          (Production, Preview y Development), luego haga <strong>Redeploy</strong>:
        </p>
        <ul className="text-left text-sm text-slate-700 space-y-1 mb-4 font-mono bg-slate-50 p-4 rounded-lg">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          <li>SUPABASE_SERVICE_ROLE_KEY</li>
        </ul>
        <p className="text-xs text-slate-500">
          Copie los valores de su archivo <code>.env.local</code> en su PC.
        </p>
      </div>
    </main>
  )
}
