// src/api/portfolio.ts
import { client } from './client'
import type { Portfolio } from '@/api'

export interface HistoryPoint {
  time: number   // Unix seconds
  value: number
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  totalEquity: number
}

export const portfolioApi = {
  get: async (simulationId: string) => {
    const { data } = await client.get<Portfolio>(`/simulations/${simulationId}/portfolio`)
    return data
  },
  getHistory: async (simulationId: string) => {
    const { data } = await client.get<HistoryPoint[]>(`/simulations/${simulationId}/portfolio/history`)
    return data
  },
  getLeaderboard: async (simulationId: string) => {
    const { data } = await client.get<LeaderboardEntry[]>(`/simulations/${simulationId}/leaderboard`)
    return data
  },
}
