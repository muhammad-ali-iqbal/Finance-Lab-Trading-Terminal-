// src/pages/student/OrderBookPage.tsx
import { useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { orderApi, simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { useSymbolDisplay } from '@/hooks/useSymbolDisplay'
import { Spinner, EmptyState } from '@/components/ui'
import clsx from 'clsx'
import { BookOpen, LayoutGrid } from 'lucide-react'

const ALL = '__ALL__'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const ROWS = 15

export default function OrderBookPage() {
  const { formatSymbol } = useSymbolDisplay()
  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { priceMap } = useSimulationSocket({ simulationId: simulation?.id ?? null })
  const symbols = Object.keys(priceMap)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  const isAllMode = (selectedSymbol ?? symbols[0]) === ALL
  const symbol = isAllMode ? null : (selectedSymbol ?? symbols[0] ?? null)
  const tick   = symbol ? priceMap[symbol] : undefined

  const { data: book, isLoading } = useQuery({
    queryKey: ['orderbook', simulation?.id, symbol],
    queryFn: () => orderApi.getBook(simulation!.id, symbol!),
    enabled: !!simulation?.id && !!symbol && !isAllMode,
    refetchInterval: 2000,
  })

  const allBookResults = useQueries({
    queries: symbols.map(s => ({
      queryKey: ['orderbook', simulation?.id, s],
      queryFn: () => orderApi.getBook(simulation!.id, s),
      enabled: !!simulation?.id && isAllMode,
      refetchInterval: 2000,
    })),
  })
  const allBooksLoading = isAllMode && allBookResults.some(r => r.isLoading)

  // Bids: desc (best bid at top), Asks: asc (best ask at top) — Binance side-by-side layout
  const displayBids = useMemo(() => {
    if (!book) return []
    let cum = 0
    return (book.bids ?? []).slice(0, ROWS).map(b => ({ ...b, cum: (cum += b.quantity) }))
  }, [book])

  const displayAsks = useMemo(() => {
    if (!book) return []
    let cum = 0
    return (book.asks ?? []).slice(0, ROWS).map(a => ({ ...a, cum: (cum += a.quantity) }))
  }, [book])

  const maxBidCum = Math.max(...displayBids.map(b => b.cum), 1)
  const maxAskCum = Math.max(...displayAsks.map(a => a.cum), 1)

  const bidVol   = (book?.bids ?? []).reduce((s, b) => s + b.quantity, 0)
  const askVol   = (book?.asks ?? []).reduce((s, a) => s + a.quantity, 0)
  const totalVol = bidVol + askVol || 1
  const bidPct   = (bidVol / totalVol) * 100
  const askPct   = (askVol / totalVol) * 100

  const lastPrice = book?.lastPrice ?? tick?.close
  const bestBid   = book?.bids?.[0]?.price
  const bestAsk   = book?.asks?.[0]?.price
  const spread    = book?.spread ?? (bestBid && bestAsk ? bestAsk - bestBid : undefined)

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
          <button
            onClick={() => setSelectedSymbol(ALL)}
            className={clsx(
              'px-3 py-1.5 rounded border text-xs font-semibold transition-all flex items-center gap-1.5',
              (selectedSymbol ?? symbols[0]) === ALL
                ? 'border-ink bg-ink text-surface dark:border-dark-ink dark:bg-dark-ink dark:text-dark-surface'
                : 'border-border dark:border-dark-border text-ink-secondary dark:text-dark-ink-secondary hover:border-border-strong dark:hover:border-dark-border-strong hover:text-ink dark:hover:text-dark-ink'
            )}
          >
            <LayoutGrid className="w-3 h-3" />
            All
          </button>
          <div className="w-px bg-border dark:bg-dark-border self-stretch mx-0.5" />
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
              {formatSymbol(s)}
            </button>
          ))}
        </div>
      )}

      {isAllMode ? (
        allBooksLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <AllBooksView symbols={symbols} bookResults={allBookResults} onSelect={s => setSelectedSymbol(s)} formatSymbol={formatSymbol} />
        )
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !book ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="No order book data"
          description="Order book appears once the simulation is active and limit orders have been placed."
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border dark:border-dark-border overflow-hidden bg-surface dark:bg-dark-surface">

            {/* Bid/Ask volume ratio bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
              <span className="text-[11px] font-mono font-semibold text-success dark:text-dark-success w-14 shrink-0">
                {bidPct.toFixed(2)}%
              </span>
              <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-danger/25 dark:bg-dark-danger/25">
                <div
                  className="bg-success dark:bg-dark-success h-full transition-all duration-500"
                  style={{ width: `${bidPct}%` }}
                />
              </div>
              <span className="text-[11px] font-mono font-semibold text-danger dark:text-dark-danger w-14 shrink-0 text-right">
                {askPct.toFixed(2)}%
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary px-3 py-1.5">
                Qty (Bid)
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-success/70 dark:text-dark-success/70 px-3 py-1.5 text-right">
                Bid (PKR)
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-danger/70 dark:text-dark-danger/70 px-3 py-1.5">
                Ask (PKR)
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary px-3 py-1.5 text-right">
                Qty (Ask)
              </span>
            </div>

            {/* Rows — bid and ask at same depth level rendered side by side */}
            {Array.from({ length: ROWS }).map((_, i) => {
              const bid = displayBids[i]
              const ask = displayAsks[i]
              if (!bid && !ask) return null
              return (
                <div
                  key={i}
                  className="relative grid grid-cols-[1fr_1fr_1fr_1fr] border-t border-border/40 dark:border-dark-border/40"
                >
                  {/* Bid depth bar: right edge anchored at center, grows leftward */}
                  {bid && (
                    <div
                      className="absolute top-0 bottom-0 bg-success/[0.16] dark:bg-dark-success/20 pointer-events-none transition-all duration-300"
                      style={{ right: '50%', width: `${(bid.cum / maxBidCum) * 50}%` }}
                    />
                  )}
                  {/* Ask depth bar: left edge anchored at center, grows rightward */}
                  {ask && (
                    <div
                      className="absolute top-0 bottom-0 bg-danger/[0.16] dark:bg-dark-danger/20 pointer-events-none transition-all duration-300"
                      style={{ left: '50%', width: `${(ask.cum / maxAskCum) * 50}%` }}
                    />
                  )}

                  <span className="relative z-10 px-3 py-1.5 text-[13px] font-mono font-medium text-ink dark:text-dark-ink">
                    {bid ? bid.quantity.toLocaleString() : ''}
                  </span>
                  <span className="relative z-10 px-3 py-1.5 text-[13px] font-mono font-semibold text-success dark:text-dark-success text-right">
                    {bid ? fmt(bid.price) : ''}
                  </span>
                  <span className="relative z-10 px-3 py-1.5 text-[13px] font-mono font-semibold text-danger dark:text-dark-danger">
                    {ask ? fmt(ask.price) : ''}
                  </span>
                  <span className="relative z-10 px-3 py-1.5 text-[13px] font-mono font-medium text-ink dark:text-dark-ink text-right">
                    {ask ? ask.quantity.toLocaleString() : ''}
                  </span>
                </div>
              )
            })}

            {/* Last trade / spread bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary dark:bg-dark-surface-secondary border-t border-border dark:border-dark-border">
              <span className="text-xs font-medium text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wider">
                Last Trade
              </span>
              <span className="font-mono font-bold text-sm text-ink dark:text-dark-ink">
                {lastPrice ? `PKR ${fmt(lastPrice)}` : '—'}
              </span>
              <span className="text-xs font-mono text-ink-tertiary dark:text-dark-ink-tertiary">
                {spread != null ? `Spread ${fmt(spread)}` : ''}
              </span>
            </div>
          </div>

          {/* Totals footer */}
          <div className="flex justify-between text-[11px] px-1">
            <span className="text-success/70 dark:text-dark-success/70">
              {(book.bids ?? []).length} bid level{(book.bids ?? []).length !== 1 ? 's' : ''} &middot; {bidVol.toLocaleString()} shares
            </span>
            <span className="text-danger/70 dark:text-dark-danger/70">
              {(book.asks ?? []).length} ask level{(book.asks ?? []).length !== 1 ? 's' : ''} &middot; {askVol.toLocaleString()} shares
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

type BookData = {
  bids?: { price: number; quantity: number; orderCount: number }[]
  asks?: { price: number; quantity: number; orderCount: number }[]
  lastPrice?: number
  spread?: number
}

function AllBooksView({
  symbols,
  bookResults,
  onSelect,
  formatSymbol,
}: {
  symbols: string[]
  bookResults: { data?: BookData; isLoading: boolean }[]
  onSelect: (s: string) => void
  formatSymbol: (s: string) => string
}) {
  if (symbols.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="w-8 h-8" />}
        title="No symbols available"
        description="Waiting for the simulation to broadcast price data."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border dark:border-dark-border overflow-hidden bg-surface dark:bg-dark-surface">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] px-4 py-2 bg-surface-secondary dark:bg-dark-surface-secondary border-b border-border dark:border-dark-border">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">Symbol</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-24 text-right">Best Bid</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-20 text-right">Bid Qty</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-24 text-right">Best Ask</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-20 text-right">Ask Qty</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary w-24 text-right">Spread</span>
        </div>

        {symbols.map((s, i) => {
          const result = bookResults[i]
          const book = result?.data
          const bestBid = book?.bids?.[0]
          const bestAsk = book?.asks?.[0]
          const spread = book?.spread ?? (bestBid && bestAsk ? bestAsk.price - bestBid.price : undefined)

          return (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className="w-full grid grid-cols-[1fr_auto_auto_auto_auto_auto] px-4 py-3 border-t border-border/40 dark:border-dark-border/40 first:border-t-0 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors text-left group"
            >
              <span className="font-mono font-semibold text-sm text-ink dark:text-dark-ink group-hover:underline underline-offset-2">
                {formatSymbol(s)}
              </span>
              {result?.isLoading ? (
                <span className="col-span-5 text-xs text-ink-tertiary dark:text-dark-ink-tertiary text-right">Loading&hellip;</span>
              ) : !book ? (
                <span className="col-span-5 text-xs text-ink-tertiary dark:text-dark-ink-tertiary text-right">No orders</span>
              ) : (
                <>
                  <span className="font-mono text-xs font-semibold text-success dark:text-dark-success w-24 text-right">
                    {bestBid ? fmt(bestBid.price) : '—'}
                  </span>
                  <span className="font-mono text-xs text-ink dark:text-dark-ink w-20 text-right">
                    {bestBid ? bestBid.quantity.toLocaleString() : '—'}
                  </span>
                  <span className="font-mono text-xs font-semibold text-danger dark:text-dark-danger w-24 text-right">
                    {bestAsk ? fmt(bestAsk.price) : '—'}
                  </span>
                  <span className="font-mono text-xs text-ink dark:text-dark-ink w-20 text-right">
                    {bestAsk ? bestAsk.quantity.toLocaleString() : '—'}
                  </span>
                  <span className="font-mono text-xs text-ink-tertiary dark:text-dark-ink-tertiary w-24 text-right">
                    {spread != null ? fmt(spread) : '—'}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary px-1">
        Click any row to view the full depth for that symbol.
      </p>
    </div>
  )
}
