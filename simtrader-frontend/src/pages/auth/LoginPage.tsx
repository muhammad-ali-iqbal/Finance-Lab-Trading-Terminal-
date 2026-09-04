// src/pages/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { ThemeToggle, Input, Button, Alert } from '@/components/ui'
import { Eye, EyeOff } from 'lucide-react'
import { AuthBrandingPanel, AuthMobileLockup } from './AuthBranding'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)

  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const login = useMutation({
    mutationFn: () => authApi.login({ email, password }),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken)
      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    login.mutate()
  }

  const errorMessage = login.isError
    ? (login.error as { response?: { data?: { error?: string } } })?.response?.data?.error
      ?? 'Login failed. Please try again.'
    : null

  return (
    <div className="min-h-screen flex bg-surface-secondary dark:bg-dark-surface">
      {/* ── Left branding panel — an always-dark surface (brand statement), independent of the site's own theme toggle ── */}
      <AuthBrandingPanel />

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 relative ambient-bg">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-sm animate-fade-up">
          {/* Mobile logo — same peer lockup as the desktop panel, scaled down */}
          <AuthMobileLockup />

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-dark-ink">Sign in</h1>
            <p className="text-sm mt-1 text-ink-secondary dark:text-dark-ink-secondary">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && <Alert variant="error" message={errorMessage} />}

            <Input
              label="Email address"
              type="email"
              placeholder="you@iba.edu.pk"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  tabIndex={-1}
                  className="pointer-events-auto hover:text-ink dark:hover:text-dark-ink transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-accent dark:text-dark-accent hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={login.isPending}
              disabled={!email || !password}
            >
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-xs text-center mt-6 text-ink-tertiary dark:text-dark-ink-tertiary">
            Don't have an account?{' '}
            <span className="text-ink-secondary dark:text-dark-ink-secondary">
              Contact your instructor to receive an invite link.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
