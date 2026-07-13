// src/api/securities.ts
// Ticker -> company name lookup, scraped from PSX by psx_tracker.

import { client } from './client'
import type { Security } from './index'

export const securitiesApi = {
  list: async (): Promise<{ securities: Security[] }> => {
    const { data } = await client.get('/securities')
    return data
  },
}
