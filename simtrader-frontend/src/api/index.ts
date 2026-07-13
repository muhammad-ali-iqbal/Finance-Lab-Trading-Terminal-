// src/api/index.ts
// Re-export types and API clients

// Types (mirror Go backend models)
export type Role = 'admin' | 'student'
export type UserStatus = 'pending' | 'active' | 'blocked'
export type SymbolDisplay = 'ticker' | 'name'
export type OrderSide = 'buy' | 'sell'
export type OrderType = 'market' | 'limit' | 'stop'
export type OrderStatus = 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected'
export type SimulationStatus = 'draft' | 'active' | 'paused' | 'completed'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  status: UserStatus
  avatarUrl: string
  symbolDisplay: SymbolDisplay
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface Simulation {
  id: string
  name: string
  description: string
  status: SimulationStatus
  startTime: string | null
  endTime: string | null
  speedMultiplier: number
  startingCash: number
  rowsLoaded: number | null
  currentSimTime: string | null
  createdAt: string
}

export interface SimulationProgress {
  status: SimulationStatus
  hasData: boolean
  progressPct: number
  currentSimTime: string | null
  firstSimTime: string | null
  lastSimTime: string | null
  elapsedMinutes: number
  totalMinutes: number
  remainingMinutes: number
  speedMultiplier: number
}

export interface PriceTick {
  symbol: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// What the WebSocket broadcasts each tick
export interface SimulationTick {
  simulationTime: string
  ticks: PriceTick[]
}

export interface Position {
  symbol: string
  quantity: number
  averageCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
}

export interface Portfolio {
  userId: string
  simulationId: string
  cashBalance: number
  totalMarketValue: number
  totalEquity: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  positions: Position[]
  updatedAt: string
}

export interface Order {
  id: string
  userId: string
  simulationId: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  limitPrice: number | null
  stopPrice: number | null
  filledQuantity: number
  averageFillPrice: number | null
  status: OrderStatus
  createdAt: string
  filledAt: string | null
}

export interface OrderBookLevel {
  price: number
  quantity: number
  orderCount: number
}

export interface OrderBook {
  symbol: string
  bids: OrderBookLevel[]   // buy orders, sorted price desc
  asks: OrderBookLevel[]   // sell orders, sorted price asc
  lastPrice: number
  spread: number
}

// ── Challenge types ────────────────────────────────────────────────────────

export type ChallengeStatus = 'draft' | 'active' | 'completed'
export type ChallengeSide = 'buy' | 'sell'
export type ChallengeOrderType = 'market' | 'limit'
export type ChallengeOrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected'

export interface Challenge {
  id: string
  name: string
  description: string
  startDate: string
  endDate: string
  initialCapital: number
  status: ChallengeStatus
  createdBy: string
  createdAt: string
}

export interface ChallengeWithMeta extends Challenge {
  participantCount: number
  joined?: boolean        // present on student list endpoint
}

export interface ChallengeOrder {
  id: string
  challengeId: string
  participantId: string
  symbol: string
  side: ChallengeSide
  orderType: ChallengeOrderType
  quantity: number
  limitPrice: number | null
  status: ChallengeOrderStatus
  fillPrice: number | null
  fillDate: string | null
  rejectReason?: string
  createdAt: string
}

export interface ChallengePosition {
  id: string
  challengeId: string
  participantId: string
  symbol: string
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
}

export interface ChallengePortfolio {
  cashBalance: number
  marketValue: number
  totalValue: number
  initialCapital: number
  returnPct: number
  positions: ChallengePosition[]
}

export interface ChallengeSnapshot {
  id: string
  challengeId: string
  participantId: string
  date: string
  portfolioValue: number
  cashBalance: number
}

export interface LeaderboardEntry {
  rank: number
  participantId: string
  displayName: string
  email?: string          // admin view only
  cashBalance: number
  portfolioValue: number
  returnPct: number
}

export interface Security {
  symbol: string
  name: string
  sector?: string
}

export interface EODBar {
  time: string   // 'YYYY-MM-DD'
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface CreateChallengeInput {
  name: string
  description: string
  startDate: string
  endDate: string
  initialCapital: number
}

// ── Announcement types ─────────────────────────────────────────────────────

export type AnnouncementStatus = 'pending' | 'sending' | 'completed' | 'failed'

export interface Announcement {
  id: string
  subject: string
  heading: string
  body: string
  createdBy: string
  status: AnnouncementStatus
  recipientCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  completedAt: string | null
}

export interface CreateAnnouncementInput {
  subject: string
  heading: string
  body: string
  excludeUserIds?: string[]
}

// ── Dividend announcement types (proxied from the PSX data portal) ─────────

export interface DividendPayout {
  symbol: string
  company: string
  sector: string
  announcement: string // e.g. "60%(i) (D)", "10% (B)"
  announcedAt: string  // as published by PSX, e.g. "April 17, 2026 5:10 PM"
  bookClosure: string  // e.g. "29/04/2026 - 30/04/2026"
}

// One entry of the PSX listed-securities directory (search suggestions)
export interface PSXSymbol {
  symbol: string
  name: string
  sectorName: string
  isDebt: boolean
}

// API error shape from the Go backend
export interface ApiError {
  error: string
  warning?: string
}

// Paginated list response
export interface ListResponse<T> {
  items: T[]
  total: number
}

// API clients
export { authApi } from './auth'
export type { LoginInput, RegisterInput, ChangePasswordInput, ForgotPasswordInput, ResetPasswordInput } from './auth'
export { simulationApi } from './simulation'
export type { CreateSimulationInput, UpdateSimulationInput, SimulationsListResponse } from './simulation'
export { orderApi } from './order'
export type { CreateOrderInput, OrdersListResponse } from './order'
export { portfolioApi } from './portfolio'
export { userApi } from './user'
export type { UpdateUserInput, InviteUserInput, UsersListResponse } from './user'
export { challengeApi } from './challenge'
export { announcementApi } from './announcement'
export { dividendApi } from './dividend'
export type { DividendsResponse } from './dividend'
export { securitiesApi } from './securities'
export { psxApi } from './psx'
export type { PSXResult } from './psx'
export { client } from './client'
