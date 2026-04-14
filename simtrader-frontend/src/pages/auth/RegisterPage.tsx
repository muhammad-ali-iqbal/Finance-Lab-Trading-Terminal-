// src/pages/auth/RegisterPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Alert } from '@/components/ui'
import { Eye, EyeOff, TrendingUp, CheckCircle2 } from 'lucide-react'

const requirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  { label: 'Contains a letter', test: (p: string) => /[a-zA-Z]/.test(p) },
]

export default function RegisterPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const inviteToken = params.get('token') ?? ''

  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const passwordsMatch = form.password === form.confirm
  const allReqsMet = requirements.every(r => r.test(form.password))

  const register = useMutation({
    mutationFn: () =>
      authApi.register({
        inviteToken,
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      }),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken)
      navigate('/dashboard')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!passwordsMatch || !allReqsMet) return
    register.mutate()
  }

  if (!inviteToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="text-center space-y-2 max-w-sm px-4">
          <h2 className="text-lg font-semibold text-ink">Invalid invitation link</h2>
          <p className="text-sm text-ink-secondary">
            This link is missing a token. Please use the link from your invitation email, or contact your instructor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 bg-ink rounded-sm flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-surface" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">SimTrader</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Create your account</h1>
          <p className="text-sm text-ink-secondary mt-1">
            You've been invited to SimTrader. Set up your profile to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {register.isError && (
            <Alert
              variant="error"
              message={(register.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Registration failed. The invite link may have expired.'}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              placeholder="Sarah"
              value={form.firstName}
              onChange={set('firstName')}
              autoComplete="given-name"
              required
              autoFocus
            />
            <Input
              label="Last name"
              placeholder="Ahmed"
              value={form.lastName}
              onChange={set('lastName')}
              autoComplete="family-name"
              required
            />
          </div>

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Choose a strong password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
            required
            rightIcon={
              <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          {/* Password requirements */}
          {form.password.length > 0 && (
            <ul className="space-y-1 pl-1">
              {requirements.map(r => (
                <li key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.test(form.password) ? 'text-success' : 'text-ink-tertiary'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {r.label}
                </li>
              ))}
            </ul>
          )}

          <Input
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Repeat your password"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            error={form.confirm.length > 0 && !passwordsMatch ? 'Passwords do not match' : undefined}
            required
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={register.isPending}
            disabled={!passwordsMatch || !allReqsMet}
            className="mt-2"
          >
            Create account
          </Button>
        </form>
      </div>
    </div>
  )
}
