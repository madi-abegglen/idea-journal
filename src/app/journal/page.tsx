'use client'

/**
 * Idea Journal — main journal page
 * Protected route: requires Supabase auth session (enforced by middleware.ts)
 * 
 * Flow: IDLE → DUMPING → DEEPENING (4 questions) → SAVING → DONE
 * Users can also switch to VIEWING mode to browse past ideas.
 * 
 * Data: reads/writes directly to Supabase `ideas` table via browser client.
 * AI summaries: generated server-side via /api/summary to keep Anthropic key secure.
 */

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASES = {
  IDLE: 'idle',
  DUMPING: 'dumping',
  DEEPENING: 'deepening',
  SAVING: 'saving',
  DONE: 'done',
  VIEWING: 'viewing',
}

// The 4 follow-up questions asked after the initial idea dump
const DEEPENING_QUESTIONS = [
  { key: 'trigger', label: 'What sparked it?', placeholder: 'What were you doing, reading, thinking about when this hit you?' },
  { key: 'problem', label: 'What problem does it solve?', placeholder: "What's the thing that's broken or missing that this fixes?" },
  { key: 'magic', label: "What's the exciting angle?", placeholder: 'The specific twist or insight that made this feel different...' },
  { key: 'energy', label: 'How does it feel?', placeholder: "One line — the vibe. 'This could change everything.' 'Finally.' 'Why hasn't anyone done this?'" },
]

