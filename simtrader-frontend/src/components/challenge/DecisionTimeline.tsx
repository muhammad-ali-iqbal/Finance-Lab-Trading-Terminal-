// src/components/challenge/DecisionTimeline.tsx
// Chronological, timestamped list of a student's own Challenge order decisions.
// Shared between the student "Decisions" tab and the admin per-participant drill-down.

import { CheckCircle2, XCircle, Clock, Activity } from 'lucide-react'
import { Badge, Spinner, EmptyState } from '@/components/ui'
import { useSymbolDisplay } from '@/hooks/useSymbolDisplay'
import type { ChallengeOrder } from '@/api'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function ChallengeOrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
    filled:    { icon: CheckCircle2, label: 'Filled',    variant: 'success' },
    pending:   { icon: Clock,        label: 'Pending',   variant: 'neutral'  },
    cancelled: { icon: XCircle,      label: 'Cancelled', variant: 'neutral'  },
    rejected:  { icon: XCircle,      label: 'Rejected',  variant: 'danger'   },
  }
  const cfg = map[status] ?? map.pending
  const Icon = cfg.icon
  return (
    <Badge variant={cfg.variant} size="sm">
      <Icon className="w-2.5 h-2.5 mr-0.5 inline" />
      {cfg.label}
    </Badge>
  )
}

export function DecisionTimeline({
  orders,
  isLoading,
  emptyTitle = 'No decisions yet',
  emptyDescription = 'Orders will appear here as a timestamped timeline as soon as they are placed.',
}: {
  orders: ChallengeOrder[]
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const { formatSymbol } = useSymbolDisplay()

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner /></div>
  }

  if (!orders.length) {
    return (
      <EmptyState
        icon={<Activity className="w-8 h-8" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className="divide-y divide-border dark:divide-dark-border">
      {orders.map(o => {
        const created = new Date(o.createdAt)
        return (
          <div key={o.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
            <div className="flex-shrink-0 w-28">
              <p className="text-xs font-mono text-ink dark:text-dark-ink">
                {created.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary font-mono">
                {created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

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
              {o.status === 'rejected' && o.rejectReason && (
                <p className="text-[11px] text-danger dark:text-dark-danger max-w-[160px]">{o.rejectReason}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
