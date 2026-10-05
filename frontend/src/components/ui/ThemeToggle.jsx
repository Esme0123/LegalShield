import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo oscuro activo' : 'Modo claro activo'}
      className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border border-line/70 bg-surface2/50 px-1 transition-colors duration-300 hover:border-accent/70 ${className}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className={`grid h-6 w-6 place-items-center rounded-full shadow-glow ${
          isDark ? 'ml-8 bg-accent/90 text-navy' : 'ml-0 bg-info/90 text-white'
        }`}
      >
        {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      </motion.span>
      <span className="pointer-events-none absolute inset-0 grid place-items-center text-[9px] font-semibold tracking-[0.2em] text-muted opacity-0">
        {isDark ? 'DARK' : 'LIGHT'}
      </span>
    </button>
  )
}