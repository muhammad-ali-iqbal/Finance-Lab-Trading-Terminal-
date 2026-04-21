// src/pages/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Alert, ThemeToggle } from '@/components/ui'
import { Eye, EyeOff } from 'lucide-react'

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
        <div className="flex items-center gap-3">
          <img
            src="/iba-logo.png"
            alt="IBA"
            className="h-9 w-auto object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div>
            <p className="text-surface dark:text-dark-surface font-semibold tracking-tight text-sm leading-tight">SimTrader</p>
            <p className="text-[10px] font-semibold tracking-widest uppercase leading-tight" style={{ color: '#C4526A' }}>Finance Lab</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="w-8 h-0.5 bg-iba" />
          <p className="font-display text-4xl text-surface dark:text-dark-surface leading-snug italic">
            Learn markets by<br />participating in them.
          </p>
          <p className="text-sm text-surface/50 dark:text-dark-surface/50 leading-relaxed max-w-xs">
            A controlled simulation environment built for IBA students to understand order types, portfolio mechanics, and market microstructure using real PSX data.
          </p>
        </div>

        <div className="text-xs text-surface/30 dark:text-dark-surface/30">
          © {new Date().getFullYear()} Institute of Business Administration, Karachi
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
          <div className="flex lg:hidden items-center gap-2.5 mb-10">
            <img
              src="/iba-logo.png"
              alt="IBA"
              className="h-7 w-auto object-contain"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div>
              <p className="font-semibold tracking-tight text-ink dark:text-dark-ink text-sm leading-tight">SimTrader</p>
              <p className="text-[9px] font-semibold tracking-widest uppercase text-iba dark:text-dark-iba leading-tight">Finance Lab</p>
            </div>
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

          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary text-center mt-6">
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
