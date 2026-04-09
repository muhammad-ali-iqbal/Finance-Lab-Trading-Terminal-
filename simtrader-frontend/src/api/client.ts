// src/api/client.ts
// Axios instance wired to the Go backend.
// The request interceptor injects the access token on every call.
// The response interceptor catches 401s, refreshes the token once,
// and retries the original request — the caller never sees the 401.

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ── Request interceptor — attach access token ────────────────────────────────
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor — handle token expiry ──────────────────────────────
let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

const processPending = (error: unknown, token?: string) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  pendingQueue = []
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Only handle 401 Unauthorized, and only once per request.
    // Skip auth endpoints themselves to avoid infinite loops.
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.startsWith('/auth/')
    ) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Another request is already refreshing — queue this one.
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken,
      })

      const newAccessToken: string = data.accessToken
      useAuthStore.getState().setTokens(newAccessToken, data.refreshToken)

      processPending(null, newAccessToken)
      original.headers.Authorization = `Bearer ${newAccessToken}`
      return client(original)
    } catch (refreshError) {
      processPending(refreshError)
      useAuthStore.getState().logout()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)
