// src/pages/admin/AdminUsersPage.tsx
import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from '@/api'
import {
  Card, Button, Input, Badge, Alert, Spinner, EmptyState
} from '@/components/ui'
import {
  Users, UserPlus, X, Shield, ShieldOff, Mail, Clock
} from 'lucide-react'
import type { User } from '@/types'

// ── Invite modal ──────────────────────────────────────────────────────────────
function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)

  const invite = useMutation({
    mutationFn: () => userApi.inviteStudent({ email, firstName: '', lastName: '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setSuccess(true)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    invite.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 dark:bg-dark-ink/20 p-4">
      <div className="bg-surface dark:bg-dark-surface rounded-xl border border-border dark:border-dark-border shadow-modal w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-dark-border">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">Invite student</h2>
          <button onClick={onClose} className="text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-10 h-10 bg-success-muted dark:bg-dark-success-muted rounded-full flex items-center justify-center mx-auto">
                <Mail className="w-5 h-5 text-success dark:text-dark-success" />
              </div>
              <p className="text-sm font-medium text-ink dark:text-dark-ink">Invite sent!</p>
              <p className="text-xs text-ink-secondary dark:text-dark-ink-secondary">
                {email} will receive a registration link. In dev mode, check the server console for the token.
              </p>
              <div className="pt-2 flex gap-2">
                <Button size="sm" variant="secondary" fullWidth onClick={() => { setEmail(''); setSuccess(false) }}>
                  Invite another
                </Button>
                <Button size="sm" fullWidth onClick={onClose}>Done</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {invite.isError && (
                <Alert
                  variant="error"
                  message={(invite.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send invite'}
                />
              )}
              <Input
                label="Student email address"
                type="email"
                placeholder="student@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
                hint="They'll receive a link to set up their password"
              />
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" fullWidth onClick={onClose}>Cancel</Button>
                <Button type="submit" size="sm" fullWidth loading={invite.isPending}>
                  Send invite
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ user }: { user: User }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })

  const block   = useMutation({ mutationFn: () => userApi.blockUser(user.id),   onSuccess: invalidate })
  const unblock = useMutation({ mutationFn: () => userApi.unblockUser(user.id), onSuccess: invalidate })

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || user.email[0].toUpperCase()
  const displayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.email

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-ink dark:bg-dark-ink flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-semibold text-surface dark:text-dark-surface">{initials}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink dark:text-dark-ink truncate">{displayName}</p>
          {user.status === 'pending' && (
            <span className="flex items-center gap-0.5 text-[10px] text-warning dark:text-dark-warning">
              <Clock className="w-3 h-3" />
              pending
            </span>
          )}
        </div>
        <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary truncate">{user.email}</p>
      </div>

      {/* Status badge */}
      <Badge
        variant={
          user.status === 'active'  ? 'success' :
          user.status === 'blocked' ? 'danger'  : 'neutral'
        }
      >
        {user.status}
      </Badge>

      {/* Actions */}
      {user.role === 'student' && (
        <div className="flex-shrink-0">
          {user.status === 'blocked' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => unblock.mutate()}
              loading={unblock.isPending}
              title="Unblock student"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Unblock
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => block.mutate()}
              loading={block.isPending}
              className="text-danger hover:text-danger"
              title="Block student"
            >
              <Shield className="w-3.5 h-3.5" />
              Block
            </Button>
          )}
        </div>
      )}

      {user.role === 'admin' && (
        <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary flex-shrink-0">Admin</span>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [showInvite, setShowInvite] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'blocked'>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => userApi.listUsers(),
    refetchInterval: 10000,
  })

  const users = data?.users ?? []
  const students = users.filter(u => u.role === 'student')

  const filtered = students.filter(u => {
    const matchesFilter = filter === 'all' || u.status === filter
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      u.email.toLowerCase().includes(q) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  const counts = {
    all:     students.length,
    active:  students.filter(u => u.status === 'active').length,
    pending: students.filter(u => u.status === 'pending').length,
    blocked: students.filter(u => u.status === 'blocked').length,
  }

  return (
    <div className="p-8 max-w-4xl">
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Students</h1>
          <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5">
            {students.length} student{students.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" />
          Invite student
        </Button>
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 bg-surface-secondary dark:bg-dark-surface-secondary rounded-lg border border-border dark:border-dark-border">
          {(['all', 'active', 'pending', 'blocked'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-surface dark:bg-dark-surface text-ink dark:text-dark-ink shadow-sm border border-border dark:border-dark-border'
                  : 'text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink'
              }`}
            >
              {f} {counts[f] > 0 && <span className="ml-1 opacity-60">({counts[f]})</span>}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs"
        />
      </div>

      {/* User table */}
      <Card padding="none">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] px-4 py-2.5 border-b border-border dark:border-dark-border bg-surface-secondary dark:bg-dark-surface-secondary">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">Student</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary mr-16">Status</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-dark-ink-tertiary">Actions</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={search || filter !== 'all' ? 'No matching students' : 'No students yet'}
            description={
              search || filter !== 'all'
                ? 'Try adjusting your filters'
                : 'Invite students using the button above. They\'ll receive an email with a registration link.'
            }
          />
        ) : (
          <div className="divide-y divide-border dark:divide-dark-border">
            {filtered.map(user => (
              <UserRow key={user.id} user={user} />
            ))}
          </div>
        )}
      </Card>

      {/* Stats */}
      {students.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Active',  value: counts.active,  variant: 'success' as const },
            { label: 'Pending', value: counts.pending, variant: 'warning' as const },
            { label: 'Blocked', value: counts.blocked, variant: 'danger'  as const },
          ].map(s => (
            <Card key={s.label} className="flex items-center justify-between" padding="sm">
              <span className="text-xs text-ink-secondary dark:text-dark-ink-secondary">{s.label}</span>
              <Badge variant={s.variant}>{s.value}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
