// src/pages/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { ThemeToggle, Input, Button, Alert } from '@/components/ui'
import { Eye, EyeOff, Calendar, TrendingUp, Trophy } from 'lucide-react'

/** Small candlestick glyph so SimTrader has a mark to pair with the IBA crest, not just a wordmark. */
function SimTraderGlyph({ accent, dim, size = 30 }: { accent: string; dim: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="11" width="4" height="12" rx="1" fill={dim} />
      <line x1="9" y1="6" x2="9" y2="11" stroke={dim} strokeWidth="1.5" />
      <line x1="9" y1="23" x2="9" y2="26" stroke={dim} strokeWidth="1.5" />
      <rect x="19" y="4" width="4" height="14" rx="1" fill={accent} />
      <line x1="21" y1="2" x2="21" y2="4" stroke={accent} strokeWidth="1.5" />
      <line x1="21" y1="18" x2="21" y2="21" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

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
      <div className="hidden lg:flex w-[480px] flex-shrink-0 flex-col justify-between p-12 relative overflow-hidden bg-ink dark:bg-dark-surface-secondary">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-iba/40" />
        <div className="absolute bottom-20 -left-16 w-64 h-64 rounded-full blur-3xl pointer-events-none bg-accent/20" />

        {/* IBA × SimTrader peer lockup */}
        <div className="relative z-10 self-start flex items-center gap-4">
          <img
            src={`${import.meta.env.BASE_URL}iba-logo.png`}
            alt="Institute of Business Administration — 70 Years & Beyond"
            className="h-16 w-auto object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div className="h-12 w-px flex-shrink-0 bg-white/15" />
          <div className="flex items-center gap-2.5">
            <SimTraderGlyph accent="#C4526A" dim="rgba(255,255,255,0.45)" />
            <div>
              <p className="font-semibold tracking-tight text-lg leading-tight text-white">SimTrader</p>
              <p className="text-[10px] font-semibold tracking-widest uppercase leading-tight text-dark-iba">Finance Lab</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="w-8 h-0.5 bg-dark-iba" />
          <p className="font-display text-4xl leading-snug italic text-white">
            Learn markets by<br />participating in them.
          </p>
          <p className="text-sm leading-relaxed max-w-xs text-white/50">
            A controlled simulation environment built for IBA students to understand order types,
            portfolio mechanics, and market microstructure using real PSX data.
          </p>

          {/* Live challenge feature card */}
          <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40">This semester</p>
                <p className="mt-0.5 text-[13px] font-semibold text-white">Live trading challenges</p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-success">
                <span className="w-1.5 h-1.5 rounded-full bg-dark-success animate-pulse_dot" />
                Active
              </span>
            </div>
            <div className="border-t border-white/10 px-5 py-4 flex gap-6">
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <Calendar className="w-3.5 h-3.5 text-white/40" />
                Semester-long
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <TrendingUp className="w-3.5 h-3.5 text-white/40" />
                Real EOD prices
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <Trophy className="w-3.5 h-3.5 text-white/40" />
                Ranked leaderboard
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/25">
          © {new Date().getFullYear()} Institute of Business Administration, Karachi
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 relative ambient-bg">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-sm animate-fade-up">
          {/* Mobile logo — same peer lockup as the desktop panel, scaled down */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <img
              src={`${import.meta.env.BASE_URL}iba-mark.png`}
              alt="IBA"
              className="h-8 w-auto object-contain"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div className="h-6 w-px flex-shrink-0 bg-ink/15 dark:bg-white/15" />
            <div className="flex items-center gap-2">
              <SimTraderGlyph size={22} accent="#8B1A2A" dim="rgba(15,15,14,0.4)" />
              <div>
                <p className="font-semibold tracking-tight text-sm leading-tight text-ink dark:text-dark-ink">SimTrader</p>
                <p className="text-[9px] font-semibold tracking-widest uppercase leading-tight text-iba dark:text-dark-iba">Finance Lab</p>
              </div>
            </div>
          </div>

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
