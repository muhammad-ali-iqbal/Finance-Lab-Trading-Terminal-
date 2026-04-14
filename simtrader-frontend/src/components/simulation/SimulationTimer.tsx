// src/components/simulation/SimulationTimer.tsx
//
// Shows simulation progress as a progress bar with elapsed/remaining time.
// Polls the /progress endpoint every 2s while the simulation is active.
// Used in both the admin panel (with controls) and student dashboard (read-only).

import { useQuery } from '@tanstack/react-query'
import { simulationApi } from '@/api'
import clsx from 'clsx'
import type { SimulationStatus } from '@/types'

interface SimulationTimerProps {
  simulationId: string
  /** Show compact single-line version for sidebar */
  compact?: boolean
  /** Admin mode shows the raw simulated timestamps */
  showSimTime?: boolean
}

function formatTime(minutes: number): string {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatSimTime(isoString: string | null): string {
  if (!isoString) return '—'
  const d = new Date(isoString)
  // Show in PKT (UTC+5)
  return d.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
    hour12: false,
  })
}

function statusColor(status: SimulationStatus) {
  switch (status) {
    case 'active':    return 'bg-success'
    case 'paused':    return 'bg-warning'
    case 'completed': return 'bg-ink-disabled'
    default:          return 'bg-ink-disabled'
  }
}

export function SimulationTimer({
  simulationId,
  compact = false,
  showSimTime = false,
}: SimulationTimerProps) {
  const { data: progress } = useQuery({
    queryKey: ['simulation', simulationId, 'progress'],
    queryFn: () => simulationApi.getProgress(simulationId),
    // Poll every 2 seconds while active, every 10s when paused/completed
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'active') return 2000
      if (status === 'paused') return 10000
      return false
    },
    staleTime: 1000,
  })

  if (!progress || !progress.hasData) {
    if (compact) return null
    return (
      <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3">
        <p className="text-xs text-ink-tertiary">No price data uploaded yet</p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, progress.progressPct))
  const isActive    = progress.status === 'active'
  const isPaused    = progress.status === 'paused'
  const isCompleted = progress.status === 'completed'

  // ── Compact (sidebar) version ───────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-1.5">
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <span className={clsx(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isActive ? 'animate-pulse_dot bg-success' : isPaused ? 'bg-warning' : 'bg-ink-disabled'
          )} />
          <div className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-700', statusColor(progress.status))}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-ink-tertiary w-8 text-right">
            {Math.round(pct)}%
          </span>
        </div>
        {/* Time labels */}
        <div className="flex justify-between text-[10px] text-ink-tertiary font-mono px-3">
          <span>{formatTime(progress.elapsedMinutes)}</span>
          <span>{formatTime(progress.remainingMinutes)} left</span>
        </div>
      </div>
    )
  }

  // ── Full version ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-secondary">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isActive    ? 'animate-pulse_dot bg-success' :
            isPaused    ? 'bg-warning' :
            isCompleted ? 'bg-ink-disabled' : 'bg-ink-disabled'
          )} />
          <span className="text-xs font-semibold text-ink capitalize">
            {isCompleted ? 'Simulation complete' : progress.status}
          </span>
        </div>
        <span className="text-xs font-mono text-ink-tertiary">
          {Math.round(pct)}% complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-700',
              statusColor(progress.status)
            )}
            style={{ width: `${pct}%` }}
          />
          {/* Animated shimmer on active */}
          {isActive && (
            <div
              className="absolute inset-y-0 w-16 bg-white/20 blur-sm"
              style={{
                left: `${Math.max(0, pct - 8)}%`,
                animation: 'shimmer 2s infinite linear',
              }}
            />
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border mt-2">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary mb-0.5">Elapsed</p>
          <p className="text-sm font-mono font-semibold text-ink">{formatTime(progress.elapsedMinutes)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary mb-0.5">Total</p>
          <p className="text-sm font-mono font-semibold text-ink">{formatTime(progress.totalMinutes)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary mb-0.5">Remaining</p>
          <p className={clsx(
            'text-sm font-mono font-semibold',
            isCompleted ? 'text-ink-tertiary' : 'text-ink'
          )}>
            {isCompleted ? '0m' : formatTime(progress.remainingMinutes)}
          </p>
        </div>
      </div>

      {/* Simulated time display (optional) */}
      {showSimTime && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-secondary">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-ink-tertiary">
              Open <span className="font-mono text-ink ml-1">{formatSimTime(progress.firstSimTime)}</span>
            </span>
            <span className="text-ink-tertiary">
              Now <span className="font-mono font-medium text-ink ml-1">{formatSimTime(progress.currentSimTime)}</span>
            </span>
            <span className="text-ink-tertiary">
              Close <span className="font-mono text-ink ml-1">{formatSimTime(progress.lastSimTime)}</span>
            </span>
          </div>
          <span className="text-[10px] text-ink-tertiary">
            {progress.speedMultiplier}× speed
          </span>
        </div>
      )}
    </div>
  )
}
