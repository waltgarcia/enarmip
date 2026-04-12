import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { Zap } from 'lucide-react'

export default function Generate() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('generate')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-cyan/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={28} className="text-accent-cyan" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Generación de Casos con IA' : 'AI Case Generation'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Genera casos clínicos ENARM basados en las guías clínicas usando Claude AI.'
              : 'Generate ENARM clinical cases based on clinical guidelines using Claude AI.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