// Fields shown when editing an idea in the detail view — labels mirror the read-only view
const EDITABLE_FIELDS = [
  { key: 'dump', label: 'The idea', rows: 4 },
  { key: 'trigger', label: 'What sparked it', rows: 2 },
  { key: 'problem', label: 'Problem it solves', rows: 2 },
  { key: 'magic', label: 'The exciting angle', rows: 2 },
  { key: 'energy', label: 'The feeling', rows: 2 },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type Idea = {
  id: string
  user_id?: string
  dump: string
  trigger?: string
  problem?: string
  magic?: string
  energy?: string
  summary?: string
  timestamp: number
  created_at: string
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Card shown in the ideas list — truncated preview of dump + magic angle
function IdeaCard({ idea, onClick }: { idea: Idea; onClick: (idea: Idea) => void }) {
  return (
    <button
      onClick={() => onClick(idea)}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 18px', textAlign: 'left', cursor: 'pointer', width: '100%', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ fontFamily: "'Georgia', serif", fontSize: '15px', color: '#f0ece4', lineHeight: 1.4, flex: 1 }}>
          {idea.dump.length > 80 ? idea.dump.slice(0, 80) + '…' : idea.dump}
        </div>
        <div style={{ fontSize: '11px', color: '#8a8070', whiteSpace: 'nowrap', paddingTop: '2px' }}>
          {formatDate(idea.timestamp)}
        </div>
      </div>
      {idea.magic && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#c4a882', fontStyle: 'italic' }}>
          ✦ {idea.magic.length > 60 ? idea.magic.slice(0, 60) + '…' : idea.magic}
        </div>
      )}
    </button>
  )
}

// Quiet "regenerate summary?" affordance shown beneath an essence/summary.
// Re-runs the AI summary from the idea's fields (POST /api/summary), persists it
// (PATCH /api/ideas/[id]), then hands the freshly-saved row back to the parent so
// the displayed summary updates in place. Styled as a muted suggestion, not a button.
function RegenerateSummary({
  idea,
  onRegenerated,
}: {
  idea: { id: string; dump: string; trigger?: string; problem?: string; magic?: string; energy?: string }
  onRegenerated: (idea: Idea) => void
}) {
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [error, setError] = useState('')

  async function regenerate() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // Generate a fresh summary from the idea's existing fields…
      const sumRes = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dump: idea.dump || '',
          trigger: idea.trigger || '',
          problem: idea.problem || '',
          magic: idea.magic || '',
          energy: idea.energy || '',
        }),
      })
      const { summary } = await sumRes.json()
      if (!summary) throw new Error()
      // …then persist it and surface the updated row to the parent
      const patchRes = await fetch(`/api/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      })
      if (!patchRes.ok) throw new Error()
      const updated = await patchRes.json()
      onRegenerated(updated)
    } catch {
      setError('Couldn’t regenerate. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Muted by default, brightens on hover, dims while working
  const color = busy ? '#5a5248' : hover ? '#c4a882' : '#8a8070'

  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <button
        onClick={regenerate}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color, fontSize: '12px', fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, transition: 'color 0.15s, opacity 0.15s' }}
      >
        {/* Circular arrows — spins while regenerating */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', animation: busy ? 'spin 0.8s linear infinite' : 'none' }}>
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <span>{busy ? 'regenerating…' : 'regenerate summary?'}</span>
      </button>
      {error && <div style={{ fontSize: '11px', color: '#e07070' }}>{error}</div>}
    </div>
  )
}

// Full idea detail view — shown when a card is clicked in VIEWING mode.
// Supports inline editing (PATCH) and deletion (DELETE) of the idea.
function IdeaDetail({
  idea,
  onBack,
  onUpdate,
  onDelete,
}: {
  idea: Idea
  onBack: () => void
  onUpdate: (idea: Idea) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Enter edit mode — seed the form with the idea's current values
  function startEditing() {
    setFields({
      dump: idea.dump || '',
      trigger: idea.trigger || '',
      problem: idea.problem || '',
      magic: idea.magic || '',
      energy: idea.energy || '',
    })
    setError('')
    setEditing(true)
  }

  // Persist edits via PATCH /api/ideas/[id] (cookie session auth), then hand the fresh row to the parent
  async function saveEdits() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onUpdate(updated)
      setEditing(false)
    } catch {
      setError('Failed to save changes. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Confirm, then remove via DELETE /api/ideas/[id] and return to the list
  async function deleteIdea() {
    if (!window.confirm('Delete this idea? This can’t be undone.')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(idea.id)
    } catch {
      setError('Failed to delete idea. Please try again.')
      setBusy(false)
    }
  }

  // Disable save until the core idea isn't empty
  const canSave = !busy && !!fields.dump?.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!editing && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#8a8070', cursor: 'pointer', fontSize: '13px', textAlign: 'left', padding: 0 }}>
          ← back
        </button>
      )}

      {error && <div style={{ fontSize: '13px', color: '#e07070' }}>{error}</div>}

      {editing ? (
        // ─── Edit form — one labeled textarea per editable field ───
        EDITABLE_FIELDS.map(f => (
          <div key={f.key}>
            <div style={{ fontSize: '11px', color: '#8a8070', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{f.label}</div>
            <textarea
              value={fields[f.key] ?? ''}
              onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              rows={f.rows}
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px', color: '#f0ece4', fontSize: '14px', fontFamily: "'Georgia', serif", lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
            />
          </div>
        ))
      ) : (
        // ─── Read-only detail ───
        <>
          <div>
            <div style={{ fontSize: '11px', color: '#8a8070', marginBottom: '6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The idea</div>
            <div style={{ fontFamily: "'Georgia', serif", fontSize: '18px', color: '#f0ece4', lineHeight: 1.5 }}>{idea.dump}</div>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          {idea.trigger && (
            <div>
              <div style={{ fontSize: '11px', color: '#8a8070', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>What sparked it</div>
              <div style={{ fontSize: '14px', color: '#c8bfb0', lineHeight: 1.5 }}>{idea.trigger}</div>
            </div>
          )}
          {idea.problem && (
            <div>
              <div style={{ fontSize: '11px', color: '#8a8070', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Problem it solves</div>
              <div style={{ fontSize: '14px', color: '#c8bfb0', lineHeight: 1.5 }}>{idea.problem}</div>
            </div>
          )}
          {idea.magic && (
            <div>
              <div style={{ fontSize: '11px', color: '#c4a882', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>✦ The exciting angle</div>
              <div style={{ fontSize: '14px', color: '#c4a882', lineHeight: 1.5, fontStyle: 'italic' }}>{idea.magic}</div>
            </div>
          )}
          {idea.energy && (
            <div>
              <div style={{ fontSize: '11px', color: '#8a8070', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The feeling</div>
              <div style={{ fontFamily: "'Georgia', serif", fontSize: '15px', color: '#f0ece4', lineHeight: 1.4 }}>"{idea.energy}"</div>
            </div>
          )}
          {idea.summary && (
            <div>
              <div style={{ fontSize: '11px', color: '#c4a882', marginBottom: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The essence</div>
              <div style={{ background: 'rgba(196,168,130,0.08)', border: '1px solid rgba(196,168,130,0.2)', borderRadius: '12px', padding: '14px 16px', fontFamily: "'Georgia', serif", fontSize: '14px', color: '#e0d8cc', lineHeight: 1.65, fontStyle: 'italic' }}>{idea.summary}</div>
              <RegenerateSummary idea={idea} onRegenerated={onUpdate} />
            </div>
          )}
          <div style={{ paddingTop: '4px', fontSize: '11px', color: '#5a5248' }}>Captured {formatDate(idea.timestamp)}</div>
        </>
      )}

      {/* Action buttons — save/cancel while editing, edit/delete otherwise */}
      {editing ? (
        <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
          <button onClick={() => setEditing(false)} disabled={busy} style={{ flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#5a5248', cursor: busy ? 'not-allowed' : 'pointer' }}>cancel</button>
          <button onClick={saveEdits} disabled={!canSave} style={{ flex: 3, background: canSave ? '#c4a882' : 'rgba(255,255,255,0.08)', color: canSave ? '#0f0d0b' : '#5a5248', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '15px', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {busy ? 'saving…' : 'save changes'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
          <button onClick={startEditing} style={{ flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#8a8070', cursor: 'pointer' }}>edit</button>
          <button onClick={deleteIdea} disabled={busy} style={{ flex: 1, background: 'none', border: '1px solid rgba(224,112,112,0.3)', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#e07070', cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? 'deleting…' : 'delete'}</button>
        </div>
      )}
    </div>
  )
}

// Slide-out profile menu — account settings + sign out. Opened from the header name.
function ProfileMenu({
  supabase,
  name,
  email,
  onClose,
  onNameSaved,
  onSignOut,
}: {
  supabase: ReturnType<typeof createClient>
  name: string
  email: string
  onClose: () => void
  onNameSaved: (name: string) => void
  onSignOut: () => void
}) {
  const [nameInput, setNameInput] = useState(name)
  const [emailInput, setEmailInput] = useState(email)
  const [passwordInput, setPasswordInput] = useState('')
  const [busy, setBusy] = useState('') // which action is in flight: '' | 'name' | 'email' | 'password' | 'delete'
  const [error, setError] = useState('')
  const [status, setStatus] = useState('') // success/confirmation feedback

  // Update first_name in user_metadata, then refresh the header greeting
  async function saveName() {
    if (!nameInput.trim() || busy) return
    setBusy('name'); setError(''); setStatus('')
    const { error } = await supabase.auth.updateUser({ data: { first_name: nameInput.trim() } })
    if (error) { setError(error.message); setBusy(''); return }
    onNameSaved(nameInput.trim())
    setStatus('Name updated.')
    setBusy('')
  }

  // Update the account email — Supabase sends a confirmation link before it takes effect
  async function saveEmail() {
    if (!emailInput.trim() || busy) return
    setBusy('email'); setError(''); setStatus('')
    const { error } = await supabase.auth.updateUser({ email: emailInput.trim() })
    if (error) { setError(error.message); setBusy(''); return }
    setStatus('Check your inbox to confirm the new email.')
    setBusy('')
  }

  // Update the account password
  async function savePassword() {
    if (!passwordInput.trim() || busy) return
    setBusy('password'); setError(''); setStatus('')
    const { error } = await supabase.auth.updateUser({ password: passwordInput.trim() })
    if (error) { setError(error.message); setBusy(''); return }
    setPasswordInput('')
    setStatus('Password updated.')
    setBusy('')
  }

  // Confirm, then delete the user's ideas and their auth account (via the delete_user_account RPC)
  async function deleteAccount() {
    if (!window.confirm('Delete your account and all your ideas? This can’t be undone.')) return
    setBusy('delete'); setError(''); setStatus('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error()
      const { error: ideasErr } = await supabase.from('ideas').delete().eq('user_id', user.id)
      if (ideasErr) throw ideasErr
      const { error: rpcErr } = await supabase.rpc('delete_user_account')
      if (rpcErr) throw rpcErr
      onSignOut() // clears the local session and redirects to /login
    } catch {
      setError('Failed to delete account. Please try again.')
      setBusy('')
    }
  }

  const accent = '#c4a882'
  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px', color: '#f0ece4', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }
  const labelStyle = { fontSize: '11px', color: '#8a8070', marginBottom: '6px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }
  const saveBtnStyle = { background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#8a8070', cursor: 'pointer', fontSize: '12px', padding: '8px 12px', marginTop: '8px', alignSelf: 'flex-start' as const }

  return (
    <>
      {/* Backdrop — click to dismiss */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10 }} />
      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 'min(360px, 90vw)', background: '#15120f', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 11, padding: '28px 22px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Georgia', serif", fontSize: '18px', color: accent }}>Profile</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8070', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {error && <div style={{ fontSize: '13px', color: '#e07070' }}>{error}</div>}
        {status && <div style={{ fontSize: '13px', color: accent }}>{status}</div>}

        {/* Edit name */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>Name</div>
          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="What name do you go by?" style={inputStyle} />
          <button onClick={saveName} disabled={!!busy} style={saveBtnStyle}>{busy === 'name' ? 'saving…' : 'save name'}</button>
        </div>

        {/* Change email */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>Email</div>
          <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Email" style={inputStyle} />
          <button onClick={saveEmail} disabled={!!busy} style={saveBtnStyle}>{busy === 'email' ? 'saving…' : 'save email'}</button>
        </div>

        {/* Change password */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>Password</div>
          <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="New password" style={inputStyle} />
          <button onClick={savePassword} disabled={!!busy} style={saveBtnStyle}>{busy === 'password' ? 'saving…' : 'save password'}</button>
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />

        {/* Account actions */}
        <button onClick={onSignOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: '#8a8070', cursor: 'pointer' }}>sign out</button>
        <button onClick={deleteAccount} disabled={!!busy} style={{ background: 'none', border: '1px solid rgba(224,112,112,0.3)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: '#e07070', cursor: busy ? 'not-allowed' : 'pointer' }}>{busy === 'delete' ? 'deleting…' : 'delete account'}</button>

      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const [phase, setPhase] = useState(PHASES.IDLE)
  const [dump, setDump] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentQ, setCurrentQ] = useState(0)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null)
  const [aiSummary, setAiSummary] = useState('')
  const [savedIdea, setSavedIdea] = useState<Idea | null>(null) // the row just inserted, for the Done screen
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileHover, setProfileHover] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Browser-side Supabase client — uses anon key + user session cookie
  const supabase = createClient()

  // Load ideas and the signed-in user on mount
  useEffect(() => {
    loadIdeas()
    loadUser()
  }, [])

  // Auto-focus textarea when entering capture or deepening phases
  useEffect(() => {
    if (textareaRef.current && (phase === PHASES.DUMPING || phase === PHASES.DEEPENING)) {
      textareaRef.current.focus()
    }
  }, [phase, currentQ])

  // ─── Data operations ────────────────────────────────────────────────────────

  async function loadIdeas() {
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .order('timestamp', { ascending: false })
    if (error) { setError('Failed to load ideas.'); return }
    setIdeas(data || [])
  }

  // Read the signed-in user's first name (set at sign-up) + email for the header and profile menu
  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setFirstName(user?.user_metadata?.first_name || '')
    setUserEmail(user?.email || '')
  }

  // Sign out and redirect to login
  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Request AI summary from server-side API route (keeps Anthropic key off the client)
  async function generateSummary(ideaData: Record<string, string | number>) {
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ideaData),
      })
      const data = await res.json()
      return data.summary || ''
    } catch {
      return ''
    }
  }

  // Called after all deepening questions are answered — generates summary and saves to DB.
  // Takes the final answers explicitly: the last question's answer is set via setAnswers()
  // immediately before this is called, and that state update hasn't flushed yet, so reading
  // the `answers` state here would drop the final field (e.g. energy → NULL).
  async function finishCapture(finalAnswers: Record<string, string>) {
    setPhase(PHASES.SAVING)
    try {
      // Tag the idea with its owner so per-user RLS policies can scope access
      const { data: { user } } = await supabase.auth.getUser()
      const ideaData = { dump, ...finalAnswers, timestamp: Date.now() }
      const summary = await generateSummary(ideaData)
      const { data, error } = await supabase
        .from('ideas')
        .insert([{ ...ideaData, summary, user_id: user?.id }])
        .select()
        .single()
      if (error) throw error
      setAiSummary(summary)
      setSavedIdea(data)
      setIdeas(prev => [data, ...prev])
      setPhase(PHASES.DONE)
    } catch {
      setError('Failed to save idea. Please try again.')
      setPhase(PHASES.DUMPING)
    }
  }

  // ─── Capture flow handlers ──────────────────────────────────────────────────

  // Advance to next deepening question, or finish if on last question
  function handleNextQuestion() {
    const q = DEEPENING_QUESTIONS[currentQ]
    const nextAnswers = { ...answers, [q.key]: currentAnswer }
    setAnswers(nextAnswers)
    setCurrentAnswer('')
    if (currentQ < DEEPENING_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      finishCapture(nextAnswers)
    }
  }

  // Same as next but saves empty string for this question
  function handleSkipQuestion() {
    const q = DEEPENING_QUESTIONS[currentQ]
    const nextAnswers = { ...answers, [q.key]: '' }
    setAnswers(nextAnswers)
    setCurrentAnswer('')
    if (currentQ < DEEPENING_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      finishCapture(nextAnswers)
    }
  }

  // Step back to previous question, restoring the previously entered answer
  function handlePreviousQuestion() {
    if (currentQ === 0) {
      // If on first question, go back to the dump screen
      setPhase(PHASES.DUMPING)
    } else {
      const prevKey = DEEPENING_QUESTIONS[currentQ - 1].key
      setCurrentAnswer(answers[prevKey] || '')
      setCurrentQ(currentQ - 1)
    }
  }

  // Reset all capture state back to IDLE
  function reset() {
    setPhase(PHASES.IDLE)
    setDump('')
    setAnswers({})
    setCurrentQ(0)
    setCurrentAnswer('')
    setAiSummary('')
    setSavedIdea(null)
    setSelectedIdea(null)
    setError('')
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const bg = '#0f0d0b'
  const accent = '#c4a882'

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#f0ece4', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

        {/* Header — title + nav controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Clicking the name/title opens the profile menu — icon + chevron + hover signal it's interactive */}
          <button
            onClick={() => setMenuOpen(true)}
            onMouseEnter={() => setProfileHover(true)}
            onMouseLeave={() => setProfileHover(false)}
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
          >
            {/* Possessive eyebrow with a profile icon + chevron; brightens on hover */}
            {firstName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: profileHover ? accent : '#8a8070', marginBottom: '3px', transition: 'color 0.15s' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                <span style={{ textDecoration: profileHover ? 'underline' : 'none' }}>{`${firstName}'s`}</span>
                <span>▾</span>
              </div>
            )}
            <div style={{ fontFamily: "'Georgia', serif", fontSize: '22px', color: accent }}>Idea Journal</div>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(phase === PHASES.IDLE || phase === PHASES.VIEWING) && ideas.length > 0 && (
              <button
                onClick={() => setPhase(phase === PHASES.VIEWING ? PHASES.IDLE : PHASES.VIEWING)}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#8a8070', cursor: 'pointer', fontSize: '12px', padding: '6px 12px' }}
              >
                {phase === PHASES.VIEWING ? '← new idea' : `${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`}
              </button>
            )}
            {phase !== PHASES.IDLE && phase !== PHASES.VIEWING && (
              <button onClick={reset} style={{ background: 'none', border: 'none', color: '#5a5248', cursor: 'pointer', fontSize: '12px' }}>cancel</button>
            )}
          </div>
        </div>

        {/* Profile menu — mounted only while open so its form resets each time */}
        {menuOpen && (
          <ProfileMenu
            supabase={supabase}
            name={firstName}
            email={userEmail}
            onClose={() => setMenuOpen(false)}
            onNameSaved={setFirstName}
            onSignOut={handleSignOut}
          />
        )}

        {error && <div style={{ fontSize: '13px', color: '#e07070' }}>{error}</div>}

        {/* IDLE — entry point, shows capture + browse buttons */}
        {phase === PHASES.IDLE && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontFamily: "'Georgia', serif", fontSize: '15px', color: '#8a8070', lineHeight: 1.6 }}>
              Capture an idea before it slips away. We'll help you hold onto what made it feel exciting.
            </div>
            <button onClick={() => setPhase(PHASES.DUMPING)} style={{ background: accent, color: '#0f0d0b', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
              + capture an idea
            </button>
            {ideas.length > 0 && (
              <button onClick={() => setPhase(PHASES.VIEWING)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: '#8a8070', cursor: 'pointer' }}>
                browse {ideas.length} saved idea{ideas.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {/* DUMPING — free-form initial idea capture */}
        {phase === PHASES.DUMPING && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '13px', color: '#8a8070' }}>Just get it out — messy is fine.</div>
            <textarea
              ref={textareaRef}
              value={dump}
              onChange={e => setDump(e.target.value)}
              placeholder="What's the idea? Say it however it comes..."
              rows={5}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', fontFamily: "'Georgia', serif", lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
              onKeyDown={e => {
                // Enter advances (when there's content); Shift+Enter inserts a newline
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (dump.trim()) setPhase(PHASES.DEEPENING)
                }
              }}
            />
            <button onClick={() => setPhase(PHASES.DEEPENING)} disabled={!dump.trim()} style={{ background: dump.trim() ? accent : 'rgba(255,255,255,0.08)', color: dump.trim() ? '#0f0d0b' : '#5a5248', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 600, cursor: dump.trim() ? 'pointer' : 'not-allowed' }}>
              got it, now deepen it →
            </button>
          </div>
        )}

        {/* DEEPENING — 4 guided follow-up questions with progress bar */}
        {phase === PHASES.DEEPENING && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Progress bar — one segment per question */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {DEEPENING_QUESTIONS.map((_, i) => (
                <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: i <= currentQ ? accent : 'rgba(255,255,255,0.1)' }} />
              ))}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8a8070', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Question {currentQ + 1} of {DEEPENING_QUESTIONS.length}</div>
              <div style={{ fontFamily: "'Georgia', serif", fontSize: '17px', color: '#f0ece4' }}>{DEEPENING_QUESTIONS[currentQ].label}</div>
            </div>
            <textarea
              ref={textareaRef}
              value={currentAnswer}
              onChange={e => setCurrentAnswer(e.target.value)}
              onKeyDown={e => {
                // Enter submits the answer (when there's content); Shift+Enter inserts a newline
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (currentAnswer.trim()) handleNextQuestion()
                }
              }}
              placeholder={DEEPENING_QUESTIONS[currentQ].placeholder}
              rows={3}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', fontFamily: "'Georgia', serif", lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handlePreviousQuestion} style={{ flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#5a5248', cursor: 'pointer' }}>← back</button>
              <button onClick={handleSkipQuestion} style={{ flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#5a5248', cursor: 'pointer' }}>skip</button>
              <button onClick={handleNextQuestion} disabled={!currentAnswer.trim()} style={{ flex: 3, background: currentAnswer.trim() ? accent : 'rgba(255,255,255,0.08)', color: currentAnswer.trim() ? '#0f0d0b' : '#5a5248', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '15px', fontWeight: 600, cursor: currentAnswer.trim() ? 'pointer' : 'not-allowed' }}>
                {currentQ < DEEPENING_QUESTIONS.length - 1 ? 'next →' : 'save it ✦'}
              </button>
            </div>
          </div>
        )}

        {/* SAVING — loading state while generating summary and writing to DB */}
        {phase === PHASES.SAVING && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px 0', color: '#8a8070' }}>
            <div style={{ fontSize: '24px' }}>✦</div>
            <div style={{ fontSize: '14px' }}>Capturing the magic…</div>
          </div>
        )}

        {/* DONE — success state, shows AI-generated essence + next actions */}
        {phase === PHASES.DONE && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>✦</div>
              <div style={{ fontFamily: "'Georgia', serif", fontSize: '16px', color: accent }}>Captured.</div>
            </div>
            {aiSummary && (
              <div>
                <div style={{ background: 'rgba(196,168,130,0.08)', border: '1px solid rgba(196,168,130,0.2)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '11px', color: '#8a8070', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>The essence</div>
                  <div style={{ fontFamily: "'Georgia', serif", fontSize: '14px', color: '#e0d8cc', lineHeight: 1.65 }}>{aiSummary}</div>
                </div>
                {savedIdea && (
                  <RegenerateSummary
                    idea={savedIdea}
                    onRegenerated={updated => {
                      setAiSummary(updated.summary || '')
                      setSavedIdea(updated)
                      setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)))
                    }}
                  />
                )}
              </div>
            )}
            <button onClick={reset} style={{ background: accent, color: '#0f0d0b', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>capture another</button>
            <button onClick={() => { reset(); setPhase(PHASES.VIEWING) }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', fontSize: '14px', color: '#8a8070', cursor: 'pointer' }}>browse all ideas</button>
          </div>
        )}

        {/* VIEWING — browsable list of all saved ideas, click to expand detail */}
        {phase === PHASES.VIEWING && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedIdea ? (
              <IdeaDetail
                idea={selectedIdea}
                onBack={() => setSelectedIdea(null)}
                onUpdate={updated => {
                  setIdeas(prev => prev.map(i => (i.id === updated.id ? updated : i)))
                  setSelectedIdea(updated)
                }}
                onDelete={id => {
                  setIdeas(prev => prev.filter(i => i.id !== id))
                  setSelectedIdea(null)
                }}
              />
            ) : (
              <>
                <div style={{ fontSize: '12px', color: '#5a5248' }}>{ideas.length} idea{ideas.length !== 1 ? 's' : ''} captured</div>
                {ideas.map(idea => (
                  <IdeaCard key={idea.id} idea={idea} onClick={setSelectedIdea} />
                ))}
                <button onClick={() => { reset(); setPhase(PHASES.DUMPING) }} style={{ background: accent, color: '#0f0d0b', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}>
                  + capture new idea
                </button>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}