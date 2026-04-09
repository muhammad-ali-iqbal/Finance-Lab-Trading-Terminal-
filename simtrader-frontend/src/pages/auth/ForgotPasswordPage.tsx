// src/pages/auth/ForgotPasswordPage.tsx
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { Button, Input, Alert } from '@/components/ui'
import { TrendingUp, ArrowLeft } from 'lucide-react'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')

  const forgot = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    forgot.mutate()
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 bg-ink rounded-sm flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-surface" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">SimTrader</span>
        </div>

        {forgot.isSuccess ? (
          <div className="text-center space-y-3 py-6">
            <div className="w-12 h-12 bg-success-muted rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-ink">Check your email</h2>
            <p className="text-sm text-ink-secondary">
              If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
            </p>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline mt-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-ink tracking-tight">Forgot password?</h1>
              <p className="text-sm text-ink-secondary mt-1">
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {forgot.isError && (
                <Alert variant="error" message="Something went wrong. Please try again." />
              )}

              <Input
                label="Email address"
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />

              <Button type="submit" fullWidth size="lg" loading={forgot.isPending}>
                Send reset link
              </Button>
            </form>

            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-ink-tertiary hover:text-ink mt-6 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

// ── Reset Password ────────────────────────────────────────────────────────────

import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => {
      setTimeout(() => navigate('/login'), 1500)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm || password.length < 8) return
    reset.mutate()
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <h2 className="text-lg font-semibold text-ink">Invalid reset link</h2>
          <p className="text-sm text-ink-secondary mt-1">
            This link is invalid or has expired. Please request a new one.
          </p>
          <Link to="/forgot-password" className="text-sm text-accent hover:underline mt-3 inline-block">
            Request new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 bg-ink rounded-sm flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-surface" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">SimTrader</span>
        </div>

        {reset.isSuccess ? (
          <div className="text-center space-y-3 py-6">
            <div className="w-12 h-12 bg-success-muted rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-ink">Password updated</h2>
            <p className="text-sm text-ink-secondary">Redirecting you to sign in…</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-ink tracking-tight">Set new password</h1>
              <p className="text-sm text-ink-secondary mt-1">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {reset.isError && (
                <Alert
                  variant="error"
                  message={(reset.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'This link may have expired.'}
                />
              )}

              <Input
                label="New password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                hint="Minimum 8 characters"
                rightIcon={
                  <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <Input
                label="Confirm password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                error={confirm.length > 0 && password !== confirm ? 'Passwords do not match' : undefined}
              />

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={reset.isPending}
                disabled={password !== confirm || password.length < 8}
              >
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
