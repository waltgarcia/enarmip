import { createContext, useContext, useState } from 'react'

const LangContext = createContext(null)

const translations = {
  ES: {
    dashboard: 'Dashboard',
    guidelines: 'Guías',
    generate: 'Generar Casos',
    study: 'Estudio Temático',
    exam: 'Examen',
    results: 'Resultados',
    flashcards: 'Flashcards',
    admin: 'Admin',
    logout: 'Cerrar sesión',
    loading: 'Cargando...',
    welcome: 'Bienvenido',
  },
  EN: {
    dashboard: 'Dashboard',
    guidelines: 'Guidelines',
    generate: 'Generate Cases',
    study: 'Thematic Study',
    exam: 'Exam',
    results: 'Results',
    flashcards: 'Flashcards',
    admin: 'Admin',
    logout: 'Sign out',
    loading: 'Loading...',
    welcome: 'Welcome',
  },
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('enarmLang') || 'ES')

  const toggleLang = () => {
    const next = lang === 'ES' ? 'EN' : 'ES'
    setLang(next)
    localStorage.setItem('enarmLang', next)
  }

  const t = (key) => translations[lang][key] || key

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const context = useContext(LangContext)
  if (!context) throw new Error('useLang must be used within LangProvider')
  return context
}
