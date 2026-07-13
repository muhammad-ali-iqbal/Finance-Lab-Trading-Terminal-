// src/api/dividend.ts

import { client } from './client'
import type { DividendPayout, PSXSymbol } from './index'

export interface DividendsResponse {
  payouts: DividendPayout[]
  total: number
  fetchedAt: string
}

export const dividendApi = {
  // Latest PSX dividend/bonus/right announcements, optionally filtered by
  // ticker symbol (filter is applied by PSX server-side).
  list: async (symbol?: string): Promise<DividendsResponse> => {
    const { data } = await client.get('/dividends', {
      params: symbol ? { symbol } : undefined,
    })
    return data
  },

  // PSX listed-securities directory (ticker + company name), used to power
  // search suggestions. The backend caches it daily.
  symbols: async (): Promise<{ symbols: PSXSymbol[]; total: number }> => {
    const { data } = await client.get('/dividends/symbols')
    return data
  },
}
