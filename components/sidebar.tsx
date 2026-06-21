'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard, Stethoscope, Users, FlaskConical,
  Package, Pill, ShoppingCart, Receipt, CreditCard,
  BarChart3, Settings, LogOut, ChevronRight,
  FileText, BookOpen, CalendarDays, Building2, KeyRound, X, Eye, EyeOff, Truck, Menu, Bell, ClipboardList,
  Wallet, PieChart, MapPin, ShieldCheck, Tag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, getInitials } from '@/lib/utils'
import ClinicaLogo from '@/components/clinica-logo'
import SucursalNombre from '@/components/sucursal-nombre'

// ---- Tipos ----
interface NavItem  { href: string; label: string; icon: React.ElementType }
interface NavGroup { label: string; items: NavItem[] }

// ---- Mapa de navegación ----
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'CLÍNICO',
    items: [
      { href: '/agenda',         label: 'Agenda',            icon: CalendarDays },
      { href: '/notificaciones', label: 'Notificaciones',    icon: Bell         },
      { href: '/consultas',      label: 'Consultas Médicas', icon: Stethoscope  },
      { href: '/pacientes',   label: 'Pacientes',         icon: Users        },
      { href: '/colonias',    label: 'Catálogo Colonias', icon: MapPin       },
      { href: '/laboratorio', label: 'Laboratorio',       icon: FlaskConical },
      { href: '/expediente',  label: 'Expediente',        icon: BookOpen     },
    ],
  },
  {
    label: 'ADMINISTRATIVO',
    items: [
      { href: '/precios',     label: 'Consulta de Precios', icon: Tag    },
      { href: '/ventas',      label: 'Ventas',       icon: Receipt      },
      { href: '/compras',     label: 'Compras',      icon: ShoppingCart },
      { href: '/cxp',        label: 'Cuentas por Pagar', icon: CreditCard },
      { href: '/proveedores', label: 'Proveedores',  icon: Truck        },
      { href: '/inventario',  label: 'Inventario',   icon: Package      },
      { href: '/productos',   label: 'Productos',    icon: Pill         },
    ],
  },
  {
    label: 'FIDELIZACIÓN',
    items: [
      { href: '/membresias',   label: 'Planes Médicos', icon: CreditCard   },
      { href: '/cotizaciones', label: 'Cotizaciones',   icon: ClipboardList },
      { href: '/facturacion',  label: 'Facturación',    icon: FileText     },
      { href: '/reportes',    label: 'Reportes',       icon: BarChart3  },
      { href: '/planilla',    label: 'Planilla',       icon: Wallet     },
      { href: '/control-financiero', label: 'Control Financiero', icon: PieChart },
    ],
  },
]

// ---- Props ----
interface SidebarProps {
  userName?:         string
  userRole?:         string
  userInitials?:     string
  sucursalNombre?:   string
  modulosPermitidos?: string[]
  sinPerfil?:        boolean
  esAdmin?:          boolean
  esSuperAdmin?:     boolean
}

