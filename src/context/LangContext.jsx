import { createContext, useContext, useState } from 'react'

const LangContext = createContext(null)

const translations = {
  ES: {
    // Nav
    dashboard:    'Dashboard',
    guidelines:   'Guías',
    generate:     'Generar Casos',
    study:        'Estudio Temático',
    exam:         'Examen',
    results:      'Resultados',
    flashcards:   'Flashcards',
    admin:        'Admin',
    logout:       'Cerrar sesión',
    loading:      'Cargando...',
    welcome:      'Bienvenido',

    // Common actions
    save:         'Guardar',
    cancel:       'Cancelar',
    delete:       'Eliminar',
    edit:         'Editar',
    view:         'Ver',
    search:       'Buscar...',
    filter:       'Filtrar',
    clear:        'Limpiar',
    retry:        'Reintentar',
    back:         'Volver al inicio',
    confirm:      'Confirmar',
    yes:          'Sí',
    no:           'No',

    // Toast messages
    toastSaved:        'Guardado correctamente',
    toastApproved:     'Pregunta aprobada',
    toastRejected:     'Pregunta rechazada',
    toastDeleted:      'Eliminado correctamente',
    toastRoleUpdated:  'Rol actualizado',
    toastAccessDenied: 'Acceso restringido',
    toastGenError:     'Error al generar casos. Intenta de nuevo.',
    toastNetError:     'Error de red. Verifica tu conexión.',
    toastOffline:      'Sin conexión. Verifica tu internet.',

    // Exam
    examStart:       'Iniciar Examen',
    examNext:        'Siguiente',
    examFinish:      'Terminar',
    examTimer:       'Tiempo restante',
    examQuestion:    'Pregunta',
    examOf:          'de',
    examAnswered:    'Respondidas',
    examUnanswered:  'Sin responder',
    examFlagged:     'Marcadas',
    examCorrect:     'Correctas',
    examIncorrect:   'Incorrectas',

    // Admin
    adminPending:    'Pendientes de revisión',
    adminApprove:    'Aprobar',
    adminReject:     'Rechazar',
    adminApproveAll: 'Aprobar todos',
    adminRejectSel:  'Rechazar seleccionados',
    adminBank:       'Banco aprobado',
    adminUsers:      'Usuarios',

    // Errors
    errorGeneric:    'Algo salió mal. Intenta de nuevo.',
    errorOffline:    'Sin conexión a internet.',
    errorApi:        'Error de API. Intenta de nuevo.',

    // Empty states
    emptyPending:    'No hay casos pendientes de revisión.',
    emptyBank:       'No hay preguntas en el banco.',
    emptyResults:    'Sin resultados.',
  },
  EN: {
    // Nav
    dashboard:    'Dashboard',
    guidelines:   'Guidelines',
    generate:     'Generate Cases',
    study:        'Thematic Study',
    exam:         'Exam',
    results:      'Results',
    flashcards:   'Flashcards',
    admin:        'Admin',
    logout:       'Sign out',
    loading:      'Loading...',
    welcome:      'Welcome',

    // Common actions
    save:         'Save',
    cancel:       'Cancel',
    delete:       'Delete',
    edit:         'Edit',
    view:         'View',
    search:       'Search...',
    filter:       'Filter',
    clear:        'Clear',
    retry:        'Retry',
    back:         'Back to home',
    confirm:      'Confirm',
    yes:          'Yes',
    no:           'No',

    // Toast messages
    toastSaved:        'Saved successfully',
    toastApproved:     'Question approved',
    toastRejected:     'Question rejected',
    toastDeleted:      'Deleted successfully',
    toastRoleUpdated:  'Role updated',
    toastAccessDenied: 'Access restricted',
    toastGenError:     'Error generating cases. Please try again.',
    toastNetError:     'Network error. Check your connection.',
    toastOffline:      'No connection. Check your internet.',

    // Exam
    examStart:       'Start Exam',
    examNext:        'Next',
    examFinish:      'Finish',
    examTimer:       'Time remaining',
    examQuestion:    'Question',
    examOf:          'of',
    examAnswered:    'Answered',
    examUnanswered:  'Unanswered',
    examFlagged:     'Flagged',
    examCorrect:     'Correct',
    examIncorrect:   'Incorrect',

    // Admin
    adminPending:    'Pending review',
    adminApprove:    'Approve',
    adminReject:     'Reject',
    adminApproveAll: 'Approve all',
    adminRejectSel:  'Reject selected',
    adminBank:       'Approved bank',
    adminUsers:      'Users',

    // Errors
    errorGeneric:    'Something went wrong. Please try again.',
    errorOffline:    'No internet connection.',
    errorApi:        'API error. Please try again.',

    // Empty states
    emptyPending:    'No cases pending review.',
    emptyBank:       'No questions in the bank.',
    emptyResults:    'No results.',
  },
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('enarm_lang') || 'ES')

  const toggleLang = () => {
    const next = lang === 'ES' ? 'EN' : 'ES'
    setLang(next)
    localStorage.setItem('enarm_lang', next)
  }

  const t = (key) => translations[lang][key] ?? key

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
