// src/pages/admin/AdminChallengePage.tsx
// Admin view: create & manage challenges, view leaderboards, trigger reconciliation.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { challengeApi } from '@/api'
import type { ChallengeWithMeta, LeaderboardEntry } from '@/api'
import { Spinner, Badge, Button } from '@/components/ui'
import { DecisionTimeline } from '@/components/challenge/DecisionTimeline'
import {
  Trophy, Plus, X, Users, Calendar, DollarSign,
  PlayCircle, CheckCircle, RotateCcw, ChevronDown, ChevronRight, Download,
} from 'lucide-react'
import { downloadCSV } from '@/utils/csv'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusBadge(status: string) {
  if (status === 'active')    return <Badge variant="success" size="sm">Active</Badge>
  if (status === 'completed') return <Badge variant="neutral" size="sm">Completed</Badge>
  return <Badge variant="warning" size="sm">Draft</Badge>
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    initialCapital: '100000',
  })
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: () => challengeApi.adminCreate({
      name: form.name,
      description: form.description,
      startDate: form.startDate,
      endDate: form.endDate,
      initialCapital: parseFloat(form.initialCapital) || 100000,
    }),
    onSuccess: () => { onCreated(); onClose() },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to create challenge'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name || !form.startDate || !form.endDate) {
      setError('Name, start date and end date are required')
      return
    }
    if (form.endDate <= form.startDate) {
      setError('End date must be after start date')
      return
    }
    mut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 dark:bg-dark-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-ink dark:text-dark-ink">New Challenge</h2>
          <button onClick={onClose} className="p-1 text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Spring 2026 Trading Challenge"
              className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
            />
          </div>
          <div>
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description for students…"
              rows={2}
              className="w-full px-3 py-2 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink focus:outline-none focus:border-ink dark:focus:border-dark-ink"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide block mb-1">Starting Capital (PKR) *</label>
            <input
              type="number"
              min="1000"
              step="1000"
              value={form.initialCapital}
              onChange={e => setForm(f => ({ ...f, initialCapital: e.target.value }))}
              className="w-full h-9 px-3 rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-sm text-ink dark:text-dark-ink font-mono focus:outline-none focus:border-ink dark:focus:border-dark-ink"
            />
          </div>

          {error && <p className="text-xs text-danger dark:text-dark-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Creating…' : 'Create Challenge'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Participant decisions modal ───────────────────────────────────────────────
// Admin drill-down into one enrolled student's own timestamped order/decision
// ledger — the name/email are passed in from the leaderboard row that was
// clicked, so no extra identity lookup is needed here.

function ParticipantDecisionsModal({
  challengeId, participantId, displayName, email, onClose,
}: {
  challengeId: string
  participantId: string
  displayName: string
  email?: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-participant-orders', challengeId, participantId],
    queryFn: () => challengeApi.adminParticipantOrders(challengeId, participantId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 dark:bg-dark-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-dark-border flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink dark:text-dark-ink">{displayName} — Decisions</h2>
            {email && <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary">{email}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto">
          <DecisionTimeline
            orders={data?.orders ?? []}
            isLoading={isLoading}
            emptyTitle="No decisions yet"
            emptyDescription="This student hasn't placed any orders in this challenge yet."
          />
        </div>
      </div>
    </div>
  )
}

// ── Expandable challenge row ──────────────────────────────────────────────────

function ChallengeRow({ ch }: { ch: ChallengeWithMeta }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [reconcileDate, setReconcileDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null)

  const activateMut = useMutation({
    mutationFn: () => challengeApi.adminActivate(ch.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-challenges'] }),
  })
  const completeMut = useMutation({
    mutationFn: () => challengeApi.adminComplete(ch.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-challenges'] }),
  })
  const enrollMut = useMutation({
    mutationFn: () => challengeApi.adminEnrollAll(ch.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-challenges'] })
      alert(`Enrolled ${data.enrolled} new student(s).`)
    },
  })
  const reconcileMut = useMutation({
    mutationFn: () => challengeApi.adminReconcile(ch.id, reconcileDate),
    onSuccess: (data) => alert(`Reconciliation complete — ${data.filled} orders filled for ${data.date}.`),
  })

  const { data: leaderboard, refetch: fetchLeaderboard, isFetching } = useQuery({
    queryKey: ['admin-leaderboard', ch.id],
    queryFn: () => challengeApi.adminLeaderboard(ch.id),
    enabled: false,
  })

  const handleExpand = () => {
    setExpanded(prev => !prev)
    if (!expanded) fetchLeaderboard()
  }

  return (
    <div className="border border-border dark:border-dark-border rounded-lg overflow-hidden mb-3">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface dark:bg-dark-surface">
        <button onClick={handleExpand} className="text-ink-tertiary dark:text-dark-ink-tertiary hover:text-ink dark:hover:text-dark-ink">
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-ink dark:text-dark-ink">{ch.name}</span>
            {statusBadge(ch.status)}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(ch.startDate)} – {fmtDate(ch.endDate)}</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ch.participantCount} participant{ch.participantCount !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />PKR {ch.initialCapital.toLocaleString()}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {ch.status === 'draft' && (
            <Button size="sm" variant="primary" onClick={() => activateMut.mutate()} disabled={activateMut.isPending}>
              <PlayCircle className="w-3.5 h-3.5 mr-1" />
              Activate
            </Button>
          )}
          {ch.status === 'active' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => enrollMut.mutate()} disabled={enrollMut.isPending}>
                <Users className="w-3.5 h-3.5 mr-1" />
                Enroll All
              </Button>
              <input
                type="date"
                value={reconcileDate}
                onChange={e => setReconcileDate(e.target.value)}
                className="h-7 px-2 text-xs rounded border border-border dark:border-dark-border bg-white dark:bg-dark-surface-secondary text-ink dark:text-dark-ink focus:outline-none"
              />
              <Button size="sm" variant="ghost" onClick={() => reconcileMut.mutate()} disabled={reconcileMut.isPending}>
                <RotateCcw className={clsx('w-3.5 h-3.5 mr-1', reconcileMut.isPending && 'animate-spin')} />
                Reconcile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Complete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Expanded leaderboard */}
      {expanded && (
        <div className="border-t border-border dark:border-dark-border">
          {isFetching ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !leaderboard?.leaderboard?.length ? (
            <div className="flex items-center justify-center py-8 text-sm text-ink-tertiary dark:text-dark-ink-tertiary">
              No participants yet. Use "Enroll All" to add students.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex justify-end px-4 py-2 border-b border-border dark:border-dark-border">
                <button
                  onClick={() => {
                    const rows: string[][] = [['Rank', 'Name', 'Email', 'Portfolio Value (PKR)', 'Return %', 'Cash Balance (PKR)']]
                    leaderboard!.leaderboard.forEach((e: LeaderboardEntry) => {
                      rows.push([String(e.rank), e.displayName, e.email ?? '', fmt(e.portfolioValue), fmt(e.returnPct), fmt(e.cashBalance)])
                    })
                    downloadCSV(rows, `admin-leaderboard-${ch.id}.csv`)
                  }}
                  className="flex items-center gap-1.5 text-xs text-ink-secondary dark:text-dark-ink-secondary hover:text-ink dark:hover:text-dark-ink transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-dark-border text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide bg-surface-secondary dark:bg-dark-surface-secondary">
                    <th className="text-left px-4 py-2">#</th>
                    <th className="text-left px-4 py-2">Student</th>
                    <th className="text-left px-4 py-2">Email</th>
                    <th className="text-right px-4 py-2">Portfolio Value</th>
                    <th className="text-right px-4 py-2">Return</th>
                    <th className="text-right px-4 py-2">Cash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-dark-border">
                  {leaderboard.leaderboard.map((e: LeaderboardEntry) => {
                    const up = e.returnPct >= 0
                    return (
                      <tr
                        key={e.participantId}
                        onClick={() => setSelectedEntry(e)}
                        className="cursor-pointer hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary"
                        title="View this student's decisions"
                      >
                        <td className="px-4 py-2.5 text-sm font-bold text-ink-tertiary dark:text-dark-ink-tertiary">
                          {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-ink dark:text-dark-ink">{e.displayName}</td>
                        <td className="px-4 py-2.5 text-ink-tertiary dark:text-dark-ink-tertiary text-xs">{e.email}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-ink dark:text-dark-ink">PKR {fmt(e.portfolioValue, 0)}</td>
                        <td className={clsx('px-4 py-2.5 text-right font-mono font-semibold', up ? 'text-success dark:text-dark-success' : 'text-danger dark:text-dark-danger')}>
                          {up ? '+' : ''}{fmt(e.returnPct)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-ink-secondary dark:text-dark-ink-secondary">PKR {fmt(e.cashBalance, 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedEntry && (
        <ParticipantDecisionsModal
          challengeId={ch.id}
          participantId={selectedEntry.participantId}
          displayName={selectedEntry.displayName}
          email={selectedEntry.email}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminChallengePage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-challenges'],
    queryFn: challengeApi.adminList,
    staleTime: 30_000,
  })

  const challenges = data?.challenges ?? []

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Trophy className="w-5 h-5 text-ink dark:text-dark-ink" />
            <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">Challenges</h1>
          </div>
          <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">
            Manage semester-long trading challenges. Orders fill nightly using live PSX data.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Challenge
        </Button>
      </div>

      {/* Info banner */}
      <div className="mb-5 p-3 rounded-lg bg-surface-secondary dark:bg-dark-surface-secondary border border-border dark:border-dark-border text-xs text-ink-secondary dark:text-dark-ink-secondary space-y-1">
        <p><strong>Workflow:</strong> Create → Activate → Enroll All students → Challenge runs for the semester → Complete.</p>
        <p>Orders placed by students are filled automatically each night at ~16:35 PKT once psx_tracker pushes daily prices.</p>
        <p>Use <strong>Reconcile</strong> to manually trigger a fill for today's date (useful after backfilling prices).</p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Trophy className="w-10 h-10 text-ink-disabled dark:text-dark-ink-disabled" />
          <p className="text-sm font-medium text-ink-secondary dark:text-dark-ink-secondary">No challenges yet</p>
          <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary max-w-xs">
            Create a challenge, set dates and starting capital, then activate it for students.
          </p>
        </div>
      ) : (
        <div>
          {challenges.map(ch => (
            <ChallengeRow key={ch.id} ch={ch} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['admin-challenges'] })}
        />
      )}
    </div>
  )
}
