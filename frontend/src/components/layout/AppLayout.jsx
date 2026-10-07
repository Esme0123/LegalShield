import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Menu, RefreshCcw, Scale, Search, ShieldAlert } from 'lucide-react'
import Sidebar from './Sidebar'
import ThemeToggle from '@/components/ui/ThemeToggle'
import EffectsToggle from '@/components/ui/EffectsToggle'
import AeroShards from '@/components/reactbits/AeroShards'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'

const TITLES = {
  '/dashboard': ['Panel de control', 'Estado operativo del despacho en tiempo real'],
  '/roles': ['Matriz de accesos SIS-321', 'Permisos por sistema, recurso y rol'],
  '/users': ['Gestión de Usuarios (ABM)', 'Alta, edicion, baja logica y desbloqueo granular'],
  '/cases': ['Expedientes judiciales', 'Gestion de prueba documental restringida'],
  '/audit': ['Logs de auditoria', 'Flujo forense en vivo · linterna de inspeccion activa'],
  '/risk-assessment': ['Evaluacion ISO 27001', 'Autoevaluacion, clasificacion y mapa de calor'],
  '/profile': ['Mi perfil', 'Datos personales, contrasena e historial de accesos'],
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const location = useLocation()
  const logs = useAppStore((s) => s.logs)
  const session = useAppStore((s) => s.session)
  const didactic = useAppStore((s) => s.didactic)
  const resetSimulation = useAppStore((s) => s.resetSimulation)

  const [title, subtitle] = TITLES[location.pathname] ?? ['LegalShield', '']
  const critical = logs.filter((l) => l.severity === 'critico').slice(0, 6)

  useEffect(() => {
    setSidebarOpen(false)
    setBellOpen(false)
  }, [location.pathname])

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <AeroShards density={didactic ? 0.00012 : 0.00004} className={didactic ? 'opacity-70' : 'opacity-25'} />
      </div>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className={cn('transition-[padding] duration-300 ease-shield', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[262px]')}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line/60 text-muted transition hover:border-accent/60 hover:text-ink lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base font-bold tracking-tight sm:text-lg">{title}</h1>
              <p className="hidden truncate text-[11px] text-muted sm:block">{subtitle}</p>
            </div>

            <div className="hidden items-center gap-2 rounded-lg border border-line/50 bg-surface2/30 px-3 py-1.5 md:flex">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input
                type="search"
                placeholder="Buscar expediente, log, hash…"
                className="w-52 bg-transparent text-[12px] outline-none placeholder:text-muted/60"
                aria-label="Busqueda global"
              />
              <span className="ls-kbd">Ctrl K</span>
            </div>

            <button
              type="button"
              onClick={() => {
                resetSimulation()
                setBellOpen(false)
              }}
              title="Reiniciar simulacion"
              className="hidden h-9 w-9 place-items-center rounded-lg border border-line/60 text-muted transition hover:border-accent/60 hover:text-ink sm:grid"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>

            <EffectsToggle className="hidden lg:inline-flex" />

            <Link
              to="/profile"
              title="Mi perfil"
              className="hidden h-9 items-center gap-2.5 rounded-lg border border-line/60 px-2 pr-3 transition hover:border-accent/60 hover:bg-surface2/40 md:flex"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-accent">
                <Scale className="h-3.5 w-3.5" />
              </span>
              <span className="text-left leading-none">
                <span className="block font-mono text-[10.5px] font-semibold text-ink">
                  {session?.userId ?? 'LEG-0000'}
                </span>
                <span className="mt-0.5 block text-[9.5px] capitalize text-muted">
                  {session?.roleId ?? 'sesion'}
                </span>
              </span>
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                className="relative grid h-9 w-9 place-items-center rounded-lg border border-line/60 text-muted transition hover:border-accent/60 hover:text-ink"
                aria-label="Alertas de seguridad"
              >
                <Bell className="h-4 w-4" />
                {critical.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                    {critical.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-11 z-50 w-[min(90vw,20rem)] rounded-xl border border-line/60 bg-surface/95 p-2 shadow-lift backdrop-blur-xl"
                  >
                    <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      Eventos criticos recientes
                    </p>
                    {critical.length === 0 ? (
                      <p className="px-2 pb-2 text-[12px] text-muted">Sin alertas criticas. Escudo estable.</p>
                    ) : (
                      critical.map((l) => (
                        <div key={l.id} className="rounded-lg px-2 py-1.5 transition hover:bg-surface2/50">
                          <p className="font-mono text-[10px] font-bold text-danger">{l.type}</p>
                          <p className="text-[11.5px] leading-snug text-ink">{l.message}</p>
                          <p className="font-mono text-[9.5px] text-muted">{timeAgo(l.ts)}</p>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Contenido */}
        <main className="relative px-4 py-6 sm:px-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="border-t border-line/40 px-4 py-4 text-center sm:px-6">
          <p className="flex items-center justify-center gap-2 text-[11px] text-muted">
            <ShieldAlert className="h-3.5 w-3.5" />
            Entorno de demostracion · datos ficticios · los logs se generan en memoria
          </p>
        </footer>
      </div>
    </div>
  )
}