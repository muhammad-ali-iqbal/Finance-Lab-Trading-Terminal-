// src/pages/admin/AdminPSXPage.tsx
// Admin panel for operating the psx_tracker data pipeline from the UI.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { psxApi } from '@/api'
import type { PSXResult } from '@/api'
import { Button, Spinner } from '@/components/ui'
import {
  Database, RefreshCw, Download, CalendarRange,
  ListChecks, AlertCircle, CheckCircle2,
} from 'lucide-react'
import clsx from 'clsx'

// ── Terminal output panel ─────────────────────────────────────────────────────

function Output({ result, loading }: { result: PSXResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface-secondary dark:bg-dark-surface-secondary border border-border dark:border-dark-border text-sm text-ink-secondary dark:text-dark-ink-secondary">
        <Spinner size="sm" />
        Running… this may take a few minutes.
      </div>
    )
  }
  if (!result) return null
  return (
    <div className={clsx(
      'rounded-lg border overflow-hidden',
      result.ok
        ? 'border-success/30 dark:border-dark-success/30'
        : 'border-danger/30 dark:border-dark-danger/30',
    )}>
      <div className={clsx(
        'flex items-center gap-2 px-3 py-2 text-xs font-medium',
        result.ok
          ? 'bg-success/10 text-success dark:text-dark-success'
          : 'bg-danger/10 text-danger dark:text-dark-danger',
      )}>
        {result.ok
          ? <CheckCircle2 className="w-3.5 h-3.5" />
          : <AlertCircle className="w-3.5 h-3.5" />}
        {result.ok ? 'Completed successfully' : 'Completed with errors'}
      </div>
      <pre className="p-3 text-xs font-mono text-ink dark:text-dark-ink bg-surface dark:bg-dark-surface overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
        {result.output || '(no output)'}
      </pre>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, description, children }: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-ink/8 dark:bg-dark-ink/8 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-ink-secondary dark:text-dark-ink-secondary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-dark-ink">{title}</h3>
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPSXPage() {
  const [backfillFrom, setBackfillFrom] = useState('')
  const [backfillTo,   setBackfillTo]   = useState('')
  const [syncFrom,     setSyncFrom]     = useState('')
  const [lastResult,   setLastResult]   = useState<{ key: string; result: PSXResult } | null>(null)

  function set(key: string, result: PSXResult) {
    setLastResult({ key, result })
  }

  // Status auto-loads on mount
  const statusQuery = useQuery({
    queryKey: ['psx-status'],
    queryFn: psxApi.status,
    staleTime: 60_000,
  })

  const fetchMut    = useMutation({ mutationFn: psxApi.fetch,    onSuccess: r => set('fetch', r) })
  const tickersMut  = useMutation({ mutationFn: psxApi.tickers,  onSuccess: r => set('tickers', r) })
  const backfillMut = useMutation({
    mutationFn: () => psxApi.backfill(backfillFrom, backfillTo || undefined),
    onSuccess: r => set('backfill', r),
  })
  const syncMut = useMutation({
    mutationFn: () => psxApi.sync(syncFrom || undefined),
    onSuccess: r => set('sync', r),
  })

  const anyLoading = fetchMut.isPending || tickersMut.isPending || backfillMut.isPending || syncMut.isPending

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Database className="w-5 h-5 text-ink dark:text-dark-ink" />
          <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">PSX Data Pipeline</h1>
        </div>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">
          Manage the psx_tracker data feed. Commands run in the background — output appears below when complete.
        </p>
      </div>

      {/* Database status */}
      <Section icon={Database} title="Database Status" description="Current row counts and date range in psx_data.db.">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            <RefreshCw className={clsx('w-3.5 h-3.5 mr-1.5', statusQuery.isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        {statusQuery.isFetching ? (
          <div className="flex items-center gap-2 text-sm text-ink-secondary dark:text-dark-ink-secondary">
            <Spinner size="sm" /> Loading…
          </div>
        ) : statusQuery.data ? (
          <pre className="text-xs font-mono text-ink dark:text-dark-ink bg-surface-secondary dark:bg-dark-surface-secondary rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
            {statusQuery.data.output || '(no output)'}
          </pre>
        ) : null}
      </Section>

      {/* Fetch today */}
      <Section icon={Download} title="Fetch Today" description="Fetch today's EOD prices from PSX and push to SimTrader. Only works after ~16:00 PKT when PSX publishes data.">
        <Button
          size="sm"
          variant="primary"
          disabled={anyLoading}
          onClick={() => fetchMut.mutate()}
        >
          {fetchMut.isPending ? <><Spinner size="sm" />&nbsp;Fetching…</> : 'Fetch Today\'s Data'}
        </Button>
        <Output result={lastResult?.key === 'fetch' ? lastResult.result : null} loading={fetchMut.isPending} />
      </Section>

      {/* Backfill */}
      <Section icon={CalendarRange} title="Backfill Date Range" description="Fetch historical EOD data for a date range and push each date to SimTrader. Can take several minutes for large ranges.">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">From *</label>
            <input
              type="date"
              value={backfillFrom}
              onChange={e => setBackfillFrom(e.target.value)}
              className="px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-sm text-ink dark:text-dark-ink focus:outline-none focus:ring-1 focus:ring-ink/30 dark:focus:ring-dark-ink/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">To (optional)</label>
            <input
              type="date"
              value={backfillTo}
              onChange={e => setBackfillTo(e.target.value)}
              className="px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-sm text-ink dark:text-dark-ink focus:outline-none focus:ring-1 focus:ring-ink/30 dark:focus:ring-dark-ink/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-transparent">run</label>
            <Button
              size="sm"
              variant="primary"
              disabled={anyLoading || !backfillFrom}
              onClick={() => backfillMut.mutate()}
            >
              {backfillMut.isPending ? <><Spinner size="sm" />&nbsp;Running…</> : 'Run Backfill'}
            </Button>
          </div>
        </div>
        <Output result={lastResult?.key === 'backfill' ? lastResult.result : null} loading={backfillMut.isPending} />
      </Section>

      {/* Refresh tickers */}
      <Section icon={ListChecks} title="Refresh Ticker List" description="Re-fetch the full list of PSX-listed symbols. Run when new stocks are listed or delisted.">
        <Button
          size="sm"
          variant="ghost"
          disabled={anyLoading}
          onClick={() => tickersMut.mutate()}
        >
          {tickersMut.isPending ? <><Spinner size="sm" />&nbsp;Refreshing…</> : 'Refresh Tickers'}
        </Button>
        <Output result={lastResult?.key === 'tickers' ? lastResult.result : null} loading={tickersMut.isPending} />
      </Section>

      {/* Sync to SimTrader */}
      <Section icon={Database} title="Sync SQLite → SimTrader" description="Push all historical data from psx_data.db into SimTrader's PostgreSQL eod_prices table. Use this on first setup or after a fresh server install.">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">From date (optional — skips earlier rows)</label>
            <input
              type="date"
              value={syncFrom}
              onChange={e => setSyncFrom(e.target.value)}
              className="px-3 py-1.5 rounded border border-border dark:border-dark-border bg-surface dark:bg-dark-surface text-sm text-ink dark:text-dark-ink focus:outline-none focus:ring-1 focus:ring-ink/30 dark:focus:ring-dark-ink/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-transparent">run</label>
            <Button
              size="sm"
              variant="primary"
              disabled={anyLoading}
              onClick={() => syncMut.mutate()}
            >
              {syncMut.isPending ? <><Spinner size="sm" />&nbsp;Syncing…</> : 'Sync to SimTrader'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
          Pushes one request per trading date. A full sync (~20+ dates × 1,000 symbols) takes 1–3 minutes.
        </p>
        <Output result={lastResult?.key === 'sync' ? lastResult.result : null} loading={syncMut.isPending} />
      </Section>
    </div>
  )
}
