// src/pages/student/ChallengeDetailPage.tsx
// Per-challenge view with tabs: Portfolio · Orders · Leaderboard

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, LineStyle, CrosshairMode,
} from 'lightweight-charts'
import { challengeApi, dividendApi } from '@/api'
import type { ChallengeOrder, ChallengePosition, ChallengeDividend, LeaderboardEntry } from '@/api'
import { Spinner, Badge, Button, Input, Alert, Card, EmptyState, StatCard, Avatar } from '@/components/ui'
import { SymbolPicker } from '@/components/ui/SymbolPicker'
import { ChallengeOrderStatusBadge } from '@/components/challenge/DecisionTimeline'
import { useTheme } from '@/context/ThemeContext'
import { useAuthStore } from '@/store/auth'
import { useSymbolDisplay } from '@/hooks/useSymbolDisplay'
import {
  ArrowLeft, Trophy,
  Briefcase, ListOrdered, Medal, BarChart3,
  Activity, Download, Banknote, Lock,
} from 'lucide-react'
import { downloadCSV } from '@/utils/csv'
import EODChartTab from './EODChartTab'
import clsx from 'clsx'

// ── Sector coloring (Positions table dots) ────────────────────────────────────
// Reuses the PSX securities directory already served by `dividendApi.symbols()`
// (same endpoint that powers the Dividends page's search) — no new backend call.

const SECTOR_DOT: { match: RegExp; className: string }[] = [
  { match: /bank/i,                    className: 'bg-accent dark:bg-dark-accent' },
  { match: /cement/i,                  className: 'bg-warning dark:bg-dark-warning' },
  { match: /chemical|fertilizer/i,     className: 'bg-success dark:bg-dark-success' },
  { match: /oil|gas|energy|exploration/i, className: 'bg-iba dark:bg-dark-iba' },
]

function sectorDotClass(sectorName?: string): string {
  if (!sectorName) return 'bg-ink-disabled dark:bg-dark-ink-disabled'
  const hit = SECTOR_DOT.find(s => s.match.test(sectorName))
  return hit?.className ?? 'bg-ink-disabled dark:bg-dark-ink-disabled'
}

