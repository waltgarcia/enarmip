import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BarChart2, CheckCircle, X, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Target, Trophy,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENARM_SPECIALTIES = [
  'Medicina Interna',
  'Pediatría',
  'Ginecología y Obstetricia',
  'Cirugía General',
  'Medicina Familiar',
  'Urgencias',
  'Salud Pública',
]

function ScoreRing({ pct }) {
  const color =
    pct >= 70 ? '#22c55e' :
    pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center border-4 shrink-0"
      style={{ borderColor: color }}
    >
      <span className="font-heading font-bold text-xl text-white">{pct}%</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Results() {
  const { lang } = useLang()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')

  const [loading, setLoading] = useState(!!sessionId)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [answersWithQ, setAnswersWithQ] = useState([]) // [{answer, question}]
  const [recentSessions, setRecentSessions] = useState([])
  const [expandedIdx, setExpandedIdx] = useState(null)

  // ── Load session data ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    if (sessionId) {
      loadSession(sessionId)
    } else {
      loadRecentSessions()
    }
  }, [user, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSession = async (id) => {
    setLoading(true)
    setError(null)
    try {
      // Fetch session
      const { data: sess, error: sErr } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (sErr) throw sErr
      setSession(sess)

      // Fetch answers + question details
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
        const merged = answers.map(a => ({
          answer: a,
          question: qMap[a.question_id] ?? null,
        }))
        setAnswersWithQ(merged)
      } else {
        setAnswersWithQ([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadRecentSessions = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setRecentSessions(data ?? [])
    } catch {
      // fail silently for dashboard
    } finally {
      setLoading(false)
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalQ = answersWithQ.length
  const correctQ = answersWithQ.filter(({ answer }) => answer.is_correct).length
  const overallPct = totalQ > 0 ? Math.round(correctQ / totalQ * 100) : 0

  // By specialty
  const specialtyStats = (() => {
    const map = new Map()
    answersWithQ.forEach(({ answer, question }) => {
      const sp = question?.specialty || (lang === 'ES' ? 'Sin especialidad' : 'No specialty')
      if (!map.has(sp)) map.set(sp, { correct: 0, total: 0 })
      const s = map.get(sp)
      s.total++
      if (answer.is_correct) s.correct++
    })
    return Array.from(map.entries()).map(([name, stats]) => ({
      name,
      ...stats,
      pct: stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0,
    })).sort((a, b) => b.total - a.total)
  })()

  // Community average (placeholder — would need aggregate data from server)
  // We show this section only when we have enough data
  const communityAvg = null // In production: fetch avg from exam_sessions aggregate

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 size={36} className="animate-spin text-accent-blue" />
          <p className="text-gray-400 text-sm">
            {lang === 'ES' ? 'Cargando resultados...' : 'Loading results...'}
          </p>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
        <div className="max-w-xl mx-auto text-center py-12 space-y-4">
          <AlertTriangle size={40} className="text-error mx-auto" />
          <p className="text-error text-sm">{error}</p>
          <Link to="/exam" className="inline-flex items-center gap-2 text-accent-blue text-sm hover:underline">
            {lang === 'ES' ? 'Volver al examen' : 'Back to exam'}
          </Link>
        </div>
      </AppLayout>
    )
  }

  // ── Dashboard (no session ID) ──────────────────────────────────────────────

  if (!sessionId) {
    return (
      <AppLayout title={lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="font-heading font-bold text-2xl text-white">
              {lang === 'ES' ? 'Dashboard de Rendimiento' : 'Performance Dashboard'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {lang === 'ES' ? 'Historial de sesiones recientes.' : 'Recent session history.'}
            </p>
          </div>

          {recentSessions.length === 0 ? (
            <div className="bg-surface border border-gray-800 rounded-2xl p-8 text-center">
              <BarChart2 size={36} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">
                {lang === 'ES'
                  ? 'Aún no has realizado ningún examen.'
                  : "You haven't taken any exams yet."}
              </p>
              <Link
                to="/exam"
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm"
              >
                {lang === 'ES' ? 'Ir al simulador' : 'Go to simulator'}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.map(s => {
                const pct = s.total_questions > 0
                  ? Math.round(s.correct_answers / s.total_questions * 100) : 0
                const color = pct >= 70 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-error'
                return (
                  <Link
                    key={s.id}
                    to={`/results?session=${s.id}`}
                    className="flex items-center justify-between bg-surface border border-gray-800 hover:border-gray-700 rounded-2xl px-5 py-4 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          s.mode === 'simulacro'
                            ? 'border-warning/30 bg-warning/10 text-warning'
                            : s.mode === 'thematic'
                            ? 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan'
                            : 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue'
                        }`}>
                          {s.mode === 'simulacro' ? '🏆 Simulacro' :
                           s.mode === 'thematic' ? `🎯 ${s.topic || 'Temático'}` :
                           '📝 Estándar'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(s.created_at).toLocaleDateString(
                            lang === 'ES' ? 'es-MX' : 'en-US',
                            { day: 'numeric', month: 'short', year: 'numeric' }
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {s.correct_answers} / {s.total_questions} {lang === 'ES' ? 'correctas' : 'correct'}
                      </p>
                    </div>
                    <span className={`font-heading font-bold text-xl ${color}`}>{pct}%</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </AppLayout>
    )
  }

  // ── Session results view ───────────────────────────────────────────────────

  const modeLabel =
    session?.mode === 'simulacro' ? '🏆 Simulacro ENARM' :
    session?.mode === 'thematic' ? `🎯 ${session?.topic || 'Temático'}` :
    '📝 Examen Estándar'

  return (
    <AppLayout title={lang === 'ES' ? 'Resultados' : 'Results'}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-medium text-gray-500">{modeLabel}</span>
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

        {/* Overall score */}
        <div className="bg-surface border border-gray-800 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {lang === 'ES' ? 'Puntuación total' : 'Overall score'}
            </p>
            <p className="font-heading font-bold text-4xl text-white">
              {correctQ}
              <span className="text-gray-500 text-2xl font-normal"> / {totalQ}</span>
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {lang === 'ES'
                ? `${totalQ - correctQ} incorrectas`
                : `${totalQ - correctQ} incorrect`}
            </p>
          </div>
          <ScoreRing pct={overallPct} />
        </div>

        {/* Community comparison */}
        {communityAvg !== null && (
          <div className="bg-surface border border-gray-800 rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {lang === 'ES' ? 'Comparativa comunitaria' : 'Community comparison'}
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-300">
                {lang === 'ES' ? 'Tu puntaje:' : 'Your score:'}{' '}
                <span className="font-bold text-white">{overallPct}%</span>
              </span>
              <span className="text-gray-600">vs</span>
              <span className="text-gray-300">
                {lang === 'ES' ? 'Promedio:' : 'Average:'}{' '}
                <span className="font-bold text-accent-cyan">{communityAvg}%</span>
              </span>
            </div>
          </div>
        )}

        {/* Breakdown by specialty */}
        {specialtyStats.length > 0 && (
          <section className="bg-surface border border-gray-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {lang === 'ES' ? 'Resultados por área ENARM' : 'Results by ENARM area'}
            </h3>
            <div className="space-y-3">
              {specialtyStats.map(({ name, correct, total, pct }) => (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={pct < 60 ? 'text-error font-medium' : 'text-gray-300'}>
                      {name}
                    </span>
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
          </section>
        )}

        {/* Detailed review */}
        {answersWithQ.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {lang === 'ES' ? 'Revisión detallada' : 'Detailed review'}
            </h3>
            {answersWithQ.map(({ answer, question }, i) => {
              const isExpanded = expandedIdx === i
              const isCorrect = answer.is_correct
              return (
                <div
                  key={answer.id ?? i}
                  className={`bg-surface border rounded-2xl overflow-hidden transition-colors ${
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
                    <span className="text-gray-600 shrink-0 mt-0.5">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
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
                            <div
                              key={oi}
                              className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${style}`}
                            >
                              {oi === question.correct_index && (
                                <CheckCircle size={12} className="shrink-0 mt-0.5" />
                              )}
                              {oi === answer.selected_index && oi !== question.correct_index && (
                                <X size={12} className="shrink-0 mt-0.5" />
                              )}
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

        {/* Action buttons */}
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
            <Trophy size={14} />
            {lang === 'ES' ? 'Estudio temático' : 'Thematic study'}
          </Link>
          <Link
            to="/results"
            className="flex items-center gap-2 px-5 py-2.5 bg-background border border-gray-700 hover:border-gray-600 text-gray-300 font-medium rounded-xl text-sm"
          >
            <BarChart2 size={14} />
            {lang === 'ES' ? 'Ver historial' : 'View history'}
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}
