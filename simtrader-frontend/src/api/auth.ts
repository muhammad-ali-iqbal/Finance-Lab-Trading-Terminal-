// src/api/auth.ts
import { client } from './client'
import type { AuthResponse, User } from '@/api'

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  inviteToken: string
  firstName: string
  lastName: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface ForgotPasswordInput {
  email: string
}

export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export const authApi = {
  login: async (input: LoginInput) => {
    const { data } = await client.post<AuthResponse>('/auth/login', input)
    return data
  },

  register: async (input: RegisterInput) => {
    const { data } = await client.post<AuthResponse>('/auth/register', input)
    return data
  },

  logout: async () => {
    await client.post('/auth/logout')
  },

  getMe: async () => {
    const { data } = await client.get<User>('/me')
    return data
  },

  changePassword: async (input: ChangePasswordInput) => {
    const { data } = await client.put('/me/password', input)
    return data
  },

  forgotPassword: async (input: ForgotPasswordInput) => {
    const { data } = await client.post('/auth/forgot-password', input)
    return data
  },

  resetPassword: async (input: ResetPasswordInput) => {
    const { data } = await client.post('/auth/reset-password', input)
    return data
  },
}
