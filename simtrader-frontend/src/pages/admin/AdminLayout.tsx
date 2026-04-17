// src/components/layout/AdminLayout.tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { ThemeToggle } from '@/components/ui'
import clsx from 'clsx'
import {
  TrendingUp, LayoutDashboard, Users, PlayCircle,
  LogOut, ChevronRight, Settings
} from 'lucide-react'

const navItems = [
  { to: '/admin',             icon: LayoutDashboard, label: 'Overview',    end: true },
  { to: '/admin/simulations', icon: PlayCircle,      label: 'Simulations'       },
  { to: '/admin/users',       icon: Users,           label: 'Students'          },
  { to: '/admin/settings',    icon: Settings,        label: 'Settings'          },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore(s => ({
    user: s.user, logout: s.logout
  }))

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => { logout(); navigate('/login') },
  })

  return (
    <div className="flex h-screen bg-surface dark:bg-dark-surface overflow-hidden">
      {/* Theme toggle — fixed top-right like sign-in page */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Sidebar */}
      <aside className="w-56 bg-surface dark:bg-dark-surface border-r border-border dark:border-dark-border flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border dark:border-dark-border">
          <div className="w-6 h-6 bg-ink dark:bg-dark-ink rounded-sm flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-surface dark:text-dark-surface" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-sm tracking-tight text-ink dark:text-dark-ink">SimTrader</span>
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink dark:bg-dark-ink text-surface dark:text-dark-surface">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors mb-0.5 group',
                isActive
                  ? 'bg-ink text-surface dark:bg-dark-ink dark:text-dark-surface'
                  : 'text-ink-secondary dark:text-dark-ink-secondary hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary hover:text-ink dark:hover:text-dark-ink',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
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
              <p className="text-[10px] text-ink-tertiary dark:text-dark-ink-tertiary truncate">Administrator</p>
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

      {/* Main */}
      <main className="flex-1 overflow-auto bg-surface-secondary dark:bg-dark-surface-secondary">
        <Outlet />
      </main>
    </div>
  )
}
