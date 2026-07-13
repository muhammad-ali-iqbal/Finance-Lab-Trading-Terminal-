// src/hooks/useSymbolDisplay.ts
//
// Reads the logged-in user's ticker/company-name display preference and
// exposes a formatter every symbol-rendering screen can share. Company names
// come from /api/securities — scraped from PSX's own symbols directory by
// psx_tracker, not hand-maintained.

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { securitiesApi } from '@/api'

export function useSymbolDisplay() {
  const mode = useAuthStore(s => s.user?.symbolDisplay ?? 'ticker')

  const { data } = useQuery({
    queryKey: ['securities'],
    queryFn: securitiesApi.list,
    enabled: mode === 'name',
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const names = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of data?.securities ?? []) map[s.symbol] = s.name
    return map
  }, [data])

  const formatSymbol = useCallback((symbol: string) => {
    if (mode !== 'name' || !symbol) return symbol
    return names[symbol.toUpperCase()] ?? symbol
  }, [mode, names])

  return { mode, formatSymbol }
}
