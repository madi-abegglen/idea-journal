'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/journal')
  }

  const bg = '#0f0d0b'
  const accent = '#c4a882'

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#f0ece4', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '3px' }}>Madi's</div>
          <div style={{ fontFamily: "'Georgia', serif", fontSize: '22px', color: accent, letterSpacing: '0.01em' }}>Idea Journal</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
            placeholder="Password"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '14px', color: '#f0ece4', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {error && <div style={{ fontSize: '13px', color: '#e07070' }}>{error}</div>}

        <button
          onClick={handleLogin}
          disabled={loading || !email.trim() || !password.trim()}
          style={{ background: loading || !email.trim() || !password.trim() ? 'rgba(255,255,255,0.08)' : accent, color: loading || !email.trim() || !password.trim() ? '#5a5248' : '#0f0d0b', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 600, cursor: loading || !email.trim() || !password.trim() ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

      </div>
    </div>
  )
}