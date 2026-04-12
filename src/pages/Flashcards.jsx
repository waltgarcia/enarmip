import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import confetti from 'canvas-confetti'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { generateMicroLesson } from '../lib/claude'
import {
  CreditCard, RotateCcw, Check, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, BookOpen, Zap, Brain,
  Layers, Filter, Trophy,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_MASTERED = 'enarm_flashcard_mastered'
const STORAGE_MODE     = 'enarm_flashcard_mode'
const SWIPE_THRESHOLD  = 55 // px

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DifficultyDots({ d }) {
  const n = typeof d === 'number' ? Math.min(Math.max(d, 0), 3) : 0
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full ${i <= n ? 'bg-warning' : 'bg-gray-700'}`} />
      ))}
    </span>
  )
}

function loadMastered() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_MASTERED) ?? '[]')) }
  catch { return new Set() }
}
function saveMastered(set) {
  localStorage.setItem(STORAGE_MASTERED, JSON.stringify([...set]))
}

function fireConfetti() {
  confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: ['#3b82f6', '#06b6d4', '#22c55e'] })
  setTimeout(() => confetti({ particleCount: 60, angle: 60,  spread: 70, origin: { x: 0 } }), 300)
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1 } }), 600)
}

// ─── 3-D Flip Card ────────────────────────────────────────────────────────────

function FlashCard({ card, isFlipped, onFlip, onMicroLesson, microLesson, microLessonLoading, lang }) {
  const stopProp = e => e.stopPropagation()

  return (
    <div
      className="w-full max-w-2xl mx-auto select-none"
      style={{ perspective: '1200px', minHeight: 440 }}
      onClick={onFlip}
      role="button"
      aria-label={isFlipped ? (lang === 'ES' ? 'Flip a frente' : 'Flip to front') : (lang === 'ES' ? 'Revelar respuesta' : 'Reveal answer')}
    >
      <div
        className="relative w-full"
        style={{
          minHeight: 440,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ── FRONT ── */}
        <div
          className="absolute inset-0 bg-surface border border-gray-700 rounded-2xl p-6 flex flex-col overflow-y-auto"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between mb-4">
            {card.specialty && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
                {card.specialty}
              </span>
            )}
            <DifficultyDots d={card.difficulty} />
          </div>

          {card.vignette && (
            <p className="text-gray-300 text-sm leading-relaxed mb-4 flex-1">
              {card.vignette}
            </p>
          )}

          <p className="text-white font-semibold text-base leading-snug mb-6">
            {card.question}
          </p>

          <div className="mt-auto text-center">
            <span className="inline-flex items-center gap-1.5 text-gray-600 text-xs">
              <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[10px]">↕</span>
              {lang === 'ES' ? 'Toca para ver la respuesta' : 'Tap to reveal answer'}
            </span>
          </div>
        </div>

        {/* ── BACK ── */}
        <div
          className="absolute inset-0 bg-surface border border-gray-700 rounded-2xl p-6 flex flex-col overflow-y-auto"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          onClick={stopProp}
        >
          {/* Options */}
          <div className="space-y-2 mb-4">
            {(card.options ?? []).map((opt, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-sm ${
                  i === card.correct_index
                    ? 'border-success/30 bg-success/10 text-success font-medium'
                    : 'border-gray-800 text-gray-500'
                }`}
              >
                {i === card.correct_index && <Check size={14} className="shrink-0 mt-0.5" />}
                <span>{opt}</span>
              </div>
            ))}
          </div>

          {card.explanation && (
            <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-3 py-2.5 mb-3">
              <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1">
                {lang === 'ES' ? 'Explicación' : 'Explanation'}
              </p>
              <p className="text-gray-300 text-xs leading-relaxed">{card.explanation}</p>
            </div>
          )}

          {card.conflict_note && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl px-3 py-2.5 mb-3">
              <p className="text-xs text-warning leading-relaxed">⚠️ {card.conflict_note}</p>
            </div>
          )}

          {card.source && (
            <p className="text-xs text-gray-600 mb-3">
              <span className="font-medium text-gray-500">{lang === 'ES' ? 'Fuente:' : 'Source:'}</span>{' '}
              {card.source}
            </p>
          )}

          {/* AI micro-lesson */}
          <div className="mt-auto">
            <button
              className="flex items-center gap-2 text-xs font-medium text-accent-cyan hover:text-white transition-colors py-1 disabled:opacity-50"
              onClick={onMicroLesson}
              disabled={microLessonLoading || !!microLesson}
            >
              {microLessonLoading
                ? <Loader2 size={14} className="animate-spin" />
                : <span>💡</span>}
              {lang === 'ES' ? 'Explicación profunda (IA)' : 'Deep explanation (AI)'}
            </button>

            {microLesson && (
              <div
                className="mt-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl px-3 py-2.5 text-xs text-gray-300 leading-relaxed"
                style={{ animation: 'fadeInDown 0.3s ease' }}
              >
                {microLesson}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ questions, filters, setFilters, lang }) {
  const specialties = useMemo(() => [...new Set(questions.map(q => q.specialty).filter(Boolean))].sort(), [questions])
  const areas       = useMemo(() => [...new Set(questions.map(q => q.area_enarm).filter(Boolean))].sort(), [questions])
  const topics      = useMemo(() => [...new Set(questions.map(q => q.topic).filter(Boolean))].sort(), [questions])

  const sel = 'bg-surface border border-gray-700 rounded-xl text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-accent-blue'

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Filter size={14} className="text-gray-500 shrink-0" />

      <select className={sel} value={filters.specialty} onChange={e => setFilters(f => ({ ...f, specialty: e.target.value }))}>
        <option value="">{lang === 'ES' ? 'Especialidad' : 'Specialty'}</option>
        {specialties.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {areas.length > 0 && (
        <select className={sel} value={filters.area} onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}>
          <option value="">{lang === 'ES' ? 'Área ENARM' : 'ENARM Area'}</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      <select className={sel} value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}>
        <option value="">{lang === 'ES' ? 'Dificultad' : 'Difficulty'}</option>
        <option value="1">★</option>
        <option value="2">★★</option>
        <option value="3">★★★</option>
      </select>

      {topics.length > 0 && (
        <select className={sel} value={filters.topic} onChange={e => setFilters(f => ({ ...f, topic: e.target.value }))}>
          <option value="">{lang === 'ES' ? 'Tema' : 'Topic'}</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      {Object.values(filters).some(Boolean) && (
        <button
          className="text-xs text-gray-500 hover:text-error transition-colors"
          onClick={() => setFilters({ specialty: '', area: '', difficulty: '', topic: '' })}
        >
          {lang === 'ES' ? 'Limpiar' : 'Clear'}
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Flashcards() {
  const { lang } = useLang()
  const { user } = useAuth()

  // ── Raw data from Supabase ────────────────────────────────────────────────
  const [missedQuestions, setMissedQuestions] = useState([]) // from exam_answers
  const [allQuestions,    setAllQuestions]    = useState([]) // full bank
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError,   setDataError]   = useState(null)

  // ── Session state ─────────────────────────────────────────────────────────
  // phase: 'loading' | 'pick' | 'deck' | 'complete'
  const [phase, setPhase]             = useState('loading')
  const [deckMode, setDeckMode]       = useState('missed') // 'missed' | 'all'
  const [filters, setFilters]         = useState({ specialty: '', area: '', difficulty: '', topic: '' })
  const [deck, setDeck]               = useState([])
  const [currentIdx, setCurrentIdx]   = useState(0)
  const [masteredIds, setMasteredIds] = useState(loadMastered)
  const [isFlipped, setIsFlipped]     = useState(false)
  const [microLessons, setMicroLessons]       = useState({}) // { [questionId]: text }
  const [microLessonLoading, setMicroLessonLoading] = useState(null) // questionId | null

  // ── Swipe tracking ────────────────────────────────────────────────────────
  const touchStartX = useRef(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setDataLoading(true)
    setDataError(null)
    try {
      // 1. Load missed question IDs from exam_answers
      const { data: wrongAnswers, error: aErr } = await supabase
        .from('exam_answers')
        .select('question_id, selected_index')
        .eq('is_correct', false)
        .not('question_id', 'is', null)

      if (aErr) throw aErr

      // 2. Full approved question bank
      const { data: bank, error: bErr } = await supabase
        .from('question_bank')
        .select('id, vignette, question, options, correct_index, explanation, source, specialty, area_enarm, difficulty, topic, conflict_note')
        .eq('approved', true)
        .order('id')

      if (bErr) throw bErr

      const bankList = bank ?? []
      setAllQuestions(bankList)

      // Enrich missed questions with full question data
      const wrongMap = new Map()
      ;(wrongAnswers ?? []).forEach(a => {
        if (!wrongMap.has(a.question_id)) {
          wrongMap.set(a.question_id, a.selected_index)
        }
      })
      const missed = bankList.filter(q => wrongMap.has(q.id)).map(q => ({
        ...q,
        _wrongIndex: wrongMap.get(q.id),
      }))
      setMissedQuestions(missed)
    } catch (err) {
      setDataError(err.message)
    } finally {
      setDataLoading(false)
      setPhase('pick')
    }
  }

  // ── Filtered questions ─────────────────────────────────────────────────────

  const sourceQuestions = deckMode === 'missed' ? missedQuestions : allQuestions

  const filteredQuestions = useMemo(() => {
    return sourceQuestions.filter(q => {
      if (filters.specialty && q.specialty !== filters.specialty) return false
      if (filters.area && q.area_enarm !== filters.area) return false
      if (filters.difficulty && String(q.difficulty) !== filters.difficulty) return false
      if (filters.topic && q.topic !== filters.topic) return false
      return true
    })
  }, [sourceQuestions, filters])

  // Pending (not yet mastered) cards
  const pendingCount = useMemo(
    () => filteredQuestions.filter(q => !masteredIds.has(String(q.id))).length,
    [filteredQuestions, masteredIds]
  )

  // ── Start / resume session ─────────────────────────────────────────────────

  const startSession = useCallback((resume) => {
    const cards = filteredQuestions.filter(q =>
      resume ? !masteredIds.has(String(q.id)) : true
    )
    if (cards.length === 0) return
    if (!resume) {
      // Clear mastery for these cards only (not cross-mode)
      const newMastered = new Set(masteredIds)
      cards.forEach(q => newMastered.delete(String(q.id)))
      setMasteredIds(newMastered)
      saveMastered(newMastered)
    }
    localStorage.setItem(STORAGE_MODE, deckMode)
    setDeck(cards)
    setCurrentIdx(0)
    setIsFlipped(false)
    setPhase('deck')
  }, [filteredQuestions, masteredIds, deckMode])

  // ── Navigation ─────────────────────────────────────────────────────────────

  const currentCard = deck[currentIdx] ?? null

  const advance = useCallback(() => {
    const next = currentIdx + 1
    if (next >= deck.length) {
      setPhase('complete')
      fireConfetti()
    } else {
      setCurrentIdx(next)
      setIsFlipped(false)
    }
  }, [currentIdx, deck])

  const markMastered = useCallback(() => {
    if (!currentCard) return
    const updated = new Set(masteredIds)
    updated.add(String(currentCard.id))
    setMasteredIds(updated)
    saveMastered(updated)
    advance()
  }, [currentCard, masteredIds, advance])

  const markReview = useCallback(() => {
    advance()
  }, [advance])

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'deck') return
    const handler = e => {
      if (e.key === 'ArrowRight') markMastered()
      if (e.key === 'ArrowLeft')  markReview()
      if (e.key === ' ' || e.key === 'Enter') setIsFlipped(f => !f)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, markMastered, markReview])

  // ── Touch / swipe ──────────────────────────────────────────────────────────

  const handleTouchStart = e => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = e => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (delta >  SWIPE_THRESHOLD) markMastered()
    if (delta < -SWIPE_THRESHOLD) markReview()
  }

  // ── AI micro-lesson ────────────────────────────────────────────────────────

  const handleMicroLesson = useCallback(async () => {
    if (!currentCard) return
    const id = String(currentCard.id)
    if (microLessons[id] || microLessonLoading === id) return
    setMicroLessonLoading(id)
    try {
      const correctOpt = currentCard.options?.[currentCard.correct_index] ?? ''
      const wrongOpt   = currentCard._wrongIndex != null
        ? (currentCard.options?.[currentCard._wrongIndex] ?? null)
        : null
      const text = await generateMicroLesson({
        question:      currentCard.question,
        correctAnswer: correctOpt,
        wrongAnswer:   wrongOpt,
        lang,
      })
      setMicroLessons(prev => ({ ...prev, [id]: text }))
    } catch (err) {
      setMicroLessons(prev => ({ ...prev, [id]: `⚠️ ${err.message}` }))
    } finally {
      setMicroLessonLoading(null)
    }
  }, [currentCard, microLessons, microLessonLoading, lang])

  // ── Mastered / total counts for progress bar ───────────────────────────────

  const masteredInDeck = deck.filter(q => masteredIds.has(String(q.id))).length
  const progressPct    = deck.length > 0 ? Math.round(masteredInDeck / deck.length * 100) : 0

  // ─── RENDER ────────────────────────────────────────────────────────────────

  // Loading
  if (dataLoading) {
    return (
      <AppLayout title={lang === 'ES' ? 'Flashcards' : 'Flashcards'}>
        <div className="flex items-center justify-center min-h-[50vh] gap-3">
          <Loader2 size={28} className="animate-spin text-accent-blue" />
        </div>
      </AppLayout>
    )
  }

  // Error
  if (dataError) {
    return (
      <AppLayout title="Flashcards">
        <div className="max-w-lg mx-auto text-center py-12 space-y-4">
          <AlertTriangle size={36} className="text-error mx-auto" />
          <p className="text-error text-sm">{dataError}</p>
          <button onClick={loadData} className="text-accent-blue text-sm hover:underline">
            {lang === 'ES' ? 'Reintentar' : 'Retry'}
          </button>
        </div>
      </AppLayout>
    )
  }

  // ── COMPLETE SCREEN ──────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <AppLayout title="Flashcards">
        <div className="max-w-xl mx-auto text-center py-16 space-y-5">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <Trophy size={36} className="text-success" />
          </div>
          <h2 className="font-heading font-bold text-2xl text-white">
            {lang === 'ES' ? '¡Todas las tarjetas dominadas!' : 'All cards mastered!'}
          </h2>
          <p className="text-gray-400 text-sm">
            {lang === 'ES'
              ? `Completaste ${deck.length} tarjetas en esta sesión.`
              : `You completed ${deck.length} cards this session.`}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => { setPhase('pick'); setMicroLessons({}) }}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
            >
              <RotateCcw size={14} />
              {lang === 'ES' ? 'Nueva sesión' : 'New session'}
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── PICK SCREEN ───────────────────────────────────────────────────────────
  if (phase === 'pick') {
    // Empty state if no cards exist at all
    if (allQuestions.length === 0) {
      return (
        <AppLayout title="Flashcards">
          <div className="max-w-xl mx-auto text-center py-20 space-y-5">
            <div className="w-20 h-20 bg-accent-cyan/10 rounded-full flex items-center justify-center mx-auto">
              <CreditCard size={36} className="text-accent-cyan" />
            </div>
            <h2 className="font-heading font-bold text-xl text-white">
              {lang === 'ES' ? 'Aún no tienes simulacros. ¡Empieza tu primer examen!' : "No exams yet. Start your first exam!"}
            </h2>
            <a href="/exam" className="inline-flex items-center gap-2 px-6 py-3 bg-accent-blue hover:opacity-90 text-white font-semibold rounded-xl text-sm">
              {lang === 'ES' ? '¡Empieza tu primer examen!' : 'Start your first exam!'}
            </a>
          </div>
        </AppLayout>
      )
    }

    return (
      <AppLayout title="Flashcards">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h2 className="font-heading font-bold text-2xl text-white">Flashcards</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {lang === 'ES' ? 'Repasa y domina conceptos clave ENARM' : 'Review and master key ENARM concepts'}
            </p>
          </div>

          {/* Mode selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDeckMode('missed')}
              className={`flex flex-col items-start gap-2 p-4 rounded-2xl border transition-colors ${
                deckMode === 'missed'
                  ? 'border-accent-blue bg-accent-blue/10'
                  : 'border-gray-800 bg-surface hover:border-gray-700'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-error/10 flex items-center justify-center">
                <Zap size={18} className="text-error" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">
                  {lang === 'ES' ? 'Mis fallos' : 'My mistakes'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {missedQuestions.length} {lang === 'ES' ? 'preguntas falladas' : 'missed questions'}
                </p>
              </div>
            </button>

            <button
              onClick={() => setDeckMode('all')}
              className={`flex flex-col items-start gap-2 p-4 rounded-2xl border transition-colors ${
                deckMode === 'all'
                  ? 'border-accent-blue bg-accent-blue/10'
                  : 'border-gray-800 bg-surface hover:border-gray-700'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center">
                <Layers size={18} className="text-accent-cyan" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">
                  {lang === 'ES' ? 'Banco completo' : 'Full bank'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {allQuestions.length} {lang === 'ES' ? 'preguntas' : 'questions'}
                </p>
              </div>
            </button>
          </div>

          {/* Filters */}
          <div className="bg-surface border border-gray-800 rounded-2xl p-4 space-y-3">
            <FilterBar
              questions={sourceQuestions}
              filters={filters}
              setFilters={setFilters}
              lang={lang}
            />
            <p className="text-xs text-gray-500">
              <span className="text-white font-semibold">{filteredQuestions.length}</span>{' '}
              {lang === 'ES' ? 'tarjetas para repasar' : 'cards to review'}
            </p>
          </div>

          {/* Resume option */}
          {pendingCount > 0 && pendingCount < filteredQuestions.length && (
            <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">
                  {lang === 'ES' ? 'Sesión anterior guardada' : 'Previous session saved'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lang === 'ES'
                    ? `${pendingCount} tarjetas pendientes`
                    : `${pendingCount} cards remaining`}
                </p>
              </div>
              <button
                onClick={() => startSession(true)}
                className="px-4 py-2 bg-warning/10 border border-warning/20 text-warning text-sm font-medium rounded-xl hover:bg-warning/20 transition-colors shrink-0"
              >
                {lang === 'ES' ? 'Retomar sesión' : 'Resume session'}
              </button>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={() => startSession(false)}
            disabled={filteredQuestions.length === 0}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-accent-blue hover:opacity-90 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-opacity"
          >
            <Brain size={16} />
            {lang === 'ES'
              ? `Nueva sesión — ${filteredQuestions.length} tarjetas`
              : `New session — ${filteredQuestions.length} cards`}
          </button>
        </div>
      </AppLayout>
    )
  }

  // ── DECK SCREEN ───────────────────────────────────────────────────────────
  return (
    <AppLayout title="Flashcards">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {lang === 'ES'
                ? `${masteredInDeck} dominadas / ${deck.length} total`
                : `${masteredInDeck} mastered / ${deck.length} total`}
            </span>
            <span className="text-gray-500">
              {lang === 'ES' ? `#${currentIdx + 1}` : `#${currentIdx + 1}`}
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-success transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Card */}
        {currentCard && (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={() => setIsFlipped(f => !f)}
              onMicroLesson={handleMicroLesson}
              microLesson={microLessons[String(currentCard.id)] ?? null}
              microLessonLoading={microLessonLoading === String(currentCard.id)}
              lang={lang}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={markReview}
            className="flex items-center justify-center gap-2 py-3 bg-error/10 border border-error/20 text-error font-medium rounded-xl text-sm hover:bg-error/20 transition-colors"
          >
            <ChevronLeft size={16} />
            {lang === 'ES' ? 'Necesito repasar' : 'Need review'}
          </button>
          <button
            onClick={markMastered}
            className="flex items-center justify-center gap-2 py-3 bg-success/10 border border-success/20 text-success font-medium rounded-xl text-sm hover:bg-success/20 transition-colors"
          >
            {lang === 'ES' ? 'Lo domino' : 'Mastered'}
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-center text-xs text-gray-700">
          {lang === 'ES'
            ? '← Repasar · Espacio = voltear · → Dominado'
            : '← Review · Space = flip · → Mastered'}
        </p>

        {/* Back to pick */}
        <div className="text-center">
          <button
            onClick={() => setPhase('pick')}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {lang === 'ES' ? 'Salir de la sesión' : 'Exit session'}
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
