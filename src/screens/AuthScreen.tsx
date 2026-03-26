import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../services/firebase'
import { toUserError } from '../services/errorMap'
import { logError } from '../services/logger'
import { ensureUserProfile, getEmailByLoginIdentifier } from '../services/userProfile'

interface AuthScreenProps {
  onError: (message: string) => void
}

export function AuthScreen({ onError }: AuthScreenProps) {
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignUp = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    onError('')
    try {
      if (isSignUp) {
        const credentials = await createUserWithEmailAndPassword(auth, email, password)
        await ensureUserProfile({
          userId: credentials.user.uid,
          email,
          username,
          phone,
          publicKey: '',
        })
      } else {
        const resolvedEmail = await getEmailByLoginIdentifier(identifier)
        if (!resolvedEmail) {
          throw new Error('No account found with that email, username, or phone number')
        }
        await signInWithEmailAndPassword(auth, resolvedEmail, password)
      }
    } catch (error) {
      logError('auth.submit', error)
      onError(toUserError(error, 'Authentication failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-borderc bg-card p-6 shadow-soft" aria-label="Authentication form">
        <h1 className="mb-1 text-3xl font-semibold text-white">Private Chat</h1>
        <p className="mb-5 text-sm text-slate-400">End-to-end encrypted messaging MVP</p>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {isSignUp ? (
            <>
              <label className="grid gap-2 text-sm text-slate-200">
                <span>Username</span>
                <input className="h-11 rounded-xl border border-borderc bg-black/40 px-3 text-slate-100 outline-none focus:ring-2 focus:ring-purple-500" type="text" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} autoComplete="username" />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                <span>Email</span>
                <input className="h-11 rounded-xl border border-borderc bg-black/40 px-3 text-slate-100 outline-none focus:ring-2 focus:ring-purple-500" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                <span>Phone (optional)</span>
                <input className="h-11 rounded-xl border border-borderc bg-black/40 px-3 text-slate-100 outline-none focus:ring-2 focus:ring-purple-500" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91xxxxxxxxxx" autoComplete="tel" />
              </label>
            </>
          ) : (
            <label className="grid gap-2 text-sm text-slate-200">
              <span>Email / Username / Phone</span>
              <input className="h-11 rounded-xl border border-borderc bg-black/40 px-3 text-slate-100 outline-none focus:ring-2 focus:ring-purple-500" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" />
            </label>
          )}
          <label className="grid gap-2 text-sm text-slate-200">
            <span>Password</span>
            <input className="h-11 rounded-xl border border-borderc bg-black/40 px-3 text-slate-100 outline-none focus:ring-2 focus:ring-purple-500" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={isSignUp ? 'new-password' : 'current-password'} />
          </label>
          <button className="h-11 rounded-xl bg-purple-700 font-medium text-white transition hover:bg-purple-600 disabled:opacity-60" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button type="button" className="mt-3 w-full rounded-xl border border-borderc bg-transparent py-2 text-sm text-slate-300" onClick={() => setMode(isSignUp ? 'signin' : 'signup')}>
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </section>
    </main>
  )
}
