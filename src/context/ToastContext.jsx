import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const DURATIONS = { success: 3000, error: 5000, info: 3000, warning: 4000 }

const STYLES = {
  success: 'bg-success/10 border-success/30 text-success',
  error:   'bg-error/10   border-error/30   text-error',
  info:    'bg-accent-blue/10 border-accent-blue/30 text-accent-blue',
  warning: 'bg-warning/10 border-warning/30 text-warning',
}

const ICONS = {
  success: CheckCircle,
  error:   AlertTriangle,
  info:    Info,
  warning: AlertTriangle,
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, type = 'info') => {
    const id = ++_id
    const duration = DURATIONS[type] ?? 3000
    setToasts(prev => [...prev, { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const toastSuccess = useCallback((msg) => toast(msg, 'success'), [toast])
  const toastError   = useCallback((msg) => toast(msg, 'error'),   [toast])
  const toastInfo    = useCallback((msg) => toast(msg, 'info'),    [toast])
  const toastWarning = useCallback((msg) => toast(msg, 'warning'), [toast])

  return (
    <ToastContext.Provider value={{ toast, toastSuccess, toastError, toastInfo, toastWarning }}>
      {children}

      {/* Toast stack – top-right */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map(({ id, message, type }) => {
          const Icon = ICONS[type]
          return (
            <div
              key={id}
              className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg pointer-events-auto animate-[fadeInDown_0.2s_ease] ${STYLES[type]}`}
            >
              <Icon size={16} className="shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{message}</span>
              <button
                onClick={() => dismiss(id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
