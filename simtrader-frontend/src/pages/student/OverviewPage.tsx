// src/pages/student/OverviewPage.tsx
import { useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { portfolioApi, simulationApi, orderApi } from '@/api'
import type { HistoryPoint, LeaderboardEntry } from '@/api/portfolio'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { useAuthStore } from '@/store/auth'
import { useTheme } from '@/context/ThemeContext'
import { StatCard, Card, EmptyState, Spinner, Button } from '@/components/ui'
import {
  TrendingUp, TrendingDown, Trophy, Briefcase, Activity,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import clsx from 'clsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPKR(n: number) { return 'PKR ' + fmt(n) }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + fmt(n) + '%' }

const SLICE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6',
]

// ── DonutChart ────────────────────────────────────────────────────────────────

interface DonutSegment { label: string; value: number; color: string }

function DonutChart({ segments, totalLabel }: { segments: DonutSegment[]; totalLabel: string }) {
  const r = 68
  const cx = 100
  const cy = 100
  const circumference = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0)

  let cumulative = 0
  return (
    <div className="relative w-full" style={{ aspectRatio: '1' }}>
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="currentColor" strokeWidth={26} className="text-surface-secondary dark:text-dark-surface-secondary" />
        ) : (
          segments.map((seg, i) => {
            const ratio = seg.value / total
            const dash = ratio * circumference
            const gap = circumference - dash
            const rotation = cumulative * 360
            cumulative += ratio
            return (
              <circle key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={seg.color} strokeWidth={26}
                strokeDasharray={`${dash} ${gap}`}
                transform={`rotate(${rotation}, ${cx}, ${cy})`}
              />
            )
          })
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-widest text-ink-tertiary dark:text-dark-ink-tertiary">Total</span>
        <span className="text-base font-bold text-ink dark:text-dark-ink font-mono">{totalLabel}</span>
      </div>
    </div>
  )
}

// ── PerformanceChart ──────────────────────────────────────────────────────────

function PerformanceChart({ data, isDark }: { data: HistoryPoint[]; isDark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const textColor = isDark ? '#6b7280' : '#9ca3af'
    const gridColor = isDark ? '#ffffff08' : '#00000008'
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { vertLine: { labelVisible: false } },
      handleScroll: false,
      handleScale: false,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })
    const series = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 5,
    })
    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); chart.remove() }
  }, [isDark])

  useEffect(() => {
    if (!seriesRef.current || !data.length) return
    const sorted = [...data].sort((a, b) => a.time - b.time)
    seriesRef.current.setData(sorted.map(p => ({ time: p.time as UTCTimestamp, value: p.value })))
    chartRef.current?.timeScale().fitContent()
  }, [data])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-ink-tertiary dark:text-dark-ink-tertiary text-sm">
        No history yet — data will appear as the simulation plays.
      </div>
    )
  }

  return <div ref={containerRef} className="w-full h-full" />
}

