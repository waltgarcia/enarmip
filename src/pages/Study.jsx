import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { Target } from 'lucide-react'

export default function Study() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('study')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
            <Target size={28} className="text-success" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Estudio Temático' : 'Thematic Study'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Estudia por especialidad médica o tema clínico con sesiones estructuradas.'
              : 'Study by medical specialty or clinical topic with structured sessions.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
