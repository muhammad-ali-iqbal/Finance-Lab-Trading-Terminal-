// src/api/user.ts
import { client } from './client'
import type { User } from '@/api'

export interface UpdateUserInput {
  firstName?: string
  lastName?: string
  role?: 'admin' | 'student'
  status?: 'pending' | 'active' | 'blocked'
}

export interface InviteUserInput {
  email: string
  firstName: string
  lastName: string
}

export interface UsersListResponse {
  users: User[]
  total: number
}

export const userApi = {
  list: async () => {
    const { data } = await client.get<UsersListResponse>('/admin/users')
    return data
  },

  listUsers: async () => {
    const { data } = await client.get<UsersListResponse>('/admin/users')
    return data
  },

  get: async (id: string) => {
    const { data } = await client.get<User>(`/admin/users/${id}`)
    return data
  },

  update: async (id: string, input: UpdateUserInput) => {
    const { data } = await client.put<User>(`/admin/users/${id}`, input)
    return data
  },

  delete: async (id: string) => {
    await client.delete(`/admin/users/${id}`)
  },

  inviteStudent: async (input: InviteUserInput) => {
    const { data } = await client.post<User>('/admin/users/invite', input)
    return data
  },

  blockUser: async (id: string) => {
    const { data } = await client.post<User>(`/admin/users/${id}/block`)
    return data
  },

  unblockUser: async (id: string) => {
    const { data } = await client.post<User>(`/admin/users/${id}/unblock`)
    return data
  },

  updateProfile: async (input: Partial<UpdateUserInput>) => {
    const { data } = await client.put<User>('/me', input)
    return data
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await client.put('/me/password', { currentPassword, newPassword })
    return data
  },
}
