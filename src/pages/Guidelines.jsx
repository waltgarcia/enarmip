import { useState, useEffect, useRef, useCallback } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { supabase, GUIDELINES_BUCKET } from '../lib/supabase'
import {
  Upload, FileText, Trash2, Search, Filter,
  CheckCircle, AlertCircle, Loader2, X, BookOpen,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────

const SPECIALTIES = [
  'Medicina Interna',
  'Pediatría',
  'Ginecología y Obstetricia',
  'Cirugía General',
  'Medicina Familiar',
  'Urgencias',
  'Salud Pública',
  'Otra',
]

const SPECIALTY_STYLES = {
  'Medicina Interna':           'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Pediatría':                  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Ginecología y Obstetricia':  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'Cirugía General':            'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Medicina Familiar':          'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'Urgencias':                  'bg-red-500/20 text-red-300 border-red-500/30',
  'Salud Pública':              'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Otra':                       'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const MAX_FILE_SIZE = 20 * 1024 * 1024  // 20 MB
const PDF_MAX_PAGES = 30
const PDF_MAX_CHARS = 15000
const PDF_WORKER_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fileBaseName(filename) {
  return filename.replace(/\.[^.]+$/, '')
}

async function extractPdfText(file) {
  const pdfjsLib = window.pdfjsLib
  if (!pdfjsLib) throw new Error('pdf.js no disponible')
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const maxPages = Math.min(pdf.numPages, PDF_MAX_PAGES)
  let text = ''

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    text += pageText + '\n'
    if (text.length >= PDF_MAX_CHARS) break
  }

  return text.slice(0, PDF_MAX_CHARS)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Guidelines() {
  const { lang } = useLang()
  const { user } = useAuth()
  const fileInputRef = useRef(null)

  // Upload flow state
  const [dragOver, setDragOver] = useState(false)
  const [phase, setPhase] = useState(null) // null | 'uploading' | 'extracting' | 'form' | 'saving'
  const [uploadedPath, setUploadedPath] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [form, setForm] = useState({ name: '', specialty: '', source: 'community', isPublic: true })
  const [uploadError, setUploadError] = useState(null)

  // List state
  const [guidelines, setGuidelines] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterSource, setFilterSource] = useState('all') // 'all' | 'mine' | 'community'
  const [search, setSearch] = useState('')

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ─── Fetch guidelines ─────────────────────────────────────────────────────

  const loadGuidelines = useCallback(async () => {
    if (!user) return
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('guidelines')
        .select('*, profiles(full_name)')
        .or(`is_public.eq.true,uploaded_by.eq.${user.id}`)
        .order('created_at', { ascending: false })
      if (error) throw error
      setGuidelines(data ?? [])
    } catch (err) {
      console.error('Error loading guidelines:', err)
    } finally {
      setListLoading(false)
    }
  }, [user])

  useEffect(() => { loadGuidelines() }, [loadGuidelines])

  // ─── Upload + extract flow ────────────────────────────────────────────────

  const processFile = async (file) => {
    setUploadError(null)

    if (file.type !== 'application/pdf') {
      setUploadError(lang === 'ES' ? 'Solo se aceptan archivos PDF.' : 'Only PDF files are accepted.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(lang === 'ES' ? 'El archivo excede el límite de 20 MB.' : 'File exceeds the 20 MB limit.')
      return
    }

    // 1. Upload to storage
    setPhase('uploading')
    let storagePath
    try {
      const timestamp = Date.now()
      const ext = file.name.split('.').pop().replace(/[^a-zA-Z0-9]/g, '') || 'pdf'
      storagePath = `${user.id}/${timestamp}.${ext}`
      const { error } = await supabase.storage
        .from(GUIDELINES_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: 'application/pdf' })
      if (error) throw error
      setUploadedPath(storagePath)
    } catch (err) {
      setPhase(null)
      setUploadError(lang === 'ES'
        ? `Error al subir: ${err.message}`
        : `Upload error: ${err.message}`)
      return
    }

    // 2. Extract text
    setPhase('extracting')
    let text = ''
    try {
      text = await extractPdfText(file)
    } catch (err) {
      console.warn('[Guidelines] PDF text extraction failed:', err)
      // Non-fatal: proceed to form without extracted text, show a notice
      setUploadError(
        lang === 'ES'
          ? 'No se pudo extraer texto del PDF. Aún puedes guardar la guía.'
          : 'Could not extract text from the PDF. You can still save the guideline.'
      )
    }
    setExtractedText(text)
    setCharCount(text.length)

    // 3. Show metadata form
    setForm({
      name: fileBaseName(file.name),
      specialty: '',
      source: 'community',
      isPublic: true,
    })
    setPhase('form')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  // ─── Cancel upload (remove from storage) ─────────────────────────────────

  const handleCancelUpload = async () => {
    if (uploadedPath) {
      await supabase.storage.from(GUIDELINES_BUCKET).remove([uploadedPath])
    }
    setPhase(null)
    setUploadedPath(null)
    setExtractedText('')
    setCharCount(0)
    setUploadError(null)
  }

  // ─── Save guideline to DB ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim() || !form.specialty) {
      setUploadError(lang === 'ES'
        ? 'Completa el nombre y la especialidad.'
        : 'Fill in the name and specialty.')
      return
    }
    setPhase('saving')
    setUploadError(null)
    try {
      const { error } = await supabase.from('guidelines').insert({
        name: form.name.trim(),
        specialty: form.specialty,
        source: form.source,
        file_path: uploadedPath,
        is_public: form.isPublic,
        uploaded_by: user.id,
      })
      if (error) throw error

      setPhase(null)
      setUploadedPath(null)
      setExtractedText('')
      setCharCount(0)
      showToast(
        lang === 'ES' ? 'Guía guardada en la biblioteca' : 'Guideline saved to the library'
      )
      await loadGuidelines()
    } catch (err) {
      setPhase('form')
      setUploadError(lang === 'ES'
        ? `Error al guardar: ${err.message}`
        : `Save error: ${err.message}`)
    }
  }

  // ─── Delete guideline ─────────────────────────────────────────────────────

  const handleDelete = async (guideline) => {
    const confirmed = window.confirm(
      lang === 'ES'
        ? `¿Eliminar "${guideline.name}"?`
        : `Delete "${guideline.name}"?`
    )
    if (!confirmed) return

    try {
      if (guideline.file_path) {
        await supabase.storage.from(GUIDELINES_BUCKET).remove([guideline.file_path])
      }
      const { error } = await supabase.from('guidelines').delete().eq('id', guideline.id)
      if (error) throw error
      setGuidelines(prev => prev.filter(g => g.id !== guideline.id))
      showToast(lang === 'ES' ? 'Guía eliminada' : 'Guideline deleted', 'info')
    } catch (err) {
      showToast(
        lang === 'ES' ? `Error: ${err.message}` : `Error: ${err.message}`,
        'error'
      )
    }
  }

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filtered = guidelines.filter(g => {
    if (filterSpecialty && g.specialty !== filterSpecialty) return false
    if (filterSource === 'mine' && g.uploaded_by !== user?.id) return false
    if (filterSource === 'community' && g.uploaded_by === user?.id) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  const isUploading = phase === 'uploading'
  const isExtracting = phase === 'extracting'
  const isSaving = phase === 'saving'
  const showForm = phase === 'form' || isSaving

  return (
    <AppLayout title={lang === 'ES' ? 'Guías Clínicas' : 'Clinical Guidelines'}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Page heading */}
        <div>
          <h2 className="font-heading font-bold text-2xl text-white">
            {lang === 'ES' ? 'Guías Clínicas / Clinical Guidelines' : 'Clinical Guidelines / Guías Clínicas'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {lang === 'ES'
              ? 'Sube PDFs de GPC para generar casos clínicos con IA.'
              : 'Upload GPC PDFs to generate AI-powered clinical cases.'}
          </p>
        </div>

        {/* ── Upload zone (hidden when form is active) ── */}
        {!showForm && !isUploading && !isExtracting && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-accent-blue bg-accent-blue/10'
                : 'border-gray-700 bg-surface hover:border-accent-blue/50 hover:bg-accent-blue/5'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-accent-blue/10 flex items-center justify-center mb-4">
              <Upload size={26} className="text-accent-blue" />
            </div>
            <p className="font-heading font-semibold text-white text-base mb-1">
              {lang === 'ES' ? 'Arrastra tu PDF aquí' : 'Drag your PDF here'}
            </p>
            <p className="text-gray-400 text-sm">
              {lang === 'ES' ? 'o haz clic para seleccionar' : 'or click to select'}
            </p>
            <p className="text-gray-600 text-xs mt-3">PDF · máx. 20 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* ── Upload progress ── */}
        {(isUploading || isExtracting) && (
          <div className="bg-surface border border-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4">
            <Loader2 size={32} className="text-accent-blue animate-spin" />
            <p className="font-heading font-semibold text-white">
              {isUploading
                ? (lang === 'ES' ? 'Subiendo PDF...' : 'Uploading PDF...')
                : (lang === 'ES' ? 'Extrayendo texto del PDF...' : 'Extracting PDF text...')}
            </p>
            <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent-blue to-accent-cyan rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}

        {/* ── Metadata form ── */}
        {showForm && (
          <div className="bg-surface border border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-lg text-white">
                {lang === 'ES' ? 'Detalles de la guía' : 'Guideline details'}
              </h3>
              <button
                onClick={handleCancelUpload}
                disabled={isSaving}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title={lang === 'ES' ? 'Cancelar' : 'Cancel'}
              >
                <X size={18} />
              </button>
            </div>

            {/* Extracted text info */}
            {charCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-xl px-4 py-2.5">
                <CheckCircle size={15} />
                <span>
                  {lang === 'ES' ? `Texto extraído: ${charCount.toLocaleString()} caracteres` : `Text extracted: ${charCount.toLocaleString()} characters`}
                </span>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lang === 'ES' ? 'Nombre de la guía' : 'Guideline name'} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm"
                placeholder={lang === 'ES' ? 'Ej. GPC Diabetes Mellitus Tipo 2' : 'E.g. Clinical Practice Guideline T2DM'}
              />
            </div>

            {/* Specialty */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lang === 'ES' ? 'Especialidad' : 'Specialty'} *
              </label>
              <select
                value={form.specialty}
                onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
              >
                <option value="">{lang === 'ES' ? '— Selecciona especialidad —' : '— Select specialty —'}</option>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Source + Visibility row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  {lang === 'ES' ? 'Origen' : 'Source'}
                </label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accent-blue text-sm"
                >
                  <option value="gpc_pdf">{lang === 'ES' ? 'GPC Mexicana (oficial)' : 'Mexican GPC (official)'}</option>
                  <option value="community">{lang === 'ES' ? 'Comunidad' : 'Community'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  {lang === 'ES' ? 'Visibilidad' : 'Visibility'}
                </label>
                <div className="flex rounded-xl overflow-hidden border border-gray-700">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isPublic: true }))}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                      form.isPublic ? 'bg-accent-blue text-white' : 'bg-background text-gray-400 hover:text-white'
                    }`}
                  >
                    {lang === 'ES' ? 'Pública' : 'Public'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isPublic: false }))}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                      !form.isPublic ? 'bg-accent-blue text-white' : 'bg-background text-gray-400 hover:text-white'
                    }`}
                  >
                    {lang === 'ES' ? 'Privada' : 'Private'}
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5">
                <AlertCircle size={15} />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:bg-blue-600 disabled:opacity-60 text-white font-medium rounded-xl transition-colors text-sm"
              >
                {isSaving
                  ? <><Loader2 size={15} className="animate-spin" /> {lang === 'ES' ? 'Guardando...' : 'Saving...'}</>
                  : (lang === 'ES' ? 'Guardar guía' : 'Save guideline')
                }
              </button>
              <button
                onClick={handleCancelUpload}
                disabled={isSaving}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-60 text-gray-300 rounded-xl transition-colors text-sm"
              >
                {lang === 'ES' ? 'Cancelar' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Upload error shown outside form */}
        {uploadError && !showForm && (
          <div className="flex items-center gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5">
            <AlertCircle size={15} />
            <span>{uploadError}</span>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'ES' ? 'Buscar por nombre...' : 'Search by name...'}
              className="w-full pl-9 pr-4 py-2.5 bg-surface border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm"
            />
          </div>

          {/* Specialty filter */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
              value={filterSpecialty}
              onChange={e => setFilterSpecialty(e.target.value)}
              className="pl-9 pr-8 py-2.5 bg-surface border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-accent-blue appearance-none"
            >
              <option value="">{lang === 'ES' ? 'Todas las especialidades' : 'All specialties'}</option>
              {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Source filter */}
          <div className="flex rounded-xl overflow-hidden border border-gray-700 text-sm shrink-0">
            {[
              { key: 'all', label: { ES: 'Todas', EN: 'All' } },
              { key: 'mine', label: { ES: 'Mías', EN: 'Mine' } },
              { key: 'community', label: { ES: 'Comunidad', EN: 'Community' } },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterSource(key)}
                className={`px-4 py-2.5 font-medium transition-colors ${
                  filterSource === key
                    ? 'bg-accent-blue text-white'
                    : 'bg-surface text-gray-400 hover:text-white'
                }`}
              >
                {label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Guidelines list ── */}
        {listLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="text-accent-blue animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState lang={lang} hasFilters={!!(filterSpecialty || filterSource !== 'all' || search)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map(g => (
              <GuidelineCard
                key={g.id}
                guideline={g}
                userId={user?.id}
                lang={lang}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GuidelineCard({ guideline, userId, lang, onDelete }) {
  const isOwner = guideline.uploaded_by === userId
  const specialtyStyle = SPECIALTY_STYLES[guideline.specialty] ?? SPECIALTY_STYLES['Otra']
  const isGpc = guideline.source === 'gpc_pdf'

  return (
    <div className="bg-surface border border-gray-800 rounded-2xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center">
            <FileText size={17} className="text-accent-blue" />
          </div>
          <p className="font-heading font-semibold text-white text-sm leading-snug line-clamp-2">{guideline.name}</p>
        </div>
        {isOwner && (
          <button
            onClick={() => onDelete(guideline)}
            className="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-error hover:bg-error/10 transition-colors"
            title={lang === 'ES' ? 'Eliminar guía' : 'Delete guideline'}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {guideline.specialty && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${specialtyStyle}`}>
            {guideline.specialty}
          </span>
        )}
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
          isGpc
            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        }`}>
          {isGpc
            ? (lang === 'ES' ? 'GPC Mexicana' : 'Mexican GPC')
            : (lang === 'ES' ? 'Comunidad' : 'Community')}
        </span>
        {!guideline.is_public && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30">
            {lang === 'ES' ? 'Privada' : 'Private'}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-800">
        <span>{guideline.profiles?.full_name ?? (lang === 'ES' ? 'Usuario' : 'User')}</span>
        <span>{formatDate(guideline.created_at)}</span>
      </div>
    </div>
  )
}

function EmptyState({ lang, hasFilters }) {
  return (
    <div className="bg-surface border border-gray-800 rounded-2xl p-12 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
        <BookOpen size={28} className="text-gray-600" />
      </div>
      <p className="font-heading font-semibold text-white text-base mb-1">
        {hasFilters
          ? (lang === 'ES' ? 'Sin resultados' : 'No results')
          : (lang === 'ES' ? 'No hay guías cargadas aún' : 'No guidelines uploaded yet')}
      </p>
      <p className="text-gray-500 text-sm max-w-xs">
        {hasFilters
          ? (lang === 'ES' ? 'Intenta con otros filtros.' : 'Try different filters.')
          : (lang === 'ES' ? 'Sube la primera GPC.' : 'Upload the first clinical guideline.')}
      </p>
    </div>
  )
}

function Toast({ msg, type, onClose }) {
  const colors = {
    success: 'bg-success/20 border-success/30 text-success',
    error: 'bg-error/20 border-error/30 text-error',
    info: 'bg-accent-blue/20 border-accent-blue/30 text-accent-blue',
  }
  const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : CheckCircle

  return (
    <div className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur ${colors[type] ?? colors.success}`}>
      <Icon size={16} />
      <span>{msg}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
  )
}

