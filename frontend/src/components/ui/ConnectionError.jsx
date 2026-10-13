import { ServerCrash } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

/**
 * Aviso de conexion. La API REST persiste en MySQL y no hay datos simulados:
 * cuando el backend o la base de datos no responden, se avisa aqui en vez de
 * mostrar informacion ficticia.
 */
export default function ConnectionError() {
  const apiStatus = useAppStore((s) => s.apiStatus)
  const apiError = useAppStore((s) => s.apiError)

  if (apiStatus !== 'error') return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/50 bg-danger/10 p-3.5">
      <ServerCrash className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div>
        <p className="text-[12.5px] font-semibold text-danger">Sin conexion con la base de datos</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink/80">
          {apiError ?? 'Revise que XAMPP (MySQL) y el backend esten en marcha.'}
        </p>
      </div>
    </div>
  )
}
