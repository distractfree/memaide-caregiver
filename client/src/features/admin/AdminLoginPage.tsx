import { type FormEvent, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAdminAuth } from './AdminAuthContext'
import { ApiClientError } from '@/services/apiClient'

export function AdminLoginPage() {
  const { login } = useAdminAuth()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage(null)
    setSubmitting(true)

    try {
      await login(password)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Sign in failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6 sm:p-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md rounded-3xl bg-surface-container-lowest shadow-card border border-outline-variant/30 p-8 sm:p-10"
      >
        <div className="mb-8 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 shadow-sm border border-accent/20">
            <ShieldCheck className="h-6 w-6 text-accent-dark" />
          </div>
        </div>

        <div className="mb-7 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-on-surface">
            Admin Portal
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Caregiver coordination oversight for the student MVP.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Admin Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            placeholder="••••••••"
          />

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-error/30 bg-error-container/60 px-3 py-2 text-sm text-error font-medium"
            >
              {errorMessage}
            </div>
          )}

          <Button type="submit" loading={submitting} fullWidth size="lg" className="mt-2">
            Sign in
          </Button>
        </form>

        <div className="mt-7 flex justify-center">
           <p className="text-xs text-text-muted text-center">
             MemAide is a care-coordination tool.<br/>It is not a medical device.
           </p>
        </div>
      </motion.div>
    </div>
  )
}
