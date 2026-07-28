// src/api/announcement.ts

import { client } from './client'
import type { Announcement, CreateAnnouncementInput, PreviewAnnouncementInput, PreviewAnnouncementResult } from './index'

export const announcementApi = {
  list: async (): Promise<{ announcements: Announcement[]; total: number }> => {
    const { data } = await client.get('/admin/announcements')
    return data
  },

  create: async (input: CreateAnnouncementInput): Promise<Announcement> => {
    const { data } = await client.post('/admin/announcements', input)
    return data
  },

  preview: async (input: PreviewAnnouncementInput): Promise<PreviewAnnouncementResult> => {
    const { data } = await client.post('/admin/announcements/preview', input)
    return data
  },
}
