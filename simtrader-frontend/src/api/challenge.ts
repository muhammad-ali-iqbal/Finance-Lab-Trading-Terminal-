// src/api/challenge.ts

import { client } from './client'
import type {
  Challenge, ChallengeWithMeta, ChallengeOrder, ChallengePortfolio,
  ChallengeSnapshot, ChallengeDividend, LeaderboardEntry, CreateChallengeInput, EODBar,
} from './index'

export const challengeApi = {
  // ── Student ────────────────────────────────────────────────────────────────

  list: async (): Promise<{ challenges: ChallengeWithMeta[] }> => {
    const { data } = await client.get('/challenges')
    return data
  },

  get: async (id: string): Promise<{ challenge: Challenge; joined: boolean }> => {
    const { data } = await client.get(`/challenges/${id}`)
    return data
  },

  join: async (id: string) => {
    const { data } = await client.post(`/challenges/${id}/join`)
    return data
  },

  getPortfolio: async (id: string): Promise<ChallengePortfolio> => {
    const { data } = await client.get(`/challenges/${id}/portfolio`)
    return data
  },

  getPortfolioHistory: async (id: string): Promise<{ history: ChallengeSnapshot[] }> => {
    const { data } = await client.get(`/challenges/${id}/portfolio/history`)
    return data
  },

  placeOrder: async (id: string, order: {
    symbol: string
    side: 'buy' | 'sell'
    orderType: 'market' | 'limit'
    quantity: number
    limitPrice?: number
  }): Promise<ChallengeOrder> => {
    const { data } = await client.post(`/challenges/${id}/orders`, order)
    return data
  },

  listOrders: async (id: string): Promise<{ orders: ChallengeOrder[] }> => {
    const { data } = await client.get(`/challenges/${id}/orders`)
    return data
  },

  cancelOrder: async (id: string, orderId: string): Promise<void> => {
    await client.post(`/challenges/${id}/orders/${orderId}/cancel`)
  },

  // Dividend/bonus payouts credited to the student by the nightly reconciler
  getDividends: async (id: string): Promise<{ dividends: ChallengeDividend[] }> => {
    const { data } = await client.get(`/challenges/${id}/dividends`)
    return data
  },

  getLeaderboard: async (id: string): Promise<{ leaderboard: LeaderboardEntry[] }> => {
    const { data } = await client.get(`/challenges/${id}/leaderboard`)
    return data
  },

  // ── Admin ──────────────────────────────────────────────────────────────────

  adminList: async (): Promise<{ challenges: ChallengeWithMeta[] }> => {
    const { data } = await client.get('/admin/challenges')
    return data
  },

  adminGet: async (id: string): Promise<Challenge> => {
    const { data } = await client.get(`/admin/challenges/${id}`)
    return data
  },

  adminCreate: async (input: CreateChallengeInput): Promise<Challenge> => {
    const { data } = await client.post('/admin/challenges', input)
    return data
  },

  adminUpdate: async (id: string, input: Partial<CreateChallengeInput>): Promise<Challenge> => {
    const { data } = await client.put(`/admin/challenges/${id}`, input)
    return data
  },

  adminActivate: async (id: string) => {
    const { data } = await client.post(`/admin/challenges/${id}/activate`)
    return data
  },

  adminComplete: async (id: string) => {
    const { data } = await client.post(`/admin/challenges/${id}/complete`)
    return data
  },

  adminEnrollAll: async (id: string): Promise<{ enrolled: number }> => {
    const { data } = await client.post(`/admin/challenges/${id}/enroll-all`)
    return data
  },

  adminReconcile: async (id: string, date?: string): Promise<{ filled: number; date: string }> => {
    const params = date ? `?date=${date}` : ''
    const { data } = await client.post(`/admin/challenges/${id}/reconcile${params}`)
    return data
  },

  adminLeaderboard: async (id: string): Promise<{ leaderboard: LeaderboardEntry[] }> => {
    const { data } = await client.get(`/admin/challenges/${id}/leaderboard`)
    return data
  },

  // A single enrolled student's own order/decision ledger, admin drill-down
  adminParticipantOrders: async (id: string, participantId: string): Promise<{ orders: ChallengeOrder[] }> => {
    const { data } = await client.get(`/admin/challenges/${id}/participants/${participantId}/orders`)
    return data
  },

  // ── EOD chart data ─────────────────────────────────────────────────────────

  getEODSymbols: async (): Promise<{ symbols: string[] }> => {
    const { data } = await client.get('/eod/symbols')
    return data
  },

  getEODHistory: async (symbol: string): Promise<{ bars: EODBar[] }> => {
    const { data } = await client.get(`/eod/${encodeURIComponent(symbol)}`)
    return data
  },
}
