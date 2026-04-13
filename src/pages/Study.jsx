import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { generateStudySession } from '../lib/claude'
import {
  Target, Loader2, CheckCircle, X, AlertTriangle,
  ChevronRight, BarChart2, RefreshCw, Save,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_TOPICS = [
  'Diabetes tipo 2',
  'Hipertensión arterial',
  'Neumonía adquirida en comunidad',
  'Insuficiencia cardíaca',
  'Preeclampsia',
  'Apendicitis aguda',
  'EPOC',
  'Dengue',
  'Síndrome coronario agudo',
  'Hipotiroidismo',
]

// Mix ratios: ~55% standalone, ~45% chained (≈3 questions per case)
const MIXED_STANDALONE_RATIO = 0.55
const MIXED_CHAINED_QUESTIONS_PER_CASE = 3

const NARRATIVE_LABELS = {
  A: { ES: 'Evolución temporal', EN: 'Temporal evolution' },
  B: { ES: 'Perfiles distintos', EN: 'Distinct profiles' },
  C: { ES: 'Complicaciones', EN: 'Complications' },
}

const SYSTEM_PROMPT = `You are an ENARM expert tutor for Mexican medical residents.
Generate a mixed thematic study session on the given topic.

CHAINED CASE NARRATIVE TYPES (use a mix):
- Type A (temporal): same patient, time progresses, complications develop
- Type B (profiles): same diagnosis, different patients (age, sex, comorbidities)
- Type C (severity): mild → moderate → severe → critical presentations

Always apply Mexican GPC context: Cuadro Básico medications, IMSS/SSA settings,
Mexican epidemiology, first and second level of care.

Return ONLY valid JSON with this exact structure:
{
  "topic": "topic name",
  "study_plan": {
    "subtopics": ["subtopic1", ...],
    "learning_objectives": ["objective1", ...]
  },
  "standalone_questions": [{
    "id": "sq_1",
    "type": "standalone",
    "vignette": "...",
    "question": "...",
    "options": ["A)...","B)...","C)...","D)...","E)..."],
    "correct_index": 0,
    "explanation": "...",
    "subtopic": "...",
    "source": "...",
    "source_type": "gpc_pdf|library|conflict",
    "conflict_note": null
  }],
  "chained_cases": [{
    "case_id": "cc_1",
    "narrative_type": "A",
    "case_title": "Short title",
    "patient_intro": "2-sentence patient intro persistent across questions",
    "questions": [{
      "id": "cc_1_q1",
      "type": "chained",
      "case_id": "cc_1",
      "position": 1,
      "clinical_update": "What changed since last question",
      "question": "...",
      "options": ["A)...","B)...","C)...","D)...","E)..."],
      "correct_index": 0,
      "explanation": "...",
      "subtopic": "...",
      "source": "...",
      "conflict_note": null
    }]
  }]
}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenQuestions(sessionData) {
  const standalone = (sessionData.standalone_questions ?? []).map(q => ({
    ...q,
    _block: 'standalone',
  }))
  const chained = (sessionData.chained_cases ?? []).flatMap(c =>
    (c.questions ?? []).map(q => ({
      ...q,
      _block: 'chained',
      caseId: c.case_id,
      caseTitle: c.case_title,
      patientIntro: c.patient_intro,
      narrativeType: c.narrative_type,
      totalInCase: (c.questions ?? []).length,
    }))
  )
  return [...standalone, ...chained]
}

function computeSubtopicScores(flatQuestions, answers) {
  const map = new Map()
  flatQuestions.forEach((q, i) => {
    const sub = q?.subtopic || 'General'
    if (!map.has(sub)) map.set(sub, { correct: 0, total: 0 })
    const s = map.get(sub)
    s.total++
    if (answers[i]?.isCorrect) s.correct++
  })
  return map
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Study() {
  const { lang } = useLang()
  const { user } = useAuth()

  // Phase: 'setup' | 'generating' | 'preview' | 'session' | 'results'
  const [phase, setPhase] = useState('setup')

  // Setup
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState('mixed')
  const [standaloneCount, setStandaloneCount] = useState(8)
  const [chainedCaseCount, setChainedCaseCount] = useState(2)
  const [questionsPerCase, setQuestionsPerCase] = useState(3)
  const [totalMixed, setTotalMixed] = useState(12)
  const [source, setSource] = useState('library')
  const [language, setLanguage] = useState('ES')
  const [guidelines, setGuidelines] = useState([])
  const [selectedGuidelineId, setSelectedGuidelineId] = useState('')

  // Generation
  const [genError, setGenError] = useState(null)

  // Session data
  const [sessionData, setSessionData] = useState(null)
  const [flatQuestions, setFlatQuestions] = useState([])

  // Exam state
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showFeedback, setShowFeedback] = useState(false)

  // Results
  const [objectivesChecked, setObjectivesChecked] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // Load guidelines
  useEffect(() => {
    if (!user) return
    supabase
      .from('guidelines')
      .select('id, name, specialty')
      .or(`is_public.eq.true,uploaded_by.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => setGuidelines(data ?? []))
  }, [user])

  useEffect(() => {
    if (source === 'library') setSelectedGuidelineId('')
  }, [source])

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!topic.trim()) return
    setGenError(null)
    setPhase('generating')

    try {
      let guidelineName = null
      if (source !== 'library' && selectedGuidelineId) {
        const g = guidelines.find(g => g.id === selectedGuidelineId)
        if (g) guidelineName = g.name
      }

      let countInstruction
      if (format === 'standalone') {
        countInstruction =
          `Generate ${standaloneCount} standalone questions. ` +
          `Do not generate chained cases (leave "chained_cases" as an empty array).`
      } else if (format === 'chained') {
        countInstruction =
          `Generate ${chainedCaseCount} chained case${chainedCaseCount !== 1 ? 's' : ''} with ${questionsPerCase} questions each. ` +
          `Do not generate standalone questions (leave "standalone_questions" as an empty array).`
      } else {
        const sqCount = Math.max(2, Math.floor(totalMixed * MIXED_STANDALONE_RATIO))
        const ccCount = Math.max(1, Math.floor(totalMixed * (1 - MIXED_STANDALONE_RATIO) / MIXED_CHAINED_QUESTIONS_PER_CASE))
        countInstruction =
          `Generate ${sqCount} standalone questions and ${ccCount} chained case${ccCount !== 1 ? 's' : ''} with ${MIXED_CHAINED_QUESTIONS_PER_CASE} questions each, ` +
          `totaling approximately ${totalMixed} questions.`
      }

      let userMessage =
        `Topic: ${topic.trim()}\n` +
        `${countInstruction}\n` +
        `Language: ${language === 'ES' ? 'Spanish (es-MX)' : 'English (en-US)'}`

      if (guidelineName) {
        userMessage += `\nReference guideline: ${guidelineName} — treat as primary GPC source.`
      }

      const result = await generateStudySession({ systemPrompt: SYSTEM_PROMPT, userMessage })

      const flat = flattenQuestions(result)
      if (flat.length === 0) {
        throw new Error(
          lang === 'ES' ? 'Claude no generó preguntas.' : 'Claude did not generate any questions.'
        )
      }

      setSessionData(result)
      setFlatQuestions(flat)
      setAnswers(new Array(flat.length).fill(null))
      setCurrentIdx(0)
      setSelectedAnswer(null)
      setShowFeedback(false)
      setSaved(false)
      setObjectivesChecked(new Set())
      setPhase('preview')
    } catch (err) {
      setGenError(err.message)
      setPhase('setup')
    }
  }

  // ── Session exam ─────────────────────────────────────────────────────────────

  const handleSelectAnswer = (idx) => {
    if (showFeedback) return
    setSelectedAnswer(idx)
  }

  const handleConfirmAnswer = () => {
    if (selectedAnswer === null || showFeedback) return
    const q = flatQuestions[currentIdx]
    const isCorrect = selectedAnswer === q.correct_index
    const newAnswers = [...answers]
    newAnswers[currentIdx] = { selectedIndex: selectedAnswer, isCorrect }
    setAnswers(newAnswers)
    setShowFeedback(true)
  }

  const handleNext = () => {
    if (currentIdx < flatQuestions.length - 1) {
      setCurrentIdx(prev => prev + 1)
      setSelectedAnswer(null)
      setShowFeedback(false)
    }
  }

  const handleFinish = () => {
    const subtopics = sessionData?.study_plan?.subtopics ?? []
    const objectiveCount = sessionData?.study_plan?.learning_objectives?.length ?? 0
    const checked = new Set()

    // Auto-check objective[i] when any question answered correctly in subtopics[i].
    // This maps objectives to subtopics by position (Claude returns them in order).
    answers.forEach((ans, i) => {
      if (!ans?.isCorrect) return
      const sub = flatQuestions[i]?.subtopic ?? ''
      const subIdx = subtopics.indexOf(sub)
      if (subIdx >= 0 && subIdx < objectiveCount) checked.add(subIdx)
    })

    setObjectivesChecked(checked)
    setPhase('results')
  }

  // ── Save session ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (saved || saving) return
    setSaving(true)
    try {
      const totalCorrect = answers.filter(a => a?.isCorrect).length

      const { data: session, error: sErr } = await supabase
        .from('exam_sessions')
        .insert({
          user_id: user.id,
          mode: 'thematic',
          topic: topic.trim(),
          total_questions: flatQuestions.length,
          correct_answers: totalCorrect,
          completed: true,
        })
        .select('id')
        .single()
      if (sErr) throw sErr

      const qRows = flatQuestions.map(q => ({
        vignette: q.vignette ??
          // For chained questions: use patient_intro only as the base vignette;
          // clinical_update is already stored separately in its own column.
          (q.patientIntro ? q.patientIntro : '—'),
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation ?? null,
        source: q.source ?? null,
        source_type: q.source_type ?? 'library',
        conflict_note: q.conflict_note ?? null,
        session_type: q._block === 'chained' ? 'chained' : 'standalone',
        case_id: q.caseId ?? null,
        case_position: q.position ?? null,
        patient_intro: q.patientIntro ?? null,
        clinical_update: q.clinical_update ?? null,
        topic: topic.trim(),
        approved: false,
        created_by: user.id,
      }))

      const { data: insertedQs, error: qErr } = await supabase
        .from('question_bank')
        .insert(qRows)
        .select('id')
      if (qErr) throw qErr

      const aRows = answers
        .map((ans, i) => (ans != null && insertedQs[i]?.id) ? {
          session_id: session.id,
          question_id: insertedQs[i].id,
          selected_index: ans.selectedIndex,
          is_correct: ans.isCorrect,
        } : null)
        .filter(Boolean)

      if (aRows.length > 0) {
        const { error: aErr } = await supabase.from('exam_answers').insert(aRows)
        if (aErr) throw aErr
      }

      setSaved(true)
      showToast(lang === 'ES' ? 'Sesión guardada exitosamente' : 'Session saved successfully')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Weak points retry ─────────────────────────────────────────────────────────

  const subtopicScores = useMemo(
    () => computeSubtopicScores(flatQuestions, answers),
    [flatQuestions, answers]
  )

  const weakSubtopics = useMemo(
    () =>
      Array.from(subtopicScores.entries())
        .filter(([, { correct, total }]) => total > 0 && correct / total < 0.6)
        .map(([name]) => name),
    [subtopicScores]
  )

  const handleStudyWeakPoints = () => {
    setTopic(weakSubtopics.join(', '))
    setSessionData(null)
    setFlatQuestions([])
    setAnswers([])
    setCurrentIdx(0)
    setSelectedAnswer(null)
    setShowFeedback(false)
    setSaved(false)
    setGenError(null)
    setPhase('setup')
  }

  // ── Derived ────────────────────────────────────────────────────────────────────

  const isLastQuestion = currentIdx === flatQuestions.length - 1
  const currentQuestion = flatQuestions[currentIdx]
  const prevQuestion = flatQuestions[currentIdx - 1]
  const isSectionTransition =
    currentIdx > 0 &&
    prevQuestion?._block === 'standalone' &&
    currentQuestion?._block === 'chained'

  const standaloneQCount = sessionData?.standalone_questions?.length ?? 0
  const chainedCasesData = sessionData?.chained_cases ?? []
  const chainedQCount = chainedCasesData.reduce((sum, c) => sum + (c.questions?.length ?? 0), 0)
  const totalQCount = standaloneQCount + chainedQCount

  const overallCorrect = answers.filter(a => a?.isCorrect).length
  const overallPct = flatQuestions.length > 0
    ? Math.round(overallCorrect / flatQuestions.length * 100)
    : 0

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title={lang === 'ES' ? 'Estudio Temático' : 'Thematic Study'}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STEP 1: SETUP                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {phase === 'setup' && (
          <>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white">
                {lang === 'ES' ? 'Plan de Estudio Temático' : 'Thematic Study Plan'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {lang === 'ES'
                  ? 'Estudia cualquier tema clínico con preguntas y casos generados por IA.'
                  : 'Study any clinical topic with AI-generated questions and cases.'}
              </p>
            </div>

            {/* ── 1. Topic input ── */}
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? '1. Tema clínico' : '1. Clinical topic'}
              </h3>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && topic.trim() && handleGenerate()}
                placeholder={
                  lang === 'ES'
                    ? 'Escribe un tema clínico... ej: Conjuntivitis aguda'
                    : 'Enter a clinical topic... e.g., Acute conjunctivitis'
                }
                className="w-full px-4 py-3 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-accent-cyan text-base"
              />
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      topic === t
                        ? 'bg-accent-cyan/20 border-accent-cyan/50 text-accent-cyan'
                        : 'bg-background border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            {/* ── 2. Format selector ── */}
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? '2. Formato de la sesión' : '2. Session format'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    key: 'standalone',
                    emoji: '📝',
                    label: lang === 'ES' ? 'Preguntas sueltas' : 'Standalone questions',
                    sub: `${standaloneCount} ${lang === 'ES' ? 'preguntas' : 'questions'}`,
                  },
                  {
                    key: 'chained',
                    emoji: '🔗',
                    label: lang === 'ES' ? 'Casos encadenados' : 'Chained cases',
                    sub: `${chainedCaseCount} × ${questionsPerCase} ${lang === 'ES' ? 'preg.' : 'q.'}`,
                  },
                  {
                    key: 'mixed',
                    emoji: '🎯',
                    label: lang === 'ES' ? 'Sesión mixta' : 'Mixed session',
                    sub: `${totalMixed} ${lang === 'ES' ? 'totales' : 'total'}`,
                  },
                ].map(({ key, emoji, label, sub }) => (
                  <button
                    key={key}
                    onClick={() => setFormat(key)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      format === key
                        ? 'border-accent-cyan bg-accent-cyan/10'
                        : 'border-gray-700 hover:border-gray-600 bg-background'
                    }`}
                  >
                    <span className="text-xl">{emoji}</span>
                    <span className={`font-heading font-semibold text-sm ${format === key ? 'text-accent-cyan' : 'text-white'}`}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-500">{sub}</span>
                  </button>
                ))}
              </div>

              {/* Standalone slider */}
              {format === 'standalone' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {lang === 'ES'
                      ? `Número de preguntas: ${standaloneCount}`
                      : `Number of questions: ${standaloneCount}`}
                  </label>
                  <input
                    type="range" min={5} max={20} value={standaloneCount}
                    onChange={e => setStandaloneCount(Number(e.target.value))}
                    className="w-full cursor-pointer accent-accent-cyan"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
                    <span>5</span><span>20</span>
                  </div>
                </div>
              )}

              {/* Chained sliders */}
              {format === 'chained' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {lang === 'ES' ? `Casos: ${chainedCaseCount}` : `Cases: ${chainedCaseCount}`}
                    </label>
                    <input
                      type="range" min={1} max={5} value={chainedCaseCount}
                      onChange={e => setChainedCaseCount(Number(e.target.value))}
                      className="w-full cursor-pointer accent-accent-cyan"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
                      <span>1</span><span>5</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {lang === 'ES'
                        ? `Preguntas por caso: ${questionsPerCase}`
                        : `Questions per case: ${questionsPerCase}`}
                    </label>
                    <input
                      type="range" min={2} max={5} value={questionsPerCase}
                      onChange={e => setQuestionsPerCase(Number(e.target.value))}
                      className="w-full cursor-pointer accent-accent-cyan"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
                      <span>2</span><span>5</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mixed slider */}
              {format === 'mixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {lang === 'ES'
                      ? `Total de preguntas: ${totalMixed}`
                      : `Total questions: ${totalMixed}`}
                  </label>
                  <input
                    type="range" min={5} max={20} value={totalMixed}
                    onChange={e => setTotalMixed(Number(e.target.value))}
                    className="w-full cursor-pointer accent-accent-cyan"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
                    <span>5</span><span>20</span>
                  </div>
                </div>
              )}
            </section>

            {/* ── 3. Source + Language ── */}
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? '3. Fuente y configuración' : '3. Source & settings'}
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'gpc', emoji: '📄', label: 'GPC Subida' },
                  { key: 'library', emoji: '🧠', label: lang === 'ES' ? 'Biblioteca' : 'Library' },
                  { key: 'both', emoji: '🔄', label: lang === 'ES' ? 'Ambas' : 'Both' },
                ].map(({ key, emoji, label }) => (
                  <button
                    key={key}
                    onClick={() => setSource(key)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-center transition-all ${
                      source === key
                        ? 'border-accent-blue bg-accent-blue/10'
                        : 'border-gray-700 hover:border-gray-600 bg-background'
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    <span className={`text-xs font-medium ${source === key ? 'text-accent-blue' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {source !== 'library' && (
                guidelines.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-background border border-gray-700 rounded-xl px-4 py-3">
                    {lang === 'ES'
                      ? 'No hay guías disponibles. Ve a Guías Clínicas para subir una.'
                      : 'No guidelines available. Upload one in Clinical Guidelines.'}
                  </p>
                ) : (
                  <select
                    value={selectedGuidelineId}
                    onChange={e => setSelectedGuidelineId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
                  >
                    <option value="">
                      {lang === 'ES' ? '— Selecciona una guía (opcional) —' : '— Select a guideline (optional) —'}
                    </option>
                    {guidelines.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.specialty ? ` (${g.specialty})` : ''}
                      </option>
                    ))}
                  </select>
                )
              )}

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-300">
                  {lang === 'ES' ? 'Idioma:' : 'Language:'}
                </span>
                <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
                  {['ES', 'EN'].map(l => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`px-5 py-2 text-sm font-medium transition-colors ${
                        language === l ? 'bg-accent-blue text-white' : 'bg-background text-gray-400 hover:text-white'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Error */}
            {genError && (
              <div className="flex items-start gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3 text-sm text-error">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{genError}</span>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!topic.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-success to-emerald-600 hover:opacity-90 disabled:opacity-50 text-white font-heading font-semibold rounded-2xl transition-opacity"
            >
              <Target size={18} />
              {lang === 'ES' ? 'Generar plan de estudio' : 'Generate study plan'}
            </button>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STEP 2: GENERATING                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {phase === 'generating' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <Loader2 size={36} className="animate-spin text-accent-cyan mx-auto mb-4" />
              <p className="font-heading font-semibold text-white text-lg mb-2 animate-pulse">
                {lang === 'ES'
                  ? 'Claude está generando casos desde la GPC...'
                  : 'Claude is generating cases from the GPC...'}
              </p>
              <p className="text-gray-500 text-sm">
                {lang === 'ES'
                  ? `Preparando sesión sobre: "${topic}"`
                  : `Preparing session on: "${topic}"`}
              </p>
            </div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3 animate-pulse">
                  <div className="h-3 bg-gray-800 rounded w-1/4" />
                  <div className="h-4 bg-gray-800 rounded w-full" />
                  <div className="h-4 bg-gray-800 rounded w-3/4" />
                  <div className="space-y-2 pt-2">
                    {[...Array(5)].map((_, j) => (
                      <div key={j} className="h-9 bg-gray-800 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STEP 3: PREVIEW                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {phase === 'preview' && sessionData && (
          <>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white">
                {sessionData.topic || topic}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {lang === 'ES' ? 'Plan de estudio generado por IA' : 'AI-generated study plan'}
              </p>
            </div>

            {/* Subtopics */}
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Subtemas' : 'Subtopics'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {(sessionData.study_plan?.subtopics ?? []).map((sub, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25">
                    {sub}
                  </span>
                ))}
              </div>
            </section>

            {/* Learning objectives */}
            {(sessionData.study_plan?.learning_objectives?.length ?? 0) > 0 && (
              <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {lang === 'ES' ? 'Objetivos de aprendizaje' : 'Learning objectives'}
                </h3>
                <ul className="space-y-2">
                  {sessionData.study_plan.learning_objectives.map((obj, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="mt-0.5 w-4 h-4 rounded border border-gray-600 flex-shrink-0" />
                      {obj}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Session breakdown */}
            <div className="bg-surface border border-gray-800 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {lang === 'ES' ? 'Resumen de la sesión' : 'Session summary'}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
                {standaloneQCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span>📝</span>
                    {standaloneQCount} {lang === 'ES' ? 'preguntas sueltas' : 'standalone questions'}
                  </span>
                )}
                {chainedCasesData.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span>🔗</span>
                    {chainedCasesData.length} {lang === 'ES' ? 'casos' : 'cases'} ({chainedQCount} {lang === 'ES' ? 'preguntas' : 'questions'})
                  </span>
                )}
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <span>🎯</span>
                  = {totalQCount} {lang === 'ES' ? 'total' : 'total'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setPhase('session')}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-success to-emerald-600 hover:opacity-90 text-white font-heading font-semibold rounded-2xl transition-opacity"
            >
              <ChevronRight size={18} />
              {lang === 'ES' ? 'Iniciar sesión' : 'Start session'}
            </button>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STEP 4: SESSION                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {phase === 'session' && currentQuestion && (
          <>
            {/* Progress bar */}
            <div className="bg-surface border border-gray-800 rounded-2xl p-4">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>
                  {lang === 'ES'
                    ? `Pregunta ${currentIdx + 1} de ${flatQuestions.length}`
                    : `Question ${currentIdx + 1} of ${flatQuestions.length}`}
                </span>
                {currentQuestion._block === 'chained' && (
                  <span className="text-accent-cyan text-xs">
                    {lang === 'ES'
                      ? `Preg. ${currentQuestion.position} de ${currentQuestion.totalInCase} • ${currentQuestion.caseTitle}`
                      : `Q. ${currentQuestion.position} of ${currentQuestion.totalInCase} • ${currentQuestion.caseTitle}`}
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-accent-cyan to-accent-blue h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / flatQuestions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Section transition banner */}
            {isSectionTransition && (
              <div className="flex items-center gap-3 bg-accent-blue/10 border border-accent-blue/20 rounded-xl px-4 py-3 text-sm text-accent-blue font-medium">
                <span className="text-base">🔗</span>
                {lang === 'ES' ? 'Iniciando casos encadenados' : 'Starting chained cases'}
              </div>
            )}

            {/* Chained case header */}
            {currentQuestion._block === 'chained' && (
              <div className="bg-surface border border-accent-blue/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-blue/20 text-accent-blue border border-accent-blue/30">
                    {NARRATIVE_LABELS[currentQuestion.narrativeType]?.[lang] ?? currentQuestion.narrativeType}
                  </span>
                  <span className="text-xs text-gray-500">{currentQuestion.caseTitle}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {lang === 'ES' ? 'Paciente' : 'Patient'}
                  </p>
                  <p className="text-gray-200 text-sm leading-relaxed">{currentQuestion.patientIntro}</p>
                </div>
                {currentQuestion.clinical_update && (
                  <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5">
                    <RefreshCw size={14} className="text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-warning mb-0.5">
                        🔄 {lang === 'ES' ? 'Actualización clínica' : 'Clinical update'}
                      </p>
                      <p className="text-sm text-gray-200">{currentQuestion.clinical_update}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Question card */}
            <div className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
              {/* Vignette (standalone only) */}
              {currentQuestion._block === 'standalone' && currentQuestion.vignette && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    {lang === 'ES' ? 'Viñeta clínica' : 'Clinical vignette'}
                  </p>
                  <p className="text-white text-sm leading-relaxed">{currentQuestion.vignette}</p>
                </div>
              )}

              {/* Question */}
              <p className="text-white font-medium text-sm">{currentQuestion.question}</p>

              {/* Options */}
              <div className="space-y-2">
                {(currentQuestion.options ?? []).map((opt, i) => {
                  let style = 'border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-white/5'
                  if (showFeedback) {
                    if (i === currentQuestion.correct_index) {
                      style = 'border-success/40 bg-success/15 text-success'
                    } else if (i === selectedAnswer) {
                      style = 'border-error/40 bg-error/15 text-error'
                    } else {
                      style = 'border-gray-800 text-gray-500 opacity-50'
                    }
                  } else if (selectedAnswer === i) {
                    style = 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectAnswer(i)}
                      disabled={showFeedback}
                      className={`w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${style}`}
                    >
                      {showFeedback && i === currentQuestion.correct_index && (
                        <CheckCircle size={14} className="shrink-0 mt-0.5" />
                      )}
                      {showFeedback && i === selectedAnswer && i !== currentQuestion.correct_index && (
                        <X size={14} className="shrink-0 mt-0.5" />
                      )}
                      <span>{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Explanation */}
              {showFeedback && currentQuestion.explanation && (
                <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1.5">
                    {lang === 'ES' ? 'Explicación' : 'Explanation'}
                  </p>
                  <p className="text-gray-300 text-sm leading-relaxed">{currentQuestion.explanation}</p>
                </div>
              )}

              {/* Source */}
              {showFeedback && currentQuestion.source && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">{lang === 'ES' ? 'Fuente:' : 'Source:'}</span>{' '}
                  {currentQuestion.source}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1 border-t border-gray-800">
                {!showFeedback && (
                  <button
                    onClick={handleConfirmAnswer}
                    disabled={selectedAnswer === null}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:opacity-90 disabled:opacity-50 text-white font-medium rounded-xl transition-opacity text-sm"
                  >
                    {lang === 'ES' ? 'Confirmar respuesta' : 'Confirm answer'}
                  </button>
                )}
                {showFeedback && !isLastQuestion && (
                  <button
                    onClick={handleNext}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl transition-opacity text-sm"
                  >
                    {lang === 'ES' ? 'Siguiente' : 'Next'} <ChevronRight size={14} />
                  </button>
                )}
                {showFeedback && isLastQuestion && (
                  <button
                    onClick={handleFinish}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-success to-emerald-600 hover:opacity-90 text-white font-medium rounded-xl transition-opacity text-sm"
                  >
                    <BarChart2 size={14} />
                    {lang === 'ES' ? 'Finalizar sesión' : 'Finish session'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STEP 5: RESULTS                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {phase === 'results' && (
          <>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white">
                {lang === 'ES' ? 'Resultados' : 'Results'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">{sessionData?.topic || topic}</p>
            </div>

            {/* Overall score */}
            <div className="bg-surface border border-gray-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {lang === 'ES' ? 'Puntuación total' : 'Overall score'}
                </p>
                <p className="font-heading font-bold text-3xl text-white">
                  {overallCorrect}
                  <span className="text-gray-500 text-xl font-normal"> / {flatQuestions.length}</span>
                </p>
              </div>
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center border-4"
                style={{
                  borderColor:
                    overallPct >= 70 ? '#22c55e' :
                    overallPct >= 50 ? '#f59e0b' : '#ef4444',
                }}
              >
                <span className="font-heading font-bold text-lg text-white">{overallPct}%</span>
              </div>
            </div>

            {/* Subtopic bar chart */}
            <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Puntuación por subtema' : 'Score by subtopic'}
              </h3>
              <div className="space-y-3">
                {Array.from(subtopicScores.entries()).map(([sub, { correct, total }]) => {
                  const pct = total > 0 ? Math.round(correct / total * 100) : 0
                  const isWeak = pct < 60
                  return (
                    <div key={sub}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className={isWeak ? 'text-error font-medium' : 'text-gray-300'}>{sub}</span>
                        <span className={`text-xs ${isWeak ? 'text-error' : 'text-gray-500'}`}>
                          {correct}/{total} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            isWeak ? 'bg-error' : pct >= 80 ? 'bg-success' : 'bg-warning'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Learning objectives with auto-checks */}
            {(sessionData?.study_plan?.learning_objectives?.length ?? 0) > 0 && (
              <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {lang === 'ES' ? 'Objetivos de aprendizaje' : 'Learning objectives'}
                </h3>
                <ul className="space-y-2">
                  {sessionData.study_plan.learning_objectives.map((obj, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {objectivesChecked.has(i)
                        ? <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
                        : <span className="mt-0.5 w-4 h-4 rounded border border-gray-600 flex-shrink-0" />
                      }
                      <span className={objectivesChecked.has(i) ? 'text-gray-300' : 'text-gray-500'}>
                        {obj}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Weak subtopics */}
            {weakSubtopics.length > 0 && (
              <section className="bg-error/5 border border-error/20 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-error uppercase tracking-wider">
                  {lang === 'ES' ? '⚠ Puntos débiles (< 60%)' : '⚠ Weak points (< 60%)'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {weakSubtopics.map(sub => (
                    <span key={sub} className="px-3 py-1.5 rounded-full text-xs font-medium bg-error/15 text-error border border-error/25">
                      {sub}
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleStudyWeakPoints}
                  className="flex items-center gap-2 px-4 py-2.5 bg-error/20 hover:bg-error/30 text-error font-medium rounded-xl transition-colors text-sm"
                >
                  <RefreshCw size={14} />
                  {lang === 'ES'
                    ? 'Generar sesión sobre mis puntos débiles'
                    : 'Generate session on my weak points'}
                </button>
              </section>
            )}

            {/* Save + New session buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className="flex items-center gap-2 px-5 py-2.5 bg-success hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saved
                  ? (lang === 'ES' ? '✓ Guardado' : '✓ Saved')
                  : saving
                  ? (lang === 'ES' ? 'Guardando...' : 'Saving...')
                  : (lang === 'ES' ? 'Guardar sesión' : 'Save session')}
              </button>
              <button
                onClick={() => {
                  setTopic('')
                  setSessionData(null)
                  setFlatQuestions([])
                  setAnswers([])
                  setGenError(null)
                  setPhase('setup')
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-background border border-gray-700 hover:border-gray-600 text-gray-300 font-medium rounded-xl transition-colors text-sm"
              >
                <Target size={14} />
                {lang === 'ES' ? 'Nueva sesión' : 'New session'}
              </button>
            </div>
          </>
        )}
      </div>

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
