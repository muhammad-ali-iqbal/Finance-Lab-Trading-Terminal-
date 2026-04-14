// src/pages/student/OrdersPage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderApi, simulationApi } from '@/api'
import { Badge, Card, Button, EmptyState, Spinner } from '@/components/ui'
import { Activity, X } from 'lucide-react'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function OrdersPage() {
  const qc = useQueryClient()

  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['orders', simulation?.id],
    queryFn: () => orderApi.list(simulation!.id),
    enabled: !!simulation?.id,
    refetchInterval: 5000,
  })

  const cancel = useMutation({
    mutationFn: (orderId: string) => orderApi.cancel(simulation!.id, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">My Orders</h1>
        <p className="text-sm text-ink-secondary mt-0.5">All orders you've placed in this simulation</p>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : !data?.orders.length ? (
          <EmptyState
            icon={<Activity className="w-8 h-8" />}
            title="No orders yet"
            description="Orders you place in the Order Entry screen will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {['Time', 'Symbol', 'Side', 'Type', 'Qty', 'Price', 'Filled', 'Fill Price', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-ink-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.orders.map(order => (
                  <tr key={order.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="px-4 py-3 text-xs text-ink-tertiary font-mono whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-ink">{order.symbol}</td>
                    <td className="px-4 py-3">
                      <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                        {order.side.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-secondary capitalize">{order.type}</td>
                    <td className="px-4 py-3 font-mono text-ink">{order.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {order.limitPrice != null ? `$${fmt(order.limitPrice)}`
                        : order.stopPrice != null ? `$${fmt(order.stopPrice)}`
                        : 'Market'}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {order.filledQuantity > 0 ? order.filledQuantity.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">
                      {order.averageFillPrice != null ? `$${fmt(order.averageFillPrice)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      {order.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancel.mutate(order.id)}
                          className="text-danger hover:text-danger"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
    filled: 'success', rejected: 'danger', partially_filled: 'warning',
    pending: 'neutral', cancelled: 'neutral',
  }
  return (
    <Badge variant={map[status] ?? 'neutral'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}
