import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware liviano para Vercel Edge.
 * La sesión y redirecciones se manejan en los layouts (dashboard / auth).
 * Evita MIDDLEWARE_INVOCATION_FAILED con @supabase/ssr en Edge.
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
