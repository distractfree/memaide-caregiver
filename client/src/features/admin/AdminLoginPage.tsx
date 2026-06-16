import { type FormEvent, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
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
        setErrorMessage('Sign in failed. Please check your password and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="adm-login-wrapper admin-portal">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="adm-login-card"
      >
        {/* Shield icon */}
        <div className="adm-login-icon">
          <ShieldCheck className="h-6 w-6" />
        </div>

        {/* Title */}
        <h2 className="adm-login-title">Admin Portal</h2>
        <p className="adm-login-subtitle">Secure access for authorized personnel only</p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="adm-login-input-group">
            <label htmlFor="adm-password" className="adm-login-label">Password</label>
            <input
              id="adm-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="adm-login-input"
            />
          </div>

          {errorMessage && (
            <div className="adm-login-error" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="adm-btn-navy full-width"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            <span>Sign In</span>
          </button>
        </form>

        <div className="adm-login-footer">
          MemAide is a care-coordination tool.<br />It is not a medical device.
        </div>
      </motion.div>
    </div>
  )
}
