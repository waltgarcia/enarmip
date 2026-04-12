import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-blue"></div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace state={{ flashError: 'Acceso restringido' }} />
  }

  return children
}
