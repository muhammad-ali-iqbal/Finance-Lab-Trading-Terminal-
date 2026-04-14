// src/api/order.ts
import { client } from './client'
import type { Order, OrderBook } from '@/api'

export interface CreateOrderInput {
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop'
  quantity: number
  limitPrice?: number
  stopPrice?: number
}

export interface OrdersListResponse {
  orders: Order[]
  total: number
}

export const orderApi = {
  list: async (simulationId: string) => {
    const { data } = await client.get<OrdersListResponse>(`/simulations/${simulationId}/orders`)
    return data
  },

  get: async (simulationId: string, orderId: string) => {
    const { data } = await client.get<Order>(`/simulations/${simulationId}/orders/${orderId}`)
    return data
  },

  submit: async (simulationId: string, input: CreateOrderInput) => {
    const { data } = await client.post<Order>(`/simulations/${simulationId}/orders`, input)
    return data
  },

  cancel: async (simulationId: string, orderId: string) => {
    const { data } = await client.delete<Order>(`/simulations/${simulationId}/orders/${orderId}`)
    return data
  },

  getBook: async (simulationId: string, symbol: string) => {
    const { data } = await client.get<OrderBook>(`/simulations/${simulationId}/orderbook/${symbol}`)
    return data
  },
}
