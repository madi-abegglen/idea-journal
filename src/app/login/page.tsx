'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  // Auth mode — toggles the form between signing in and creating an account
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('') // info message, e.g. "confirm your email"
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const isSignUp = mode === 'signup'

  // Form is submittable once the required fields for the current mode are filled
  const canSubmit = !!(email.trim() && password.trim() && (!isSignUp || firstName.trim()))
  const disabled = loading || !canSubmit

  async function handleLogin() {
    setLoading(true)
    setError('')
    setNotice('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/journal')
  }

  // Register a new account, stashing first_name in user_metadata for the journal header greeting
  async function handleSignUp() {
    setLoading(true)
    setError('')
    setNotice('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName.trim() } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // With email confirmation enabled, signUp returns no session — prompt to confirm instead of redirecting
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.')
      setMode('signin')
      setLoading(false)
      return
    }

    router.push('/journal')
  }

  // Dispatch to the right handler for the active mode
  function handleSubmit() {
    if (!canSubmit) return
    if (isSignUp) handleSignUp()
    else handleLogin()
  }

  // Flip between sign in / sign up and clear any stale messages
  function toggleMode() {
    setMode(isSignUp ? 'signin' : 'signup')
    setError('')
    setNotice('')
  }

  const bg = '#0f0d0b'
  const accent = '#c4a882'

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#f0ece4', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <div>
          <div style={{ fontFamily: "'Georgia', serif", fontSize: '22px', color: accent, letterSpacing: '0.01em' }}>Idea Journal</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* First name — only needed when creating an account */}
          {isSignUp && (
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="What name do you go by?"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Password"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {error && <div style={{ fontSize: '13px', color: '#e07070' }}>{error}</div>}
        {notice && <div style={{ fontSize: '13px', color: accent }}>{notice}</div>}

        <button
          onClick={handleSubmit}
          disabled={disabled}
          style={{ background: disabled ? 'rgba(255,255,255,0.08)' : accent, color: disabled ? '#5a5248' : '#0f0d0b', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {loading ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Sign up' : 'Sign in')}
        </button>

        {/* Mode toggle */}
        <button
          onClick={toggleMode}
          style={{ background: 'none', border: 'none', color: '#8a8070', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

      </div>
    </div>
  )
}
