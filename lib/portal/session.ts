import { cookies } from 'next/headers'
import {
  scryptSync, randomBytes, timingSafeEqual, createHmac,
} from 'node:crypto'

export const PORTAL_COOKIE = 'portal_sesion'
const SESSION_TTL_MS = 1000 * 60 * 60 * 6 // 6 horas

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'portal-dev-secret-cambiar-en-produccion'
}

/* ───────────── Hash de contraseña (scrypt) ───────────── */

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!hash || !salt) return false
  try {
    const calc = scryptSync(password, salt, 64)
    const stored = Buffer.from(hash, 'hex')
    if (calc.length !== stored.length) return false
    return timingSafeEqual(calc, stored)
  } catch {
    return false
  }
}

/** Genera una contraseña legible (sin caracteres ambiguos). */
export function generarPassword(largo = 6): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(largo)
  let out = ''
  for (let i = 0; i < largo; i++) out += chars[bytes[i] % chars.length]
  return out
}

/* ───────────── Token de sesión (HMAC firmado) ───────────── */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function firmar(payload: string): string {
  return b64url(createHmac('sha256', getSecret()).update(payload).digest())
}

export function crearTokenSesion(pacienteId: number): string {
  const payloadObj = { pid: pacienteId, exp: Date.now() + SESSION_TTL_MS }
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)))
  return `${payload}.${firmar(payload)}`
}

export function verificarToken(token: string | undefined): { pacienteId: number } | null {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const esperado = firmar(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (typeof data.pid !== 'number' || typeof data.exp !== 'number') return null
    if (Date.now() > data.exp) return null
    return { pacienteId: data.pid }
  } catch {
    return null
  }
}

/* ───────────── Cookie helpers (server) ───────────── */

export async function setSesionPortal(pacienteId: number): Promise<void> {
  const store = await cookies()
  store.set(PORTAL_COOKIE, crearTokenSesion(pacienteId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/portal',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function getSesionPortal(): Promise<{ pacienteId: number } | null> {
  const store = await cookies()
  return verificarToken(store.get(PORTAL_COOKIE)?.value)
}

export async function limpiarSesionPortal(): Promise<void> {
  const store = await cookies()
  store.delete(PORTAL_COOKIE)
}
