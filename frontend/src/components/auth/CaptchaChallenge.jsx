import { useEffect, useState } from "react"
import { ShieldAlert } from "lucide-react"
import { authApi } from "@/lib/apiClient"

/**
 * Componente CAPTCHA como "Mecanismo Menos Común" (Principio de Diseño Seguro #7)
 * Desafío matemático emitido y validado por el servidor: el cliente solo
 * muestra la pregunta y devuelve token + respuesta al iniciar sesión
 */
export default function CaptchaChallenge({ onVerify, disabled }) {
  const [challenge, setChallenge] = useState(null)
  const [answer, setAnswer] = useState("")
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState("")

  const loadChallenge = async () => {
    setAnswer("")
    setIsReady(false)
    setError("")
    onVerify && onVerify(false, null)
    try {
      setChallenge(await authApi.captcha())
    } catch {
      setChallenge(null)
      setError("No se pudo obtener el desafío. Intenta de nuevo")
    }
  }

  useEffect(() => {
    loadChallenge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, "")
    setAnswer(value)
    setError("")
    setIsReady(false)
    onVerify && onVerify(false, null)
  }

  // La respuesta se valida en el servidor al iniciar sesión.
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!challenge || !answer) return
    setIsReady(true)
    onVerify && onVerify(true, { token: challenge.token, answer })
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="h-4 w-4 text-accent" />
        <p className="font-mono text-[10.5px] font-bold text-accent uppercase tracking-wider">
          Verificación Anti-Bot (Mecanismo Menos Común)
        </p>
      </div>
      <p className="mb-3 text-[11.5px] leading-snug text-ink/80">
        Resuelve la siguiente operación matemática para confirmar que eres humano:
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-center gap-2 text-lg font-bold font-mono">
          <span className="rounded-lg border border-line/60 bg-surface px-3 py-2">{challenge?.question ?? "…"}</span>
          <span>=</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={answer}
            onChange={handleChange}
            disabled={disabled}
            placeholder="?"
            className="w-16 rounded-lg border border-line/60 bg-surface px-3 py-2 text-center focus:border-accent focus:outline-none"
            maxLength="2"
          />
        </div>
        {error && (
          <p className="text-center text-[10.5px] text-danger">{error}</p>
        )}
        {isReady && (
          <p className="text-center text-[10.5px] text-accent">✓ Respuesta lista para enviar</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadChallenge}
            disabled={disabled}
            className="flex-1 rounded-lg border border-line/60 bg-surface2/60 px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted transition hover:bg-surface2 hover:text-accent"
          >
            NUEVO DESAFÍO
          </button>
          <button
            type="submit"
            disabled={disabled || !answer || !challenge}
            className="flex-1 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-wider text-accent transition hover:bg-accent/15 disabled:opacity-50"
          >
            VERIFICAR
          </button>
        </div>
      </form>
    </div>
  )
}
