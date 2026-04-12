import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell,
} from 'recharts'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BarChart2, CheckCircle, X, ChevronDown, ChevronUp, Star,
  Loader2, AlertTriangle, Target, Trophy, FileText, Users,
  TrendingUp, BookOpen,
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

// Short labels for radar axes
const SHORT_LABELS = {
  'Medicina Interna': 'M. Interna',
  'Pediatría': 'Pediatría',
  'Ginecología y Obstetricia': 'GinecoObs',
  'Cirugía General': 'Cirugía',
  'Medicina Familiar': 'M. Familiar',
  'Urgencias': 'Urgencias',
  'Salud Pública': 'Salud Púb.',
}

// Recharts dark-theme palette
const CHART_COLORS = [
  '#3b82f6', '#06b6d4', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#f97316',
]

const CHART_BG       = 'transparent'
const CHART_GRID     = '#1f2937'
const CHART_LABEL    = '#9ca3af'
const CHART_TOOLTIP  = '#111827'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cutoffDate(filter) {
  const now = new Date()
  if (filter === 'week') { now.setDate(now.getDate() - 7); return now.toISOString() }
  if (filter === 'month') { now.setDate(now.getDate() - 30); return now.toISOString() }
  return null // all time
}

function fmtDate(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === 'ES' ? 'es-MX' : 'en-US', {
    day: '2-digit', month: 'short',
  })
}

function difficultyStars(d) {
  const n = typeof d === 'number' ? d : 0
  return '★'.repeat(Math.max(0, Math.min(3, n))) + '☆'.repeat(Math.max(0, 3 - Math.min(3, n)))
}

function modeBadgeClass(mode) {
  if (mode === 'simulacro') return 'border-warning/30 bg-warning/10 text-warning'
  if (mode === 'thematic')  return 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan'
  return 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue'
}
function modeLabel(mode, topic) {
  if (mode === 'simulacro') return '🏆 Simulacro'
  if (mode === 'thematic')  return `🎯 ${topic || 'Temático'}`
  return '📝 Estándar'
}

function ScoreRing({ pct }) {
  const color = pct >= 70 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center border-4 shrink-0"
      style={{ borderColor: color }}
    >
      <span className="font-heading font-bold text-xl text-white">{pct}%</span>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  )
}

