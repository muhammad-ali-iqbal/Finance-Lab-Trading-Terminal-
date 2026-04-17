// src/pages/student/OrderBookPage.tsx
// Depth of market — shows all student limit orders at each price level.
// Bids (buy orders) on the left, asks (sell orders) on the right.
// Updates live as new orders arrive via polling.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { orderApi, simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { Card, Spinner, EmptyState } from '@/components/ui'
import clsx from 'clsx'
import { BookOpen } from 'lucide-react'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

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
  const currentPrice = symbol ? priceMap[symbol]?.close : undefined

  const { data: book, isLoading } = useQuery({
    queryKey: ['orderbook', simulation?.id, symbol],
    queryFn: () => orderApi.getBook(simulation!.id, symbol!),
    enabled: !!simulation?.id && !!symbol,
    refetchInterval: 2000,
  })

  // Max quantity for depth bar scaling
  const maxQty = Math.max(
    ...(book?.bids ?? []).map(b => b.quantity),
    ...(book?.asks ?? []).map(a => a.quantity),
    1,
  )

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Order Book</h1>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5">
          Live depth of market — student limit orders at each price level
        </p>
      </div>

      {/* Symbol tabs */}
      {symbols.length > 0 && (
        <div className="flex gap-1 mb-5 flex-wrap">
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
          description="Order book will appear once the simulation is active and orders have been placed."
        />
      ) : (
        <div className="space-y-4">
          {/* Spread indicator */}
          <div className="flex items-center justify-center gap-4 py-2">
            <div className="text-right">
              <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wider">Best Bid</p>
              <p className="text-lg font-mono font-semibold text-success dark:text-dark-success">
                {book.bids[0] ? `$${fmt(book.bids[0].price)}` : '—'}
              </p>
            </div>
            <div className="text-center px-4 border-x border-border dark:border-dark-border">
              <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wider">Spread</p>
              <p className="text-sm font-mono font-medium text-ink dark:text-dark-ink">
                ${fmt(book.spread)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wider">Best Ask</p>
              <p className="text-lg font-mono font-semibold text-danger dark:text-dark-danger">
                {book.asks[0] ? `$${fmt(book.asks[0].price)}` : '—'}
              </p>
            </div>
          </div>

          {/* Last price bar */}
          {currentPrice && (
            <div className="flex justify-center">
              <div className="px-4 py-1.5 rounded bg-surface-secondary dark:bg-dark-surface-secondary border border-border dark:border-dark-border">
                <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mr-2">Last</span>
                <span className="font-mono font-semibold text-sm text-ink dark:text-dark-ink">${fmt(currentPrice)}</span>
              </div>
            </div>
          )}

          {/* Order book grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Bids — buy orders */}
            <Card padding="none">
              <div className="px-4 py-2.5 border-b border-border dark:border-dark-border bg-success-muted/30 dark:bg-dark-success-muted/30">
                <p className="text-xs font-semibold text-success dark:text-dark-success uppercase tracking-wider">Bids (Buy)</p>
              </div>
              <div>
                <div className="grid grid-cols-3 px-4 py-2 border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
                  {['Price', 'Qty', 'Orders'].map(h => (
                    <span key={h} className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">
                      {h}
                    </span>
                  ))}
                </div>
                {book.bids.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-ink-tertiary dark:text-dark-ink-tertiary text-center">No buy orders</p>
                ) : (
                  book.bids.slice(0, 15).map((bid, i) => (
                    <div key={i} className="relative grid grid-cols-3 px-4 py-2 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
                      {/* Depth bar */}
                      <div
                        className="absolute inset-y-0 right-0 bg-success/8 dark:bg-dark-success/8 pointer-events-none"
                        style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                      />
                      <span className="font-mono text-xs font-semibold text-success dark:text-dark-success relative z-10">
                        ${fmt(bid.price)}
                      </span>
                      <span className="font-mono text-xs text-ink dark:text-dark-ink relative z-10">
                        {bid.quantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary relative z-10">
                        {bid.orderCount}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Asks — sell orders */}
            <Card padding="none">
              <div className="px-4 py-2.5 border-b border-border dark:border-dark-border bg-danger-muted/30 dark:bg-dark-danger-muted/30">
                <p className="text-xs font-semibold text-danger dark:text-dark-danger uppercase tracking-wider">Asks (Sell)</p>
              </div>
              <div>
                <div className="grid grid-cols-3 px-4 py-2 border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
                  {['Price', 'Qty', 'Orders'].map(h => (
                    <span key={h} className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">
                      {h}
                    </span>
                  ))}
                </div>
                {book.asks.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-ink-tertiary dark:text-dark-ink-tertiary text-center">No sell orders</p>
                ) : (
                  book.asks.slice(0, 15).map((ask, i) => (
                    <div key={i} className="relative grid grid-cols-3 px-4 py-2 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
                      <div
                        className="absolute inset-y-0 left-0 bg-danger/8 dark:bg-dark-danger/8 pointer-events-none"
                        style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                      />
                      <span className="font-mono text-xs font-semibold text-danger dark:text-dark-danger relative z-10">
                        ${fmt(ask.price)}
                      </span>
                      <span className="font-mono text-xs text-ink dark:text-dark-ink relative z-10">
                        {ask.quantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary relative z-10">
                        {ask.orderCount}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
