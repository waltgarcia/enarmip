// ─── Anthropic Claude API helper ─────────────────────────────────────────────
//
// NOTE: This calls the Anthropic REST API directly from the browser using the
// VITE_ANTHROPIC_API_KEY environment variable.  The key is therefore visible
// to anyone who inspects the network traffic.  This is intentional for the
// current prototype.  For production, proxy the call through a Supabase Edge
// Function or similar server-side handler.

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const ANTHROPIC_MODEL   = 'claude-3-5-sonnet-20241022'

/**
 * Shared: call the Anthropic Messages API and return the cleaned response text.
 * Strips optional markdown code fences Claude sometimes adds.
 * @private
 */
async function _callClaudeRaw({ systemPrompt, userMessage }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY is not set. ' +
      'Copy .env.example to .env and add your Anthropic key.'
    )
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Required when calling the Anthropic API from a browser environment
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Anthropic API error: HTTP ${response.status}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

/**
 * Call Claude and parse the response as a JSON array of clinical cases.
 *
 * @param {{ systemPrompt: string, userMessage: string }} params
 * @returns {Promise<Array>} Parsed JSON array returned by Claude
 */
export async function generateClinicalCases({ systemPrompt, userMessage }) {
  const cleaned = await _callClaudeRaw({ systemPrompt, userMessage })

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Claude returned invalid JSON. First 300 chars: ${cleaned.slice(0, 300)}`
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Claude response was not a JSON array.')
  }

  return parsed
}

/**
 * Call Claude and parse the response as a JSON object (thematic study session).
 *
 * @param {{ systemPrompt: string, userMessage: string }} params
 * @returns {Promise<object>} Parsed JSON object returned by Claude
 */
export async function generateStudySession({ systemPrompt, userMessage }) {
  const cleaned = await _callClaudeRaw({ systemPrompt, userMessage })

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Claude returned invalid JSON. First 300 chars: ${cleaned.slice(0, 300)}`
    )
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    throw new Error('Claude response was not a JSON object.')
  }

  return parsed
}
