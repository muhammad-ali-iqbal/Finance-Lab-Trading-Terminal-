// src/pages/admin/AdminAnnouncementsPage.tsx
// Admin view: compose and broadcast branded email announcements to all active students.

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { announcementApi, userApi } from '@/api'
import type { Announcement } from '@/api'
import { Spinner, Badge, Button } from '@/components/ui'
import { Megaphone, Plus, X, Users, Clock } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function statusBadge(status: Announcement['status']) {
  if (status === 'completed') return <Badge variant="success" size="sm">Completed</Badge>
  if (status === 'sending')   return <Badge variant="warning" size="sm">Sending</Badge>
  if (status === 'failed')    return <Badge variant="danger" size="sm">Failed</Badge>
  return <Badge variant="warning" size="sm">Pending</Badge>
}

// ── Compose modal ─────────────────────────────────────────────────────────────

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [form, setForm] = useState({ subject: '', heading: '', body: '' })
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  const { data: usersData, isLoading: loadingStudents } = useQuery({
    queryKey: ['admin-users-for-announcement'],
    queryFn: userApi.list,
  })
  const activeStudents = useMemo(
    () => (usersData?.users ?? []).filter(u => u.role === 'student' && u.status === 'active'),
    [usersData],
  )

  const toggleExclude = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const recipientCount = activeStudents.length - excludedIds.size

  const mut = useMutation({
    mutationFn: () => announcementApi.create({ ...form, excludeUserIds: Array.from(excludedIds) }),
    onSuccess: () => { onSent(); onClose() },
    onError: (e: any) => {
      setConfirming(false)
      setError(e?.response?.data?.error ?? 'Failed to send announcement')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.subject.trim() || !form.heading.trim() || !form.body.trim()) {
      setError('Subject, heading and body are all required')
      return
    }
    if (recipientCount <= 0) {
      setError('At least one student must be selected to receive this announcement')
      return
    }
    setConfirming(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 dark:bg-dark-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-ink dark:text-dark-ink">New Announcement</h2>
          <button onClick={onClose} className="p-1 text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!confirming ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Subject *</label>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Email subject line"
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Heading *</label>
              <input
                value={form.heading}
                onChange={e => setForm(f => ({ ...f, heading: e.target.value }))}
                placeholder="Headline shown in the email"
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Body *</label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Message to students. Leave a blank line between paragraphs."
                rows={8}
                className="w-full px-3 py-2 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide">Recipients</label>
                <span className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">{recipientCount} of {activeStudents.length} selected</span>
              </div>
              {loadingStudents ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : activeStudents.length === 0 ? (
                <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary py-2">No active students found.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded border border-border dark:border-dark-border divide-y divide-border dark:divide-dark-border">
                  {activeStudents.map(stu => (
                    <label key={stu.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink dark:text-dark-ink cursor-pointer hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary">
                      <input
                        type="checkbox"
                        checked={!excludedIds.has(stu.id)}
                        onChange={() => toggleExclude(stu.id)}
                        className="accent-ink dark:accent-dark-ink"
                      />
                      <span className="truncate">{stu.firstName} {stu.lastName}</span>
                      <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary truncate">{stu.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mt-1">Uncheck a student to exclude them from this send.</p>
            </div>

            {error && <p className="text-xs text-danger dark:text-dark-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} type="button">Cancel</Button>
              <Button variant="primary" size="sm" type="submit">Continue</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink dark:text-dark-ink">
              This will email <strong>{recipientCount} student{recipientCount !== 1 ? 's' : ''}</strong> using the subject "<strong>{form.subject}</strong>". This cannot be undone.
            </p>
            {error && <p className="text-xs text-danger dark:text-dark-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={mut.isPending}>Back</Button>
              <Button variant="primary" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? 'Sending…' : 'Send to All Students'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminAnnouncementsPage() {
  const qc = useQueryClient()
  const [showCompose, setShowCompose] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: announcementApi.list,
    refetchInterval: q => (q.state.data?.announcements?.some(a => a.status === 'sending') ? 5_000 : false),
  })

  const announcements = data?.announcements ?? []

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Megaphone className="w-5 h-5 text-ink dark:text-dark-ink" />
            <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">Announcements</h1>
          </div>
          <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">
            Broadcast an email to all active students using the branded SimTrader template.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCompose(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Announcement
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Megaphone className="w-10 h-10 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm font-medium text-ink-secondary dark:text-dark-ink-secondary">No announcements yet</p>
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary max-w-xs">
            Compose your first announcement to broadcast it to all active students.
          </p>
        </div>
      ) : (
        <div className="border border-border dark:border-dark-border rounded-lg divide-y divide-border dark:divide-dark-border overflow-hidden">
          {announcements.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 bg-surface dark:bg-dark-surface">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink dark:text-dark-ink truncate">{a.subject}</span>
                  {statusBadge(a.status)}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDateTime(a.createdAt)}</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {a.status === 'pending' ? 'Resolving recipients…' : `${a.sentCount}/${a.recipientCount} sent`}
                    {a.failedCount > 0 && ` · ${a.failedCount} failed`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          onSent={() => qc.invalidateQueries({ queryKey: ['admin-announcements'] })}
        />
      )}
    </div>
  )
}