function useSectorMap() {
  const { data } = useQuery({
    queryKey: ['psx-symbols'],
    queryFn: () => dividendApi.symbols(),
    staleTime: 24 * 60 * 60_000,
  })
  const map = new Map<string, { sectorName: string; name: string }>()
  data?.symbols.forEach(s => map.set(s.symbol.toUpperCase(), { sectorName: s.sectorName, name: s.name }))
  return map
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function calcFees(tradeValue: number): number {
  const cdc = Math.min(tradeValue * 0.0001, 10)
  const nccpl = tradeValue * 0.00017
  const psx = tradeValue * 0.00003
  return cdc + nccpl + psx
}
function fmtPKR(n: number) {
  return 'PKR ' + fmt(n, 0)
}
function pct(n: number) {
  return (n >= 0 ? '+' : '') + fmt(n) + '%'
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-4">
      <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx(
        'text-xl font-semibold font-mono tabular-nums',
        positive === true  && 'text-success dark:text-dark-success',
        positive === false && 'text-danger dark:text-dark-danger',
        positive === undefined && 'text-ink dark:text-dark-ink',
      )}>{value}</p>
      {sub && <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Portfolio history chart ───────────────────────────────────────────────────

function PerformanceChart({ challengeId, initialCapital }: { challengeId: string; initialCapital: number }) {
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const isDark = theme === 'dark'

  const { data } = useQuery({
    queryKey: ['challenge-history', challengeId],
    queryFn: () => challengeApi.getPortfolioHistory(challengeId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  useEffect(() => {
    if (!containerRef.current) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const bg = isDark ? '#1A1A18' : '#FFFFFF'
    const textColor = isDark ? '#5A5A55' : '#8A8A85'
    const gridColor = isDark ? '#1E1E1C' : '#F2F1EF'
    const lineColor = isDark ? '#4D88FF' : '#1A5CFF'

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: bg }, textColor, fontSize: 11 },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? '#2C2C29' : '#E4E4E0' },
      timeScale: { borderColor: isDark ? '#2C2C29' : '#E4E4E0', timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 240,
    })

    const series = chart.addAreaSeries({
      lineColor, lineWidth: 2,
      topColor: isDark ? 'rgba(77,136,255,0.28)' : 'rgba(26,92,255,0.22)',
      bottomColor: isDark ? 'rgba(77,136,255,0)' : 'rgba(26,92,255,0)',
      priceLineVisible: false, lastValueVisible: true,
      crosshairMarkerRadius: 4,
    })

    // Initial capital reference line
    series.createPriceLine({
      price: initialCapital,
      color: isDark ? '#4A4A47' : '#C4C4BF',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: true,
      title: 'Start',
    })

    chartRef.current = chart
    seriesRef.current = series

    const observer = new ResizeObserver(([e]) => {
      chart.applyOptions({ width: e.contentRect.width })
    })
    observer.observe(containerRef.current)

    return () => { observer.disconnect(); chart.remove(); chartRef.current = null }
  }, [isDark, initialCapital])

  useEffect(() => {
    if (!seriesRef.current || !data?.history?.length) return
    const points = data.history.map(s => ({
      time: s.date as unknown as import('lightweight-charts').Time,
      value: s.portfolioValue,
    }))
    seriesRef.current.setData(points)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  return <div ref={containerRef} className="w-full" style={{ height: 240 }} />
}

// ── Portfolio tab ─────────────────────────────────────────────────────────────

function PortfolioTab({ challengeId }: { challengeId: string }) {
  const { formatSymbol } = useSymbolDisplay()
  const sectorMap = useSectorMap()
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-portfolio', challengeId],
    queryFn: () => challengeApi.getPortfolio(challengeId),
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (!data) return null

  const up = data.returnPct >= 0
  const gainLoss = data.totalValue - data.initialCapital

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr] gap-3">
        <StatCard
          variant="featured"
          label="Portfolio Value"
          value={fmtPKR(data.totalValue)}
          mono
          delta={data.returnPct}
          deltaLabel={`· ${gainLoss >= 0 ? '+' : ''}${fmtPKR(gainLoss)}`}
        />
        <Stat label="Cash Balance" value={fmtPKR(data.cashBalance)} />
        <Stat label="Invested" value={fmtPKR(data.marketValue)} />
        <Stat label="Total Return" value={pct(data.returnPct)} sub={fmtPKR(gainLoss)} positive={up} />
      </div>

      {/* Performance chart */}
      <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-4">
        <p className="text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary mb-3">Portfolio Value Over Time</p>
        <PerformanceChart challengeId={challengeId} initialCapital={data.initialCapital} />
      </div>

      {/* Positions table */}
      <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border">
          <p className="text-sm font-medium text-ink dark:text-dark-ink">Open Positions</p>
        </div>
        {data.positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Briefcase className="w-6 h-6 text-ink-disabled dark:text-dark-ink-disabled" />
            <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary">No open positions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-dark-border text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Symbol</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Avg Cost</th>
                  <th className="text-right px-4 py-2">Price</th>
                  <th className="text-right px-4 py-2">Mkt Value</th>
                  <th className="text-right px-4 py-2">P&L</th>
                  <th className="text-right px-4 py-2">P&L %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {data.positions.map((p: ChallengePosition) => {
                  const up = p.unrealizedPnL >= 0
                  return (
                    <tr key={p.symbol} className="hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary">
                      <td className="px-4 py-2.5 font-mono font-semibold text-ink dark:text-dark-ink">
                        <span className="flex items-center gap-2">
                          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', sectorDotClass(sectorMap.get(p.symbol.toUpperCase())?.sectorName))} />
                          {formatSymbol(p.symbol)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">{p.quantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink-secondary dark:text-dark-ink-secondary">{fmt(p.avgCost)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">{fmt(p.currentPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">{fmt(p.marketValue, 0)}</td>
                      <td className={clsx('px-4 py-2.5 text-right font-mono', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                        {up ? '+' : ''}{fmt(p.unrealizedPnL, 0)}
                      </td>
                      <td className={clsx('px-4 py-2.5 text-right font-mono', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                        {pct(p.unrealizedPnLPct)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dividends & payouts */}
      <DividendsSection challengeId={challengeId} />
    </div>
  )
}

// ── Dividends & payouts (Portfolio tab section) ───────────────────────────────

function DividendsSection({ challengeId }: { challengeId: string }) {
  const { formatSymbol } = useSymbolDisplay()
  const { data } = useQuery({
    queryKey: ['challenge-dividends', challengeId],
    queryFn: () => challengeApi.getDividends(challengeId),
    staleTime: 5 * 60_000,
  })

  const dividends = data?.dividends ?? []

  return (
    <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center gap-2">
        <Banknote className="w-4 h-4 text-ink dark:text-dark-ink" />
        <p className="text-sm font-medium text-ink dark:text-dark-ink">Dividends &amp; Payouts</p>
        <span className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary ml-auto">
          Credited automatically when stocks you hold pay out
        </span>
      </div>
      {dividends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-center px-4">
          <Banknote className="w-6 h-6 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary">No payouts yet</p>
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary max-w-sm">
            When a company you hold announces a dividend or bonus issue, cash or shares are
            credited to your portfolio on its book-closure date.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border dark:divide-dark-border">
          {dividends.map((d: ChallengeDividend) => (
            <div key={d.id} className="flex items-center gap-3.5 px-4 py-3">
              <div className="w-7 h-7 rounded-md bg-success-muted dark:bg-dark-success-muted flex items-center justify-center flex-shrink-0">
                <Banknote className="w-3.5 h-3.5 text-success dark:text-dark-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink dark:text-dark-ink">
                  <span className="font-mono font-semibold">{formatSymbol(d.symbol)}</span>
                  {' · '}{d.kind === 'dividend' ? 'Cash dividend' : 'Bonus shares'}
                  <span className="text-ink-tertiary dark:text-dark-ink-tertiary font-mono text-xs"> ({d.announcement})</span>
                </p>
                <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">
                  Credited {new Date(d.bookClosureStart + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}{d.quantityHeld.toLocaleString()} shares held
                </p>
              </div>
              <span className="font-mono font-semibold text-success dark:text-dark-success text-sm flex-shrink-0">
                {d.kind === 'dividend'
                  ? `+PKR ${fmt(d.cashCredited)}`
                  : `+${d.sharesCredited.toLocaleString()} shares`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Orders tab ────────────────────────────────────────────────────────────────

const CHALLENGE_ORDER_TYPES: { value: 'market' | 'limit'; label: string; description: string }[] = [
  { value: 'market', label: 'Market', description: 'Fills at the day\'s closing price after 16:35 PKT' },
  { value: 'limit',  label: 'Limit',  description: 'Fill only if the day\'s low/high reaches your price' },
]

function OrdersTab({ challengeId }: { challengeId: string }) {
  const qc = useQueryClient()
  const { formatSymbol } = useSymbolDisplay()
  const sectorMap = useSectorMap()
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [submitted, setSubmitted] = useState<'success' | 'error' | null>(null)
  const [submitError, setSubmitError] = useState('')

  const { data: eodSymbols } = useQuery({
    queryKey: ['eod-symbols'],
    queryFn: () => challengeApi.getEODSymbols(),
    staleTime: 5 * 60_000,
  })

  const { data: portfolio } = useQuery({
    queryKey: ['challenge-portfolio', challengeId],
    queryFn: () => challengeApi.getPortfolio(challengeId),
    staleTime: 30_000,
  })

  const { data: eodHistory } = useQuery({
    queryKey: ['eod-history', symbol],
    queryFn: () => challengeApi.getEODHistory(symbol),
    enabled: !!symbol,
    staleTime: 8 * 60 * 60_000,
  })
  const bars = eodHistory?.bars ?? []
  const lastBar = bars[bars.length - 1]
  const prevBar = bars[bars.length - 2]
  const lastPrice = lastBar?.close
  const priceChange = lastBar && prevBar ? lastBar.close - prevBar.close : undefined
  const priceChangePct = priceChange !== undefined && prevBar.close ? (priceChange / prevBar.close) * 100 : undefined

  const { data, isLoading } = useQuery({
    queryKey: ['challenge-orders', challengeId],
    queryFn: () => challengeApi.listOrders(challengeId),
    staleTime: 15_000,
  })

  const qty = parseInt(quantity) || 0
  const lp  = parseFloat(limitPrice) || 0
  const estimatedValue = orderType === 'limit' ? qty * lp : qty * (lastPrice ?? 0)
  const estimatedFees  = estimatedValue > 0 ? calcFees(estimatedValue) : 0
  const estimatedTotal = estimatedValue + estimatedFees
  const canAfford = side === 'buy' && estimatedValue > 0
    ? (portfolio?.cashBalance ?? 0) >= estimatedTotal
    : true

  const placeMutation = useMutation({
    mutationFn: () => challengeApi.placeOrder(challengeId, {
      symbol: symbol.toUpperCase().trim(),
      side,
      orderType,
      quantity: qty,
      limitPrice: orderType === 'limit' ? lp : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge-orders', challengeId] })
      qc.invalidateQueries({ queryKey: ['challenge-portfolio', challengeId] })
      setQuantity(''); setLimitPrice('')
      setSubmitted('success')
      setTimeout(() => setSubmitted(null), 3000)
    },
    onError: (e: any) => {
      setSubmitError(e?.response?.data?.error ?? 'Failed to place order')
      setSubmitted('error')
      setTimeout(() => setSubmitted(null), 4000)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => challengeApi.cancelOrder(challengeId, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge-orders', challengeId] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol.trim() || qty <= 0) return
    placeMutation.mutate()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
      {/* Order form */}
      <div className="space-y-4">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Live quote strip */}
            {symbol && lastPrice !== undefined && (
              <div className="flex items-center justify-between pb-4 border-b border-border dark:border-dark-border">
                <div>
                  <p className="font-mono text-lg font-semibold text-ink dark:text-dark-ink">{formatSymbol(symbol)}</p>
                  <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
                    {sectorMap.get(symbol.toUpperCase())?.name ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold text-ink dark:text-dark-ink">{fmt(lastPrice)}</p>
                  {priceChange !== undefined && priceChangePct !== undefined && (
                    <p className={clsx('text-[11px] font-semibold', priceChange >= 0 ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                      {priceChange >= 0 ? '+' : ''}{fmt(priceChange)} ({priceChange >= 0 ? '+' : ''}{fmt(priceChangePct)}%)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* EOD fill notice */}
            <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary border border-border dark:border-dark-border rounded px-3 py-2 bg-surface-secondary dark:bg-dark-surface-secondary">
              Orders fill at end-of-day (16:35 PKT) using live PSX closing prices.
            </p>

            {/* Buy / Sell toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-surface-secondary dark:bg-dark-surface-secondary rounded-md">
              {(['buy', 'sell'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={clsx(
                    'py-2 rounded text-sm font-semibold capitalize transition-all',
                    side === s
                      ? s === 'buy'
                        ? 'bg-success text-white shadow-sm'
                        : 'bg-danger text-white shadow-sm'
                      : 'text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Symbol */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary">Symbol</label>
              <SymbolPicker
                symbols={eodSymbols?.symbols ?? []}
                value={symbol}
                onChange={setSymbol}
                placeholder={eodSymbols?.symbols?.length ? 'Select a symbol' : 'Loading symbols…'}
                getLabel={formatSymbol}
              />
              {symbol && lastPrice !== undefined && (
                <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
                  Last close: <span className="font-mono font-medium text-ink dark:text-dark-ink">PKR {fmt(lastPrice)}</span>
                </p>
              )}
            </div>

            {/* Order type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary">Order type</label>
              <div className="space-y-1">
                {CHALLENGE_ORDER_TYPES.map(ot => (
                  <button
                    key={ot.value}
                    type="button"
                    onClick={() => setOrderType(ot.value)}
                    className={clsx(
                      'w-full flex items-start gap-3 p-2.5 rounded border text-left transition-all',
                      orderType === ot.value
                        ? 'border-accent bg-accent-muted dark:border-dark-accent dark:bg-dark-accent-muted'
                        : 'border-border dark:border-dark-border hover:border-border-strong dark:hover:border-dark-border-strong'
                    )}
                  >
                    <div className={clsx(
                      'w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors',
                      orderType === ot.value ? 'border-accent bg-accent' : 'border-border dark:border-dark-border'
                    )} />
                    <div>
                      <p className={clsx('text-xs font-semibold', orderType === ot.value ? 'text-accent dark:text-dark-accent' : 'text-ink dark:text-dark-ink')}>
                        {ot.label}
                      </p>
                      <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">{ot.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <Input
              label="Quantity (shares)"
              type="number"
              placeholder="100"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              min="1"
              step="1"
              required
            />

            {/* Limit price */}
            {orderType === 'limit' && (
              <Input
                label="Limit price (PKR)"
                type="number"
                placeholder="0.00"
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                step="0.01"
                required
                hint={side === 'buy' ? 'Buy if day\'s low reaches this price' : 'Sell if day\'s high reaches this price'}
              />
            )}

            {/* Estimated cost + fees + cash balance */}
            {qty > 0 && estimatedValue > 0 && (
              <div className="rounded border border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-tertiary dark:text-dark-ink-tertiary">
                    Estimated {side === 'buy' ? 'cost' : 'proceeds'}
                    {orderType === 'market' && <span className="ml-1 opacity-60">(~last close)</span>}
                  </span>
                  <span className="font-mono font-medium text-ink dark:text-dark-ink">PKR {fmt(estimatedValue)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-tertiary dark:text-dark-ink-tertiary">Brokerage fees</span>
                  <span className="font-mono text-ink-secondary dark:text-dark-ink-secondary">PKR {fmt(estimatedFees)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-border dark:border-dark-border pt-1.5">
                  <span className="font-medium text-ink dark:text-dark-ink">
                    {side === 'buy' ? 'Total debit' : 'Net proceeds'}
                  </span>
                  <span className="font-mono font-semibold text-ink dark:text-dark-ink">PKR {fmt(side === 'buy' ? estimatedTotal : estimatedValue - estimatedFees)}</span>
                </div>
                {side === 'buy' && portfolio && (
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-tertiary dark:text-dark-ink-tertiary">Available cash</span>
                    <span className={clsx('font-mono font-medium', canAfford ? 'text-ink dark:text-dark-ink' : 'text-danger dark:text-dark-danger')}>
                      PKR {fmt(portfolio.cashBalance ?? 0)}
                    </span>
                  </div>
                )}
                {!canAfford && (
                  <p className="text-[11px] text-danger dark:text-dark-danger font-medium">Insufficient cash for this order</p>
                )}
              </div>
            )}

            {/* Feedback */}
            {submitted === 'success' && (
              <Alert variant="success" message="Order placed successfully. It will fill at today's close." />
            )}
            {submitted === 'error' && (
              <Alert variant="error" message={submitError} />
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              variant={side === 'sell' ? 'danger' : 'primary'}
              loading={placeMutation.isPending}
              disabled={!symbol.trim() || qty <= 0 || !canAfford}
            >
              {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Order history */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Order History</h2>
          {data && (
            <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">{data.orders.length} orders</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !data?.orders?.length ? (
          <EmptyState
            icon={<Activity className="w-8 h-8" />}
            title="No orders yet"
            description="Your submitted orders will appear here."
          />
        ) : (
          <div className="divide-y divide-border dark:divide-dark-border">
            {data.orders.map((o: ChallengeOrder) => (
              <div key={o.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm text-ink dark:text-dark-ink">{formatSymbol(o.symbol)}</span>
                    <Badge variant={o.side === 'buy' ? 'success' : 'danger'} size="sm">
                      {o.side.toUpperCase()}
                    </Badge>
                    <Badge variant="neutral" size="sm">{o.orderType}</Badge>
                  </div>
                  <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5 font-mono">
                    {o.quantity.toLocaleString()} shares
                    {o.limitPrice != null && ` @ PKR ${fmt(o.limitPrice)}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <ChallengeOrderStatusBadge status={o.status} />
                  {o.fillPrice != null && (
                    <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary font-mono">
                      filled @ PKR {fmt(o.fillPrice)}
                    </p>
                  )}
                  {o.status === 'filled' && o.fillPrice != null && (
                    <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary font-mono">
                      fees: PKR {fmt(calcFees(o.quantity * o.fillPrice))}
                    </p>
                  )}
                  <p className="text-[10px] text-ink-tertiary dark:text-dark-ink-tertiary">
                    {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </p>
                  {o.status === 'pending' && (
                    <button
                      onClick={() => cancelMutation.mutate(o.id)}
                      disabled={cancelMutation.isPending}
                      className="text-[11px] text-danger dark:text-dark-danger hover:underline disabled:opacity-50 block"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

function LeaderboardTab({ challengeId, initialCapital }: { challengeId: string; initialCapital: number }) {
  const user = useAuthStore(s => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-leaderboard', challengeId],
    queryFn: () => challengeApi.getLeaderboard(challengeId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const board = data?.leaderboard ?? []
  const myName = user ? `${user.firstName} ${user.lastName}` : null
  // Best-effort "is this me" match — the leaderboard doesn't carry the viewer's own
  // participant id, so we compare against the logged-in student's full name.
  const isYou = (entry: LeaderboardEntry) => entry.email ? entry.email === user?.email : entry.displayName === myName
  const topValue = board[0]?.portfolioValue || 1
  const podium = board.slice(0, 3)
  const rest = board.slice(3)

  function handleDownload() {
    const rows: string[][] = [['Rank', 'Name', 'Portfolio Value (PKR)', 'Return %', 'Gain/Loss (PKR)']]
    board.forEach((e: LeaderboardEntry) => {
      rows.push([
        String(e.rank),
        e.displayName,
        fmt(e.portfolioValue),
        fmt(e.returnPct),
        fmt(e.portfolioValue - initialCapital),
      ])
    })
    downloadCSV(rows, `leaderboard-${challengeId}.csv`)
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-ink dark:text-dark-ink" />
        <p className="text-sm font-medium text-ink dark:text-dark-ink">Leaderboard</p>
        <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary ml-auto">
          {board.length} participant{board.length !== 1 ? 's' : ''}
        </span>
        {board.length > 0 && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 text-xs text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink transition-colors"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </div>

      {board.length === 0 ? (
        <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg flex flex-col items-center justify-center py-10 gap-2">
          <Medal className="w-6 h-6 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary">No participants yet</p>
        </div>
      ) : (
        <>
          {/* Podium — ranks 1-3 */}
          {podium.length > 0 && (
            <div className="grid grid-cols-3 gap-3 items-end">
              {[podium[1], podium[0], podium[2]].map((entry, slot) => {
                if (!entry) return <div key={slot} />
                const isFirst = entry.rank === 1
                return (
                  <div
                    key={entry.participantId}
                    className={clsx(
                      'rounded-lg text-center px-4',
                      isFirst ? 'surface-feature py-6 shadow-modal' : 'bg-surface dark:bg-dark-surface border border-border dark:border-dark-border py-4.5',
                    )}
                  >
                    <Avatar name={entry.displayName} paletteIndex={entry.rank} isSelf={isYou(entry)} size={isFirst ? 'lg' : 'md'} className="mx-auto" />
                    <p className={clsx('mt-2', isFirst ? 'text-2xl' : 'text-lg')}>{['🥇', '🥈', '🥉'][entry.rank - 1]}</p>
                    <p className={clsx('mt-1 font-medium truncate', isFirst ? 'text-sm text-white' : 'text-xs text-ink dark:text-dark-ink')}>
                      {entry.displayName}
                    </p>
                    <p className={clsx(
                      'font-mono font-bold mt-0.5',
                      isFirst ? 'text-base' : 'text-sm',
                      entry.returnPct >= 0 ? (isFirst ? 'text-dark-success' : 'text-success dark:text-dark-success') : (isFirst ? 'text-dark-danger' : 'text-danger dark:text-dark-danger'),
                    )}>
                      {pct(entry.returnPct)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ranks 4+ */}
          {rest.length > 0 && (
            <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden divide-y divide-border dark:divide-dark-border">
              {rest.map((entry: LeaderboardEntry) => {
                const up = entry.returnPct >= 0
                const gainLoss = entry.portfolioValue - initialCapital
                const you = isYou(entry)
                return (
                  <div
                    key={entry.participantId}
                    className={clsx('relative flex items-center gap-3 px-4 py-2.5', you && 'bg-accent-muted/40 dark:bg-dark-accent-muted/40')}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-accent/[0.04] dark:bg-dark-accent/[0.06] pointer-events-none"
                      style={{ width: `${Math.min(100, (entry.portfolioValue / topValue) * 100)}%` }}
                    />
                    <span className="relative w-6 text-xs font-bold text-ink-tertiary dark:text-dark-ink-tertiary flex-shrink-0">#{entry.rank}</span>
                    <Avatar name={entry.displayName} paletteIndex={entry.rank} isSelf={you} size="sm" className="relative" />
                    <span className="relative flex-1 min-w-0 flex items-center gap-2 text-sm font-medium text-ink dark:text-dark-ink truncate">
                      {entry.displayName}
                      {you && <Badge variant="accent" size="sm">YOU</Badge>}
                    </span>
                    <span className="relative font-mono text-sm text-ink dark:text-dark-ink w-28 text-right flex-shrink-0">{fmtPKR(entry.portfolioValue)}</span>
                    <span className={clsx('relative font-mono text-sm font-semibold w-20 text-right flex-shrink-0', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                      {pct(entry.returnPct)}
                    </span>
                    <span className={clsx('relative font-mono text-xs w-20 text-right flex-shrink-0 hidden sm:inline', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                      {gainLoss >= 0 ? '+' : ''}{fmt(gainLoss, 0)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Tab = 'portfolio' | 'orders' | 'leaderboard' | 'charts'

const VALID_TABS: Tab[] = ['portfolio', 'orders', 'leaderboard', 'charts']

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'portfolio'
  const setTab = (next: Tab) => setSearchParams(prev => {
    const params = new URLSearchParams(prev)
    params.set('tab', next)
    return params
  }, { replace: true })

  const { data, isLoading } = useQuery({
    queryKey: ['challenge', id],
    queryFn: () => challengeApi.get(id!),
    enabled: !!id,
  })

  const challenge = data?.challenge

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="p-6">
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">Challenge not found.</p>
      </div>
    )
  }

  // Challenges are locked by default. Without an access grant every
  // challenge-scoped endpoint 403s, so bail out before mounting any tab.
  if (data && !data.hasAccess) {
    return (
      <div className="p-6 max-w-4xl">
        <button
          onClick={() => navigate('/dashboard/challenges')}
          className="flex items-center gap-1.5 text-xs text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Challenges
        </button>
        <Card>
          <EmptyState
            icon={<Lock className="w-10 h-10 text-ink-disabled dark:text-dark-ink-disabled" />}
            title={`${challenge.name} is locked`}
            description="Your instructor has not granted you access to this challenge yet. Contact them if you think this is a mistake."
          />
        </Card>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'portfolio',   label: 'Portfolio',   icon: <Briefcase className="w-3.5 h-3.5" /> },
    { key: 'orders',      label: 'Orders',      icon: <ListOrdered className="w-3.5 h-3.5" /> },
    { key: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-3.5 h-3.5" /> },
    { key: 'charts',      label: 'Charts',      icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ]

  const statusColor = challenge.status === 'active'
    ? 'bg-success/10 text-success dark:text-dark-success'
    : 'bg-ink/10 text-ink-secondary dark:text-dark-ink-secondary'

  return (
    <div className="p-6 max-w-5xl">
      {/* Back */}
      <button
        onClick={() => navigate('/dashboard/challenges')}
        className="flex items-center gap-1.5 text-sm text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All Challenges
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">{challenge.name}</h1>
            <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full capitalize', statusColor)}>
              {challenge.status}
            </span>
          </div>
          {challenge.description && (
            <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">{challenge.description}</p>
          )}
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mt-1">
            {new Date(challenge.startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} →{' '}
            {new Date(challenge.endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} · Starting capital: PKR {challenge.initialCapital.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border dark:border-dark-border mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-ink dark:border-dark-ink text-ink dark:text-dark-ink'
                : 'border-transparent text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'portfolio'   && <PortfolioTab challengeId={id!} />}
      {tab === 'orders'      && <OrdersTab challengeId={id!} />}
      {tab === 'leaderboard' && <LeaderboardTab challengeId={id!} initialCapital={challenge.initialCapital} />}
      {tab === 'charts'      && <EODChartTab />}
    </div>
  )
}
