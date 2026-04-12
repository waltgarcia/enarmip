import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing required credentials: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'The application will not function correctly without valid credentials. ' +
    'Copy .env.example to .env and fill in your Supabase project credentials.'
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key'
)

// ─── Typed table helpers ────────────────────────────────────────────────────

export const db = {
  /** @returns {ReturnType<typeof supabase.from>} */
  profiles: () => supabase.from('profiles'),
  /** @returns {ReturnType<typeof supabase.from>} */
  guidelines: () => supabase.from('guidelines'),
  /** @returns {ReturnType<typeof supabase.from>} */
  questionBank: () => supabase.from('question_bank'),
  /** @returns {ReturnType<typeof supabase.from>} */
  examSessions: () => supabase.from('exam_sessions'),
  /** @returns {ReturnType<typeof supabase.from>} */
  examAnswers: () => supabase.from('exam_answers'),
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

export const GUIDELINES_BUCKET = 'guidelines-pdfs'

/**
 * Upload a PDF to the guidelines-pdfs bucket.
 * Files are stored under `{userId}/{filename}` to scope per-user.
 * @param {string} userId
 * @param {File} file
 */
export async function uploadGuidelinePdf(userId, file) {
  const path = `${userId}/${Date.now()}_${file.name}`
  const { data, error } = await supabase.storage
    .from(GUIDELINES_BUCKET)
    .upload(path, file, { upsert: false, contentType: 'application/pdf' })
  if (error) throw error
  return data.path
}

/**
 * Get a signed URL for a stored PDF (valid 1 hour).
 * @param {string} filePath
 */
export async function getGuidelinePdfUrl(filePath) {
  const { data, error } = await supabase.storage
    .from(GUIDELINES_BUCKET)
    .createSignedUrl(filePath, 3600)
  if (error) throw error
  return data.signedUrl
}
