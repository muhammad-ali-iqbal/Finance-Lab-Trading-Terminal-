// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from '@/context/ThemeContext'

// Auth pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/ForgotPasswordPage'

// Layouts
import DashboardLayout from '@/components/layout/DashboardLayout'
import AdminLayout from '@/pages/admin/AdminLayout'

// Student pages
import OverviewPage from '@/pages/student/OverviewPage'
import PortfolioPage from '@/pages/student/PortfolioPage'
import OrderEntryPage from '@/pages/student/OrderEntryPage'
import ChartPage from '@/pages/student/ChartPage'
import OrderBookPage from '@/pages/student/OrderBookPage'
import { OrdersPage } from '@/pages/student/OrdersPage'
import { ProfilePage } from '@/pages/student/ProfilePage'

// Admin pages
import AdminOverviewPage from '@/pages/admin/AdminOverviewPage'
import AdminSimulationsPage from '@/pages/admin/AdminSimulationsPage'
import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'

// Guards
import { RequireAuth } from '@/components/auth/RequireAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    },
    mutations: { retry: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
        <Routes>
          {/* ── Public auth routes ──────────────────────────────────── */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* ── Student dashboard ───────────────────────────────────── */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth role="student">
                <DashboardLayout />
              </RequireAuth>
            }
          >
            <Route index               element={<OverviewPage />} />
            <Route path="portfolio"    element={<PortfolioPage />} />
            <Route path="trade"        element={<OrderEntryPage />} />
            <Route path="chart"   element={<ChartPage />} />
            <Route path="book"    element={<OrderBookPage />} />
            <Route path="orders"  element={<OrdersPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* ── Admin panel ─────────────────────────────────────────── */}
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index               element={<AdminOverviewPage />} />
            <Route path="simulations"  element={<AdminSimulationsPage />} />
            <Route path="users"        element={<AdminUsersPage />} />
            <Route path="settings"     element={<AdminSettingsPage />} />
          </Route>

          {/* ── Root redirect ────────────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>

      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-5xl font-display italic text-ink-disabled">404</p>
        <p className="text-sm text-ink-secondary">Page not found</p>
        <a href="/login" className="text-sm text-accent hover:underline inline-block mt-2">
          Return to sign in
        </a>
      </div>
    </div>
  )
}