// ── OverviewPage ──────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const user = useAuthStore(s => s.user)

  const { data: sim } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
    refetchInterval: 15_000,
  })

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio', sim?.id],
    queryFn: () => portfolioApi.get(sim!.id),
    enabled: !!sim?.id,
    refetchInterval: 15_000,
    staleTime: 0,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['portfolio-history', sim?.id],
    queryFn: () => portfolioApi.getHistory(sim!.id),
    enabled: !!sim?.id,
    refetchInterval: 30_000,
    staleTime: 0,
  })

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard', sim?.id],
    queryFn: () => portfolioApi.getLeaderboard(sim!.id),
    enabled: !!sim?.id,
    refetchInterval: 30_000,
  })

  const { data: ordersData } = useQuery({
    queryKey: ['orders', sim?.id],
    queryFn: () => orderApi.list(sim!.id),
    enabled: !!sim?.id,
    refetchInterval: 15_000,
  })

  const { priceMap } = useSimulationSocket({ simulationId: sim?.id ?? null })

  // Live-enrich portfolio with WebSocket prices
  const enriched = useMemo(() => {
    if (!portfolio) return null
    const positions = (portfolio.positions ?? []).map(p => {
      const livePrice = priceMap[p.symbol]?.close ?? p.currentPrice ?? p.averageCost
      const marketValue = p.quantity * livePrice
      const unrealizedPnL = marketValue - p.quantity * p.averageCost
      return { ...p, currentPrice: livePrice, marketValue, unrealizedPnL }
    })
    const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
    const totalEquity = portfolio.cashBalance + totalMarketValue
    const costBasis = positions.reduce((s, p) => s + p.quantity * p.averageCost, 0)
    const unrealizedPnL = totalMarketValue - costBasis
    return { ...portfolio, positions, totalMarketValue, totalEquity, unrealizedPnL }
  }, [portfolio, priceMap])

  const totalReturnPct = useMemo(() => {
    if (!enriched || !sim?.startingCash) return 0
    return ((enriched.totalEquity - sim.startingCash) / sim.startingCash) * 100
  }, [enriched, sim])

  const myRank = useMemo(() => {
    if (!user || !leaderboard.length) return null
    const idx = leaderboard.findIndex((e: LeaderboardEntry) => e.userId === user.id)
    return idx >= 0 ? idx + 1 : null
  }, [leaderboard, user])

  // Donut segments: one per position (by market value) + cash
  const donutSegments = useMemo((): DonutSegment[] => {
    if (!enriched) return []
    const segs: DonutSegment[] = enriched.positions.map((p, i) => ({
      label: p.symbol,
      value: p.marketValue,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }))
    if (enriched.cashBalance > 0) {
      segs.push({ label: 'Cash', value: enriched.cashBalance, color: '#6b7280' })
    }
    return segs
  }, [enriched])

  const recentOrders = useMemo(() => {
    const orders = ordersData?.orders ?? []
    return orders
      .filter(o => o.status === 'filled' || o.status === 'partially_filled')
      .sort((a, b) => new Date(b.filledAt ?? b.createdAt).getTime() - new Date(a.filledAt ?? a.createdAt).getTime())
      .slice(0, 6)
  }, [ordersData])

  const isMarketOpen = sim?.status === 'active'

  if (portfolioLoading || !enriched) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  const pnlUp = enriched.unrealizedPnL >= 0

  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Portfolio Overview</h1>
          <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5 flex items-center gap-1.5">
            {sim?.name ?? 'No active simulation'}
            {sim && (
              <span className={clsx(
                'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full',
                isMarketOpen
                  ? 'bg-success/10 text-success'
                  : 'bg-ink-disabled/10 text-ink-disabled dark:text-dark-ink-disabled'
              )}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', isMarketOpen ? 'bg-success animate-pulse_dot' : 'bg-ink-disabled dark:bg-dark-ink-disabled')} />
                {isMarketOpen ? 'Active' : sim.status.charAt(0).toUpperCase() + sim.status.slice(1)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard/orders')}>
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Orders
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/dashboard/trade')}>
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" /> New Order
          </Button>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          variant="glass"
          label="Total Account Value"
          value={fmtPKR(enriched.totalEquity)}
          mono
        />
        <StatCard
          variant="glass"
          label="Unrealized P&L"
          value={(pnlUp ? '+' : '') + fmtPKR(enriched.unrealizedPnL)}
          delta={enriched.unrealizedPnL !== 0 ? (pnlUp ? Math.abs(enriched.unrealizedPnL / (enriched.totalEquity || 1) * 100) : -Math.abs(enriched.unrealizedPnL / (enriched.totalEquity || 1) * 100)) : 0}
          mono
        />
        <StatCard
          variant="glass"
          label="Cash Balance"
          value={fmtPKR(enriched.cashBalance)}
          deltaLabel="Available"
          mono
        />
        <StatCard
          variant="glass"
          label="Total Return"
          value={fmtPct(totalReturnPct)}
          delta={totalReturnPct}
          deltaLabel={myRank ? `Rank #${myRank}` : undefined}
          mono
        />
      </div>

      {/* ── Chart + Donut row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Performance chart */}
        <Card padding="none" className="lg:col-span-3">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Portfolio Performance</h2>
            <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">Value over simulation time</p>
          </div>
          <div className="h-56 p-2">
            <PerformanceChart data={history} isDark={isDark} />
          </div>
        </Card>

        {/* Asset allocation */}
        <Card variant="glass" padding="sm" className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-ink mb-3">Asset Allocation</h2>
          {donutSegments.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
              No positions yet
            </div>
          ) : (
            <div className="flex gap-4 items-center">
              <div className="w-32 flex-shrink-0">
                <DonutChart
                  segments={donutSegments}
                  totalLabel={enriched.totalEquity >= 1_000_000
                    ? fmt(enriched.totalEquity / 1_000_000, 1) + 'M'
                    : fmt(enriched.totalEquity / 1_000, 1) + 'K'}
                />
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {donutSegments.map(seg => {
                  const pct = enriched.totalEquity > 0 ? (seg.value / enriched.totalEquity) * 100 : 0
                  return (
                    <div key={seg.label} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-xs text-ink-secondary dark:text-dark-ink-secondary truncate font-mono">{seg.label}</span>
                      </div>
                      <span className="text-xs font-medium text-ink dark:text-dark-ink flex-shrink-0">{fmt(pct, 1)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Holdings table ──────────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Current Holdings</h2>
          <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">{enriched.positions.length} position{enriched.positions.length !== 1 ? 's' : ''}</span>
        </div>
        {enriched.positions.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="w-8 h-8" />}
            title="No open positions"
            description="Submit a buy order to open your first position."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
                  {['Symbol', 'Qty', 'Avg Price', 'Mkt Price', 'Total Value', 'P&L'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {enriched.positions.map((pos, i) => {
                  const up = pos.unrealizedPnL >= 0
                  return (
                    <tr key={pos.symbol} className="hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                          >
                            {pos.symbol[0]}
                          </span>
                          <span className="font-semibold text-ink dark:text-dark-ink font-mono">{pos.symbol}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{pos.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtPKR(pos.averageCost)}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtPKR(pos.currentPrice)}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtPKR(pos.marketValue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {up
                            ? <ArrowUpRight className="w-3.5 h-3.5 text-success" />
                            : <ArrowDownRight className="w-3.5 h-3.5 text-danger" />}
                          <span className={clsx('font-mono text-xs font-medium', up ? 'text-success' : 'text-danger')}>
                            {up ? '+' : ''}{fmtPKR(pos.unrealizedPnL)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Recent Activity + Leaderboard row ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Activity */}
        <Card variant="glass" padding="none">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Recent Activity</h2>
            <button
              onClick={() => navigate('/dashboard/orders')}
              className="text-xs text-accent dark:text-dark-accent hover:underline"
            >
              View all
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
              No filled orders yet.
            </div>
          ) : (
            <div className="divide-y divide-border dark:divide-dark-border">
              {recentOrders.map(order => {
                const isBuy = order.side === 'buy'
                const fillPrice = order.averageFillPrice ?? 0
                const total = (order.filledQuantity ?? order.quantity) * fillPrice
                return (
                  <div key={order.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={clsx(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                      isBuy ? 'bg-success/10' : 'bg-danger/10'
                    )}>
                      {isBuy
                        ? <TrendingUp className="w-3.5 h-3.5 text-success" />
                        : <TrendingDown className="w-3.5 h-3.5 text-danger" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink dark:text-dark-ink">
                        {isBuy ? 'Bought' : 'Sold'} <span className="font-mono">{order.symbol}</span>
                      </p>
                      <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
                        {order.filledQuantity ?? order.quantity} shares @ {fmtPKR(fillPrice)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={clsx('text-xs font-mono font-medium', isBuy ? 'text-danger' : 'text-success')}>
                        {isBuy ? '-' : '+'}{fmtPKR(total)}
                      </p>
                      <p className="text-[10px] text-ink-tertiary dark:text-dark-ink-tertiary">
                        {order.filledAt
                          ? new Date(order.filledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Leaderboard */}
        <Card variant="glass" padding="none">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Leaderboard</h2>
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
              No students yet.
            </div>
          ) : (
            <div className="divide-y divide-border dark:divide-dark-border">
              {leaderboard.map((entry: LeaderboardEntry) => {
                const isMe = entry.userId === user?.id
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
                return (
                  <div key={entry.userId} className={clsx(
                    'px-4 py-3 flex items-center gap-3 transition-colors',
                    isMe ? 'bg-accent/5 dark:bg-dark-accent/5' : 'hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary'
                  )}>
                    <span className="w-6 text-center text-sm flex-shrink-0">
                      {medal ?? <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary font-mono">#{entry.rank}</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        'text-xs font-medium truncate',
                        isMe ? 'text-accent dark:text-dark-accent' : 'text-ink dark:text-dark-ink'
                      )}>
                        {entry.name}{isMe && <span className="ml-1 text-[10px] opacity-60">(you)</span>}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-ink dark:text-dark-ink flex-shrink-0">
                      {fmtPKR(entry.totalEquity)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}
