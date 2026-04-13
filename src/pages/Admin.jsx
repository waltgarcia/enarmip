import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useDebounce } from '../hooks/useDebounce'
import {
  Check, X, Edit2, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Search, Filter, Trash2, Eye,
  ShieldCheck, Users, BookOpen, AlertCircle, RefreshCw,
  CheckSquare, Square, MoreHorizontal, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIFFICULTIES = ['', '1', '2', '3']
const SOURCE_TYPES  = ['', 'guias', 'consenso', 'evidencia', 'ia']
const ROLES         = ['student', 'admin', 'institution']

function Badge({ label, variant = 'blue' }) {
  const colors = {
    blue:    'bg-accent-blue/10 border-accent-blue/20 text-accent-blue',
    cyan:    'bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan',
    green:   'bg-success/10 border-success/20 text-success',
    yellow:  'bg-warning/10 border-warning/20 text-warning',
    red:     'bg-error/10 border-error/20 text-error',
    gray:    'bg-gray-800 border-gray-700 text-gray-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[variant] ?? colors.gray}`}>
      {label}
    </span>
  )
}

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

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ question, onClose, onSaved }) {
  const [form, setForm] = useState({
    vignette:      question.vignette ?? '',
    question:      question.question ?? '',
    options:       question.options ?? ['', '', '', '', ''],
    correct_index: question.correct_index ?? 0,
    explanation:   question.explanation ?? '',
    source:        question.source ?? '',
    specialty:     question.specialty ?? '',
    area_enarm:    question.area_enarm ?? '',
    difficulty:    question.difficulty ?? 1,
    conflict_note: question.conflict_note ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const setOpt = (i, v) => setForm(f => {
    const opts = [...f.options]
    opts[i] = v
    return { ...f, options: opts }
  })

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase
        .from('question_bank')
        .update({ ...form, approved: true })
        .eq('id', question.id)
      if (err) throw err
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-background border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue'
  const labelCls = 'text-xs font-medium text-gray-400 mb-1 block'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 sticky top-0 bg-surface z-10">
          <h3 className="font-heading font-bold text-white">Editar Pregunta #{question.id}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Viñeta clínica</label>
            <textarea rows={4} className={inputCls} value={form.vignette} onChange={e => setForm(f => ({ ...f, vignette: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Pregunta</label>
            <textarea rows={2} className={inputCls} value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Opciones (marca la correcta)</label>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, correct_index: i }))}
                    className={`w-6 h-6 rounded-full border-2 shrink-0 transition-colors ${form.correct_index === i ? 'border-success bg-success/20' : 'border-gray-700'}`}
                  >
                    {form.correct_index === i && <Check size={12} className="text-success mx-auto" />}
                  </button>
                  <input className={inputCls} value={opt} onChange={e => setOpt(i, e.target.value)} placeholder={`Opción ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Explicación</label>
            <textarea rows={3} className={inputCls} value={form.explanation} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Especialidad</label>
              <input className={inputCls} value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Área ENARM</label>
              <input className={inputCls} value={form.area_enarm} onChange={e => setForm(f => ({ ...f, area_enarm: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Fuente</label>
              <input className={inputCls} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Dificultad (1-3)</label>
              <select className={inputCls} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: Number(e.target.value) }))}>
                <option value={1}>1 – Fácil</option>
                <option value={2}>2 – Media</option>
                <option value={3}>3 – Difícil</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Nota de conflicto (opcional)</label>
            <input className={inputCls} value={form.conflict_note} onChange={e => setForm(f => ({ ...f, conflict_note: e.target.value }))} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-xl px-3 py-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-3 sticky bottom-0 bg-surface">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:opacity-90 text-white font-medium rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar y Aprobar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Question Card (Pending Queue) ────────────────────────────────────────────

function PendingCard({ q, selected, onSelect, onApprove, onReject, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const date = q.created_at ? new Date(q.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="bg-surface border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <button onClick={onSelect} className="mt-0.5 shrink-0">
          {selected
            ? <CheckSquare size={18} className="text-accent-blue" />
            : <Square size={18} className="text-gray-600 hover:text-gray-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {q.specialty && <Badge label={q.specialty} variant="blue" />}
            {q.area_enarm && <Badge label={q.area_enarm} variant="cyan" />}
            {q.difficulty && <DifficultyDots d={q.difficulty} />}
            {q.source_type && <Badge label={q.source_type} variant="gray" />}
            <span className="text-xs text-gray-600 ml-auto">{date}</span>
          </div>
          <p className="text-sm text-gray-300 line-clamp-2">{q.vignette || q.question}</p>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-white shrink-0 ml-2">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
          {q.vignette && (
            <p className="text-xs text-gray-400 leading-relaxed">{q.vignette}</p>
          )}
          <p className="text-sm font-semibold text-white">{q.question}</p>
          <div className="space-y-1.5">
            {(q.options ?? []).map((opt, i) => (
              <div key={i} className={`flex items-start gap-2 px-3 py-1.5 rounded-xl text-xs border ${
                i === q.correct_index
                  ? 'border-success/30 bg-success/10 text-success font-medium'
                  : 'border-gray-800 text-gray-500'
              }`}>
                {i === q.correct_index && <Check size={12} className="shrink-0 mt-0.5" />}
                <span>{opt}</span>
              </div>
            ))}
          </div>
          {q.explanation && (
            <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400 leading-relaxed">{q.explanation}</p>
            </div>
          )}
          {q.conflict_note && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl px-3 py-2">
              <p className="text-xs text-warning">⚠️ {q.conflict_note}</p>
            </div>
          )}
          {q.source && <p className="text-xs text-gray-600">Fuente: {q.source}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800 bg-background/30">
        <button
          onClick={onApprove}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 text-success text-xs font-medium rounded-xl hover:bg-success/20 transition-colors"
        >
          <Check size={13} /> Aprobar
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 border border-error/20 text-error text-xs font-medium rounded-xl hover:bg-error/20 transition-colors"
        >
          <X size={13} /> Rechazar
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border border-warning/20 text-warning text-xs font-medium rounded-xl hover:bg-warning/20 transition-colors"
        >
          <Edit2 size={13} /> Editar
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Admin() {
  const { lang } = useLang()
  const { profile } = useAuth()

  // ── State ────────────────────────────────────────────────────────────────
  const [tab, setTab]                     = useState('pending')  // 'pending' | 'approved' | 'users'
  const [pending, setPending]             = useState([])
  const [approved, setApproved]           = useState([])
  const [users, setUsers]                 = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

  // Pending queue
  const [selected, setSelected]           = useState(new Set())
  const [editTarget, setEditTarget]       = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Approved bank
  const [searchRaw, setSearchRaw]         = useState('')
  const searchQ                           = useDebounce(searchRaw, 300)
  const [sortCol, setSortCol]             = useState('id')
  const [sortDir, setSortDir]             = useState('desc')
  const [filterSpec, setFilterSpec]       = useState('')
  const [filterArea, setFilterArea]       = useState('')
  const [filterDiff, setFilterDiff]       = useState('')
  const [filterSrc,  setFilterSrc]        = useState('')
  const [viewTarget, setViewTarget]       = useState(null)
  const [page, setPage]                   = useState(1)
  const PAGE_SIZE                         = 20

  // User management
  const [roleUpdating, setRoleUpdating]   = useState(null)

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pendRes, apprRes, usersRes] = await Promise.all([
        supabase.from('question_bank').select('*').eq('approved', false).order('created_at', { ascending: true }),
        supabase.from('question_bank').select('*').eq('approved', true).order('id'),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      ])
      if (pendRes.error) throw pendRes.error
      if (apprRes.error) throw apprRes.error
      if (usersRes.error) throw usersRes.error
      setPending(pendRes.data ?? [])
      setApproved(apprRes.data ?? [])
      setUsers(usersRes.data ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Actions ───────────────────────────────────────────────────────────────

  const approveOne = async (id) => {
    setActionLoading(true)
    await supabase.from('question_bank').update({ approved: true }).eq('id', id)
    setPending(p => p.filter(q => q.id !== id))
    setApproved(a => {
      const q = pending.find(x => x.id === id)
      return q ? [...a, { ...q, approved: true }] : a
    })
    setActionLoading(false)
  }

  const rejectOne = async (id) => {
    setActionLoading(true)
    await supabase.from('question_bank').delete().eq('id', id)
    setPending(p => p.filter(q => q.id !== id))
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
    setActionLoading(false)
  }

  const approveAll = async () => {
    if (pending.length === 0) return
    setActionLoading(true)
    const ids = pending.map(q => q.id)
    await supabase.from('question_bank').update({ approved: true }).in('id', ids)
    setApproved(a => [...a, ...pending.map(q => ({ ...q, approved: true }))])
    setPending([])
    setSelected(new Set())
    setActionLoading(false)
  }

  const rejectSelected = async () => {
    if (selected.size === 0) return
    setActionLoading(true)
    const ids = [...selected]
    await supabase.from('question_bank').delete().in('id', ids)
    setPending(p => p.filter(q => !selected.has(q.id)))
    setSelected(new Set())
    setActionLoading(false)
  }

  const revokeApproval = async (id) => {
    await supabase.from('question_bank').update({ approved: false }).eq('id', id)
    const q = approved.find(x => x.id === id)
    setApproved(a => a.filter(x => x.id !== id))
    if (q) setPending(p => [{ ...q, approved: false }, ...p])
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const deleteApproved = async (id) => {
    if (deleteConfirmId !== id) { setDeleteConfirmId(id); return }
    setDeleteConfirmId(null)
    await supabase.from('question_bank').delete().eq('id', id)
    setApproved(a => a.filter(x => x.id !== id))
  }

  const updateRole = async (userId, role) => {
    setRoleUpdating(userId)
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x))
    setRoleUpdating(null)
  }

  // ── Toggle selection ───────────────────────────────────────────────────────

  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const toggleSelectAll = () => {
    if (selected.size === pending.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pending.map(q => q.id)))
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const allQuestions = useMemo(() => [...pending, ...approved], [pending, approved])
  const bySpecialty  = useMemo(() => {
    const map = {}
    allQuestions.forEach(q => {
      if (q.specialty) map[q.specialty] = (map[q.specialty] ?? 0) + 1
    })
    return Object.entries(map).map(([name, count]) => ({
      name: name.length > 12 ? name.slice(0, 11) + '…' : name,
      count,
    })).sort((a, b) => b.count - a.count)
  }, [allQuestions])
  const conflictCount = useMemo(
    () => allQuestions.filter(q => q.conflict_note).length,
    [allQuestions],
  )

  // ── Filtered + sorted approved bank ───────────────────────────────────────

  const filteredApproved = useMemo(() => {
    let rows = approved
    if (searchQ)    rows = rows.filter(q => (q.vignette + q.question + (q.topic ?? '')).toLowerCase().includes(searchQ.toLowerCase()))
    if (filterSpec) rows = rows.filter(q => q.specialty === filterSpec)
    if (filterArea) rows = rows.filter(q => q.area_enarm === filterArea)
    if (filterDiff) rows = rows.filter(q => String(q.difficulty) === filterDiff)
    if (filterSrc)  rows = rows.filter(q => q.source_type === filterSrc)

    rows = [...rows].sort((a, b) => {
      const va = a[sortCol] ?? ''
      const vb = b[sortCol] ?? ''
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [approved, searchQ, filterSpec, filterArea, filterDiff, filterSrc, sortCol, sortDir])

  // Reset to page 1 whenever filters / sort change
  useEffect(() => { setPage(1) }, [searchQ, filterSpec, filterArea, filterDiff, filterSrc, sortCol, sortDir])

  const totalPages   = Math.max(1, Math.ceil(filteredApproved.length / PAGE_SIZE))
  const pagedApproved = filteredApproved.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const approvedSpecialties = useMemo(() => [...new Set(approved.map(q => q.specialty).filter(Boolean))].sort(), [approved])
  const approvedAreas       = useMemo(() => [...new Set(approved.map(q => q.area_enarm).filter(Boolean))].sort(), [approved])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => sortCol === col
    ? (sortDir === 'asc' ? <ChevronUp size={12} className="inline ml-0.5" /> : <ChevronDown size={12} className="inline ml-0.5" />)
    : <MoreHorizontal size={12} className="inline ml-0.5 opacity-30" />

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout title={lang === 'ES' ? 'Admin' : 'Admin'}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 size={32} className="animate-spin text-accent-blue" />
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="Admin">
        <div className="max-w-lg mx-auto text-center py-12 space-y-4">
          <AlertTriangle size={36} className="text-error mx-auto" />
          <p className="text-error text-sm">{error}</p>
          <button onClick={loadAll} className="flex items-center gap-2 mx-auto text-accent-blue text-sm hover:underline">
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      </AppLayout>
    )
  }

  const inputCls = 'bg-surface border border-gray-700 rounded-xl text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-accent-blue'

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Admin">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Stats Banner ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface border border-gray-800 rounded-2xl p-4">
            <div className="w-9 h-9 bg-accent-blue/10 rounded-xl flex items-center justify-center mb-2">
              <BookOpen size={18} className="text-accent-blue" />
            </div>
            <p className="text-2xl font-heading font-bold text-white">{approved.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">{lang === 'ES' ? 'Preguntas aprobadas' : 'Approved questions'}</p>
          </div>
          <div className="bg-surface border border-gray-800 rounded-2xl p-4">
            <div className="w-9 h-9 bg-warning/10 rounded-xl flex items-center justify-center mb-2">
              <AlertCircle size={18} className="text-warning" />
            </div>
            <p className="text-2xl font-heading font-bold text-white">{pending.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">{lang === 'ES' ? 'Pendientes de revisión' : 'Pending review'}</p>
          </div>
          <div className="bg-surface border border-gray-800 rounded-2xl p-4">
            <div className="w-9 h-9 bg-error/10 rounded-xl flex items-center justify-center mb-2">
              <AlertTriangle size={18} className="text-error" />
            </div>
            <p className="text-2xl font-heading font-bold text-white">{conflictCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">{lang === 'ES' ? 'Con conflicto' : 'Conflicts flagged'}</p>
          </div>
          <div className="bg-surface border border-gray-800 rounded-2xl p-4">
            <div className="w-9 h-9 bg-success/10 rounded-xl flex items-center justify-center mb-2">
              <Users size={18} className="text-success" />
            </div>
            <p className="text-2xl font-heading font-bold text-white">{users.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">{lang === 'ES' ? 'Usuarios' : 'Users'}</p>
          </div>
        </div>

        {/* Specialty bar chart */}
        {bySpecialty.length > 0 && (
          <div className="bg-surface border border-gray-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {lang === 'ES' ? 'Preguntas por especialidad' : 'Questions by specialty'}
            </p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={bySpecialty} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#f1f5f9' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {bySpecialty.map((_, i) => (
                    <Cell key={i} fill="#3b82f6" fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Tab navigation ────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-surface border border-gray-800 p-1 rounded-2xl w-fit">
          {[
            { key: 'pending',  icon: AlertCircle, label: lang === 'ES' ? `Pendientes (${pending.length})` : `Pending (${pending.length})` },
            { key: 'approved', icon: ShieldCheck,  label: lang === 'ES' ? 'Banco aprobado' : 'Approved bank' },
            { key: 'users',    icon: Users,        label: lang === 'ES' ? 'Usuarios' : 'Users' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === key ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── PENDING QUEUE ─────────────────────────────────────────────── */}
        {tab === 'pending' && (
          <div className="space-y-4">
            {/* Bulk actions */}
            {pending.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 bg-surface border border-gray-800 rounded-2xl px-4 py-3">
                <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                  {selected.size === pending.length ? <CheckSquare size={14} className="text-accent-blue" /> : <Square size={14} />}
                  {lang === 'ES' ? 'Seleccionar todos' : 'Select all'}
                </button>
                <div className="w-px h-4 bg-gray-700" />
                <button
                  onClick={approveAll}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 text-success text-xs font-medium rounded-xl hover:bg-success/20 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {lang === 'ES' ? 'Aprobar todos' : 'Approve all'}
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={rejectSelected}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 border border-error/20 text-error text-xs font-medium rounded-xl hover:bg-error/20 disabled:opacity-50"
                  >
                    <X size={12} />
                    {lang === 'ES' ? `Rechazar seleccionados (${selected.size})` : `Reject selected (${selected.size})`}
                  </button>
                )}
              </div>
            )}

            {pending.length === 0 ? (
              <div className="text-center py-16">
                <Check size={36} className="text-success mx-auto mb-3" />
                <p className="text-white font-semibold">{lang === 'ES' ? 'Todo al día 🎉' : 'All caught up 🎉'}</p>
                <p className="text-gray-500 text-sm mt-1">{lang === 'ES' ? 'No hay casos pendientes de revisión.' : 'No pending cases.'}</p>
              </div>
            ) : (
              pending.map(q => (
                <PendingCard
                  key={q.id}
                  q={q}
                  selected={selected.has(q.id)}
                  onSelect={() => toggleSelect(q.id)}
                  onApprove={() => approveOne(q.id)}
                  onReject={() => rejectOne(q.id)}
                  onEdit={() => setEditTarget(q)}
                />
              ))
            )}
          </div>
        )}

        {/* ── APPROVED BANK ─────────────────────────────────────────────── */}
        {tab === 'approved' && (
          <div className="space-y-4">
            {/* Search + filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  className="bg-surface border border-gray-700 rounded-xl text-sm text-gray-300 pl-8 pr-3 py-2 w-56 focus:outline-none focus:border-accent-blue"
                  placeholder={lang === 'ES' ? 'Buscar...' : 'Search...'}
                  value={searchRaw}
                  onChange={e => setSearchRaw(e.target.value)}
                />
              </div>
              <Filter size={14} className="text-gray-500" />
              <select className={inputCls} value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
                <option value="">{lang === 'ES' ? 'Especialidad' : 'Specialty'}</option>
                {approvedSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={inputCls} value={filterArea} onChange={e => setFilterArea(e.target.value)}>
                <option value="">{lang === 'ES' ? 'Área' : 'Area'}</option>
                {approvedAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className={inputCls} value={filterDiff} onChange={e => setFilterDiff(e.target.value)}>
                <option value="">{lang === 'ES' ? 'Dificultad' : 'Difficulty'}</option>
                {DIFFICULTIES.filter(Boolean).map(d => <option key={d} value={d}>★{'★'.repeat(Number(d) - 1)}</option>)}
              </select>
              <select className={inputCls} value={filterSrc} onChange={e => setFilterSrc(e.target.value)}>
                <option value="">{lang === 'ES' ? 'Tipo fuente' : 'Source type'}</option>
                {SOURCE_TYPES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(searchRaw || filterSpec || filterArea || filterDiff || filterSrc) && (
                <button
                  className="text-xs text-gray-500 hover:text-error"
                  onClick={() => { setSearchRaw(''); setFilterSpec(''); setFilterArea(''); setFilterDiff(''); setFilterSrc('') }}
                >
                  {lang === 'ES' ? 'Limpiar' : 'Clear'}
                </button>
              )}
              <span className="ml-auto text-xs text-gray-500">{filteredApproved.length} {lang === 'ES' ? 'preguntas' : 'questions'}</span>
            </div>

            {/* Table */}
            <div className="bg-surface border border-gray-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      {[
                        { col: 'id',         label: 'ID' },
                        { col: 'vignette',   label: lang === 'ES' ? 'Vista previa' : 'Preview' },
                        { col: 'specialty',  label: lang === 'ES' ? 'Especialidad' : 'Specialty' },
                        { col: 'difficulty', label: lang === 'ES' ? 'Dificultad' : 'Difficulty' },
                        { col: 'source_type',label: lang === 'ES' ? 'Fuente' : 'Source' },
                        { col: 'conflict_note', label: lang === 'ES' ? 'Conflicto' : 'Conflict' },
                        { col: 'created_at', label: lang === 'ES' ? 'Fecha' : 'Date' },
                      ].map(({ col, label }) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left font-medium cursor-pointer hover:text-white select-none"
                          onClick={() => handleSort(col)}
                        >
                          {label} <SortIcon col={col} />
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left font-medium">{lang === 'ES' ? 'Acciones' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApproved.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-gray-600">
                          {lang === 'ES' ? 'Sin resultados.' : 'No results.'}
                        </td>
                      </tr>
                    ) : (
                      pagedApproved.map(q => (
                        <tr key={q.id} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-gray-500 font-mono">{q.id}</td>
                          <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{q.vignette || q.question || '—'}</td>
                          <td className="px-4 py-3">{q.specialty ? <Badge label={q.specialty} variant="blue" /> : '—'}</td>
                          <td className="px-4 py-3"><DifficultyDots d={q.difficulty} /></td>
                          <td className="px-4 py-3">{q.source_type ? <Badge label={q.source_type} variant="gray" /> : '—'}</td>
                          <td className="px-4 py-3">{q.conflict_note ? <Badge label="⚠️" variant="yellow" /> : '—'}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {q.created_at ? new Date(q.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setViewTarget(q)}
                                className="p-1 text-gray-500 hover:text-accent-blue transition-colors" title="Ver"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={() => setEditTarget(q)}
                                className="p-1 text-gray-500 hover:text-warning transition-colors" title="Editar"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => revokeApproval(q.id)}
                                className="p-1 text-gray-500 hover:text-warning transition-colors" title="Revocar aprobación"
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button
                                onClick={() => deleteApproved(q.id)}
                                className={`p-1 transition-colors ${deleteConfirmId === q.id ? 'text-error' : 'text-gray-500 hover:text-error'}`}
                                title={deleteConfirmId === q.id ? '¿Confirmar eliminación?' : 'Eliminar'}
                                onBlur={() => setDeleteConfirmId(null)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  {lang === 'ES'
                    ? `Página ${page} de ${totalPages} · ${filteredApproved.length} preguntas`
                    : `Page ${page} of ${totalPages} · ${filteredApproved.length} questions`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-white/5"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      p === '…'
                        ? <span key={`ellipsis-${i}`} className="px-1 text-gray-600 text-xs">…</span>
                        : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                              page === p
                                ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                                : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {p}
                          </button>
                        )
                    )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-white/5"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USERS ─────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="bg-surface border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="px-4 py-3 text-left font-medium">{lang === 'ES' ? 'Nombre' : 'Name'}</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Rol</th>
                    <th className="px-4 py-3 text-left font-medium">{lang === 'ES' ? 'Última actividad' : 'Last active'}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-600">
                        {lang === 'ES' ? 'Sin usuarios.' : 'No users.'}
                      </td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-300">
                          {u.full_name || u.name || '—'}
                          {u.id === profile?.id && <span className="ml-1.5 text-[10px] text-accent-blue">(tú)</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            className="bg-background border border-gray-700 rounded-lg text-xs text-gray-300 px-2 py-1 focus:outline-none focus:border-accent-blue"
                            value={u.role ?? 'student'}
                            disabled={roleUpdating === u.id}
                            onChange={e => updateRole(u.id, e.target.value)}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {roleUpdating === u.id && <Loader2 size={12} className="animate-spin inline ml-2 text-accent-blue" />}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {u.updated_at ? new Date(u.updated_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────── */}
      {editTarget && (
        <EditModal
          question={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            // Move from pending to approved list if it was pending
            const wasPending = pending.some(q => q.id === editTarget.id)
            if (wasPending) {
              setPending(p => p.filter(q => q.id !== editTarget.id))
            } else {
              setApproved(a => a.filter(q => q.id !== editTarget.id))
            }
            // Reload to get updated data
            loadAll()
          }}
        />
      )}

      {/* ── View Modal ──────────────────────────────────────────────────── */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-gray-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="font-heading font-bold text-white">Pregunta #{viewTarget.id}</h3>
              <button onClick={() => setViewTarget(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {viewTarget.vignette && <p className="text-sm text-gray-400 leading-relaxed">{viewTarget.vignette}</p>}
              <p className="text-sm font-semibold text-white">{viewTarget.question}</p>
              <div className="space-y-1.5">
                {(viewTarget.options ?? []).map((opt, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-1.5 rounded-xl text-xs border ${
                    i === viewTarget.correct_index
                      ? 'border-success/30 bg-success/10 text-success font-medium'
                      : 'border-gray-800 text-gray-500'
                  }`}>
                    {i === viewTarget.correct_index && <Check size={12} className="shrink-0 mt-0.5" />}
                    <span>{opt}</span>
                  </div>
                ))}
              </div>
              {viewTarget.explanation && (
                <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-300 leading-relaxed">{viewTarget.explanation}</p>
                </div>
              )}
              {viewTarget.conflict_note && (
                <div className="bg-warning/5 border border-warning/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-warning">⚠️ {viewTarget.conflict_note}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {viewTarget.specialty && <Badge label={viewTarget.specialty} variant="blue" />}
                {viewTarget.area_enarm && <Badge label={viewTarget.area_enarm} variant="cyan" />}
                {viewTarget.source_type && <Badge label={viewTarget.source_type} variant="gray" />}
                {viewTarget.difficulty && <DifficultyDots d={viewTarget.difficulty} />}
              </div>
              {viewTarget.source && <p className="text-xs text-gray-600">Fuente: {viewTarget.source}</p>}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
