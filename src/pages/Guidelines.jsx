import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { Upload, FileText } from 'lucide-react'

export default function Guidelines() {
  const { t, lang } = useLang()
  return (
    <AppLayout title={t('guidelines')}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-blue/10 flex items-center justify-center mx-auto mb-4">
            <Upload size={28} className="text-accent-blue" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">
            {lang === 'ES' ? 'Gestión de Guías Clínicas' : 'Clinical Guidelines Management'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {lang === 'ES'
              ? 'Sube y administra los PDFs de las guías clínicas del IMSS, ISSSTE y NOM para generar casos clínicos con IA.'
              : 'Upload and manage clinical guideline PDFs from IMSS, ISSSTE and NOM to generate AI clinical cases.'}
          </p>
          <div className="mt-6 p-6 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-accent-blue/50 transition-colors">
            <FileText size={24} className="text-gray-500 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{lang === 'ES' ? 'Arrastra tu PDF aquí o haz clic para seleccionar' : 'Drag your PDF here or click to select'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
