// src/pages/admin/AdminOverviewPage.tsx
import { useQuery } from '@tanstack/react-query'
import { simulationApi, userApi } from '@/api'
import { StatCard, Card, Badge } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, Users, Activity, ArrowRight } from 'lucide-react'

export default function AdminOverviewPage() {
  const navigate = useNavigate()

  const { data: simsData } = useQuery({
    queryKey: ['admin', 'simulations'],
    queryFn: simulationApi.list,
  })

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => userApi.listUsers(),
  })

  const sims = simsData?.simulations ?? []
  const users = usersData?.users ?? []
  const activeSim = sims.find(s => s.status === 'active')
  const students = users.filter(u => u.role === 'student')
  const activeStudents = students.filter(u => u.status === 'active')

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Overview</h1>
        <p className="text-sm text-ink-secondary mt-1">
          SimTrader Admin Dashboard
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total students" value={students.length} />
        <StatCard label="Active students" value={activeStudents.length} />
        <StatCard label="Simulations" value={sims.length} />
        <StatCard
          label="Active simulation"
          value={activeSim ? 'Running' : 'None'}
        />
      </div>

      {/* Active simulation banner */}
      {activeSim ? (
        <Card className="mb-6 border-success/30 bg-success-muted/30">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse_dot" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{activeSim.name}</p>
              <p className="text-xs text-ink-secondary">
                Simulation is live · {activeSim.speedMultiplier}× speed
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/simulations')}
              className="flex items-center gap-1 text-xs text-success font-medium hover:underline"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 border-dashed">
          <div className="flex items-center gap-3">
            <PlayCircle className="w-5 h-5 text-ink-disabled" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-secondary">No active simulation</p>
              <p className="text-xs text-ink-tertiary">Start a simulation so students can begin trading</p>
            </div>
            <button
              onClick={() => navigate('/admin/simulations')}
              className="text-xs text-accent font-medium hover:underline"
            >
              Go to Simulations →
            </button>
          </div>
        </Card>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:border-border-strong transition-colors"
          onClick={() => navigate('/admin/simulations')}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center">
              <PlayCircle className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Simulations</p>
              <p className="text-xs text-ink-secondary">Create, upload data, start & pause</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-tertiary ml-auto" />
          </div>
        </Card>

        <Card
          className="cursor-pointer hover:border-border-strong transition-colors"
          onClick={() => navigate('/admin/users')}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-tertiary flex items-center justify-center">
              <Users className="w-5 h-5 text-ink-secondary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Students</p>
              <p className="text-xs text-ink-secondary">Invite, block, manage accounts</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-tertiary ml-auto" />
          </div>
        </Card>
      </div>

      {/* Recent simulations */}
      {sims.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-ink mb-3">Recent simulations</h2>
          <Card padding="none">
            <div className="divide-y divide-border">
              {sims.slice(0, 5).map(sim => (
                <div key={sim.id} className="flex items-center gap-3 px-4 py-3">
                  <Activity className="w-4 h-4 text-ink-tertiary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{sim.name}</p>
                    <p className="text-xs text-ink-tertiary">
                      {new Date(sim.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      sim.status === 'active' ? 'success' :
                      sim.status === 'completed' ? 'neutral' :
                      sim.status === 'paused' ? 'warning' : 'neutral'
                    }
                  >
                    {sim.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
