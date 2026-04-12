import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { BarChart2 } from 'lucide-react'

export default function Results() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('results')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-blue/10 flex items-center justify-center mx-auto mb-4">
            <BarChart2 size={28} className="text-accent-blue" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Visualiza tu progreso, áreas de mejora y estadísticas detalladas.'
              : 'Visualize your progress, areas for improvement and detailed statistics.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
