import { useState, useEffect, useRef, useCallback } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase, GUIDELINES_BUCKET } from '../lib/supabase'
import { generateClinicalCases } from '../lib/claude'
import {
  Zap, CheckCircle, AlertCircle, AlertTriangle,
  Loader2, Save, X, BookOpen,
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

const ENARM_AREAS = ['Ciencias Básicas', 'Clínicas', 'Salud Pública']

const PDF_WORKER_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const SYSTEM_PROMPT = `You are an expert ENARM exam question writer specialized in Mexican clinical practice guidelines (GPC).

TIER 1 — MEXICAN GPC (always prioritized):
- CENETEC clinical practice guidelines
- IMSS / ISSSTE / SSA institutional guidelines
- Cuadro Básico de Medicamentos del IMSS/SSA
- Mexican epidemiological context

TIER 2 — GENERAL LIBRARY (complementary only):
- Harrison, UpToDate, AHA, ESC, IDSA, WHO, ADA, ACOG
- Use ONLY when GPC content is insufficient

RULES:
- If GPC text provided: base case entirely on it
- If no GPC: use Tier 1 knowledge first, Tier 2 as complement
- If conflict exists between GPC and international guidelines: add conflict_note
- Use Cuadro Básico medications, IMSS/SSA settings, Mexican epidemiology
- Focus on first and second level of care decision-making

Return ONLY a valid JSON array, no markdown, no preamble.
Each object must have:
{
  "vignette": "3-5 sentence clinical scenario",
  "question": "Single best answer question",
  "options": ["A)...","B)...","C)...","D)...","E)..."],
  "correct_index": 0,
  "explanation": "2-3 sentence explanation with clinical rationale",
  "source": "GPC name/section OR Library - [source name]",
  "source_type": "gpc_pdf|library|conflict",
  "conflict_note": null
}`

// ─── PDF extraction from Supabase Storage ─────────────────────────────────────

async function extractPdfFromStorage(filePath) {
  const { data, error } = await supabase.storage
    .from(GUIDELINES_BUCKET)
    .createSignedUrl(filePath, 300) // 5-min URL
  if (error) throw new Error(`Storage error: ${error.message}`)

  const res = await fetch(data.signedUrl)
  if (!res.ok) throw new Error(`Failed to fetch PDF: HTTP ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()

  const pdfjsLib = window.pdfjsLib
  if (!pdfjsLib) throw new Error('pdf.js no disponible en la página.')
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const maxPages = Math.min(pdf.numPages, 30)
  let text = ''
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
    if (text.length >= 15000) break
  }
  return text.slice(0, 15000)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Generate() {
  const { lang } = useLang()
  const { user } = useAuth()

  // Source
  const [source, setSource] = useState('library') // 'gpc' | 'library' | 'both'
  const [guidelines, setGuidelines] = useState([])
  const [selectedGuidelineId, setSelectedGuidelineId] = useState('')

  // Config
  const [specialty, setSpecialty] = useState('')
  const [areaEnarm, setAreaEnarm] = useState('')
  const [difficulty, setDifficulty] = useState(2)
  const [caseCount, setCaseCount] = useState(5)
  const [language, setLanguage] = useState('ES')

  // Generation
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState('') // 'extracting' | 'calling'
  const [cases, setCases] = useState([])
  const [genError, setGenError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // Load guidelines list
  useEffect(() => {
    if (!user) return
    supabase
      .from('guidelines')
      .select('id, name, specialty, file_path')
      .or(`is_public.eq.true,uploaded_by.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => setGuidelines(data ?? []))
  }, [user])

  // Reset guideline selection when switching to library-only
  useEffect(() => {
    if (source === 'library') setSelectedGuidelineId('')
  }, [source])

  // ─── Generate handler ───────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenError(null)
    setGenerating(true)
    setCases([])

    try {
      let gpcText = null
      let guidelineName = null

      if (source !== 'library' && selectedGuidelineId) {
        const selected = guidelines.find(g => g.id === selectedGuidelineId)
        if (selected?.file_path) {
          setGenStep('extracting')
          gpcText = await extractPdfFromStorage(selected.file_path)
          guidelineName = selected.name
        }
      }

      setGenStep('calling')

      const difficultyLabel =
        difficulty === 1 ? 'Fácil (Easy)' :
        difficulty === 2 ? 'Moderado (Moderate)' : 'Difícil (Hard)'

      let userMessage =
        `Generate ${caseCount} ENARM clinical case${caseCount > 1 ? 's' : ''} with these parameters:\n` +
        `- Specialty: ${specialty || 'Any ENARM specialty'}\n` +
        `- ENARM Area: ${areaEnarm || 'Any'}\n` +
        `- Difficulty: ${difficultyLabel}\n` +
        `- Language: ${language === 'ES' ? 'Spanish (es-MX)' : 'English (en-US)'}`

      if (gpcText) {
        userMessage +=
          `\n\nBase the cases on the following GPC text (${guidelineName}):\n---\n${gpcText}\n---`
      }

      userMessage += `\n\nReturn exactly ${caseCount} case object${caseCount > 1 ? 's' : ''} in the JSON array.`

      const result = await generateClinicalCases({ systemPrompt: SYSTEM_PROMPT, userMessage })
      setCases(result.map(c => ({ ...c, status: 'pending', saved: false })))
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
      setGenStep('')
    }
  }

  // ─── Approve / Reject (toggle: same status → pending) ─────────────────────

  const setStatus = (idx, newStatus) => {
    setCases(prev =>
      prev.map((c, i) =>
        i === idx ? { ...c, status: c.status === newStatus ? 'pending' : newStatus } : c
      )
    )
  }

  const resetStatus = (idx) => {
    setCases(prev =>
      prev.map((c, i) => i === idx ? { ...c, status: 'pending' } : c)
    )
  }

  // ─── Save approved cases to question_bank ──────────────────────────────────

  const handleSave = async () => {
    const approved = cases.filter(c => c.status === 'approved' && !c.saved)
    if (approved.length === 0) return

    setSaving(true)
    try {
      const rows = approved.map(c => ({
        vignette: c.vignette,
        question: c.question,
        options: c.options,
        correct_index: c.correct_index,
        explanation: c.explanation ?? null,
        source: c.source ?? null,
        source_type: c.source_type ?? 'library',
        conflict_note: c.conflict_note ?? null,
        specialty: specialty || null,
        area_enarm: areaEnarm || null,
        difficulty,
        approved: false, // admin must approve before publishing
        created_by: user.id,
        guideline_id:
          source !== 'library' && selectedGuidelineId ? selectedGuidelineId : null,
      }))

      const { error } = await supabase.from('question_bank').insert(rows)
      if (error) throw error

      // Mark those cases as saved in UI
      setCases(prev => {
        let savedIdx = 0
        return prev.map(c => {
          if (c.status === 'approved' && !c.saved) {
            savedIdx++
            return { ...c, saved: true }
          }
          return c
        })
      })

      const n = approved.length
      showToast(
        lang === 'ES'
          ? `${n} caso${n !== 1 ? 's' : ''} guardado${n !== 1 ? 's' : ''} en el banco de preguntas`
          : `${n} case${n !== 1 ? 's' : ''} saved to the question bank`
      )
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const needsGuideline = source !== 'library'
  const approvedUnsaved = cases.filter(c => c.status === 'approved' && !c.saved).length
  // Can generate: not already generating; if GPC source, either a guideline is selected or none exist (fallback to library)
  const canGenerate =
    !generating &&
    !(needsGuideline && guidelines.length > 0 && !selectedGuidelineId)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout title={lang === 'ES' ? 'Generar Casos' : 'Generate Cases'}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page heading */}
        <div>
          <h2 className="font-heading font-bold text-2xl text-white">
            {lang === 'ES' ? 'Generación de Casos con IA' : 'AI Case Generation'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {lang === 'ES'
              ? 'Genera preguntas tipo ENARM basadas en GPC mexicanas con Claude AI.'
              : 'Generate ENARM-style questions based on Mexican GPCs with Claude AI.'}
          </p>
        </div>

        {/* ── 1. Source selector ── */}
        <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {lang === 'ES' ? '1. Fuente de conocimiento' : '1. Knowledge source'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                key: 'gpc',
                emoji: '📄',
                label: 'GPC Subida',
                sub: lang === 'ES' ? 'Basado en tu guía' : 'Based on your guideline',
              },
              {
                key: 'library',
                emoji: '🧠',
                label: lang === 'ES' ? 'Biblioteca General' : 'General Library',
                sub: lang === 'ES' ? 'Conocimiento Claude' : 'Claude knowledge',
              },
              {
                key: 'both',
                emoji: '🔄',
                label: lang === 'ES' ? 'Ambas fuentes' : 'Both sources',
                sub: lang === 'ES' ? 'PDF + biblioteca' : 'PDF + library',
              },
            ].map(({ key, emoji, label, sub }) => (
              <button
                key={key}
                onClick={() => setSource(key)}
                className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all duration-200 ${
                  source === key
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-gray-700 hover:border-gray-600 bg-background'
                }`}
              >
                <span className="text-xl">{emoji}</span>
                <span className={`font-heading font-semibold text-sm ${source === key ? 'text-accent-blue' : 'text-white'}`}>
                  {label}
                </span>
                <span className="text-xs text-gray-500">{sub}</span>
              </button>
            ))}
          </div>

          {/* Guideline dropdown */}
          {needsGuideline && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lang === 'ES' ? 'Selecciona una guía' : 'Select a guideline'}
              </label>
              {guidelines.length === 0 ? (
                <p className="text-sm text-gray-500 bg-background border border-gray-700 rounded-xl px-4 py-3">
                  {lang === 'ES'
                    ? 'No hay guías disponibles. Ve a Guías Clínicas para subir una.'
                    : 'No guidelines available. Go to Clinical Guidelines to upload one.'}
                </p>
              ) : (
                <select
                  value={selectedGuidelineId}
                  onChange={e => setSelectedGuidelineId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
                >
                  <option value="">
                    {lang === 'ES' ? '— Selecciona una guía —' : '— Select a guideline —'}
                  </option>
                  {guidelines.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.specialty ? ` (${g.specialty})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </section>

        {/* ── 2. Configuration form ── */}
        <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {lang === 'ES' ? '2. Configuración' : '2. Configuration'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Specialty */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lang === 'ES' ? 'Especialidad ENARM' : 'ENARM Specialty'}
              </label>
              <select
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
                className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
              >
                <option value="">
                  {lang === 'ES' ? 'Cualquier especialidad' : 'Any specialty'}
                </option>
                {ENARM_SPECIALTIES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Area ENARM */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Área ENARM
              </label>
              <select
                value={areaEnarm}
                onChange={e => setAreaEnarm(e.target.value)}
                className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
              >
                <option value="">{lang === 'ES' ? 'Cualquier área' : 'Any area'}</option>
                {ENARM_AREAS.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {lang === 'ES' ? 'Dificultad' : 'Difficulty'}
            </label>
            <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
              {[
                { value: 1, label: lang === 'ES' ? 'Fácil' : 'Easy' },
                { value: 2, label: lang === 'ES' ? 'Moderado' : 'Moderate' },
                { value: 3, label: lang === 'ES' ? 'Difícil' : 'Hard' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDifficulty(value)}
                  className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                    difficulty === value
                      ? 'bg-accent-blue text-white'
                      : 'bg-background text-gray-400 hover:text-white'
                  }`}
                >
                  {value} · {label}
                </button>
              ))}
            </div>
          </div>

          {/* Case count + Language */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {lang === 'ES' ? `Número de casos: ${caseCount}` : `Number of cases: ${caseCount}`}
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={caseCount}
                onChange={e => setCaseCount(Number(e.target.value))}
                className="w-full cursor-pointer accent-accent-blue"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {lang === 'ES' ? 'Idioma de los casos' : 'Case language'}
              </label>
              <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
                {['ES', 'EN'].map(l => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                      language === l
                        ? 'bg-accent-blue text-white'
                        : 'bg-background text-gray-400 hover:text-white'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Generate button ── */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-accent-blue to-accent-cyan hover:opacity-90 disabled:opacity-50 text-white font-heading font-semibold rounded-2xl transition-opacity text-base"
        >
          {generating
            ? <><Loader2 size={18} className="animate-spin" /> {lang === 'ES' ? 'Generando...' : 'Generating...'}</>
            : <><Zap size={18} /> {lang === 'ES' ? `Generar ${caseCount} caso${caseCount !== 1 ? 's' : ''}` : `Generate ${caseCount} case${caseCount !== 1 ? 's' : ''}`}</>
          }
        </button>

        {/* ── Loading step label ── */}
        {generating && (
          <p className="text-center text-accent-cyan text-sm animate-pulse">
            {genStep === 'extracting'
              ? (lang === 'ES' ? 'Extrayendo texto del PDF...' : 'Extracting PDF text...')
              : (lang === 'ES'
                  ? 'Claude está generando casos desde la GPC...'
                  : 'Claude is generating cases from the GPC...')}
          </p>
        )}

        {/* ── Skeleton cards (loading) ── */}
        {generating && (
          <div className="space-y-4">
            {Array.from({ length: caseCount }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {genError && !generating && (
          <div className="flex items-start gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3 text-sm text-error">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{genError}</span>
          </div>
        )}

        {/* ── Review section ── */}
        {!generating && cases.length > 0 && (
          <div className="space-y-4">
            {/* Header + save button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="font-heading font-semibold text-white">
                {lang === 'ES'
                  ? `${cases.length} caso${cases.length !== 1 ? 's' : ''} generado${cases.length !== 1 ? 's' : ''}`
                  : `${cases.length} case${cases.length !== 1 ? 's' : ''} generated`}
              </p>
              <button
                onClick={handleSave}
                disabled={saving || approvedUnsaved === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-success hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
              >
                {saving
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Save size={14} />
                }
                {lang === 'ES'
                  ? `Guardar ${approvedUnsaved} caso${approvedUnsaved !== 1 ? 's' : ''} aprobado${approvedUnsaved !== 1 ? 's' : ''}`
                  : `Save ${approvedUnsaved} approved case${approvedUnsaved !== 1 ? 's' : ''}`
                }
              </button>
            </div>

            {/* Case cards */}
            {cases.map((c, i) => (
              <CaseReviewCard
                key={i}
                caseData={c}
                index={i}
                lang={lang}
                onSetStatus={status => setStatus(i, status)}
                onResetStatus={() => resetStatus(i)}
              />
            ))}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CaseReviewCard({ caseData, index, lang, onSetStatus, onResetStatus }) {
  const {
    vignette, question, options, correct_index,
    explanation, source, source_type, conflict_note,
    status, saved,
  } = caseData

  const sourceBadge =
    source_type === 'gpc_pdf'
      ? { label: 'GPC Mexicana', style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
      : source_type === 'conflict'
      ? { label: '⚠️ Conflicto', style: 'bg-warning/20 text-warning border-warning/30' }
      : { label: lang === 'ES' ? 'Biblioteca' : 'Library', style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }

  return (
    <div className={`bg-surface border rounded-2xl p-5 space-y-4 transition-all ${
      status === 'approved'
        ? 'border-success/40'
        : status === 'rejected'
        ? 'border-error/30 opacity-60'
        : 'border-gray-800'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-gray-500 bg-gray-800 px-2.5 py-1 rounded-lg shrink-0">
          Caso #{index + 1}
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${sourceBadge.style}`}>
            {sourceBadge.label}
          </span>
          {saved && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-success/20 text-success border-success/30">
              <CheckCircle size={11} /> {lang === 'ES' ? 'Guardado' : 'Saved'}
            </span>
          )}
        </div>
      </div>

      {/* Conflict note */}
      {conflict_note && (
        <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 text-sm text-warning">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>{conflict_note}</span>
        </div>
      )}

      {/* Vignette */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          {lang === 'ES' ? 'Viñeta clínica' : 'Clinical vignette'}
        </p>
        <p className="text-white text-sm leading-relaxed">{vignette}</p>
      </div>

      {/* Question */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          {lang === 'ES' ? 'Pregunta' : 'Question'}
        </p>
        <p className="text-white text-sm font-medium">{question}</p>
      </div>

      {/* Options */}
      {Array.isArray(options) && (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                i === correct_index
                  ? 'bg-success/15 border border-success/30 text-success'
                  : 'bg-background border border-gray-800 text-gray-300'
              }`}
            >
              {i === correct_index && <CheckCircle size={14} className="shrink-0 mt-0.5" />}
              <span>{opt}</span>
            </div>
          ))}
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1.5">
            {lang === 'ES' ? 'Explicación' : 'Explanation'}
          </p>
          <p className="text-gray-300 text-sm leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Source text */}
      {source && (
        <p className="text-xs text-gray-500">
          <span className="font-medium">{lang === 'ES' ? 'Fuente:' : 'Source:'}</span> {source}
        </p>
      )}

      {/* Approve / Reject */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-800 flex-wrap">
        <button
          onClick={() => onSetStatus('approved')}
          disabled={saved}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            status === 'approved'
              ? 'bg-success text-white'
              : 'bg-success/10 text-success hover:bg-success/20'
          }`}
        >
          <CheckCircle size={14} /> {lang === 'ES' ? 'Aprobar' : 'Approve'}
        </button>
        <button
          onClick={() => onSetStatus('rejected')}
          disabled={saved}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            status === 'rejected'
              ? 'bg-error text-white'
              : 'bg-error/10 text-error hover:bg-error/20'
          }`}
        >
          <X size={14} /> {lang === 'ES' ? 'Rechazar' : 'Reject'}
        </button>
        {status !== 'pending' && !saved && (
          <button
            onClick={onResetStatus}
            className="px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            {lang === 'ES' ? 'Deshacer' : 'Undo'}
          </button>
        )}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-5 w-16 bg-gray-800 rounded-lg" />
        <div className="h-5 w-24 bg-gray-800 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 bg-gray-800 rounded" />
        <div className="h-4 bg-gray-800 rounded w-full" />
        <div className="h-4 bg-gray-800 rounded w-4/5" />
        <div className="h-4 bg-gray-800 rounded w-3/5" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-800 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 bg-gray-800 rounded" />
        <div className="h-4 bg-gray-800 rounded w-full" />
        <div className="h-4 bg-gray-800 rounded w-2/3" />
      </div>
    </div>
  )
}

function Toast({ msg, type, onClose }) {
  const colors = {
    success: 'bg-success/20 border-success/30 text-success',
    error: 'bg-error/20 border-error/30 text-error',
    info: 'bg-accent-blue/20 border-accent-blue/30 text-accent-blue',
  }
  const Icon = type === 'error' ? AlertTriangle : CheckCircle

  return (
    <div className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur ${colors[type] ?? colors.success}`}>
      <Icon size={16} />
      <span>{msg}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

