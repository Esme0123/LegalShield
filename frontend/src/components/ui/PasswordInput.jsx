import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Campo de contraseña con visor (ojito) para comprobar lo escrito. Se usa en
 * todas las vistas que piden una clave: login, cambio, reinicio y alta.
 * El valor solo se muestra en pantalla; nunca se copia ni se guarda.
 */
const PasswordInput = forwardRef(function PasswordInput({ className, disabled, ...props }, ref) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        className={cn('ls-input !pr-11', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-surface2/60 hover:text-accent disabled:pointer-events-none disabled:opacity-40"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})

export default PasswordInput
