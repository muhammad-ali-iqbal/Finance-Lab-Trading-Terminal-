// src/pages/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Alert, ThemeToggle } from '@/components/ui'
import { Eye, EyeOff, TrendingUp } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div className="min-h-screen bg-surface-secondary dark:bg-dark-surface-secondary flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-[480px] flex-shrink-0 bg-ink dark:bg-dark-ink flex-col justify-between p-12">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-surface dark:bg-dark-surface rounded-sm flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-ink dark:text-dark-ink" strokeWidth={2.5} />
          </div>
          <span className="text-surface dark:text-dark-surface font-semibold tracking-tight">SimTrader</span>
        </div>

        <div className="space-y-6">
          <p className="font-display text-4xl text-surface leading-snug italic">
            Learn markets by<br />participating in them.
          </p>
          <p className="text-sm text-surface/50 leading-relaxed max-w-xs">
            A controlled simulation environment for understanding order types, portfolio mechanics, and market microstructure.
          </p>
        </div>

        <div className="text-xs text-surface/30">
          © {new Date().getFullYear()} SimTrader Academic Platform
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Theme toggle — top right */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-10">
            <div className="w-7 h-7 bg-ink dark:bg-dark-ink rounded-sm flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-surface dark:text-dark-surface" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight text-ink dark:text-dark-ink">SimTrader</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-ink dark:text-dark-ink tracking-tight">Sign in</h1>
            <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-1">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {login.isError && (
              <Alert
                variant="error"
                message={(login.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed. Please try again.'}
              />
            )}

            <Input
              label="Email address"
              type="email"
              placeholder="you@university.edu"
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
                <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}>
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-accent dark:text-dark-accent hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" fullWidth size="lg" loading={login.isPending}>
              Sign in
            </Button>
          </form>

          <p className="text-xs text-ink-tertiary text-center mt-6">
            Don't have an account?{' '}
            <span className="text-ink-secondary">
              Contact your instructor to receive an invite link.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
