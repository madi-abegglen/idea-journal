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
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
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

  // Read the signed-in user's first name (set at sign-up) for the header greeting
  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setFirstName(user?.user_metadata?.first_name || '')
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

  // Called after all deepening questions are answered — generates summary and saves to DB
  async function finishCapture() {
    setPhase(PHASES.SAVING)
    try {
      // Tag the idea with its owner so per-user RLS policies can scope access
      const { data: { user } } = await supabase.auth.getUser()
      const ideaData = { dump, ...answers, timestamp: Date.now() }
      const summary = await generateSummary(ideaData)
      const { data, error } = await supabase
        .from('ideas')
        .insert([{ ...ideaData, summary, user_id: user?.id }])
        .select()
        .single()
      if (error) throw error
      setAiSummary(summary)
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
    setAnswers(prev => ({ ...prev, [q.key]: currentAnswer }))
    setCurrentAnswer('')
    if (currentQ < DEEPENING_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      finishCapture()
    }
  }

  // Same as next but saves empty string for this question
  function handleSkipQuestion() {
    const q = DEEPENING_QUESTIONS[currentQ]
    setAnswers(prev => ({ ...prev, [q.key]: '' }))
    setCurrentAnswer('')
    if (currentQ < DEEPENING_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      finishCapture()
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
          <div>
            {/* Possessive eyebrow only shows when we know the user's first name */}
            {firstName && (
              <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '3px' }}>{`${firstName}'s`}</div>
            )}
            <div style={{ fontFamily: "'Georgia', serif", fontSize: '22px', color: accent }}>Idea Journal</div>
          </div>
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
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', color: '#5a5248', cursor: 'pointer', fontSize: '12px' }}>sign out</button>
          </div>
        </div>

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
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey && dump.trim()) setPhase(PHASES.DEEPENING) }}
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
              <div style={{ background: 'rgba(196,168,130,0.08)', border: '1px solid rgba(196,168,130,0.2)', borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', color: '#8a8070', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>The essence</div>
                <div style={{ fontFamily: "'Georgia', serif", fontSize: '14px', color: '#e0d8cc', lineHeight: 1.65 }}>{aiSummary}</div>
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