// Custom tooltip for recharts (dark theme)
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-gray-700 rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-gray-400 mb-1.5">{label}</p>}
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{p.name ?? p.dataKey}:</span>
          <span className="text-white font-semibold">
            {typeof p.value === 'number' ? `${p.value}%` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Results() {
  const { lang } = useLang()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')

  // ── Dashboard state ──────────────────────────────────────────────────────
  const [timeFilter, setTimeFilter] = useState('all')
  const [sessions, setSessions] = useState([])
  const [allAnswers, setAllAnswers] = useState([]) // [{answer, question, session}] — user's own
  const [communityAnswers, setCommunityAnswers] = useState([]) // [{answer, question, userIdKey}] — all visible
  const [dashLoading, setDashLoading] = useState(true)
  const [dashError, setDashError] = useState(null)
  const [expandedMissed, setExpandedMissed] = useState(null)
  const [expandedSession, setExpandedSession] = useState(null)
  const [hiddenSpecialties, setHiddenSpecialties] = useState(new Set())

  // ── Session detail state ─────────────────────────────────────────────────
  const [sessLoading, setSessLoading] = useState(false)
  const [sessError, setSessError]   = useState(null)
  const [session, setSession]       = useState(null)
  const [answersWithQ, setAnswersWithQ] = useState([])
  const [expandedIdx, setExpandedIdx]  = useState(null)

  // ── Load dashboard data (always, for sidebar etc) ────────────────────────
  useEffect(() => {
    if (!user) return
    loadDashboard()
  }, [user, timeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async () => {
    setDashLoading(true)
    setDashError(null)
    try {
      let q = supabase
        .from('exam_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      const cut = cutoffDate(timeFilter)
      if (cut) q = q.gte('created_at', cut)

      const { data: sessList, error: sErr } = await q
      if (sErr) throw sErr
      setSessions(sessList ?? [])

      // Load all answers with question details for those sessions
      const ids = (sessList ?? []).map(s => s.id)
      if (ids.length === 0) {
        setAllAnswers([])
        setDashLoading(false)
        return
      }

      const { data: answers, error: aErr } = await supabase
        .from('exam_answers')
        .select('*')
        .in('session_id', ids)
      if (aErr) throw aErr

      const qIds = [...new Set((answers ?? []).map(a => a.question_id).filter(Boolean))]
      let qMap = {}
      if (qIds.length > 0) {
        const { data: questions, error: qErr } = await supabase
          .from('question_bank')
          .select('id, vignette, question, options, correct_index, explanation, source, specialty, difficulty')
          .in('id', qIds)
        if (qErr) throw qErr
        qMap = Object.fromEntries((questions ?? []).map(q => [q.id, q]))
      }

      const sessMap = Object.fromEntries((sessList ?? []).map(s => [s.id, s]))
      const merged = (answers ?? []).map(a => ({
        answer: a,
        question: qMap[a.question_id] ?? null,
        session: sessMap[a.session_id] ?? null,
      }))
      setAllAnswers(merged)

      // ── Community data: fetch all exam_answers with session user_id for comparison ──
      // This broader query (no user filter) will return all rows visible under RLS.
      // If RLS restricts to own rows only, communityAnswers will equal user's own answers
      // and the comparison chart won't be shown (needs 2+ distinct user IDs).
      try {
        const { data: commSessions } = await supabase
          .from('exam_sessions')
          .select('id, user_id')
          .limit(200)

        const commSessionIds = (commSessions ?? []).map(s => s.id)
        const commUserMap = Object.fromEntries((commSessions ?? []).map(s => [s.id, s.user_id]))

        if (commSessionIds.length > 0) {
          const { data: commAns } = await supabase
            .from('exam_answers')
            .select('session_id, is_correct, question_id')
            .in('session_id', commSessionIds)

          if (commAns?.length) {
            const commQIds = [...new Set(commAns.map(a => a.question_id).filter(Boolean))]
            let commQMap = {}
            if (commQIds.length > 0) {
              const { data: commQs } = await supabase
                .from('question_bank')
                .select('id, specialty')
                .in('id', commQIds)
              commQMap = Object.fromEntries((commQs ?? []).map(q => [q.id, q]))
            }
            setCommunityAnswers(commAns.map(a => ({
              answer: a,
              question: commQMap[a.question_id] ?? null,
              userId: commUserMap[a.session_id] ?? null,
            })))
          } else {
            setCommunityAnswers([])
          }
        }
      } catch {
        // Community fetch is best-effort; fail silently
        setCommunityAnswers([])
      }
    } catch (err) {
      setDashError(err.message)
    } finally {
      setDashLoading(false)
    }
  }

  // ── Load session detail ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !sessionId) return
    loadSession(sessionId)
  }, [user, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSession = async (id) => {
    setSessLoading(true)
    setSessError(null)
    try {
      const { data: sess, error: sErr } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (sErr) throw sErr
      setSession(sess)

      const { data: answers, error: aErr } = await supabase
        .from('exam_answers')
        .select('*')
        .eq('session_id', id)
      if (aErr) throw aErr

      if (answers?.length) {
        const qIds = [...new Set(answers.map(a => a.question_id).filter(Boolean))]
        const { data: questions, error: qErr } = await supabase
          .from('question_bank')
          .select('id, vignette, question, options, correct_index, explanation, source, specialty, difficulty')
          .in('id', qIds)
        if (qErr) throw qErr
        const qMap = Object.fromEntries((questions ?? []).map(q => [q.id, q]))
        setAnswersWithQ(answers.map(a => ({ answer: a, question: qMap[a.question_id] ?? null })))
      } else {
        setAnswersWithQ([])
      }
    } catch (err) {
      setSessError(err.message)
    } finally {
      setSessLoading(false)
    }
  }

  // ── Dashboard derived data ────────────────────────────────────────────────

  const totalSimulacros = useMemo(
    () => sessions.filter(s => s.mode === 'simulacro').length,
    [sessions]
  )

  const totalQuestionsAnswered = useMemo(() => allAnswers.length, [allAnswers])

  const avgPct = useMemo(() => {
    if (sessions.length === 0) return 0
    const sum = sessions.reduce((acc, s) => {
      const p = s.total_questions > 0
        ? Math.round(s.correct_answers / s.total_questions * 100) : 0
      return acc + p
    }, 0)
    return Math.round(sum / sessions.length)
  }, [sessions])

  // Per-specialty stats across all sessions
  const specialtyMap = useMemo(() => {
    const map = new Map()
    allAnswers.forEach(({ answer, question }) => {
      const sp = question?.specialty
      if (!sp) return
      if (!map.has(sp)) map.set(sp, { correct: 0, total: 0 })
      const s = map.get(sp)
      s.total++
      if (answer.is_correct) s.correct++
    })
    return map
  }, [allAnswers])

  const bestSpecialty = useMemo(() => {
    let best = null, bestPct = -1
    specialtyMap.forEach((stats, sp) => {
      if (stats.total >= 3) {
        const p = Math.round(stats.correct / stats.total * 100)
        if (p > bestPct) { bestPct = p; best = { name: sp, pct: p } }
      }
    })
    return best
  }, [specialtyMap])

  // Radar data
  const radarData = useMemo(() =>
    ENARM_SPECIALTIES.map(sp => {
      const s = specialtyMap.get(sp)
      return {
        subject: SHORT_LABELS[sp] ?? sp,
        value: s && s.total > 0 ? Math.round(s.correct / s.total * 100) : 0,
        fullMark: 100,
      }
    }), [specialtyMap])

  const radarHasData = radarData.some(d => d.value > 0)

  // Line chart data — one point per session, lines per specialty
  const lineData = useMemo(() => {
    return sessions.map(sess => {
      const sessAnswers = allAnswers.filter(({ answer }) => answer.session_id === sess.id)
      const point = { date: fmtDate(sess.created_at, lang) }
      ENARM_SPECIALTIES.forEach(sp => {
        const items = sessAnswers.filter(({ question }) => question?.specialty === sp)
        if (items.length > 0) {
          point[sp] = Math.round(items.filter(({ answer }) => answer.is_correct).length / items.length * 100)
        }
      })
      return point
    })
  }, [sessions, allAnswers, lang])

  // Which specialties actually appear in line data
  const activeSpecialties = useMemo(() =>
    ENARM_SPECIALTIES.filter(sp => lineData.some(d => sp in d)),
    [lineData])

  // Missed questions — group by question_id, sort by miss count
  const missedQuestions = useMemo(() => {
    const map = new Map()
    allAnswers
      .filter(({ answer }) => !answer.is_correct && answer.question_id)
      .forEach(({ answer, question }) => {
        const id = answer.question_id
        if (!map.has(id)) map.set(id, { question, count: 0 })
        map.get(id).count++
      })
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [allAnswers])

  // Community comparison — uses community-wide data from the broader query.
  // Shows only when 2+ distinct user IDs are visible (i.e., when RLS allows multi-user data).
  const communityData = useMemo(() => {
    const distinctUsers = new Set(communityAnswers.map(a => a.userId).filter(Boolean))
    if (distinctUsers.size < 2) return null

    return ENARM_SPECIALTIES.map(sp => {
      // User's own average for this specialty
      const userStats = specialtyMap.get(sp)
      const userAvg = userStats && userStats.total > 0
        ? Math.round(userStats.correct / userStats.total * 100) : 0

      // Community average: all visible answers for this specialty (all users)
      const commItems = communityAnswers.filter(a => a.question?.specialty === sp)
      const commAvg = commItems.length > 0
        ? Math.round(commItems.filter(a => a.answer.is_correct).length / commItems.length * 100) : 0

      return { name: SHORT_LABELS[sp] ?? sp, user: userAvg, community: commAvg }
    })
  }, [communityAnswers, specialtyMap])

  // Recent sessions (last 5, descending)
  const recentSessions = useMemo(
    () => [...sessions].reverse().slice(0, 5),
    [sessions]
  )

  // Expanded recent session answers
  const expandedSessionAnswers = useMemo(() => {
    if (!expandedSession) return []
    return allAnswers.filter(({ answer }) => answer.session_id === expandedSession)
  }, [expandedSession, allAnswers])

  // ── Session detail derived ────────────────────────────────────────────────

  const totalQ   = answersWithQ.length
  const correctQ = answersWithQ.filter(({ answer }) => answer.is_correct).length
  const overallPct = totalQ > 0 ? Math.round(correctQ / totalQ * 100) : 0

  const specialtyStats = useMemo(() => {
    const map = new Map()
    answersWithQ.forEach(({ answer, question }) => {
      const sp = question?.specialty || (lang === 'ES' ? 'Sin especialidad' : 'No specialty')
      if (!map.has(sp)) map.set(sp, { correct: 0, total: 0 })
      const s = map.get(sp)
      s.total++
      if (answer.is_correct) s.correct++
    })
    return Array.from(map.entries())
      .map(([name, stats]) => ({
        name, ...stats,
        pct: stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [answersWithQ, lang])

  // ─── RENDER ────────────────────────────────────────────────────────────────

  // Session detail view
  if (sessionId) {
    if (sessLoading || dashLoading) {
      return (
        <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <Loader2 size={36} className="animate-spin text-accent-blue" />
          </div>
        </AppLayout>
      )
    }
    if (sessError) {
      return (
        <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
          <div className="max-w-xl mx-auto text-center py-12 space-y-4">
            <AlertTriangle size={40} className="text-error mx-auto" />
            <p className="text-error text-sm">{sessError}</p>
            <Link to="/results" className="text-accent-blue text-sm hover:underline">
              {lang === 'ES' ? 'Volver al dashboard' : 'Back to dashboard'}
            </Link>
          </div>
        </AppLayout>
      )
    }

    const sessModeLbl =
      session?.mode === 'simulacro' ? '🏆 Simulacro ENARM' :
      session?.mode === 'thematic'  ? `🎯 ${session?.topic || 'Temático'}` :
      '📝 Examen Estándar'

    return (
      <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs text-gray-500">{sessModeLbl}</span>
              {session?.created_at && (
                <span className="text-xs text-gray-600">
                  {new Date(session.created_at).toLocaleDateString(
                    lang === 'ES' ? 'es-MX' : 'en-US',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                  )}
                </span>
              )}
            </div>
            <h2 className="font-heading font-bold text-2xl text-white">
              {lang === 'ES' ? 'Resultados del examen' : 'Exam results'}
            </h2>
          </div>

          {/* Score card */}
          <div className="bg-surface border border-gray-800 rounded-2xl p-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {lang === 'ES' ? 'Puntuación total' : 'Overall score'}
              </p>
              <p className="font-heading font-bold text-4xl text-white">
                {correctQ}<span className="text-gray-500 text-2xl font-normal"> / {totalQ}</span>
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {lang === 'ES' ? `${totalQ - correctQ} incorrectas` : `${totalQ - correctQ} incorrect`}
              </p>
            </div>
            <ScoreRing pct={overallPct} />
          </div>

          {/* Specialty breakdown */}
          {specialtyStats.length > 0 && (
            <SectionCard title={lang === 'ES' ? 'Resultados por área ENARM' : 'Results by ENARM area'}>
              <div className="space-y-3">
                {specialtyStats.map(({ name, correct, total, pct }) => (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={pct < 60 ? 'text-error font-medium' : 'text-gray-300'}>{name}</span>
                      <span className={`text-xs ${pct < 60 ? 'text-error' : 'text-gray-500'}`}>
                        {correct}/{total} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          pct < 60 ? 'bg-error' : pct >= 80 ? 'bg-success' : 'bg-warning'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Detailed review */}
          {answersWithQ.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {lang === 'ES' ? 'Revisión detallada' : 'Detailed review'}
              </h3>
              {answersWithQ.map(({ answer, question }, i) => {
                const isExpanded = expandedIdx === i
                const isCorrect  = answer.is_correct
                return (
                  <div
                    key={answer.id ?? i}
                    className={`bg-surface border rounded-2xl overflow-hidden ${
                      isCorrect ? 'border-success/20' : 'border-error/20'
                    }`}
                  >
                    <button
                      className="w-full flex items-start gap-3 px-4 py-3 text-left"
                      onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    >
                      <span className={`mt-0.5 shrink-0 ${isCorrect ? 'text-success' : 'text-error'}`}>
                        {isCorrect ? <CheckCircle size={16} /> : <X size={16} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 line-clamp-2">
                          {question?.question || (lang === 'ES' ? '(Pregunta eliminada)' : '(Question deleted)')}
                        </p>
                        {question?.specialty && (
                          <span className="text-xs text-gray-500 mt-0.5 block">{question.specialty}</span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-600 shrink-0 mt-0.5" /> : <ChevronDown size={14} className="text-gray-600 shrink-0 mt-0.5" />}
                    </button>
                    {isExpanded && question && (
                      <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                        {question.vignette && (
                          <p className="text-gray-400 text-sm leading-relaxed pt-3">{question.vignette}</p>
                        )}
                        <p className="text-white text-sm font-medium">{question.question}</p>
                        <div className="space-y-1.5">
                          {(question.options ?? []).map((opt, oi) => {
                            let style = 'border-gray-800 text-gray-500'
                            if (oi === question.correct_index)
                              style = 'border-success/30 bg-success/10 text-success'
                            else if (oi === answer.selected_index)
                              style = 'border-error/30 bg-error/10 text-error'
                            return (
                              <div key={oi} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${style}`}>
                                {oi === question.correct_index && <CheckCircle size={12} className="shrink-0 mt-0.5" />}
                                {oi === answer.selected_index && oi !== question.correct_index && <X size={12} className="shrink-0 mt-0.5" />}
                                <span>{opt}</span>
                              </div>
                            )
                          })}
                        </div>
                        {question.explanation && (
                          <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-3 py-2.5">
                            <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1">
                              {lang === 'ES' ? 'Explicación' : 'Explanation'}
                            </p>
                            <p className="text-gray-300 text-xs leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                        {question.source && (
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">{lang === 'ES' ? 'Fuente:' : 'Source:'}</span>{' '}
                            {question.source}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pb-4">
            <Link to="/exam" className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm">
              <Target size={14} />{lang === 'ES' ? 'Nuevo examen' : 'New exam'}
            </Link>
            <Link to="/results" className="flex items-center gap-2 px-5 py-2.5 bg-background border border-gray-700 hover:border-gray-600 text-gray-300 font-medium rounded-xl text-sm">
              <BarChart2 size={14} />{lang === 'ES' ? 'Ver dashboard' : 'View dashboard'}
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ─── DASHBOARD VIEW ────────────────────────────────────────────────────────

  if (dashLoading) {
    return (
      <AppLayout title={lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 size={36} className="animate-spin text-accent-blue" />
        </div>
      </AppLayout>
    )
  }

  // Empty state
  if (!dashLoading && sessions.length === 0) {
    return (
      <AppLayout title={lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}>
        <div className="max-w-xl mx-auto text-center py-20 space-y-5">
          <div className="w-20 h-20 bg-accent-blue/10 rounded-full flex items-center justify-center mx-auto">
            <BarChart2 size={36} className="text-accent-blue" />
          </div>
          <h2 className="font-heading font-bold text-xl text-white">
            {lang === 'ES' ? 'Aún no tienes simulacros' : 'No exams yet'}
          </h2>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            {lang === 'ES'
              ? '¡Empieza tu primer examen para ver tus estadísticas aquí!'
              : 'Take your first exam to see your analytics here!'}
          </p>
          <Link
            to="/exam"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-blue hover:opacity-90 text-white font-semibold rounded-xl text-sm"
          >
            <Target size={16} />
            {lang === 'ES' ? '¡Empieza tu primer examen!' : 'Start your first exam!'}
          </Link>
          {dashError && (
            <p className="text-error text-xs">{dashError}</p>
          )}
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title={lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Page header + time filter ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold text-2xl text-white">
              {lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}
            </h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {lang === 'ES' ? 'Analiza tu progreso en el ENARM' : 'Track your ENARM progress'}
            </p>
          </div>
          <div className="flex gap-1 bg-surface border border-gray-800 rounded-xl p-1">
            {[
              { key: 'week',  label: lang === 'ES' ? 'Semana' : 'Week' },
              { key: 'month', label: lang === 'ES' ? 'Mes'    : 'Month' },
              { key: 'all',   label: lang === 'ES' ? 'Todo'   : 'All' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeFilter(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  timeFilter === key
                    ? 'bg-accent-blue text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 1. Summary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: Trophy,
              label: lang === 'ES' ? 'Simulacros realizados' : 'Exams taken',
              value: totalSimulacros,
              sub: lang === 'ES' ? `${sessions.length} sesiones` : `${sessions.length} sessions`,
              color: 'text-warning',
              bg: 'bg-warning/10',
            },
            {
              icon: TrendingUp,
              label: lang === 'ES' ? 'Promedio general' : 'Overall average',
              value: `${avgPct}%`,
              sub: avgPct >= 70
                ? (lang === 'ES' ? '¡Por encima del umbral!' : 'Above threshold!')
                : (lang === 'ES' ? 'Umbral de aprobación: 70%' : 'Pass threshold: 70%'),
              color: avgPct >= 70 ? 'text-success' : avgPct >= 50 ? 'text-warning' : 'text-error',
              bg: avgPct >= 70 ? 'bg-success/10' : avgPct >= 50 ? 'bg-warning/10' : 'bg-error/10',
            },
            {
              icon: Star,
              label: lang === 'ES' ? 'Mejor especialidad' : 'Best specialty',
              value: bestSpecialty ? `${bestSpecialty.pct}%` : '—',
              sub: bestSpecialty?.name ?? (lang === 'ES' ? 'Sin datos suficientes' : 'Not enough data'),
              color: 'text-accent-cyan',
              bg: 'bg-accent-cyan/10',
            },
            {
              icon: BookOpen,
              label: lang === 'ES' ? 'Preguntas respondidas' : 'Questions answered',
              value: totalQuestionsAnswered,
              sub: lang === 'ES' ? 'en total' : 'total',
              color: 'text-accent-blue',
              bg: 'bg-accent-blue/10',
            },
          ].map(({ icon: Icon, label, value, sub, color, bg }) => (
            <div key={label} className="bg-surface border border-gray-800 rounded-2xl p-4 space-y-2">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={18} className={color} />
              </div>
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
              <p className={`font-heading font-bold text-2xl ${color}`}>{value}</p>
              <p className="text-xs text-gray-600">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── 2. Radar + Line charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Radar */}
          <SectionCard title={lang === 'ES' ? 'Rendimiento por área ENARM' : 'Performance by ENARM area'}>
            {radarHasData ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} background={CHART_BG}>
                  <PolarGrid stroke={CHART_GRID} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: CHART_LABEL, fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: CHART_LABEL, fontSize: 10 }}
                    axisLine={false}
                  />
                  <Radar
                    name={lang === 'ES' ? 'Tu rendimiento' : 'Your performance'}
                    dataKey="value"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                  <Tooltip content={<DarkTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                {lang === 'ES' ? 'Sin datos suficientes' : 'Not enough data yet'}
              </div>
            )}
          </SectionCard>

          {/* Line chart */}
          <SectionCard title={lang === 'ES' ? 'Progreso en el tiempo' : 'Progress over time'}>
            {sessions.length >= 2 && activeSpecialties.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={lineData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: CHART_LABEL, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: CHART_LABEL, fontSize: 11 }} />
                    <Tooltip content={<DarkTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: CHART_LABEL, paddingTop: 6 }}
                      onClick={e => {
                        setHiddenSpecialties(prev => {
                          const next = new Set(prev)
                          next.has(e.dataKey) ? next.delete(e.dataKey) : next.add(e.dataKey)
                          return next
                        })
                      }}
                    />
                    {activeSpecialties.map((sp, i) => (
                      <Line
                        key={sp}
                        type="monotone"
                        dataKey={sp}
                        name={SHORT_LABELS[sp] ?? sp}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        hide={hiddenSpecialties.has(sp)}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-600 text-center mt-1">
                  {lang === 'ES' ? 'Haz clic en la leyenda para ocultar/mostrar áreas' : 'Click legend to toggle areas'}
                </p>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                {lang === 'ES' ? 'Se necesitan al menos 2 sesiones' : 'Need at least 2 sessions'}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── 3. Community comparison ── */}
        {communityData && (
          <SectionCard title={lang === 'ES' ? '% Aciertos vs promedio de la comunidad' : '% Correct vs community average'}>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-sm bg-accent-blue inline-block" />
                <span className="text-gray-400">{lang === 'ES' ? 'Tú' : 'You'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-sm bg-gray-500 inline-block" />
                <span className="text-gray-400">{lang === 'ES' ? 'Comunidad' : 'Community'}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={communityData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART_LABEL, fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={72} tick={{ fill: CHART_LABEL, fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="user" name={lang === 'ES' ? 'Tú' : 'You'} fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={8} />
                <Bar dataKey="community" name={lang === 'ES' ? 'Comunidad' : 'Community'} fill="#4b5563" radius={[0, 4, 4, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* ── 4. Most missed questions ── */}
        {missedQuestions.length > 0 && (
          <SectionCard title={lang === 'ES' ? 'Preguntas más falladas (Top 10)' : 'Most missed questions (Top 10)'}>
            <div className="space-y-2">
              {missedQuestions.map(({ question, count }, i) => {
                const isExpanded = expandedMissed === i
                return (
                  <div key={question?.id ?? i} className="border border-gray-800 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedMissed(isExpanded ? null : i)}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-error/15 text-error text-xs font-bold shrink-0 mt-0.5">
                        {count}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 line-clamp-2">
                          {question?.question ?? (lang === 'ES' ? '(Pregunta eliminada)' : '(Question deleted)')}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {question?.specialty && (
                            <span className="text-xs text-gray-500">{question.specialty}</span>
                          )}
                          {question?.difficulty != null && (
                            <span className="text-xs text-warning/70">
                              {difficultyStars(question.difficulty)}
                            </span>
                          )}
                          <span className="text-xs text-error/70">
                            {count}× {lang === 'ES' ? 'fallida' : 'missed'}
                          </span>
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={14} className="text-gray-600 shrink-0 mt-1" />
                        : <ChevronDown size={14} className="text-gray-600 shrink-0 mt-1" />}
                    </button>
                    {isExpanded && question && (
                      <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                        {question.vignette && (
                          <p className="text-gray-400 text-sm leading-relaxed pt-3">{question.vignette}</p>
                        )}
                        <p className="text-white text-sm font-medium">{question.question}</p>
                        <div className="space-y-1.5">
                          {(question.options ?? []).map((opt, oi) => (
                            <div
                              key={oi}
                              className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                                oi === question.correct_index
                                  ? 'border-success/30 bg-success/10 text-success'
                                  : 'border-gray-800 text-gray-500'
                              }`}
                            >
                              {oi === question.correct_index && <CheckCircle size={12} className="shrink-0 mt-0.5" />}
                              <span>{opt}</span>
                            </div>
                          ))}
                        </div>
                        {question.explanation && (
                          <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-3 py-2.5">
                            <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1">
                              {lang === 'ES' ? 'Explicación' : 'Explanation'}
                            </p>
                            <p className="text-gray-300 text-xs leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* ── 5. Recent sessions ── */}
        {recentSessions.length > 0 && (
          <SectionCard title={lang === 'ES' ? 'Sesiones recientes' : 'Recent sessions'}>
            <div className="space-y-2">
              {recentSessions.map(s => {
                const pct = s.total_questions > 0
                  ? Math.round(s.correct_answers / s.total_questions * 100) : 0
                const pctColor = pct >= 70 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-error'
                const isExpanded = expandedSession === s.id
                const sessAnswers = isExpanded ? expandedSessionAnswers : []

                return (
                  <div key={s.id} className="border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                        onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${modeBadgeClass(s.mode)}`}>
                              {modeLabel(s.mode, s.topic)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(s.created_at).toLocaleDateString(
                                lang === 'ES' ? 'es-MX' : 'en-US',
                                { day: 'numeric', month: 'short', year: 'numeric' }
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {s.correct_answers} / {s.total_questions} {lang === 'ES' ? 'correctas' : 'correct'}
                          </p>
                        </div>
                        <span className={`font-heading font-bold text-lg shrink-0 ${pctColor}`}>{pct}%</span>
                        {isExpanded
                          ? <ChevronUp size={14} className="text-gray-600 shrink-0" />
                          : <ChevronDown size={14} className="text-gray-600 shrink-0" />}
                      </button>
                      <Link
                        to={`/results?session=${s.id}`}
                        className="shrink-0 px-3 py-1 text-xs bg-accent-blue/10 border border-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/20 transition-colors"
                      >
                        {lang === 'ES' ? 'Ver detalle' : 'Details'}
                      </Link>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-800 px-4 py-3 space-y-1.5">
                        {sessAnswers.length === 0 ? (
                          <p className="text-gray-600 text-xs">
                            {lang === 'ES' ? 'Sin respuestas registradas.' : 'No answers recorded.'}
                          </p>
                        ) : (
                          sessAnswers.slice(0, 15).map(({ answer, question }, qi) => (
                            <div key={answer.id ?? qi} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className={`shrink-0 mt-0.5 ${answer.is_correct ? 'text-success' : 'text-error'}`}>
                                {answer.is_correct ? <CheckCircle size={12} /> : <X size={12} />}
                              </span>
                              <span className="line-clamp-1">
                                {question?.question ?? (lang === 'ES' ? '(eliminada)' : '(deleted)')}
                              </span>
                            </div>
                          ))
                        )}
                        {sessAnswers.length > 15 && (
                          <Link to={`/results?session=${s.id}`} className="text-accent-blue text-xs hover:underline">
                            {lang === 'ES' ? `Ver las ${sessAnswers.length} respuestas →` : `See all ${sessAnswers.length} answers →`}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {sessions.length > 5 && (
                <p className="text-xs text-gray-600 text-center pt-1">
                  {lang === 'ES'
                    ? `Mostrando las 5 sesiones más recientes de ${sessions.length} totales.`
                    : `Showing the 5 most recent of ${sessions.length} total sessions.`}
                </p>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── CTA ── */}
        <div className="flex flex-wrap gap-3 pb-4">
          <Link
            to="/exam"
            className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
          >
            <Target size={14} />
            {lang === 'ES' ? 'Nuevo examen' : 'New exam'}
          </Link>
          <Link
            to="/study"
            className="flex items-center gap-2 px-5 py-2.5 bg-background border border-gray-700 hover:border-gray-600 text-gray-300 font-medium rounded-xl text-sm"
          >
            <FileText size={14} />
            {lang === 'ES' ? 'Estudio temático' : 'Thematic study'}
          </Link>
        </div>

      </div>
    </AppLayout>
  )
}
