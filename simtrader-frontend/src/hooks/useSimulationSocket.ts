// src/hooks/useSimulationSocket.ts
// Singleton WebSocket pool — only ONE connection per simulation per browser tab,
// shared by all components that call useSimulationSocket().
// Prevents "Insufficient resources" errors from too many concurrent connections.
//
// Multi-user lab scenario: Each student's browser tab gets its own WebSocket.
// The singleton ensures each tab uses exactly 1 connection, not 3+.

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import type { SimulationTick, PriceTick } from '@/api'

// In dev mode, connect directly to Go backend. In production, use VITE_WS_URL.
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

// ── Singleton connection pool (per tab) ──────────────────────────────────────

interface Connection {
  ws: WebSocket | null
  subscribers: number       // how many hook instances are using this connection
  priceMap: Record<string, PriceTick>
  simulationTime: string | null
  connected: boolean
  error: string | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  accessToken: string | null
  lastTick: SimulationTick | null
}

const connections = new Map<string, Connection>() // key: simulationId
const callbacks = new Map<string, Set<() => void>>() // notify subscribers

function getConn(id: string): Connection {
  if (!connections.has(id)) {
    connections.set(id, {
      ws: null, subscribers: 0, priceMap: {},
      simulationTime: null, connected: false, error: null,
      reconnectAttempts: 0, reconnectTimer: null,
      accessToken: null, lastTick: null,
    })
  }
  return connections.get(id)!
}

function notify(id: string) {
  callbacks.get(id)?.forEach(fn => fn())
}

function wsConnect(simId: string, token: string) {
  const conn = getConn(simId)
  conn.accessToken = token

  if (conn.ws?.readyState === WebSocket.OPEN) return
  if (conn.ws?.readyState === WebSocket.CONNECTING) return

  conn.error = null; notify(simId)

  const url = `${WS_URL}/api/simulations/${simId}/ws?token=${token}`
  console.log('[ws-pool] Connecting:', simId)

  const ws = new WebSocket(url)
  conn.ws = ws

  ws.onopen = () => {
    console.log('[ws-pool] Connected:', simId)
    conn.reconnectAttempts = 0
    conn.connected = true
    notify(simId)
  }

  ws.onmessage = (event: MessageEvent) => {
    try {
      const tick: SimulationTick = JSON.parse(event.data as string)
      const newMap: Record<string, PriceTick> = {}
      tick.ticks.forEach(t => { newMap[t.symbol] = t })
      conn.priceMap = { ...conn.priceMap, ...newMap }
      conn.simulationTime = tick.simulationTime
      conn.lastTick = tick
      notify(simId)
    } catch { /* ignore malformed */ }
  }

  ws.onerror = () => {
    console.error('[ws-pool] Error:', simId)
    conn.error = 'Connection error'
    notify(simId)
  }

  ws.onclose = (event) => {
    console.log('[ws-pool] Closed:', simId, event.code)
    conn.connected = false
    conn.ws = null
    notify(simId)

    if (event.code === 1000) return

    if (conn.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      conn.reconnectAttempts++
      const delay = RECONNECT_DELAY_MS * Math.min(conn.reconnectAttempts, 4)
      conn.reconnectTimer = setTimeout(() => wsConnect(simId, conn.accessToken!), delay)
    } else {
      conn.error = 'Unable to connect to simulation. Please refresh.'
      notify(simId)
    }
  }
}

function wsDisconnect(simId: string) {
  const conn = getConn(simId)
  if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer)
  conn.ws?.close(1000, 'User disconnected')
  conn.ws = null
  conn.connected = false
  connections.delete(simId)
  callbacks.delete(simId)
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseSimulationSocketOptions {
  simulationId: string | null
  onTick?: (tick: SimulationTick) => void
}

interface SocketState {
  connected: boolean
  connecting: boolean
  lastTick: SimulationTick | null
  priceMap: Record<string, PriceTick>
  simulationTime: string | null
  error: string | null
}

export function useSimulationSocket({ simulationId, onTick }: UseSimulationSocketOptions) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isMounted = useRef(true)
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  // Track state via mutable connection object + listeners
  const [state, setState] = useState<SocketState>({
    connected: false, connecting: false, lastTick: null,
    priceMap: {}, simulationTime: null, error: null,
  })

  useEffect(() => {
    if (!simulationId) {
      setState(s => ({ ...s, connected: false, connecting: false }))
      return
    }

    isMounted.current = true
    const conn = getConn(simulationId)

    // Register subscriber
    conn.subscribers++
    if (!callbacks.has(simulationId)) callbacks.set(simulationId, new Set())

    const onChange = () => {
      if (!isMounted.current) return
      const c = getConn(simulationId)
      setState({
        connected: c.connected,
        connecting: !!c.ws && !c.connected,
        lastTick: c.lastTick,
        priceMap: { ...c.priceMap },
        simulationTime: c.simulationTime,
        error: c.error,
      })
    }

    callbacks.get(simulationId)!.add(onChange)

    // Connect if needed
    if (!conn.connected && !conn.ws && accessToken) {
      wsConnect(simulationId, accessToken)
    } else {
      onChange() // sync existing state
    }

    return () => {
      isMounted.current = false
      callbacks.get(simulationId)?.delete(onChange)
      const c = getConn(simulationId)
      c.subscribers--
      if (c.subscribers <= 0) wsDisconnect(simulationId)
    }
  }, [simulationId, accessToken])

  // Call onTick when priceMap changes
  useEffect(() => {
    if (!simulationId || !state.lastTick || !onTickRef.current) return
    onTickRef.current(state.lastTick)
  }, [state.priceMap, simulationId])

  const reconnect = useCallback(() => {
    if (simulationId && accessToken) {
      wsDisconnect(simulationId)
      wsConnect(simulationId, accessToken)
    }
  }, [simulationId, accessToken])

  return { ...state, reconnect }
}
