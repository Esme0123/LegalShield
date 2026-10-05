import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Roles from '@/pages/Roles'
import Cases from '@/pages/Cases'
import Audit from '@/pages/Audit'
import RiskAssessment from '@/pages/RiskAssessment'
import { useAppStore } from '@/store/useAppStore'

function RequireSession({ children }) {
  const session = useAppStore((s) => s.session)
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireSession>
            <AppLayout />
          </RequireSession>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/risk-assessment" element={<RiskAssessment />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}