// src/api/index.ts
// One function per backend endpoint. Every function returns typed data.
// Callers never import axios directly — always use these functions.

import { client } from './client'
import type {
  AuthResponse, User, Portfolio, Order, OrderBook,
  OrderSide, OrderType, Simulation,
} from '@/types'

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    client.post<AuthResponse>('/auth/login', { email, password }).then(r => r.data),

  register: (inviteToken: string, firstName: string, lastName: string, password: string) =>
    client.post<AuthResponse>('/auth/register', { inviteToken, firstName, lastName, password }).then(r => r.data),

  logout: (refreshToken: string) =>
    client.post('/auth/logout', { refreshToken }),

  forgotPassword: (email: string) =>
    client.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    client.post('/auth/reset-password', { token, newPassword }),
}

// ── User / Profile ───────────────────────────────────────────────────────────

export const userApi = {
  me: () =>
    client.get<User>('/me').then(r => r.data),

  updateProfile: (firstName: string, lastName: string) =>
    client.put<User>('/me', { firstName, lastName }).then(r => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    client.put('/me/password', { currentPassword, newPassword }),

  // Admin
  listUsers: (role?: string) =>
    client.get<{ users: User[]; total: number }>('/admin/users', { params: { role } }).then(r => r.data),

  inviteStudent: (email: string) =>
    client.post<{ user: User; message: string }>('/admin/users/invite', { email }).then(r => r.data),

  blockUser: (id: string) =>
    client.post(`/admin/users/${id}/block`),

  unblockUser: (id: string) =>
    client.post(`/admin/users/${id}/unblock`),
}

// ── Simulation ───────────────────────────────────────────────────────────────

export const simulationApi = {
  list: () =>
    client.get<{ simulations: Simulation[] }>('/simulations').then(r => r.data),

  get: (id: string) =>
    client.get<Simulation>(`/simulations/${id}`).then(r => r.data),

  getActive: () =>
    client.get<Simulation>('/simulations/active').then(r => r.data),

  // Admin
  create: (data: { name: string; description: string; speedMultiplier: number; startingCash: number }) =>
    client.post<Simulation>('/admin/simulations', data).then(r => r.data),

  uploadCSV: (simId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post<{ message: string; rowsLoaded: number }>(
      `/admin/simulations/${simId}/upload`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data)
  },

  start:    (simId: string) => client.post(`/admin/simulations/${simId}/start`).then(r => r.data),
  pause:    (simId: string) => client.post(`/admin/simulations/${simId}/pause`).then(r => r.data),
  resume:   (simId: string) => client.post(`/admin/simulations/${simId}/resume`).then(r => r.data),
  complete: (simId: string) => client.post(`/admin/simulations/${simId}/complete`).then(r => r.data),
}

// ── Portfolio ────────────────────────────────────────────────────────────────

export const portfolioApi = {
  get: (simulationId: string) =>
    client.get<Portfolio>(`/simulations/${simulationId}/portfolio`).then(r => r.data),
}

// ── Orders ───────────────────────────────────────────────────────────────────

export const orderApi = {
  submit: (simulationId: string, params: {
    symbol: string
    side: OrderSide
    type: OrderType
    quantity: number
    limitPrice?: number
    stopPrice?: number
  }) =>
    client.post<Order>(`/simulations/${simulationId}/orders`, params).then(r => r.data),

  list: (simulationId: string) =>
    client.get<{ orders: Order[] }>(`/simulations/${simulationId}/orders`).then(r => r.data),

  cancel: (simulationId: string, orderId: string) =>
    client.delete(`/simulations/${simulationId}/orders/${orderId}`),

  getBook: (simulationId: string, symbol: string) =>
    client.get<OrderBook>(`/simulations/${simulationId}/orderbook/${symbol}`).then(r => r.data),
}
