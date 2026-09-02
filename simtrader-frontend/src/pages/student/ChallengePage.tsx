// src/pages/student/ChallengePage.tsx
// Lists all active and completed challenges.
// Students can join an active challenge from here.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { challengeApi } from '@/api'
import type { ChallengeWithMeta } from '@/api'
import { Spinner, Badge, Button } from '@/components/ui'
import { Trophy, Calendar, Users, TrendingUp, ChevronRight, Lock } from 'lucide-react'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtCurrency(n: number) {
  return 'PKR ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function statusBadge(status: string) {
  if (status === 'active') return <Badge variant="success" size="sm">Active</Badge>
  if (status === 'completed') return <Badge variant="neutral" size="sm">Completed</Badge>
  return <Badge variant="neutral" size="sm">Draft</Badge>
}

function ChallengeCard({
  challenge, onJoin, joining,
}: {
  challenge: ChallengeWithMeta
  onJoin: (id: string) => void
  joining: boolean
}) {
  const navigate = useNavigate()
  // Challenges are locked by default — the admin grants access per challenge,
  // so a student sees an unopenable card until then.
  const locked = challenge.hasAccess === false
  const openable = !locked && challenge.joined

  return (
    <div
      className={
        'group relative bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-5 transition-all' +
        (locked
          ? ' opacity-60'
          : ' cursor-pointer hover:border-ink/30 dark:hover:border-dark-ink/30')
      }
      onClick={() => openable && navigate(`/dashboard/challenges/${challenge.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ' +
            (locked
              ? 'bg-surface-secondary dark:bg-dark-surface-secondary border border-border dark:border-dark-border'
              : 'bg-ink dark:bg-dark-ink')
          }>
            {locked
              ? <Lock className="w-4 h-4 text-ink-tertiary dark:text-dark-ink-tertiary" />
              : <Trophy className="w-4 h-4 text-surface dark:text-dark-surface" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-ink dark:text-dark-ink truncate">{challenge.name}</h3>
            {locked ? <Badge variant="neutral" size="sm">Locked</Badge> : statusBadge(challenge.status)}
          </div>
        </div>
        {openable && (
          <ChevronRight className="w-4 h-4 text-ink-tertiary dark:text-dark-ink-tertiary flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
        )}
      </div>

      {/* Description */}
      {challenge.description && (
        <p className="text-xs text-ink-secondary dark:text-dark-ink-secondary mb-3 line-clamp-2">
          {challenge.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mb-4">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {fmtDate(challenge.startDate)} — {fmtDate(challenge.endDate)}
        </span>
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {challenge.participantCount} participant{challenge.participantCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {fmtCurrency(challenge.initialCapital)} starting capital
        </span>
      </div>

      {/* Action */}
      <div className="flex items-center justify-end gap-2">
        {locked ? (
          <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary italic">
            Access required — contact your instructor
          </span>
        ) : challenge.joined ? (
          <Button
            size="sm"
            variant="primary"
            onClick={e => { e.stopPropagation(); navigate(`/dashboard/challenges/${challenge.id}`) }}
          >
            View Portfolio
          </Button>
        ) : challenge.status === 'active' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={joining}
            onClick={e => { e.stopPropagation(); onJoin(challenge.id) }}
          >
            {joining ? 'Joining…' : 'Join Challenge'}
          </Button>
        ) : (
          <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary italic">
            {challenge.status === 'completed' ? 'Challenge ended' : 'Not yet open'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ChallengePage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: challengeApi.list,
    staleTime: 30_000,
  })

  const joinMutation = useMutation({
    mutationFn: (id: string) => challengeApi.join(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges'] }),
  })

  const challenges = data?.challenges ?? []

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Trophy className="w-5 h-5 text-ink dark:text-dark-ink" />
          <h1 className="text-xl font-semibold text-ink dark:text-dark-ink">Challenges</h1>
        </div>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary">
          Semester-long paper-trading competitions using live PSX market data.
        </p>
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
            Your instructor will create a challenge and open it for enrollment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {challenges.map(ch => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              onJoin={joinMutation.mutate}
              joining={joinMutation.isPending && joinMutation.variables === ch.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
