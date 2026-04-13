import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { LangProvider, useLang } from './context/LangContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import { Loader2, WifiOff } from 'lucide-react'

// ── Lazy page imports ──────────────────────────────────────────────────────────
const Login      = lazy(() => import('./pages/Login'))
const Signup     = lazy(() => import('./pages/Signup'))
const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Guidelines = lazy(() => import('./pages/Guidelines'))
const Generate   = lazy(() => import('./pages/Generate'))
const Study      = lazy(() => import('./pages/Study'))
const Exam       = lazy(() => import('./pages/Exam'))
const Results    = lazy(() => import('./pages/Results'))
const Flashcards = lazy(() => import('./pages/Flashcards'))
const Admin      = lazy(() => import('./pages/Admin'))

// ── Full-page spinner (Suspense fallback) ─────────────────────────────────────
function PageSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-accent-blue" />
    </div>
  )
}

// ── Network offline banner ─────────────────────────────────────────────────────
function OfflineBanner() {
  const { t } = useLang()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (!offline) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 bg-error text-white text-sm font-medium py-2">
      <WifiOff size={14} />
      {t('toastOffline')}
    </div>
  )
}

// ── Dynamic document.title per route ─────────────────────────────────────────
const ROUTE_TITLES = {
  '/dashboard':  'Dashboard — ENARM•AI',
  '/guidelines': 'Guías — ENARM•AI',
  '/generate':   'Generar Casos — ENARM•AI',
  '/study':      'Estudio — ENARM•AI',
  '/exam':       'Examen — ENARM•AI',
  '/results':    'Resultados — ENARM•AI',
  '/flashcards': 'Flashcards — ENARM•AI',
  '/admin':      'Admin — ENARM•AI',
  '/login':      'Iniciar sesión — ENARM•AI',
  '/signup':     'Registro — ENARM•AI',
}

function TitleUpdater() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = ROUTE_TITLES[pathname] ?? 'ENARM•AI'
  }, [pathname])
  return null
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LangProvider>
          <ToastProvider>
            <ScrollToTop />
            <TitleUpdater />
            <OfflineBanner />
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/login"      element={<Login />} />
                <Route path="/signup"     element={<Signup />} />
                <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/guidelines" element={<ProtectedRoute><Guidelines /></ProtectedRoute>} />
                <Route path="/generate"   element={<ProtectedRoute><Generate /></ProtectedRoute>} />
                <Route path="/study"      element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/exam"       element={<ProtectedRoute><Exam /></ProtectedRoute>} />
                <Route path="/results"    element={<ProtectedRoute><Results /></ProtectedRoute>} />
                <Route path="/flashcards" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
                <Route path="/admin"      element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </LangProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
