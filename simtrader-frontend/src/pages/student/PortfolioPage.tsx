// src/pages/student/PortfolioPage.tsx
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, simulationApi } from '@/api'
import { StatCard, Card, Badge, EmptyState, Spinner } from '@/components/ui'
import { TrendingUp, TrendingDown, Briefcase } from 'lucide-react'
import clsx from 'clsx'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtCurrency(n: number) {
  return '$' + fmt(n)
}

export default function PortfolioPage() {
  const { data: simulation } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
  })

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['portfolio', simulation?.id],
    queryFn: () => portfolioApi.get(simulation!.id),
    enabled: !!simulation?.id,
    refetchInterval: 5000,   // poll every 5s while on this page
  })

  if (isLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  const pnlPositive = portfolio.unrealizedPnL >= 0

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink tracking-tight">Portfolio</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Simulation: <span className="text-ink font-medium">{simulation?.name ?? '—'}</span>
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total equity"
          value={fmtCurrency(portfolio.totalEquity)}
          mono
        />
        <StatCard
          label="Cash balance"
          value={fmtCurrency(portfolio.cashBalance)}
          mono
        />
        <StatCard
          label="Market value"
          value={fmtCurrency(portfolio.totalMarketValue)}
          mono
        />
        <StatCard
          label="Unrealized P&L"
          value={fmtCurrency(portfolio.unrealizedPnL)}
          delta={portfolio.unrealizedPnLPct}
          mono
        />
      </div>

      {/* Positions table */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Positions</h2>
          <span className="text-xs text-ink-tertiary">{portfolio.positions?.length ?? 0} holdings</span>
        </div>

        {!portfolio.positions?.length ? (
          <EmptyState
            icon={<Briefcase className="w-8 h-8" />}
            title="No open positions"
            description="Submit a buy order to open your first position."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {['Symbol', 'Qty', 'Avg Cost', 'Current', 'Market Value', 'P&L', 'P&L %'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-ink-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {portfolio.positions.map(pos => {
                  const up = pos.unrealizedPnL >= 0
                  return (
                    <tr key={pos.symbol} className="hover:bg-surface-secondary transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink font-mono">{pos.symbol}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink">{pos.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-ink">{fmtCurrency(pos.averageCost)}</td>
                      <td className="px-4 py-3 font-mono text-ink">{fmtCurrency(pos.currentPrice)}</td>
                      <td className="px-4 py-3 font-mono text-ink">{fmtCurrency(pos.marketValue)}</td>
                      <td className={clsx('px-4 py-3 font-mono font-medium', up ? 'text-success' : 'text-danger')}>
                        {up ? '+' : ''}{fmtCurrency(pos.unrealizedPnL)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={up ? 'success' : 'danger'}>
                          {up ? <TrendingUp className="w-2.5 h-2.5 mr-0.5 inline" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5 inline" />}
                          {up ? '+' : ''}{fmt(pos.unrealizedPnLPct)}%
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-secondary">
                  <td colSpan={4} className="px-4 py-3 text-xs font-medium text-ink-secondary">Total</td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">
                    {fmtCurrency(portfolio.totalMarketValue)}
                  </td>
                  <td className={clsx('px-4 py-3 font-mono font-semibold', pnlPositive ? 'text-success' : 'text-danger')}>
                    {pnlPositive ? '+' : ''}{fmtCurrency(portfolio.unrealizedPnL)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={pnlPositive ? 'success' : 'danger'}>
                      {pnlPositive ? '+' : ''}{fmt(portfolio.unrealizedPnLPct)}%
                    </Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
