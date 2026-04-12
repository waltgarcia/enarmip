import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { CreditCard } from 'lucide-react'

export default function Flashcards() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('flashcards')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-cyan/10 flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-accent-cyan" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Modo Flashcards' : 'Flashcard Mode'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Repasa conceptos clave con tarjetas de memoria interactivas.'
              : 'Review key concepts with interactive memory cards.'}
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
