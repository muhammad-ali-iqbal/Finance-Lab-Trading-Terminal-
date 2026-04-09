// src/pages/student/OrderEntryPage.tsx
import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderApi, simulationApi, portfolioApi } from '@/api'
import { Button, Input, Card, Badge, Alert, Spinner, EmptyState } from '@/components/ui'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import type { OrderSide, OrderType } from '@/types'
import clsx from 'clsx'
import { CheckCircle2, XCircle, Clock, Activity } from 'lucide-react'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ORDER_TYPES: { value: OrderType; label: string; description: string }[] = [
  { value: 'market', label: 'Market',  description: 'Fill immediately at current price' },
  { value: 'limit',  label: 'Limit',   description: 'Fill only at your specified price or better' },
  { value: 'stop',   label: 'Stop',    description: 'Trigger a market order when price hits stop' },
]

export default function OrderEntryPage() {
  const qc = useQueryClient()

  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', simulation?.id],
    queryFn: () => portfolioApi.get(simulation!.id),
    enabled: !!simulation?.id,
  })

  // Live prices from WebSocket
  const { priceMap, connected } = useSimulationSocket({
    simulationId: simulation?.id ?? null,
  })

  const symbols = Object.keys(priceMap)
  const [side, setSide]         = useState<OrderSide>('buy')
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [symbol, setSymbol]     = useState('')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice]   = useState('')
  const [submitted, setSubmitted]   = useState<'success' | 'error' | null>(null)

  const currentPrice = symbol ? priceMap[symbol]?.close : undefined

  // Estimated cost/proceeds
  const qty = parseFloat(quantity) || 0
  const lp  = parseFloat(limitPrice) || 0
  const estimatedValue = orderType === 'market'
    ? qty * (currentPrice ?? 0)
    : qty * lp

  const canAfford = side === 'buy'
    ? (portfolio?.cashBalance ?? 0) >= estimatedValue
    : true

  const submit = useMutation({
    mutationFn: () =>
      orderApi.submit(simulation!.id, {
        symbol,
        side,
        type: orderType,
        quantity: qty,
        ...(orderType === 'limit' && { limitPrice: lp }),
        ...(orderType === 'stop'  && { stopPrice: parseFloat(stopPrice) }),
      }),
    onSuccess: () => {
      setSubmitted('success')
      setQuantity('')
      setLimitPrice('')
      setStopPrice('')
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setTimeout(() => setSubmitted(null), 3000)
    },
    onError: () => {
      setSubmitted('error')
      setTimeout(() => setSubmitted(null), 4000)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!simulation || !symbol || qty <= 0) return
    submit.mutate()
  }

  const { data: recentOrders } = useQuery({
    queryKey: ['orders', simulation?.id],
    queryFn: () => orderApi.list(simulation!.id),
    enabled: !!simulation?.id,
    refetchInterval: 5000,
  })

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">Order Entry</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Submit buy and sell orders against the live simulation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Order form */}
        <div className="space-y-4">
          {/* Connection status */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium',
            connected
              ? 'border-success/30 bg-success-muted text-success-text'
              : 'border-warning/30 bg-warning-muted text-warning-text'
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-success animate-pulse_dot' : 'bg-warning')} />
            {connected ? 'Connected to simulation' : 'Connecting to simulation…'}
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Buy / Sell toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-surface-secondary rounded-md">
                {(['buy', 'sell'] as OrderSide[]).map(s => (
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
                        : 'text-ink-secondary hover:text-ink'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Symbol */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-secondary">Symbol</label>
                <div className="grid grid-cols-3 gap-1.5 flex-wrap">
                  {symbols.length === 0 && (
                    <p className="col-span-3 text-xs text-ink-tertiary py-1">
                      Waiting for simulation data…
                    </p>
                  )}
                  {symbols.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSymbol(s)}
                      className={clsx(
                        'px-2 py-1.5 rounded border text-xs font-mono font-semibold transition-all',
                        symbol === s
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-ink-secondary hover:border-border-strong hover:text-ink'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {symbol && currentPrice !== undefined && (
                  <p className="text-xs text-ink-tertiary">
                    Last price: <span className="font-mono font-medium text-ink">${fmt(currentPrice)}</span>
                  </p>
                )}
              </div>

              {/* Order type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-secondary">Order type</label>
                <div className="space-y-1">
                  {ORDER_TYPES.map(ot => (
                    <button
                      key={ot.value}
                      type="button"
                      onClick={() => setOrderType(ot.value)}
                      className={clsx(
                        'w-full flex items-start gap-3 p-2.5 rounded border text-left transition-all',
                        orderType === ot.value
                          ? 'border-accent bg-accent-muted'
                          : 'border-border hover:border-border-strong'
                      )}
                    >
                      <div className={clsx(
                        'w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors',
                        orderType === ot.value ? 'border-accent bg-accent' : 'border-border'
                      )} />
                      <div>
                        <p className={clsx('text-xs font-semibold', orderType === ot.value ? 'text-accent' : 'text-ink')}>
                          {ot.label}
                        </p>
                        <p className="text-[11px] text-ink-tertiary mt-0.5">{ot.description}</p>
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
                  label="Limit price"
                  type="number"
                  placeholder={currentPrice ? fmt(currentPrice) : '0.00'}
                  value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                  step="0.01"
                  required
                  hint={side === 'buy' ? 'Maximum price you will pay' : 'Minimum price you will accept'}
                />
              )}

              {/* Stop price */}
              {orderType === 'stop' && (
                <Input
                  label="Stop price"
                  type="number"
                  placeholder={currentPrice ? fmt(currentPrice) : '0.00'}
                  value={stopPrice}
                  onChange={e => setStopPrice(e.target.value)}
                  step="0.01"
                  required
                  hint="Order triggers when price reaches this level"
                />
              )}

              {/* Estimated value + buying power */}
              {qty > 0 && (orderType === 'market' ? currentPrice : lp > 0) && (
                <div className="rounded border border-border bg-surface-secondary p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-tertiary">Estimated {side === 'buy' ? 'cost' : 'proceeds'}</span>
                    <span className="font-mono font-medium text-ink">${fmt(estimatedValue)}</span>
                  </div>
                  {side === 'buy' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-tertiary">Available cash</span>
                      <span className={clsx('font-mono font-medium', canAfford ? 'text-ink' : 'text-danger')}>
                        ${fmt(portfolio?.cashBalance ?? 0)}
                      </span>
                    </div>
                  )}
                  {!canAfford && (
                    <p className="text-[11px] text-danger font-medium">Insufficient cash for this order</p>
                  )}
                </div>
              )}

              {/* Feedback */}
              {submitted === 'success' && (
                <Alert variant="success" message="Order submitted successfully." />
              )}
              {submitted === 'error' && (
                <Alert
                  variant="error"
                  message={(submit.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Order failed. Please try again.'}
                />
              )}

              <Button
                type="submit"
                fullWidth
                size="lg"
                variant={side === 'sell' ? 'danger' : 'primary'}
                loading={submit.isPending}
                disabled={!symbol || qty <= 0 || !canAfford || !connected}
              >
                {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Recent orders */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent orders</h2>
            {recentOrders && (
              <span className="text-xs text-ink-tertiary">{recentOrders.orders.length} orders</span>
            )}
          </div>

          {!recentOrders ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : recentOrders.orders.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-8 h-8" />}
              title="No orders yet"
              description="Your submitted orders will appear here."
            />
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.orders.slice(0, 20).map(order => (
                <div key={order.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface-secondary transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-ink">{order.symbol}</span>
                      <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                        {order.side.toUpperCase()}
                      </Badge>
                      <Badge variant="neutral">{order.type}</Badge>
                    </div>
                    <p className="text-xs text-ink-tertiary mt-0.5 font-mono">
                      {order.quantity.toLocaleString()} shares
                      {order.limitPrice != null && ` @ $${fmt(order.limitPrice)}`}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <OrderStatusBadge status={order.status} />
                    {order.averageFillPrice && (
                      <p className="text-[11px] text-ink-tertiary font-mono mt-0.5">
                        filled @ ${fmt(order.averageFillPrice)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
    filled:           { icon: CheckCircle2, label: 'Filled',    variant: 'success' },
    partially_filled: { icon: CheckCircle2, label: 'Partial',   variant: 'warning' },
    pending:          { icon: Clock,        label: 'Pending',   variant: 'neutral'  },
    cancelled:        { icon: XCircle,      label: 'Cancelled', variant: 'neutral'  },
    rejected:         { icon: XCircle,      label: 'Rejected',  variant: 'danger'   },
  }
  const cfg = map[status] ?? map.pending
  const Icon = cfg.icon
  return (
    <Badge variant={cfg.variant}>
      <Icon className="w-2.5 h-2.5 mr-0.5 inline" />
      {cfg.label}
    </Badge>
  )
}
