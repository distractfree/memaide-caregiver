import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, HeartPulse, Lock, LogIn, Mail, Sparkles, User, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthContext'
import { ApiClientError } from '@/services/apiClient'

const DEMO_EMAIL = 'demo@memaide.local'
const DEMO_PASSWORD = 'Password123!'

export function LoginPage() {
  const { login, register, isAuthenticated, isBootstrapping } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (isBootstrapping) return null
  if (isAuthenticated) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage(null)

    if (mode === 'register') {
      const trimmedName = name.trim()
      if (trimmedName.length < 1 || trimmedName.length > 100) {
        setErrorMessage('Full name must be between 1 and 100 characters.')
        return
      }
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        setErrorMessage('Password must be at least 8 characters and contain at least one letter and one number.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          confirmPassword
        })
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'EMAIL_CONFLICT') {
          setErrorMessage('An account with this email already exists. Please sign in instead.')
        } else {
          setErrorMessage(err.message)
        }
      } else {
        setErrorMessage(mode === 'login' ? 'Sign in failed. Please try again.' : 'Create account failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setErrorMessage(null)
  }



  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Brand panel — CSS gradient (shader fallback) */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 20% 25%, rgba(252,108,41,0.45), transparent 55%),' +
            'radial-gradient(circle at 80% 75%, rgba(166,59,0,0.42), transparent 60%),' +
            'linear-gradient(135deg, #1a1c1c 0%, #2f3131 100%)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent shadow-card">
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">MemAide</p>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Caregiver Portal</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="max-w-md"
        >
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Quiet, dependable support for the people you care for.
          </h1>
          <p className="mt-4 text-white/70 text-base leading-relaxed">
            Caregiver coordination for reminders, wellness trends, and independent living support.
          </p>

          <ul className="mt-8 flex flex-col gap-3 text-sm text-white/80">
            <li className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Gentle medication and care reminders
            </li>
            <li className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              Best-effort wellness trends, not diagnosis
            </li>
          </ul>
        </motion.div>

        <p className="text-xs text-white/40">
          MemAide is a care-coordination tool. It is not a medical device.
        </p>
      </div>

      {/* Sign-in card */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md rounded-3xl bg-surface-container-lowest shadow-card border border-outline-variant/30 p-8 sm:p-10"
        >
          <div className="mb-8 flex w-full border-b border-outline-variant/30">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMessage(null); }}
              className={`relative flex flex-1 items-center justify-center gap-2 pb-4 text-sm font-medium transition-colors ${
                mode === 'login' ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface/80'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Sign In
              {mode === 'login' && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#F26522]"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMessage(null); }}
              className={`relative flex flex-1 items-center justify-center gap-2 pb-4 text-sm font-medium transition-colors ${
                mode === 'register' ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface/80'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Create Account
              {mode === 'register' && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#F26522]"
                />
              )}
            </button>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight text-on-surface">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {mode === 'login' ? 'Sign in to your caregiver portal to continue.' : 'Register a new caregiver account.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence mode="popLayout">
              {mode === 'register' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <Input
                    label="Full Name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    leftIcon={<User className="h-4 w-4" />}
                    placeholder="Your Name"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              placeholder="you@example.com"
            />

            <Input
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder="••••••••"
            />

            <AnimatePresence mode="popLayout">
              {mode === 'register' && (
                <motion.div
                  key="confirm-password-field"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <Input
                    label="Confirm Password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    leftIcon={<Lock className="h-4 w-4" />}
                    placeholder="••••••••"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2 text-sm text-error font-medium"
              >
                {errorMessage}
              </div>
            )}

            <Button type="submit" loading={submitting} fullWidth size="lg" className="mt-2">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>

            {mode === 'login' && (
              <Button type="button" variant="ghost" size="sm" onClick={fillDemo} fullWidth>
                Use demo credentials
              </Button>
            )}
          </form>

        </motion.div>
      </div>
    </div>
  )
}
