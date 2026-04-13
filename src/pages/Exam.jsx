import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  FileText, Trophy, CheckCircle, X, Flag, AlertTriangle,
  Loader2, ChevronRight, Menu, Clock, BarChart2,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const ENARM_SPECIALTIES = [
  'Medicina Interna',
  'Pediatría',
  'Ginecología y Obstetricia',
  'Cirugía General',
  'Medicina Familiar',
  'Urgencias',
  'Salud Pública',
]

const Q_COUNTS = [10, 20, 40, 80]
const PER_QUESTION_SECS = 90
const SIMULACRO_Q_COUNT = 80

// Fisher-Yates shuffle
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Exam() {
  const { lang } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Phase: 'config' | 'loading' | 'exam' | 'summary' | 'saving' ────────────
  const [phase, setPhase] = useState('config')

  // ── Config ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState('standard')        // 'standard' | 'simulacro'
  const [questionCount, setQuestionCount] = useState(20)
  const [specialties, setSpecialties] = useState([])  // empty = all
  const [difficulty, setDifficulty] = useState('mixto') // 'facil'|'moderado'|'dificil'|'mixto'
  const [source, setSource] = useState('both')        // 'mine'|'community'|'both'
  const [timerMode, setTimerMode] = useState('per_question') // 'per_question'|'total'
  const [showTimer, setShowTimer] = useState(true)

  // ── Loading ──────────────────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState(null)
  const [availableWarning, setAvailableWarning] = useState(null)

  // ── Questions ────────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState([])

  // ── Exam state ───────────────────────────────────────────────────────────────
  const [currentIdx, setCurrentIdx] = useState(0)
  // answers: {[qId]: {selectedIndex, isCorrect, timedOut}}
  const [answers, setAnswers] = useState({})
  // flagged: Set of question IDs
  const [flagged, setFlagged] = useState(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  // ── Timer ────────────────────────────────────────────────────────────────────
  // For per_question: timeLeft resets to PER_QUESTION_SECS each question
  // For total: timeLeft counts down from total budget
  const [timeLeft, setTimeLeft] = useState(PER_QUESTION_SECS)
  const timerRef = useRef(null)
  const autoAdvancePending = useRef(false)

  // ── Summary modal ────────────────────────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(false)

  // ── Toast ────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Simulacro locks some config ───────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'simulacro') {
      setQuestionCount(SIMULACRO_Q_COUNT)
      setTimerMode('per_question')
    }
  }, [mode])

  // ── LOAD QUESTIONS ────────────────────────────────────────────────────────────

  const handleStartExam = async () => {
    setLoadError(null)
    setAvailableWarning(null)
    setPhase('loading')

    try {
      let query = supabase
        .from('question_bank')
        .select('id, vignette, question, options, correct_index, explanation, source, specialty, area_enarm, difficulty, created_by')
        .eq('approved', true)

      // Source filter
      if (source === 'mine') {
        query = query.eq('created_by', user.id)
      } else if (source === 'community') {
        query = query.neq('created_by', user.id)
      }

      // Specialty filter
      if (specialties.length > 0) {
        query = query.in('specialty', specialties)
      }

      // Difficulty filter
      if (difficulty !== 'mixto') {
        const diffMap = { facil: 1, moderado: 2, dificil: 3 }
        query = query.eq('difficulty', diffMap[difficulty])
      }

      const { data, error } = await query
      if (error) throw error

      const pool = data ?? []
      if (pool.length === 0) {
        throw new Error(
          lang === 'ES'
            ? 'No hay preguntas disponibles con los filtros seleccionados.'
            : 'No questions available with the selected filters.'
        )
      }

      const target = mode === 'simulacro' ? SIMULACRO_Q_COUNT : questionCount
      const shuffled = shuffleArray(pool)

      if (shuffled.length < target) {
        setAvailableWarning(
          lang === 'ES'
            ? `Solo ${shuffled.length} preguntas disponibles`
            : `Only ${shuffled.length} questions available`
        )
      }

      const selected = shuffled.slice(0, target)

      setQuestions(selected)
      setCurrentIdx(0)
      setAnswers({})
      setFlagged(new Set())
      setShowFeedback(false)
      setSidebarOpen(false)

      // Initialize timer
      const totalSecs = mode === 'simulacro' || timerMode === 'per_question'
        ? PER_QUESTION_SECS
        : target * PER_QUESTION_SECS
      setTimeLeft(totalSecs)

      setPhase('exam')
    } catch (err) {
      setLoadError(err.message)
      setPhase('config')
    }
  }

  // ── TIMER EFFECT ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'exam') {
      clearInterval(timerRef.current)
      return
    }

    autoAdvancePending.current = false
    clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (!autoAdvancePending.current) {
            autoAdvancePending.current = true
            // schedule outside of setState
            setTimeout(() => handleTimerExpire(), 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIdx])

  // Reset per-question timer when question changes
  useEffect(() => {
    if (phase !== 'exam') return
    if (timerMode === 'per_question' || mode === 'simulacro') {
      setTimeLeft(PER_QUESTION_SECS)
    }
    // For total timer, we don't reset — the effect above re-starts the interval
    // but timeLeft isn't reset, so the countdown continues from where it was.
  }, [currentIdx, phase, timerMode, mode])

  const handleOpenSummary = useCallback(() => {
    clearInterval(timerRef.current)
    setSummaryOpen(true)
  }, [])

  const handleTimerExpire = useCallback(() => {
    if (timerMode === 'total' && mode !== 'simulacro') {
      // Total time ran out: auto-submit
      handleOpenSummary()
      return
    }
    // Per-question: mark as timed out and advance
    setQuestions(prev => {
      const q = prev[currentIdx] // read via closure
      if (q) {
        setAnswers(ans => ({
          ...ans,
          [q.id]: { selectedIndex: null, isCorrect: false, timedOut: true },
        }))
      }
      return prev
    })
    setCurrentIdx(prev => {
      if (prev < questions.length - 1) return prev + 1
      // Last question timed out → open summary
      setTimeout(() => handleOpenSummary(), 100)
      return prev
    })
  }, [currentIdx, questions, timerMode, mode, handleOpenSummary])

  // ── ANSWER HANDLER ────────────────────────────────────────────────────────────

  const handleSelectAnswer = useCallback((optIdx) => {
    const q = questions[currentIdx]
    if (!q) return
    if (answers[q.id] && mode === 'simulacro') return // simulacro: can change answer
    if (answers[q.id] && mode === 'standard') return  // standard: locked after feedback

    const isCorrect = optIdx === q.correct_index
    setAnswers(prev => ({
      ...prev,
      [q.id]: { selectedIndex: optIdx, isCorrect, timedOut: false },
    }))

    if (mode === 'standard') {
      setShowFeedback(true)
    }
  }, [questions, currentIdx, answers, mode])

  const handleNext = useCallback(() => {
    setShowFeedback(false)
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1)
    } else {
      handleOpenSummary()
    }
  }, [currentIdx, questions.length, handleOpenSummary])

  const handleJumpTo = (idx) => {
    if (mode === 'standard') setShowFeedback(false)
    setCurrentIdx(idx)
    setSidebarOpen(false)
  }

  const toggleFlag = () => {
    const q = questions[currentIdx]
    if (!q) return
    setFlagged(prev => {
      const next = new Set(prev)
      next.has(q.id) ? next.delete(q.id) : next.add(q.id)
      return next
    })
  }

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
  // 1-5: select option, Enter/N: next question (in exam phase)
  useEffect(() => {
    if (phase !== 'exam') return
    const handleKey = (e) => {
      // Ignore when focus is inside a text input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

      const digit = parseInt(e.key, 10)
      if (digit >= 1 && digit <= 5) {
        handleSelectAnswer(digit - 1)
      } else if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
        handleNext()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [phase, handleSelectAnswer, handleNext])

  // ── SUMMARY & SUBMIT ──────────────────────────────────────────────────────────

  const answeredCount = Object.keys(answers).length
  const unansweredCount = questions.length - answeredCount
  const flaggedCount = flagged.size

  const handleSubmit = async () => {
    setSummaryOpen(false)
    setPhase('saving')

    try {
      const correctCount = Object.values(answers).filter(a => a.isCorrect).length

      const { data: session, error: sErr } = await supabase
        .from('exam_sessions')
        .insert({
          user_id: user.id,
          mode: mode === 'simulacro' ? 'simulacro' : 'standard',
          total_questions: questions.length,
          correct_answers: correctCount,
          completed: true,
          topic: null,
        })
        .select('id')
        .single()
      if (sErr) throw sErr

      const aRows = questions
        .map(q => {
          const a = answers[q.id]
          return {
            session_id: session.id,
            question_id: q.id,
            selected_index: a?.selectedIndex ?? null,
            is_correct: a?.isCorrect ?? false,
          }
        })

      if (aRows.length > 0) {
        const { error: aErr } = await supabase.from('exam_answers').insert(aRows)
        if (aErr) throw aErr
      }

      navigate(`/results?session=${session.id}`)
    } catch (err) {
      showToast(err.message, 'error')
      setPhase('exam')
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────────

  const currentQ = questions[currentIdx]
  const currentAnswer = currentQ ? answers[currentQ.id] : null
  const isCurrentFlagged = currentQ ? flagged.has(currentQ.id) : false
  const progress = questions.length > 0 ? (currentIdx + 1) / questions.length : 0
  const isTimerRed = timeLeft <= 15 && timeLeft > 0

  // Progress bar color: blue at 0%, green at 100%
  const progressColor = progress < 0.5
    ? '#3b82f6'
    : progress < 0.8
    ? '#06b6d4'
    : '#22c55e'

  const effectiveTimerMode = mode === 'simulacro' ? 'per_question' : timerMode

  // ── RENDER ─────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title={lang === 'ES' ? 'Simulador de Examen' : 'Exam Simulator'}>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PHASE: CONFIG                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'config' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="font-heading font-bold text-2xl text-white">
              {lang === 'ES' ? 'Configurar Examen' : 'Configure Exam'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {lang === 'ES'
                ? 'Personaliza tu sesión de práctica tipo ENARM.'
                : 'Customize your ENARM-style practice session.'}
            </p>
          </div>

          {/* ── 1. Mode selector ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {lang === 'ES' ? '1. Modo de examen' : '1. Exam mode'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  key: 'standard',
                  icon: FileText,
                  emoji: '📝',
                  label: lang === 'ES' ? 'Examen Estándar' : 'Standard Exam',
                  desc: lang === 'ES'
                    ? 'Configurable, con retroalimentación inmediata'
                    : 'Configurable, instant feedback per question',
                },
                {
                  key: 'simulacro',
                  icon: Trophy,
                  emoji: '🏆',
                  label: 'Simulacro ENARM',
                  desc: lang === 'ES'
                    ? '80 preguntas, condiciones reales, sin retroalimentación'
                    : '80 questions, strict conditions, no feedback during exam',
                },
              ].map(({ key, emoji, label, desc }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`flex flex-col items-start gap-2 p-5 rounded-2xl border text-left transition-all ${
                    mode === key
                      ? key === 'standard'
                        ? 'border-accent-blue/50 bg-accent-blue/10'
                        : 'border-warning/50 bg-warning/10'
                      : 'border-gray-700 hover:border-gray-600 bg-surface'
                  }`}
                >
                  <span className="text-2xl">{emoji}</span>
                  <span className={`font-heading font-bold text-base ${
                    mode === key
                      ? key === 'standard' ? 'text-accent-blue' : 'text-warning'
                      : 'text-white'
                  }`}>
                    {label}
                  </span>
                  <span className="text-xs text-gray-500 leading-relaxed">{desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 2. Question count ── */}
          {mode === 'standard' && (
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? '2. Número de preguntas' : '2. Number of questions'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {Q_COUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    className={`px-5 py-2 rounded-xl font-heading font-semibold text-sm border transition-colors ${
                      questionCount === n
                        ? 'bg-accent-blue text-white border-accent-blue'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── 3. Specialties ── */}
          <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {lang === 'ES' ? `${mode === 'standard' ? '3' : '2'}. Especialidades (vacío = todas)` : `${mode === 'standard' ? '3' : '2'}. Specialties (empty = all)`}
            </h3>
            <div className="flex flex-wrap gap-2">
              {ENARM_SPECIALTIES.map(sp => {
                const active = specialties.includes(sp)
                return (
                  <button
                    key={sp}
                    onClick={() =>
                      setSpecialties(prev =>
                        active ? prev.filter(s => s !== sp) : [...prev, sp]
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-accent-cyan/20 border-accent-cyan/50 text-accent-cyan'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {sp}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── 4. Difficulty + Source ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Dificultad' : 'Difficulty'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'facil', label: lang === 'ES' ? 'Fácil' : 'Easy' },
                  { key: 'moderado', label: lang === 'ES' ? 'Moderado' : 'Moderate' },
                  { key: 'dificil', label: lang === 'ES' ? 'Difícil' : 'Hard' },
                  { key: 'mixto', label: lang === 'ES' ? 'Mixto' : 'Mixed' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDifficulty(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      difficulty === key
                        ? 'bg-warning/20 border-warning/40 text-warning'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Fuente' : 'Source'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'mine', label: lang === 'ES' ? 'Mis preguntas' : 'My questions' },
                  { key: 'community', label: lang === 'ES' ? 'Banco comunitario' : 'Community bank' },
                  { key: 'both', label: lang === 'ES' ? 'Ambos' : 'Both' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSource(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      source === key
                        ? 'bg-success/20 border-success/40 text-success'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* ── 5. Timer options (standard only) ── */}
          {mode === 'standard' && (
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Cronómetro' : 'Timer'}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTimerMode('per_question')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${
                    timerMode === 'per_question'
                      ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <Clock size={14} />
                  {lang === 'ES' ? '90 seg por pregunta' : '90 sec per question'}
                </button>
                <button
                  onClick={() => setTimerMode('total')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${
                    timerMode === 'total'
                      ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <Clock size={14} />
                  {lang === 'ES' ? `Tiempo total (${Math.round(questionCount * PER_QUESTION_SECS / 60)} min)` : `Total time (${Math.round(questionCount * PER_QUESTION_SECS / 60)} min)`}
                </button>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className={`relative w-10 h-5 rounded-full transition-colors ${showTimer ? 'bg-accent-blue' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showTimer ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
                <span className="text-sm text-gray-300">
                  {lang === 'ES' ? 'Mostrar cronómetro' : 'Show timer'}
                </span>
                <input type="checkbox" className="sr-only" checked={showTimer} onChange={e => setShowTimer(e.target.checked)} />
              </label>
            </section>
          )}

          {/* ── Error ── */}
          {loadError && (
            <div className="flex items-start gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3 text-sm text-error">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {/* ── Start button ── */}
          <button
            onClick={handleStartExam}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-accent-blue to-accent-cyan hover:opacity-90 text-white font-heading font-semibold rounded-2xl transition-opacity"
          >
            <ChevronRight size={18} />
            {lang === 'ES' ? 'Iniciar examen' : 'Start exam'}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PHASE: LOADING                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 size={36} className="animate-spin text-accent-blue" />
          <p className="text-white font-medium animate-pulse">
            {lang === 'ES' ? 'Cargando preguntas...' : 'Loading questions...'}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PHASE: SAVING                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'saving' && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 size={36} className="animate-spin text-success" />
          <p className="text-white font-medium animate-pulse">
            {lang === 'ES' ? 'Guardando resultados...' : 'Saving results...'}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PHASE: EXAM                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'exam' && currentQ && (
        <div className="max-w-5xl mx-auto">

          {/* Available warning */}
          {availableWarning && (
            <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl px-4 py-2.5 text-sm text-warning mb-4">
              <AlertTriangle size={14} />
              {availableWarning}
            </div>
          )}

          <div className="flex gap-4">
            {/* ── Main column ── */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Top bar */}
              <div className="bg-surface border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {lang === 'ES'
                      ? `Pregunta ${currentIdx + 1} de ${questions.length}`
                      : `Question ${currentIdx + 1} of ${questions.length}`}
                  </span>
                  <div className="flex items-center gap-3">
                    {/* Timer */}
                    {(showTimer || mode === 'simulacro') && (
                      <span className={`flex items-center gap-1.5 text-sm font-mono font-semibold ${
                        isTimerRed ? 'text-error animate-pulse' : 'text-gray-400'
                      }`}>
                        <Clock size={14} />
                        {formatTime(timeLeft)}
                      </span>
                    )}
                    {/* Flag button */}
                    <button
                      onClick={toggleFlag}
                      title={lang === 'ES' ? 'Marcar para revisar' : 'Flag for review'}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        isCurrentFlagged
                          ? 'bg-warning/20 border-warning/40 text-warning'
                          : 'border-gray-700 text-gray-400 hover:border-warning/40 hover:text-warning'
                      }`}
                    >
                      <Flag size={12} />
                      {isCurrentFlagged
                        ? (lang === 'ES' ? 'Marcada' : 'Flagged')
                        : (lang === 'ES' ? 'Marcar' : 'Flag')}
                    </button>
                    {/* Mobile sidebar toggle */}
                    <button
                      className="lg:hidden p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white"
                      onClick={() => setSidebarOpen(o => !o)}
                    >
                      <Menu size={16} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${progress * 100}%`,
                      backgroundColor: progressColor,
                    }}
                  />
                </div>
              </div>

              {/* Question card */}
              <div className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
                {/* Vignette */}
                {currentQ.vignette && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      {lang === 'ES' ? 'Caso clínico' : 'Clinical case'}
                    </p>
                    <p className="text-gray-200 text-sm leading-relaxed">{currentQ.vignette}</p>
                  </div>
                )}

                {/* Question */}
                <p className="text-white font-medium text-sm">{currentQ.question}</p>

                {/* Options */}
                <div className="space-y-2">
                  {(currentQ.options ?? []).map((opt, i) => {
                    let style = 'border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-white/5'

                    if (showFeedback && mode === 'standard') {
                      if (i === currentQ.correct_index) {
                        style = 'border-success/40 bg-success/15 text-success'
                      } else if (i === currentAnswer?.selectedIndex) {
                        style = 'border-error/40 bg-error/15 text-error'
                      } else {
                        style = 'border-gray-800 text-gray-500 opacity-40'
                      }
                    } else if (currentAnswer?.selectedIndex === i) {
                      // Simulacro: show selected but no correct/wrong
                      style = mode === 'simulacro'
                        ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                        : 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                    }

                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectAnswer(i)}
                        disabled={
                          (mode === 'standard' && !!currentAnswer) ||
                          (mode === 'simulacro' && false) // simulacro allows changing before next
                        }
                        className={`w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${style}`}
                      >
                        {showFeedback && mode === 'standard' && i === currentQ.correct_index && (
                          <CheckCircle size={14} className="shrink-0 mt-0.5" />
                        )}
                        {showFeedback && mode === 'standard' && i === currentAnswer?.selectedIndex && i !== currentQ.correct_index && (
                          <X size={14} className="shrink-0 mt-0.5" />
                        )}
                        <span>{opt}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Explanation (standard mode only, after answer) */}
                {showFeedback && mode === 'standard' && currentQ.explanation && (
                  <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1.5">
                      {lang === 'ES' ? 'Explicación' : 'Explanation'}
                    </p>
                    <p className="text-gray-300 text-sm leading-relaxed">{currentQ.explanation}</p>
                    {currentQ.source && (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-medium">{lang === 'ES' ? 'Fuente:' : 'Source:'}</span>{' '}
                        {currentQ.source}
                      </p>
                    )}
                  </div>
                )}

                {/* Navigation buttons */}
                <div className="flex gap-2 pt-1 border-t border-gray-800">
                  {/* Standard: must confirm then advance */}
                  {mode === 'standard' && !showFeedback && currentAnswer && (
                    <button
                      onClick={() => setShowFeedback(true)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
                    >
                      {lang === 'ES' ? 'Confirmar respuesta' : 'Confirm answer'}
                    </button>
                  )}
                  {mode === 'standard' && showFeedback && (
                    <button
                      onClick={handleNext}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
                    >
                      {currentIdx < questions.length - 1
                        ? (lang === 'ES' ? 'Siguiente' : 'Next')
                        : (lang === 'ES' ? 'Finalizar' : 'Finish')}
                      <ChevronRight size={14} />
                    </button>
                  )}

                  {/* Simulacro: can always advance (optionally unanswered) */}
                  {mode === 'simulacro' && (
                    <button
                      onClick={handleNext}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
                    >
                      {currentIdx < questions.length - 1
                        ? (lang === 'ES' ? 'Siguiente' : 'Next')
                        : (lang === 'ES' ? 'Terminar examen' : 'End exam')}
                      <ChevronRight size={14} />
                    </button>
                  )}

                  {/* Finish exam button always available in simulacro */}
                  {mode === 'simulacro' && currentIdx < questions.length - 1 && (
                    <button
                      onClick={handleOpenSummary}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-700 hover:border-error/40 text-gray-400 hover:text-error rounded-xl text-sm transition-colors"
                    >
                      <BarChart2 size={14} />
                      {lang === 'ES' ? 'Terminar' : 'End'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Sidebar: question grid (desktop) ── */}
            <div className="hidden lg:flex flex-col w-56 shrink-0">
              <div className="bg-surface border border-gray-800 rounded-2xl p-4 sticky top-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {lang === 'ES' ? 'Navegación' : 'Navigation'}
                </p>
                <div className="grid grid-cols-5 gap-1.5 mb-4">
                  {questions.map((q, i) => {
                    const ans = answers[q.id]
                    const isFlagged = flagged.has(q.id)
                    let bg = 'bg-gray-800 text-gray-500'
                    if (i === currentIdx) bg = 'bg-accent-blue text-white'
                    else if (isFlagged) bg = 'bg-warning/30 text-warning'
                    else if (ans) bg = 'bg-accent-cyan/20 text-accent-cyan'
                    return (
                      <button
                        key={q.id}
                        onClick={() => handleJumpTo(i)}
                        className={`w-full aspect-square rounded-lg text-xs font-medium transition-colors ${bg}`}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-gray-800 inline-block" />
                    {lang === 'ES' ? 'Sin responder' : 'Unanswered'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-accent-cyan/20 inline-block" />
                    {lang === 'ES' ? 'Respondida' : 'Answered'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-warning/30 inline-block" />
                    {lang === 'ES' ? 'Marcada' : 'Flagged'}
                  </div>
                </div>
                <button
                  onClick={handleOpenSummary}
                  className="mt-4 w-full py-2 bg-error/10 hover:bg-error/20 text-error text-xs font-medium rounded-xl border border-error/20 transition-colors"
                >
                  {lang === 'ES' ? 'Terminar examen' : 'End exam'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile sidebar overlay ── */}
      {phase === 'exam' && sidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative bg-surface border-l border-gray-800 w-64 h-full p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Navegación' : 'Navigation'}
              </p>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {questions.map((q, i) => {
                const ans = answers[q.id]
                const isFlagged = flagged.has(q.id)
                let bg = 'bg-gray-800 text-gray-500'
                if (i === currentIdx) bg = 'bg-accent-blue text-white'
                else if (isFlagged) bg = 'bg-warning/30 text-warning'
                else if (ans) bg = 'bg-accent-cyan/20 text-accent-cyan'
                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpTo(i)}
                    className={`w-full aspect-square rounded-lg text-xs font-medium ${bg}`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => { setSidebarOpen(false); handleOpenSummary() }}
              className="w-full py-2 bg-error/10 hover:bg-error/20 text-error text-xs font-medium rounded-xl border border-error/20"
            >
              {lang === 'ES' ? 'Terminar examen' : 'End exam'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUMMARY MODAL                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {summaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-surface border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5">
            <h3 className="font-heading font-bold text-xl text-white">
              {lang === 'ES' ? '¿Terminar el examen?' : 'End the exam?'}
            </h3>
            <div className="space-y-2">
              {[
                {
                  label: lang === 'ES' ? 'Respondidas' : 'Answered',
                  value: answeredCount,
                  color: 'text-success',
                },
                {
                  label: lang === 'ES' ? 'Sin responder' : 'Unanswered',
                  value: unansweredCount,
                  color: 'text-gray-400',
                },
                {
                  label: lang === 'ES' ? 'Marcadas para revisar' : 'Flagged for review',
                  value: flaggedCount,
                  color: 'text-warning',
                },
                {
                  label: lang === 'ES' ? 'Total' : 'Total',
                  value: questions.length,
                  color: 'text-white',
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between text-sm bg-background rounded-lg px-4 py-2">
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSummaryOpen(false)}
                className="flex-1 py-2.5 border border-gray-700 text-gray-300 hover:text-white rounded-xl text-sm font-medium"
              >
                {lang === 'ES' ? 'Continuar examen' : 'Continue exam'}
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-semibold rounded-xl text-sm hover:opacity-90"
              >
                {lang === 'ES' ? 'Confirmar y enviar' : 'Confirm & submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur ${
          toast.type === 'error'
            ? 'bg-error/20 border-error/30 text-error'
            : 'bg-success/20 border-success/30 text-success'
        }`}>
          {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </AppLayout>
  )
}
