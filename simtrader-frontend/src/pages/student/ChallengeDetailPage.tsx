// src/pages/student/ChallengeDetailPage.tsx
// Per-challenge view with tabs: Portfolio · Orders · Leaderboard

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, LineStyle, CrosshairMode,
} from 'lightweight-charts'
import { challengeApi } from '@/api'
import type { ChallengeOrder, ChallengePosition, LeaderboardEntry } from '@/api'
import { Spinner, Badge, Button } from '@/components/ui'
import { useTheme } from '@/context/ThemeContext'
import {
  ArrowLeft, Trophy,
  Briefcase, ListOrdered, Medal, BarChart3,
} from 'lucide-react'
import EODChartTab from './EODChartTab'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
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
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
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

    const series = chart.addLineSeries({
      color: lineColor, lineWidth: 2,
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
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-portfolio', challengeId],
    queryFn: () => challengeApi.getPortfolio(challengeId),
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (!data) return null

  const up = data.returnPct >= 0

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Portfolio Value" value={fmtPKR(data.totalValue)} />
        <Stat label="Cash Balance" value={fmtPKR(data.cashBalance)} />
        <Stat label="Invested" value={fmtPKR(data.marketValue)} />
        <Stat label="Total Return" value={pct(data.returnPct)} sub={fmtPKR(data.totalValue - data.initialCapital)} positive={up} />
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
                      <td className="px-4 py-2.5 font-mono font-semibold text-ink dark:text-dark-ink">{p.symbol}</td>
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
    </div>
  )
}

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrdersTab({ challengeId }: { challengeId: string }) {
  const qc = useQueryClient()
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [formError, setFormError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['challenge-orders', challengeId],
    queryFn: () => challengeApi.listOrders(challengeId),
    staleTime: 15_000,
  })

  const placeMutation = useMutation({
    mutationFn: () => challengeApi.placeOrder(challengeId, {
      symbol: symbol.toUpperCase(),
      side,
      orderType,
      quantity: parseInt(quantity),
      limitPrice: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge-orders', challengeId] })
      qc.invalidateQueries({ queryKey: ['challenge-portfolio', challengeId] })
      setSymbol(''); setQuantity(''); setLimitPrice('')
      setFormError('')
    },
    onError: (e: any) => setFormError(e?.response?.data?.error ?? 'Failed to place order'),
  })

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => challengeApi.cancelOrder(challengeId, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge-orders', challengeId] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!symbol.trim()) { setFormError('Symbol is required'); return }
    const qty = parseInt(quantity)
    if (!qty || qty <= 0) { setFormError('Quantity must be a positive number'); return }
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setFormError('Limit price is required for limit orders')
      return
    }
    placeMutation.mutate()
  }

  function statusBadgeVariant(s: string): 'success' | 'danger' | 'warning' | 'neutral' {
    if (s === 'filled') return 'success'
    if (s === 'rejected' || s === 'cancelled') return 'danger'
    return 'warning'
  }

  return (
    <div className="space-y-5">
      {/* Order form */}
      <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-5">
        <p className="text-sm font-medium text-ink dark:text-dark-ink mb-4">Place Order</p>
        <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mb-4">
          Orders fill at the end of each trading day using live PSX closing prices.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Symbol */}
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Symbol</label>
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. PSO"
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink placeholder:text-ink-disabled dark:placeholder:text-dark-ink-disabled focus:outline-none focus:border-ink dark:focus:border-dark-ink font-mono"
              />
            </div>
            {/* Side */}
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Side</label>
              <select
                value={side}
                onChange={e => setSide(e.target.value as 'buy' | 'sell')}
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            {/* Type */}
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Type</label>
              <select
                value={orderType}
                onChange={e => setOrderType(e.target.value as 'market' | 'limit')}
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
            {/* Quantity */}
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="100"
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink placeholder:text-ink-disabled dark:placeholder:text-dark-ink-disabled focus:outline-none focus:border-ink dark:focus:border-dark-ink font-mono"
              />
            </div>
          </div>

          {orderType === 'limit' && (
            <div className="max-w-[200px]">
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Limit Price</label>
              <input
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink placeholder:text-ink-disabled dark:placeholder:text-dark-ink-disabled focus:outline-none focus:border-ink dark:focus:border-dark-ink font-mono"
              />
            </div>
          )}

          {formError && (
            <p className="text-xs text-danger dark:text-dark-danger">{formError}</p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant={side === 'buy' ? 'primary' : 'danger'}
              size="sm"
              disabled={placeMutation.isPending}
            >
              {placeMutation.isPending ? 'Placing…' : `Place ${side === 'buy' ? 'Buy' : 'Sell'} Order`}
            </Button>
          </div>
        </form>
      </div>

      {/* Order history */}
      <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border">
          <p className="text-sm font-medium text-ink dark:text-dark-ink">Order History</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !data?.orders?.length ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <ListOrdered className="w-6 h-6 text-ink-disabled dark:text-dark-ink-disabled" />
            <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary">No orders placed yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-dark-border text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Symbol</th>
                  <th className="text-left px-4 py-2">Side</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Limit</th>
                  <th className="text-right px-4 py-2">Fill</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {data.orders.map((o: ChallengeOrder) => (
                  <tr key={o.id} className="hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary">
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink dark:text-dark-ink">{o.symbol}</td>
                    <td className={clsx('px-4 py-2.5 font-medium capitalize', o.side === 'buy' ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                      {o.side}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-ink-secondary dark:text-dark-ink-secondary">{o.orderType}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">{o.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-secondary dark:text-dark-ink-secondary">
                      {o.limitPrice != null ? fmt(o.limitPrice) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">
                      {o.fillPrice != null ? fmt(o.fillPrice) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusBadgeVariant(o.status)} size="sm">{o.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-ink-tertiary dark:text-dark-ink-tertiary text-xs">
                      {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-4 py-2.5">
                      {o.status === 'pending' && (
                        <button
                          onClick={() => cancelMutation.mutate(o.id)}
                          disabled={cancelMutation.isPending}
                          className="text-[11px] text-danger dark:text-dark-danger hover:underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

function LeaderboardTab({ challengeId, initialCapital }: { challengeId: string; initialCapital: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-leaderboard', challengeId],
    queryFn: () => challengeApi.getLeaderboard(challengeId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const board = data?.leaderboard ?? []
  const top3Colors = ['text-yellow-500', 'text-slate-400', 'text-amber-600']

  return (
    <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center gap-2">
        <Trophy className="w-4 h-4 text-ink dark:text-dark-ink" />
        <p className="text-sm font-medium text-ink dark:text-dark-ink">Leaderboard</p>
        <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary ml-auto">
          {board.length} participant{board.length !== 1 ? 's' : ''}
        </span>
      </div>
      {board.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Medal className="w-6 h-6 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary">No participants yet</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border dark:border-dark-border text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Participant</th>
              <th className="text-right px-4 py-2">Portfolio</th>
              <th className="text-right px-4 py-2">Return</th>
              <th className="text-right px-4 py-2">vs Initial</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-dark-border">
            {board.map((entry: LeaderboardEntry) => {
              const up = entry.returnPct >= 0
              const gainLoss = entry.portfolioValue - initialCapital
              return (
                <tr key={entry.participantId} className="hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary">
                  <td className="px-4 py-2.5">
                    <span className={clsx('font-bold text-sm', entry.rank <= 3 ? top3Colors[entry.rank - 1] : 'text-ink-tertiary dark:text-dark-ink-tertiary')}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink dark:text-dark-ink">{entry.displayName}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">{fmtPKR(entry.portfolioValue)}</td>
                  <td className={clsx('px-4 py-2.5 text-right font-mono font-semibold', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                    {pct(entry.returnPct)}
                  </td>
                  <td className={clsx('px-4 py-2.5 text-right font-mono text-sm', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                    {gainLoss >= 0 ? '+' : ''}{fmt(gainLoss, 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Tab = 'portfolio' | 'orders' | 'leaderboard' | 'charts'

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('portfolio')

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