export default function Sidebar({
  userName = 'Usuario', userRole = '', userInitials, sucursalNombre, modulosPermitidos, sinPerfil, esAdmin, esSuperAdmin,
}: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const initials = userInitials ?? getInitials(userName)

  // ── estado menú de usuario ──────────────────────────────────
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [modalPass,  setModalPass]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cerrar sidebar móvil al cambiar de ruta
  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  // ── log de acceso ───────────────────────────────────────────
  async function registrarLog(accion: 'logout' | 'timeout') {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('acceso_logs').insert({
        user_id: user.id,
        email:   user.email,
        accion,
      })
    } catch { /* silencioso */ }
  }

  async function handleLogout() {
    await registrarLog('logout')
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  function puedeVer(href: string) {
    if (!modulosPermitidos || modulosPermitidos.length === 0) return false
    if (href === '/colonias') {
      return modulosPermitidos.includes('pacientes') || modulosPermitidos.includes('configuracion')
    }
    // Consulta de precios: visible para personal de mostrador (cualquiera con acceso a estos módulos)
    if (href === '/precios') {
      return ['ventas', 'laboratorio', 'productos', 'inventario', 'cotizaciones']
        .some(m => modulosPermitidos.includes(m))
    }
    const clave = href.replace('/', '') || 'dashboard'
    return modulosPermitidos.includes(clave)
  }

  const navFiltrado = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => puedeVer(item.href)),
  })).filter(g => g.items.length > 0)

  // ── Nav content (reutilizado en desktop y mobile) ───────────
  const navContent = (
    <>
      {/* ---- Logo ---- */}
      <div className="flex items-center gap-2 px-3 py-2.5 min-h-[4rem] border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-[#003366]/5 to-transparent overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <ClinicaLogo variant="compact" />
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5 pl-[3rem] truncate">Sistema v2.0</p>
        </div>
        {/* Botón cerrar en móvil */}
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ---- Dashboard ---- */}
      {puedeVer('/') && (
        <div className="px-3 pt-4">
          <NavLink href="/" label="Dashboard" icon={LayoutDashboard} active={isActive('/')} />
        </div>
      )}

      {/* ---- Nav ---- */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {navFiltrado.length === 0 && (
          <div className="mx-2 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 leading-relaxed">
            <p className="font-semibold mb-1">
              {sinPerfil ? 'Cuenta sin perfil' : 'Sin módulos asignados'}
            </p>
            <p>
              {sinPerfil
                ? 'Tu usuario existe en el login pero no está vinculado en la tabla perfiles. Ejecuta el SQL de corrección en Supabase (ver chat) y vuelve a entrar.'
                : 'Tu rol no tiene permisos de acceso. Pide al administrador que te asigne un rol con permisos en Configuración → Permisos.'}
            </p>
          </div>
        )}
        {navFiltrado.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ---- Footer ---- */}
      <div className="border-t border-slate-100 px-3 py-3 space-y-0.5 flex-shrink-0">
        {(esAdmin || puedeVer('/usuarios')) && (
          <NavLink href="/usuarios" label="Usuarios" icon={Users} active={isActive('/usuarios')} />
        )}
        {puedeVer('/configuracion') && (
          <NavLink href="/configuracion" label="Configuración" icon={Settings} active={isActive('/configuracion')} />
        )}
        {esSuperAdmin && (
          <NavLink href="/auditoria" label="Auditoría y Respaldos" icon={ShieldCheck} active={isActive('/auditoria')} />
        )}

        {/* Sucursal activa — lectura directa desde el navegador */}
        <div className="flex items-center gap-2 px-2 py-1.5 mt-1 bg-blue-50 rounded-lg min-h-[28px]">
          <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <SucursalNombre
            inicial={sucursalNombre}
            className="text-xs text-blue-700 font-medium truncate"
          />
        </div>

        {/* Avatar + menú contextual */}
        <div className="relative mt-1" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition text-left"
          >
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{userName}</p>
              {userRole && <p className="text-xs text-slate-400 truncate">{userRole}</p>}
            </div>
            <ChevronRight className={cn('w-3.5 h-3.5 text-slate-300 transition-transform', menuOpen && '-rotate-90')} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
              <button
                onClick={() => { setMenuOpen(false); setModalPass(true) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <KeyRound className="w-4 h-4 text-slate-400" />
                Cambiar contraseña
              </button>
              <div className="h-px bg-slate-100" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* ── Botón hamburguesa (solo móvil) ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 transition"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Overlay móvil ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar móvil (drawer) ── */}
      <aside className={cn(
        'md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] bg-white border-r border-slate-100 shadow-xl transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {navContent}
      </aside>

      {/* ── Sidebar desktop (fijo) ── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col w-[260px] bg-white border-r border-slate-100 shadow-sm">
        {navContent}
      </aside>

      {/* ---- Modal Cambiar Contraseña ---- */}
      {modalPass && <ModalCambiarPassword onClose={() => setModalPass(false)} />}
    </>
  )
}

// ── Modal cambio de contraseña ──────────────────────────────────
function ModalCambiarPassword({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const [nueva,    setNueva]    = useState('')
  const [confirma, setConfirma] = useState('')
  const [showN,    setShowN]    = useState(false)
  const [showC,    setShowC]    = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ok,       setOk]       = useState(false)
  const [error,    setError]    = useState('')

  async function handleGuardar() {
    setError('')
    if (nueva.length < 6)       return setError('La contraseña debe tener al menos 6 caracteres.')
    if (nueva !== confirma)      return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    const { error: err } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)
    if (err) return setError(err.message)
    setOk(true)
    setTimeout(onClose, 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-slate-800">Cambiar contraseña</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {ok ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-medium text-green-700">¡Contraseña actualizada!</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <input
                    type={showN ? 'text' : 'password'}
                    value={nueva}
                    onChange={e => setNueva(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => setShowN(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showN ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña</label>
                <div className="relative">
                  <input
                    type={showC ? 'text' : 'password'}
                    value={confirma}
                    onChange={e => setConfirma(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => setShowC(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showC ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Indicador de fuerza */}
              {nueva.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(n => (
                      <div key={n} className={cn('h-1 flex-1 rounded-full transition-colors',
                        nueva.length >= n * 3
                          ? n <= 1 ? 'bg-red-400' : n <= 2 ? 'bg-yellow-400' : n <= 3 ? 'bg-blue-400' : 'bg-green-400'
                          : 'bg-slate-200'
                      )} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">
                    {nueva.length < 4 ? 'Muy corta' : nueva.length < 7 ? 'Débil' : nueva.length < 10 ? 'Aceptable' : 'Fuerte'}
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition"
              >
                {guardando ? 'Guardando…' : 'Actualizar contraseña'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── NavLink ─────────────────────────────────────────────────────
function NavLink({ href, label, icon: Icon, active }: {
  href: string; label: string; icon: React.ElementType; active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 px-2 py-2 rounded-xl text-sm font-medium transition-all',
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} />
      <span className="flex-1 truncate">{label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
    </Link>
  )
}
