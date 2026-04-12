import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { Settings } from 'lucide-react'

export default function Admin() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('admin')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-4">
            <Settings size={28} className="text-error" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Panel de Administración' : 'Admin Panel'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Aprueba casos clínicos generados por IA antes de publicarlos.'
              : 'Approve AI-generated clinical cases before publishing them.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
