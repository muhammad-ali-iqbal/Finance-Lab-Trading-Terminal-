// src/components/layout/DashboardLayout.tsx
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { authApi, simulationApi } from '@/api'
import { SimulationTimer } from '@/components/simulation/SimulationTimer'
import { ThemeToggle } from '@/components/ui'
import clsx from 'clsx'
import {
  TrendingUp, LayoutDashboard, BookOpen, BarChart3,
  User, LogOut, Menu, X, ChevronRight, Activity
} from 'lucide-react'

// Compact sidebar widget — fetches active sim and shows live timer
function SimulationSidebarWidget() {
  const { data: sim } = useQuery({
    queryKey: ['simulation', 'active'],
    queryFn: simulationApi.getActive,
    retry: false,
    refetchInterval: 15000,
  })

  if (!sim) {
    return (
      <div className="px-3 py-2 border-b border-border dark:border-dark-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-secondary dark:bg-dark-surface-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-disabled dark:bg-dark-ink-disabled flex-shrink-0" />
          <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary truncate">No active simulation</span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-border dark:border-dark-border space-y-1.5">
      <div className="flex items-center gap-1.5 px-1">
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          sim.status === 'active' ? 'bg-success animate-pulse_dot' :
          sim.status === 'paused' ? 'bg-warning' : 'bg-ink-disabled dark:bg-dark-ink-disabled'
        )} />
        <span className="text-xs text-ink-secondary dark:text-dark-ink-secondary font-medium truncate">{sim.name}</span>
      </div>
      <SimulationTimer simulationId={sim.id} compact />
    </div>
  )
}

const navItems = [
  { to: '/dashboard',       icon: LayoutDashboard, label: 'Portfolio'    },
  { to: '/dashboard/trade', icon: TrendingUp,      label: 'Order Entry'  },
  { to: '/dashboard/chart', icon: BarChart3,        label: 'Charts'       },
  { to: '/dashboard/book',  icon: BookOpen,         label: 'Order Book'   },
  { to: '/dashboard/orders',icon: Activity,         label: 'My Orders'    },
  { to: '/dashboard/profile', icon: User,           label: 'Profile'      },
]

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuthStore(s => ({
    user: s.user, logout: s.logout
  }))

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      logout()
      navigate('/login')
    },
  })

  return (
    <div className="flex h-screen bg-surface dark:bg-dark-surface overflow-hidden">
      {/* Theme toggle — fixed top-right like sign-in page */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-56 bg-surface dark:bg-dark-surface border-r border-border dark:border-dark-border flex flex-col transition-transform duration-200',
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border dark:border-dark-border flex-shrink-0">
          <div className="w-6 h-6 bg-ink dark:bg-dark-ink rounded-sm flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-surface dark:text-dark-surface" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-sm tracking-tight text-ink dark:text-dark-ink">SimTrader</span>
        </div>

        {/* Live simulation timer */}
        <SimulationSidebarWidget />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors mb-0.5 group',
                isActive
                  ? 'bg-ink text-surface dark:bg-dark-ink dark:text-dark-surface'
                  : 'text-ink-secondary dark:text-dark-ink-secondary hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary hover:text-ink dark:hover:text-dark-ink',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0 text-ink-secondary dark:text-dark-ink-secondary group-[.active]:text-surface dark:group-[.active]:text-dark-surface" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border dark:border-dark-border p-3 space-y-2">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-7 h-7 rounded-full bg-ink dark:bg-dark-ink flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-surface dark:text-dark-surface">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink dark:text-dark-ink truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-[10px] text-ink-tertiary dark:text-dark-ink-tertiary truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-ink-secondary dark:text-dark-ink-secondary hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary hover:text-danger dark:hover:text-dark-danger transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 dark:bg-dark-ink/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar — mobile only */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border dark:border-dark-border bg-surface dark:bg-dark-surface flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1 text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-ink dark:bg-dark-ink rounded-sm flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-surface dark:text-dark-surface" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm text-ink dark:text-dark-ink">SimTrader</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
