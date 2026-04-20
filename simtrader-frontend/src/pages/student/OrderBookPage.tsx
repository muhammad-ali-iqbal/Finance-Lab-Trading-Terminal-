// src/pages/student/OrderBookPage.tsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { orderApi, simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { Spinner, EmptyState } from '@/components/ui'
import clsx from 'clsx'
import { BookOpen, TrendingUp, TrendingDown } from 'lucide-react'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const ROWS = 12

export default function OrderBookPage() {
  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { priceMap } = useSimulationSocket({ simulationId: simulation?.id ?? null })
  const symbols = Object.keys(priceMap)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  const symbol = selectedSymbol ?? symbols[0] ?? null
  const tick   = symbol ? priceMap[symbol] : undefined

  const { data: book, isLoading } = useQuery({
    queryKey: ['orderbook', simulation?.id, symbol],
    queryFn: () => orderApi.getBook(simulation!.id, symbol!),
    enabled: !!simulation?.id && !!symbol,
    refetchInterval: 2000,
  })

  // Asks: sorted asc from API (lowest ask first). We want lowest ask closest
  // to the mid-price bar, so we reverse for display: highest ask at top, lowest at bottom.
  const displayAsks = useMemo(() => {
    if (!book) return []
    let cum = 0
    const withCum = (book.asks ?? []).slice(0, ROWS).map(a => ({ ...a, cum: (cum += a.quantity) }))
    return withCum.reverse() // highest ask at top of block
  }, [book])

  // Bids: sorted desc from API (highest bid first). Highest bid stays at top (closest to mid).
  const displayBids = useMemo(() => {
    if (!book) return []
    let cum = 0
    return (book.bids ?? []).slice(0, ROWS).map(b => ({ ...b, cum: (cum += b.quantity) }))
  }, [book])

  const maxCum = Math.max(
    ...displayAsks.map(a => a.cum),
    ...displayBids.map(b => b.cum),
    1,
  )

  const lastPrice  = book?.lastPrice ?? tick?.close
  const bestBid    = book?.bids?.[0]?.price
  const bestAsk    = book?.asks?.[0]?.price
  const spread     = book?.spread ?? (bestBid && bestAsk ? bestAsk - bestBid : undefined)
  const spreadPct  = bestBid && spread ? (spread / bestBid) * 100 : undefined

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Order Book</h1>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5">
          Live depth of market — student limit orders aggregated by price level
        </p>
      </div>

      {/* Symbol tabs */}
      {symbols.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {symbols.map(s => (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              className={clsx(
                'px-3 py-1.5 rounded border text-xs font-mono font-semibold transition-all',
                (selectedSymbol ?? symbols[0]) === s
                  ? 'border-ink bg-ink text-surface dark:border-dark-ink dark:bg-dark-ink dark:text-dark-surface'
                  : 'border-border dark:border-dark-border text-ink-secondary dark:text-dark-ink-secondary hover:border-border-strong dark:hover:border-dark-border-strong hover:text-ink dark:hover:text-dark-ink'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !book ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="No order book data"
          description="Order book appears once the simulation is active and limit orders have been placed."
        />
      ) : (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            <StatPill label="Best Bid" value={bestBid ? fmt(bestBid) : '—'} color="success" />
            <StatPill
              label="Spread"
              value={spread != null ? fmt(spread) : '—'}
              sub={spreadPct != null ? `${fmt(spreadPct, 3)}%` : undefined}
              color="neutral"
            />
            <StatPill label="Best Ask" value={bestAsk ? fmt(bestAsk) : '—'} color="danger" />
            <StatPill label="Last Price" value={lastPrice ? fmt(lastPrice) : '—'} color="neutral" />
          </div>

          {/* Merged order book */}
          <div className="rounded-lg border border-border dark:border-dark-border overflow-hidden bg-surface dark:bg-dark-surface">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 bg-surface-secondary dark:bg-dark-surface-secondary border-b border-border dark:border-dark-border">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">Depth</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-28 text-right">Price (PKR)</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-20 text-right">Shares</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-16 text-right">Orders</span>
            </div>

            {/* ASKS — displayed highest price at top, lowest ask (closest to mid) at bottom */}
            {displayAsks.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-ink-tertiary dark:text-dark-ink-tertiary border-b border-border dark:border-dark-border">
                No sell orders
              </div>
            ) : (
              displayAsks.map((ask, i) => (
                <div
                  key={ask.price}
                  className="relative grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 border-b border-border/40 dark:border-dark-border/40 last:border-b-0"
                >
                  {/* Depth bar — grows upward from mid (bottom row has smallest bar) */}
                  <div
                    className="absolute inset-y-0 right-0 bg-danger/10 dark:bg-dark-danger/10 pointer-events-none transition-all duration-300"
                    style={{ width: `${(ask.cum / maxCum) * 100}%` }}
                  />
                  {/* Depth label */}
                  <span className="text-[10px] font-mono text-danger/40 dark:text-dark-danger/40 relative z-10 flex items-center">
                    {i === 0 && <TrendingDown className="w-2.5 h-2.5 mr-1" />}
                    {fmt(ask.cum, 0)}
                  </span>
                  <span className="font-mono text-xs font-semibold text-danger dark:text-dark-danger relative z-10 w-28 text-right">
                    {fmt(ask.price)}
                  </span>
                  <span className="font-mono text-xs text-ink dark:text-dark-ink relative z-10 w-20 text-right">
                    {ask.quantity.toLocaleString()}
                  </span>
                  <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary relative z-10 w-16 text-right">
                    {ask.orderCount}
                  </span>
                </div>
              ))
            )}

            {/* Mid-price / last trade row */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-secondary dark:bg-dark-surface-secondary border-y border-border dark:border-dark-border">
              <span className="text-xs font-medium text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wider">
                Last Trade
              </span>
              <span className="font-mono font-bold text-base text-ink dark:text-dark-ink">
                {lastPrice ? `PKR ${fmt(lastPrice)}` : '—'}
              </span>
              {spread != null && (
                <span className="text-xs font-mono text-ink-tertiary dark:text-dark-ink-tertiary">
                  Spread: {fmt(spread)}
                </span>
              )}
            </div>

            {/* BIDS — highest bid (closest to mid) at top */}
            {displayBids.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-ink-tertiary dark:text-dark-ink-tertiary">
                No buy orders
              </div>
            ) : (
              displayBids.map((bid, i) => (
                <div
                  key={bid.price}
                  className="relative grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 border-t border-border/40 dark:border-dark-border/40 first:border-t-0"
                >
                  {/* Depth bar — grows as you go away from mid */}
                  <div
                    className="absolute inset-y-0 right-0 bg-success/10 dark:bg-dark-success/10 pointer-events-none transition-all duration-300"
                    style={{ width: `${(bid.cum / maxCum) * 100}%` }}
                  />
                  <span className="text-[10px] font-mono text-success/40 dark:text-dark-success/40 relative z-10 flex items-center">
                    {i === 0 && <TrendingUp className="w-2.5 h-2.5 mr-1" />}
                    {fmt(bid.cum, 0)}
                  </span>
                  <span className="font-mono text-xs font-semibold text-success dark:text-dark-success relative z-10 w-28 text-right">
                    {fmt(bid.price)}
                  </span>
                  <span className="font-mono text-xs text-ink dark:text-dark-ink relative z-10 w-20 text-right">
                    {bid.quantity.toLocaleString()}
                  </span>
                  <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary relative z-10 w-16 text-right">
                    {bid.orderCount}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Book totals */}
          <div className="flex justify-between text-xs text-ink-tertiary dark:text-dark-ink-tertiary px-1">
            <span>
              {(book.bids ?? []).length} bid level{(book.bids ?? []).length !== 1 ? 's' : ''} ·{' '}
              {(book.bids ?? []).reduce((s, b) => s + b.quantity, 0).toLocaleString()} shares
            </span>
            <span>
              {(book.asks ?? []).length} ask level{(book.asks ?? []).length !== 1 ? 's' : ''} ·{' '}
              {(book.asks ?? []).reduce((s, a) => s + a.quantity, 0).toLocaleString()} shares
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub?: string
  color: 'success' | 'danger' | 'neutral'
}) {
  const valueClass = color === 'success'
    ? 'text-success dark:text-dark-success'
    : color === 'danger'
    ? 'text-danger dark:text-dark-danger'
    : 'text-ink dark:text-dark-ink'

  return (
    <div className="rounded-lg border border-border dark:border-dark-border bg-surface dark:bg-dark-surface px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary mb-1">
        {label}
      </p>
      <p className={clsx('font-mono font-semibold text-sm', valueClass)}>{value}</p>
      {sub && <p className="text-[10px] font-mono text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}
