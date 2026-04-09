// src/components/auth/RequireAuth.tsx
// Wraps protected routes. Redirects unauthenticated users to /login.
// Redirects wrong-role users to their correct home.

import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import type { Role } from '@/types'

interface RequireAuthProps {
  children: React.ReactNode
  role?: Role   // if set, only that role may access this route
}

export function RequireAuth({ children, role }: RequireAuthProps) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    // Preserve intended destination so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (role && user.role !== role) {
    // Wrong role — send to their own home
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
  }

  return <>{children}</>
}
