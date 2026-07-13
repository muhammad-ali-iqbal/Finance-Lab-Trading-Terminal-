// src/pages/student/PortfolioPage.tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, simulationApi } from '@/api'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import { useSymbolDisplay } from '@/hooks/useSymbolDisplay'
import { StatCard, Card, Badge, EmptyState, Spinner } from '@/components/ui'
import { TrendingUp, TrendingDown, Briefcase } from 'lucide-react'
import clsx from 'clsx'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtCurrency(n: number) {
  return 'PKR ' + fmt(n)
}

function NoSimulationGraphic() {
  return (
    <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-48 h-36 opacity-80">
      {/* Grid lines */}
      <line x1="20" y1="130" x2="180" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
      <line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" />
      <line x1="20" y1="70"  x2="180" y2="70"  stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" />
      <line x1="20" y1="40"  x2="180" y2="40"  stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" />
      {/* Y axis */}
      <line x1="20" y1="20" x2="20" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
      {/* Dashed flat line — waiting for data */}
      <line x1="20" y1="100" x2="180" y2="100"
        stroke="#6b7280" strokeWidth="2" strokeDasharray="6 4" strokeOpacity="0.4" />
      {/* Clock circle */}
      <circle cx="100" cy="85" r="28" fill="none" stroke="#6b7280" strokeWidth="2" strokeOpacity="0.25" />
      <circle cx="100" cy="85" r="22" className="fill-surface-secondary dark:fill-dark-surface-secondary" />
      {/* Clock hands */}
      <line x1="100" y1="85" x2="100" y2="68" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="100" y1="85" x2="112" y2="90" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
      <circle cx="100" cy="85" r="2" fill="#6b7280" fillOpacity="0.6" />
      {/* Tick marks on clock */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => {
        const rad = (deg - 90) * Math.PI / 180
        const r1 = i % 3 === 0 ? 19 : 21
        const x1 = 100 + r1 * Math.cos(rad)
        const y1 = 85 + r1 * Math.sin(rad)
        const x2 = 100 + 22 * Math.cos(rad)
        const y2 = 85 + 22 * Math.sin(rad)
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b7280" strokeWidth={i % 3 === 0 ? 1.5 : 0.8} strokeOpacity="0.4" />
      })}
    </svg>
  )
}

export default function PortfolioPage() {
  const { formatSymbol } = useSymbolDisplay()
  const { data: simulation, isLoading: simLoading } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
    refetchInterval: 15_000,
  })

  // Backend provides cash balance + position quantities/avg costs.
  // Refetch on order fills (every 15s is enough — prices come from WS).
  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['portfolio', simulation?.id],
    queryFn: () => portfolioApi.get(simulation!.id),
    enabled: !!simulation?.id,
    refetchInterval: 15_000,
    staleTime: 0,
  })

  // Live prices from the WebSocket — updates on every simulation tick.
  // Restart detection is handled globally in DashboardLayout.
  const { priceMap } = useSimulationSocket({ simulationId: simulation?.id ?? null })

  // Recompute positions and totals whenever priceMap or portfolio changes.
  const enriched = useMemo(() => {
    if (!portfolio) return null

    const positions = (portfolio.positions ?? []).map(pos => {
      const livePrice = priceMap[pos.symbol]?.close ?? pos.currentPrice ?? pos.averageCost
      const marketValue   = pos.quantity * livePrice
      const costBasis     = pos.quantity * pos.averageCost
      const unrealizedPnL = marketValue - costBasis
      const unrealizedPnLPct = pos.averageCost > 0
        ? ((livePrice - pos.averageCost) / pos.averageCost) * 100
        : 0
      return { ...pos, currentPrice: livePrice, marketValue, unrealizedPnL, unrealizedPnLPct }
    })

    const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
    const totalCostBasis   = positions.reduce((s, p) => s + p.quantity * p.averageCost, 0)
    const totalEquity      = portfolio.cashBalance + totalMarketValue
    const unrealizedPnL    = totalMarketValue - totalCostBasis
    const unrealizedPnLPct = totalEquity > 0 ? (unrealizedPnL / totalEquity) * 100 : 0

    return { ...portfolio, positions, totalMarketValue, totalEquity, unrealizedPnL, unrealizedPnLPct }
  }, [portfolio, priceMap])

  if (simLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  if (!simulation) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center px-6">
        <div className="text-ink-disabled dark:text-dark-ink-disabled">
          <NoSimulationGraphic />
        </div>
        <div>
          <p className="text-base font-semibold text-ink dark:text-dark-ink">No simulation running</p>
          <p className="text-sm text-ink-tertiary dark:text-dark-ink-tertiary mt-1 max-w-xs">
            Your instructor will start a simulation during class. Your portfolio will appear here once it begins.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading || !enriched) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  const pnlPositive = enriched.unrealizedPnL >= 0

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Portfolio</h1>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5">
          Simulation: <span className="text-ink dark:text-dark-ink font-medium">{simulation?.name ?? '—'}</span>
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total equity"
          value={fmtCurrency(enriched.totalEquity)}
          mono
        />
        <StatCard
          label="Cash balance"
          value={fmtCurrency(enriched.cashBalance)}
          mono
        />
        <StatCard
          label="Market value"
          value={fmtCurrency(enriched.totalMarketValue)}
          mono
        />
        <StatCard
          label="Unrealized P&L"
          value={fmtCurrency(enriched.unrealizedPnL)}
          delta={enriched.unrealizedPnLPct}
          mono
        />
      </div>

      {/* Positions table */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Positions</h2>
          <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">{enriched.positions?.length ?? 0} holdings</span>
        </div>

        {!enriched.positions?.length ? (
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
                  {['Symbol', 'Qty', 'Avg Cost', 'Current', 'Market Value', 'P&L', 'P&L %'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {enriched.positions.map(pos => {
                  const up = pos.unrealizedPnL >= 0
                  return (
                    <tr key={pos.symbol} className="hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink dark:text-dark-ink font-mono">{formatSymbol(pos.symbol)}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{pos.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtCurrency(pos.averageCost)}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtCurrency(pos.currentPrice)}</td>
                      <td className="px-4 py-3 font-mono text-ink dark:text-dark-ink">{fmtCurrency(pos.marketValue)}</td>
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
                <tr className="border-t-2 border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
                  <td colSpan={4} className="px-4 py-3 text-xs font-medium text-ink-secondary dark:text-dark-ink-secondary">Total</td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink dark:text-dark-ink">
                    {fmtCurrency(enriched.totalMarketValue)}
                  </td>
                  <td className={clsx('px-4 py-3 font-mono font-semibold', pnlPositive ? 'text-success' : 'text-danger')}>
                    {pnlPositive ? '+' : ''}{fmtCurrency(enriched.unrealizedPnL)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={pnlPositive ? 'success' : 'danger'}>
                      {pnlPositive ? '+' : ''}{fmt(enriched.unrealizedPnLPct)}%
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
