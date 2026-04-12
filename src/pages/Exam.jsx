import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { FileText } from 'lucide-react'

export default function Exam() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('exam')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-warning" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Simulador de Examen' : 'Exam Simulator'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Simula el formato real del ENARM con casos clínicos cronometrados.'
              : 'Simulate the real ENARM format with timed clinical cases.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
