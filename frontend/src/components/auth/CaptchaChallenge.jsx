import { useEffect, useState } from "react"
import { ShieldAlert } from "lucide-react"

/**
 * Componente CAPTCHA como "Mecanismo Menos Común" (Principio de Diseño Seguro #7)
 * Desafío matemático interactivo de confirmación humana
 */
export default function CaptchaChallenge({ onVerify, disabled }) {
  const [num1, setNum1] = useState(0)
  const [num2, setNum2] = useState(0)
  const [answer, setAnswer] = useState("")
  const [isValid, setIsValid] = useState(false)
  const [error, setError] = useState("")
  const [attempts, setAttempts] = useState(0)

  const generateChallenge = () => {
    const n1 = Math.floor(Math.random() * 10) + 1
    const n2 = Math.floor(Math.random() * 10) + 1
    setNum1(n1)
    setNum2(n2)
    setAnswer("")
    setIsValid(false)
    setError("")
  }

  useEffect(() => {
    generateChallenge()
  }, [])

  const handleChange = (e) => {
    const value = e.target.value
    setAnswer(value)
    const correctAnswer = num1 + num2
    const userAnswer = parseInt(value)

    if (value === "" || isNaN(userAnswer)) {
      setIsValid(false)
      setError("")
      return
    }

    if (userAnswer === correctAnswer) {
      setIsValid(true)
      setError("")
      onVerify && onVerify(true, correctAnswer.toString())
    } else {
      setIsValid(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const correctAnswer = num1 + num2
    const userAnswer = parseInt(answer)

    if (userAnswer === correctAnswer) {
      setIsValid(true)
      setError("")
      onVerify && onVerify(true, correctAnswer.toString())
    } else {
      setIsValid(false)
      setError("Respuesta incorrecta. Inténtalo de nuevo.")
      setAttempts((prev) => prev + 1)
      if (attempts >= 2) {
        generateChallenge()
        setAttempts(0)
      }
    }
  }

  const handleRefresh = () => {
    generateChallenge()
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
          <span className="rounded-lg border border-line/60 bg-surface px-3 py-2">{num1}</span>
          <span>+</span>
          <span className="rounded-lg border border-line/60 bg-surface px-3 py-2">{num2}</span>
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
        {isValid && (
          <p className="text-center text-[10.5px] text-accent">✓ Verificación completada</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={disabled}
            className="flex-1 rounded-lg border border-line/60 bg-surface2/60 px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted transition hover:bg-surface2 hover:text-accent"
          >
            NUEVO DESAFÍO
          </button>
          <button
            type="submit"
            disabled={disabled || !answer}
            className="flex-1 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-wider text-accent transition hover:bg-accent/15 disabled:opacity-50"
          >
            VERIFICAR
          </button>
        </div>
      </form>
    </div>
  )
}
