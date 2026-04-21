// src/components/ui/index.tsx
// Design system primitives. Every screen composes from these.
// Typed props, consistent sizing, no magic numbers.

export { ThemeToggle } from './ThemeToggle'

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

// ── Button ───────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'

    const variants = {
      primary:   'bg-ink text-surface hover:bg-ink/90 border border-ink dark:bg-dark-ink dark:text-dark-surface dark:hover:bg-dark-ink/90 dark:border-dark-ink',
      secondary: 'bg-surface text-ink hover:bg-surface-secondary border border-border dark:bg-dark-surface dark:text-dark-ink dark:hover:bg-dark-surface-secondary dark:border-dark-border',
      ghost:     'bg-transparent text-ink-secondary hover:bg-surface-secondary hover:text-ink dark:text-dark-ink-secondary dark:hover:bg-dark-surface-secondary dark:hover:text-dark-ink border border-transparent',
      danger:    'bg-danger text-white hover:bg-danger/90 border border-danger dark:bg-dark-danger dark:hover:bg-dark-danger/90 dark:border-dark-danger',
    }

    const sizes = {
      sm: 'h-7 px-3 text-xs',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-6 text-sm',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
        {...props}
      >
        {loading && <Spinner size="sm" className="text-current" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

// ── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-dark-ink-tertiary">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'h-9 w-full rounded border bg-surface text-sm text-ink placeholder:text-ink-disabled',
              'dark:bg-dark-surface dark:text-dark-ink dark:placeholder:text-dark-ink-disabled',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 focus:border-accent',
              'dark:focus:ring-dark-accent dark:focus:border-dark-accent',
              error ? 'border-danger focus:ring-danger dark:border-dark-danger dark:focus:ring-dark-danger' : 'border-border hover:border-border-strong dark:border-dark-border dark:hover:border-dark-border-strong',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              'px-3',
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary dark:text-dark-ink-tertiary">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-danger dark:text-dark-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">{hint}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'solid' | 'glass'
  onClick?: () => void
}

export function Card({ children, className, padding = 'md', variant = 'solid', onClick }: CardProps) {
  const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }
  const base = variant === 'glass'
    ? 'glass-subtle rounded-lg'
    : 'bg-surface border border-border rounded-lg shadow-card dark:bg-dark-surface dark:border-dark-border dark:shadow-dark-card'
  return (
    <div
      onClick={onClick}
      className={clsx(base, paddings[padding], className, onClick && 'cursor-pointer')}
    >
      {children}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'accent' | 'neutral'
  size?: 'sm' | 'md'
}

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const variants = {
    default:  'bg-surface-tertiary text-ink-secondary dark:bg-dark-surface-tertiary dark:text-dark-ink-secondary',
    success:  'bg-success-muted text-success-text dark:bg-dark-success-muted dark:text-dark-success-text',
    danger:   'bg-danger-muted text-danger-text dark:bg-dark-danger-muted dark:text-dark-danger-text',
    warning:  'bg-warning-muted text-warning-text dark:bg-dark-warning-muted dark:text-dark-warning-text',
    accent:   'bg-accent-muted text-accent-text dark:bg-dark-accent-muted dark:text-dark-accent-text',
    neutral:  'bg-surface-secondary text-ink-tertiary dark:bg-dark-surface-secondary dark:text-dark-ink-tertiary',
  }
  const sizes = { sm: 'text-[10px] px-1.5 py-0.5', md: 'text-xs px-2 py-1' }

  return (
    <span className={clsx('inline-flex items-center rounded font-medium', variants[variant], sizes[size])}>
      {children}
    </span>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────

interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; className?: string }

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-6 h-6' }
  return (
    <svg
      className={clsx('animate-spin text-ink-tertiary dark:text-dark-ink-tertiary', sizes[size], className)}
      fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-border dark:border-dark-border', className)} />
}

// ── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  delta?: number       // positive = green, negative = red
  deltaLabel?: string
  mono?: boolean
  variant?: 'solid' | 'glass'
  className?: string
}

export function StatCard({ label, value, delta, deltaLabel, mono, variant = 'solid', className }: StatCardProps) {
  return (
    <Card variant={variant} className={clsx('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium uppercase tracking-widest text-ink-tertiary dark:text-dark-ink-tertiary">{label}</span>
      <span className={clsx('text-xl font-semibold text-ink dark:text-dark-ink', mono && 'font-mono tabular-nums')}>
        {value}
      </span>
      {delta !== undefined && (
        <span className={clsx('text-xs font-medium', delta >= 0 ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(2)}% {deltaLabel}
        </span>
      )}
    </Card>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="mb-1 text-ink-disabled dark:text-dark-ink-disabled">{icon}</div>}
      <p className="text-sm font-medium text-ink-secondary dark:text-dark-ink-secondary">{title}</p>
      {description && <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary max-w-xs">{description}</p>}
    </div>
  )
}

// ── Alert ────────────────────────────────────────────────────────────────────

interface AlertProps { variant: 'error' | 'warning' | 'success'; message: string; className?: string }

export function Alert({ variant, message, className }: AlertProps) {
  const styles = {
    error:   'bg-danger-muted border-danger/20 text-danger-text dark:bg-dark-danger-muted dark:border-dark-danger/20 dark:text-dark-danger-text',
    warning: 'bg-warning-muted border-warning/20 text-warning-text dark:bg-dark-warning-muted dark:border-dark-warning/20 dark:text-dark-warning-text',
    success: 'bg-success-muted border-success/20 text-success-text dark:bg-dark-success-muted dark:border-dark-success/20 dark:text-dark-success-text',
  }
  return (
    <div className={clsx('rounded border px-3 py-2.5 text-sm', styles[variant], className)}>
      {message}
    </div>
  )
}
