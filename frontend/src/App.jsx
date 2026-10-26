import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import GlowCursor from '@/components/reactbits/GlowCursor'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Roles from '@/pages/Roles'
import UsersManagement from '@/pages/UsersManagement'
import Cases from '@/pages/Cases'
import Audit from '@/pages/Audit'
import RiskAssessment from '@/pages/RiskAssessment'
import Profile from '@/pages/Profile'
import { useAppStore } from '@/store/useAppStore'

function RequireSession({ children }) {
  const session = useAppStore((s) => s.session)
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  // Clave inicial pendiente: el servidor veta el resto de rutas, la UI no las ofrece.
  if (session.mustChangePassword && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />
  }
  return children
}

export default function App() {
  const session = useAppStore((s) => s.session)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const location = useLocation()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // Al recargar, la sesion tarda en restaurarse y la guarda manda a /login con la ruta
  // de origen; una vez restaurada se vuelve a ella. `from` viaja en el estado interno
  // del router (no en la URL) y solo se acepta si es una ruta interna distinta de /login.
  const from = location.state?.from
  const afterLogin = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/dashboard'

  return (
    <>
      {/* Cursor circular global: cubre header, tablas, formularios y dashboard. */}
      <GlowCursor />
      <Routes>
        <Route path="/login" element={session ? <Navigate to={afterLogin} replace /> : <Login />} />
        {/* El alta de cuentas es exclusiva del OSI: no hay auto-registro. */}
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route
          element={
            <RequireSession>
              <AppLayout />
            </RequireSession>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/users" element={<UsersManagement />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/risk-assessment" element={<RiskAssessment />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </>
  )
}