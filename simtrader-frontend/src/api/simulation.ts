// src/api/simulation.ts
import { client } from './client'
import type { Simulation, SimulationProgress } from '@/api'

export interface CreateSimulationInput {
  name: string
  description?: string
  speedMultiplier?: number
  startingCash?: number
  startTime?: string
  endTime?: string
}

export interface UpdateSimulationInput {
  name?: string
  description?: string
  status?: 'draft' | 'active' | 'paused' | 'completed'
  speedMultiplier?: number
  startingCash?: number
  startTime?: string
  endTime?: string
}

export interface SimulationsListResponse {
  simulations: Simulation[]
  total: number
}

export const simulationApi = {
  list: async () => {
    const { data } = await client.get<SimulationsListResponse>('/simulations')
    return data
  },

  getActive: async () => {
    const { data } = await client.get<Simulation>('/simulations/active')
    return data
  },

  get: async (id: string) => {
    const { data } = await client.get<Simulation>(`/simulations/${id}`)
    return data
  },

  create: async (input: CreateSimulationInput) => {
    const { data } = await client.post<Simulation>('/admin/simulations', input)
    return data
  },

  update: async (id: string, input: UpdateSimulationInput) => {
    const { data } = await client.put<Simulation>(`/admin/simulations/${id}`, input)
    return data
  },

  delete: async (id: string) => {
    await client.delete(`/admin/simulations/${id}`)
  },

  start: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/start`)
    return data
  },

  pause: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/pause`)
    return data
  },

  resume: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/resume`)
    return data
  },

  stop: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/stop`)
    return data
  },

  complete: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/complete`)
    return data
  },

  restart: async (id: string) => {
    const { data } = await client.post<Simulation>(`/admin/simulations/${id}/restart`)
    return data
  },

  getProgress: async (id: string) => {
    const { data } = await client.get<SimulationProgress>(`/simulations/${id}/progress`)
    return data
  },

  uploadCSV: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await client.post<Simulation>(`/simulations/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
