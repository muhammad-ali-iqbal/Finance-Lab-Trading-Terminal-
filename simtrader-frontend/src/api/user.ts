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

export type BulkInviteStatus =
  | 'invited'
  | 'email_failed'
  | 'already_exists'
  | 'invalid'

export interface BulkInviteResult {
  email: string
  status: BulkInviteStatus
  detail?: string
}

export interface BulkInviteResponse {
  results: BulkInviteResult[]
  invited: number
  failed: number
  duplicates: number
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

  // Bulk invite: one pending account + invite email per address, with an
  // optional challenge access grant applied to every invitee.
  bulkInvite: async (input: { emails: string[]; challengeId?: string }) => {
    const { data } = await client.post<BulkInviteResponse>('/admin/users/invite/bulk', input)
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

  updateDisplayPreference: async (symbolDisplay: 'ticker' | 'name') => {
    const { data } = await client.put<User>('/me/display-preference', { symbolDisplay })
    return data
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await client.put('/me/password', { currentPassword, newPassword })
    return data
  },

  uploadAvatar: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await client.post<User>('/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  setPresetAvatar: async (preset: string) => {
    const { data } = await client.put<User>('/me/avatar/preset', { preset })
    return data
  },

  removeAvatar: async () => {
    const { data } = await client.delete<User>('/me/avatar')
    return data
  },
}
