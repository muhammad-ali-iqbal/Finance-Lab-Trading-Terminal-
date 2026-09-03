// src/pages/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { ThemeToggle } from '@/components/ui'
import { useTheme } from '@/context/ThemeContext'
import { Eye, EyeOff } from 'lucide-react'

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
  const navigate  = useNavigate()
  const setAuth   = useAuthStore(s => s.setAuth)
  const { theme } = useTheme()
  const dark      = theme === 'dark'

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

  const inputBase: React.CSSProperties = {
    width: '100%',
    borderRadius: 6,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    backgroundColor: dark ? '#3a2535' : '#ffffff',
    border:          `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#E4E4E0'}`,
    color:           dark ? 'rgba(255,255,255,0.9)' : '#0F0F0E',
    caretColor:      dark ? '#b81481' : '#1A5CFF',
  }
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => Object.assign(e.currentTarget.style, {
    borderColor: dark ? '#b81481' : '#1A5CFF',
    boxShadow:   dark ? '0 0 0 3px rgba(184,20,129,0.2)' : '0 0 0 2px rgba(26,92,255,0.15)',
  })
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => Object.assign(e.currentTarget.style, {
    borderColor: dark ? 'rgba(255,255,255,0.08)' : '#E4E4E0',
    boxShadow:   'none',
  })

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: dark ? '#21111c' : '#F8F8F7' }}
    >
      {/* ── Left branding panel ── */}
      <div
        className="hidden lg:flex w-[480px] flex-shrink-0 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: dark ? '#2d1b28' : '#0F0F0E' }}
      >
        {dark && <>
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(184,20,129,0.25), transparent)' }} />
          <div className="absolute bottom-24 -left-12 w-56 h-56 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18), transparent)' }} />
        </>}

        <div className="relative z-10 self-start flex items-center gap-4">
          <img
            src={`${import.meta.env.BASE_URL}iba-logo.png`}
            alt="Institute of Business Administration — 70 Years & Beyond"
            className="h-16 w-auto object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div className="h-12 w-px flex-shrink-0"
            style={{ backgroundColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(242,241,239,0.22)' }} />
          <div className="flex items-center gap-2.5">
            <SimTraderGlyph
              accent={dark ? '#b81481' : '#8B1A2A'}
              dim={dark ? 'rgba(255,255,255,0.45)' : 'rgba(242,241,239,0.55)'}
            />
            <div>
              <p className="font-semibold tracking-tight text-lg leading-tight"
                style={{ color: dark ? '#ffffff' : '#F2F1EF' }}>
                SimTrader
              </p>
              <p className="text-[10px] font-semibold tracking-widest uppercase leading-tight"
                style={{ color: dark ? '#b81481' : '#8B1A2A' }}>
                Finance Lab
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="w-8 h-0.5" style={{ backgroundColor: dark ? '#b81481' : '#8B1A2A' }} />
          <p className="font-display text-4xl leading-snug italic"
            style={{ color: dark ? '#ffffff' : '#F2F1EF' }}>
            Learn markets by<br />participating in them.
          </p>
          <p className="text-sm leading-relaxed max-w-xs"
            style={{ color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(242,241,239,0.5)' }}>
            A controlled simulation environment built for IBA students to understand order types,
            portfolio mechanics, and market microstructure using real PSX data.
          </p>
        </div>

        <div className="relative z-10 text-xs"
          style={{ color: dark ? 'rgba(255,255,255,0.22)' : 'rgba(242,241,239,0.3)' }}>
          © {new Date().getFullYear()} Institute of Business Administration, Karachi
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex items-center justify-center p-6 relative"
        style={{ backgroundColor: dark ? '#21111c' : '#F8F8F7' }}
      >
        {dark && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
            style={{ backgroundColor: '#b81481', opacity: 0.06 }} />
        )}

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
            <div className="h-6 w-px flex-shrink-0"
              style={{ backgroundColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,15,14,0.14)' }} />
            <div className="flex items-center gap-2">
              <SimTraderGlyph
                size={22}
                accent={dark ? '#b81481' : '#8B1A2A'}
                dim={dark ? 'rgba(255,255,255,0.45)' : 'rgba(15,15,14,0.4)'}
              />
              <div>
                <p className="font-semibold tracking-tight text-sm leading-tight"
                  style={{ color: dark ? '#ffffff' : '#0F0F0E' }}>
                  SimTrader
                </p>
                <p className="text-[9px] font-semibold tracking-widest uppercase leading-tight"
                  style={{ color: dark ? '#b81481' : '#8B1A2A' }}>
                  Finance Lab
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight"
              style={{ color: dark ? '#ffffff' : '#0F0F0E' }}>
              Sign in
            </h1>
            <p className="text-sm mt-1"
              style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#4A4A47' }}>
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {login.isError && (
              <div
                className="rounded px-3 py-2.5 text-sm font-medium"
                style={dark ? {
                  backgroundColor: 'rgba(224,64,46,0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(224,64,46,0.25)',
                } : {
                  backgroundColor: '#FEF0EE',
                  color: '#C8291A',
                  border: '1px solid rgba(200,41,26,0.15)',
                }}
              >
                {(login.error as { response?: { data?: { error?: string } } })?.response?.data?.error
                  ?? 'Login failed. Please try again.'}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium"
                style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#4A4A47' }}>
                Email address
              </label>
              <input
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                style={inputBase}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium"
                style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#4A4A47' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ ...inputBase, paddingRight: '2.5rem' }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
                  style={{ color: dark ? 'rgba(255,255,255,0.35)' : '#8A8A85' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs hover:underline"
                style={{ color: dark ? '#b81481' : '#1A5CFF' }}
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={login.isPending || !email || !password}
              className="w-full h-11 px-6 text-sm font-medium rounded transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={dark ? {
                background: 'linear-gradient(135deg, #b81481, #d91b98)',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(184,20,129,0.25)',
              } : {
                backgroundColor: '#0F0F0E',
                color: '#F2F1EF',
                border: '1px solid #0F0F0E',
              }}
            >
              {login.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-center mt-6"
            style={{ color: dark ? 'rgba(255,255,255,0.25)' : '#8A8A85' }}>
            Don't have an account?{' '}
            <span style={{ color: dark ? 'rgba(255,255,255,0.45)' : '#4A4A47' }}>
              Contact your instructor to receive an invite link.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
