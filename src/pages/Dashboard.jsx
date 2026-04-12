import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { BookOpen, Zap, Target, Trophy, AlertTriangle } from 'lucide-react'

const stats = [
  { icon: BookOpen, label: { ES: 'Casos Estudiados', EN: 'Cases Studied' }, value: '0', color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  { icon: Zap, label: { ES: 'Casos Generados', EN: 'Cases Generated' }, value: '0', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
  { icon: Target, label: { ES: 'Precisión', EN: 'Accuracy' }, value: '—', color: 'text-success', bg: 'bg-success/10' },
  { icon: Trophy, label: { ES: 'Racha', EN: 'Streak' }, value: '0 días', color: 'text-warning', bg: 'bg-warning/10' },
]

export default function Dashboard() {
  const { t, lang } = useLang()
  const { profile } = useAuth()
  const location = useLocation()
  const [flashError, setFlashError] = useState(location.state?.flashError ?? null)

  useEffect(() => {
    if (flashError) {
      const timer = setTimeout(() => setFlashError(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [flashError])

  return (
    <AppLayout title={t('dashboard')}>
      {flashError && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-error/10 border border-error/30 text-error text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          <AlertTriangle size={16} />
          {flashError}
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="font-heading font-bold text-2xl text-white">
            {lang === 'ES' ? 'Bienvenido' : 'Welcome'}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! 👋
          </h2>
          <p className="text-gray-400 mt-1">
            {lang === 'ES' ? 'Continúa tu preparación para el ENARM.' : 'Continue your ENARM preparation.'}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label.ES} className="bg-surface border border-gray-800 rounded-2xl p-4">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bg} mb-3`}>
                <Icon size={20} className={color} />
              </div>
              <p className="text-2xl font-heading font-bold text-white">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label[lang]}</p>
            </div>
          ))}
        </div>

        {/* Placeholder content */}
        <div className="bg-surface border border-gray-800 rounded-2xl p-6">
          <h3 className="font-heading font-semibold text-lg text-white mb-2">
            {lang === 'ES' ? 'Actividad reciente' : 'Recent activity'}
          </h3>
          <p className="text-gray-400 text-sm">
            {lang === 'ES' ? 'Aquí aparecerá tu actividad de estudio reciente.' : 'Your recent study activity will appear here.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
