import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card } from './ui'

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (isSignUp && !result.data.session) {
      setMessage('Check your email to confirm your account, then sign in.')
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href.split('#')[0],
      },
    })

    if (signInError) {
      setError(signInError.message)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 py-10">
      <Card className="w-full max-w-md p-7 sm:p-9">
        <div className="mb-8 flex justify-center">
          <img
            src={`${import.meta.env.BASE_URL}1.png?v=2`}
            alt="Masheleni"
            className="h-auto w-64 max-w-full"
          />
        </div>
        <h1 className="text-center font-display text-3xl font-semibold tracking-[-0.06em]">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-center text-sm text-muted">{isSignUp ? 'Start keeping your budget in one place.' : 'Sign in to continue to your budget.'}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="auth-email">
            Email
            <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-ink/12 bg-canvas px-3 text-sm font-normal outline-none focus:border-ink/40" />
          </label>
          <label className="block text-sm font-semibold" htmlFor="auth-password">
            Password
            <input id="auth-password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-ink/12 bg-canvas px-3 text-sm font-normal outline-none focus:border-ink/40" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-coral/12 px-3 py-2 text-sm text-coral-dark">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-mint/12 px-3 py-2 text-sm text-mint-dark">{message}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}</Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted"><div className="h-px flex-1 bg-ink/10" /><span>or</span><div className="h-px flex-1 bg-ink/10" /></div>
        <Button type="button" variant="secondary" className="w-full" onClick={handleGoogleSignIn}>Continue with Google</Button>

        <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }} className="mt-5 w-full text-center text-sm font-semibold text-muted hover:text-ink">
          {isSignUp ? 'Already have an account? Sign in' : 'New to Masheleni? Create an account'}
        </button>
      </Card>
    </main>
  )
}