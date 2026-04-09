// src/hooks/useSimulationSocket.ts
// Manages the WebSocket connection to the Go simulation clock.
// Reconnects automatically on disconnect (e.g. server restart).
// Returns the latest tick data for each symbol.

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import type { SimulationTick, PriceTick } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

interface UseSimulationSocketOptions {
  simulationId: string | null
  onTick?: (tick: SimulationTick) => void
}

interface SocketState {
  connected: boolean
  connecting: boolean
  lastTick: SimulationTick | null
  priceMap: Record<string, PriceTick>  // symbol → latest tick
  simulationTime: string | null
  error: string | null
}

export function useSimulationSocket({ simulationId, onTick }: UseSimulationSocketOptions) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)

  const [state, setState] = useState<SocketState>({
    connected: false,
    connecting: false,
    lastTick: null,
    priceMap: {},
    simulationTime: null,
    error: null,
  })

  const connect = useCallback(() => {
    if (!simulationId || !accessToken || !isMounted.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setState(s => ({ ...s, connecting: true, error: null }))

    // Token is passed as query param — Go backend validates it on connect.
    const url = `${WS_URL}/api/simulations/${simulationId}/ws?token=${accessToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMounted.current) return
      reconnectAttempts.current = 0
      setState(s => ({ ...s, connected: true, connecting: false, error: null }))
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!isMounted.current) return
      try {
        const tick: SimulationTick = JSON.parse(event.data as string)
        const newPriceMap: Record<string, PriceTick> = {}
        tick.ticks.forEach(t => { newPriceMap[t.symbol] = t })

        setState(s => ({
          ...s,
          lastTick: tick,
          priceMap: { ...s.priceMap, ...newPriceMap },
          simulationTime: tick.simulationTime,
        }))

        onTick?.(tick)
      } catch {
        // Malformed message — ignore, don't crash
      }
    }

    ws.onerror = () => {
      if (!isMounted.current) return
      setState(s => ({ ...s, error: 'Connection error', connecting: false }))
    }

    ws.onclose = (event) => {
      if (!isMounted.current) return
      setState(s => ({ ...s, connected: false, connecting: false }))

      // Normal closure (code 1000) — don't reconnect.
      if (event.code === 1000) return

      // Attempt reconnect with backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++
        const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts.current, 4)
        reconnectTimer.current = setTimeout(connect, delay)
      } else {
        setState(s => ({ ...s, error: 'Unable to connect to simulation. Please refresh.' }))
      }
    }
  }, [simulationId, accessToken, onTick])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    wsRef.current?.close(1000, 'User disconnected')
    wsRef.current = null
  }, [])

  useEffect(() => {
    isMounted.current = true
    connect()
    return () => {
      isMounted.current = false
      disconnect()
    }
  }, [connect, disconnect])

  return { ...state, disconnect, reconnect: connect }
}
