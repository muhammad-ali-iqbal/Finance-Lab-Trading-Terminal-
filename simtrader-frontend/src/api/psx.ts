// src/api/psx.ts

import { client } from './client'

export interface PSXResult {
  ok: boolean
  output: string
  error?: string
}

export const psxApi = {
  fetch: async (): Promise<PSXResult> => {
    const { data } = await client.post('/admin/psx/fetch')
    return data
  },

  backfill: async (from: string, to?: string): Promise<PSXResult> => {
    const { data } = await client.post('/admin/psx/backfill', { from, to: to || undefined })
    return data
  },

  tickers: async (): Promise<PSXResult> => {
    const { data } = await client.post('/admin/psx/tickers')
    return data
  },

  status: async (): Promise<PSXResult> => {
    const { data } = await client.get('/admin/psx/status')
    return data
  },

  sync: async (from?: string): Promise<PSXResult> => {
    const { data } = await client.post('/admin/psx/sync', { from: from || undefined })
    return data
  },
}
