// src/api/portfolio.ts
import { client } from './client'
import type { Portfolio } from '@/api'

export const portfolioApi = {
  get: async (simulationId: string) => {
    const { data } = await client.get<Portfolio>(`/simulations/${simulationId}/portfolio`)
    return data
  },
}
