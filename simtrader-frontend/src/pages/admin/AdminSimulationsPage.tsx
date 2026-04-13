// src/pages/admin/AdminSimulationsPage.tsx
import { useState, useRef, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { simulationApi } from '@/api'
import { client } from '@/api/client'
import {
  Card, Button, Input, Badge, Alert, Spinner, EmptyState
} from '@/components/ui'
import {
  PlayCircle, PauseCircle, CheckCircle2, Upload,
  Plus, X, Activity, ChevronDown, ChevronUp
} from 'lucide-react'
import clsx from 'clsx'
import type { Simulation } from '@/types'

// ── API helpers not in api/index.ts yet ─────────────────────────────────────
const adminSimApi = {
  create: (data: { name: string; description: string; speedMultiplier: number; startingCash: number }) =>
    client.post<Simulation>('/admin/simulations', data).then(r => r.data),

  uploadCSV: (simId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post<{ message: string; rowsLoaded: number }>(
      `/admin/simulations/${simId}/upload`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data)
  },

  start:    (simId: string) => client.post(`/admin/simulations/${simId}/start`).then(r => r.data),
  pause:    (simId: string) => client.post(`/admin/simulations/${simId}/pause`).then(r => r.data),
  resume:   (simId: string) => client.post(`/admin/simulations/${simId}/resume`).then(r => r.data),
  complete: (simId: string) => client.post(`/admin/simulations/${simId}/complete`).then(r => r.data),
}

// ── Status badge helper ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
    active: 'success', paused: 'warning', completed: 'neutral', draft: 'neutral',
  }
  return <Badge variant={map[status] ?? 'neutral'}>{status}</Badge>
}

// ── Simulation row ────────────────────────────────────────────────────────────
function SimulationRow({ sim }: { sim: Simulation }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'simulations'] })

  const start    = useMutation({ mutationFn: () => adminSimApi.start(sim.id),    onSuccess: invalidate })
  const pause    = useMutation({ mutationFn: () => adminSimApi.pause(sim.id),    onSuccess: invalidate })
  const resume   = useMutation({ mutationFn: () => adminSimApi.resume(sim.id),   onSuccess: invalidate })
  const complete = useMutation({ mutationFn: () => adminSimApi.complete(sim.id), onSuccess: invalidate })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const result = await adminSimApi.uploadCSV(sim.id, file)
      setUploadMsg({ type: 'success', text: `✓ Loaded ${result.rowsLoaded.toLocaleString()} rows` })
      invalidate()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setUploadMsg({ type: 'error', text: msg })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-secondary transition-colors">
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-0.5 text-ink-tertiary hover:text-ink"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{sim.name}</p>
          {sim.description && (
            <p className="text-xs text-ink-tertiary truncate">{sim.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-ink-tertiary hidden sm:block">
            {sim.speedMultiplier}× · PKR {sim.startingCash?.toLocaleString()}
          </span>
          <StatusBadge status={sim.status} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {sim.status === 'draft' && (
            <Button size="sm" variant="primary" onClick={() => start.mutate()} loading={start.isPending}>
              <PlayCircle className="w-3.5 h-3.5" />
              Start
            </Button>
          )}
          {sim.status === 'active' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => pause.mutate()} loading={pause.isPending}>
                <PauseCircle className="w-3.5 h-3.5" />
                Pause
              </Button>
              <Button size="sm" variant="ghost" onClick={() => complete.mutate()} loading={complete.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                End
              </Button>
            </>
          )}
          {sim.status === 'paused' && (
            <>
              <Button size="sm" variant="primary" onClick={() => resume.mutate()} loading={resume.isPending}>
                <PlayCircle className="w-3.5 h-3.5" />
                Resume
              </Button>
              <Button size="sm" variant="ghost" onClick={() => complete.mutate()} loading={complete.isPending}>
                End
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-surface-secondary px-4 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Status',        value: sim.status },
              { label: 'Speed',         value: `${sim.speedMultiplier}× replay` },
              { label: 'Starting cash', value: `PKR ${sim.startingCash?.toLocaleString()}` },
              { label: 'Created',       value: new Date(sim.createdAt).toLocaleDateString() },
            ].map(item => (
              <div key={item.label} className="bg-surface rounded-md border border-border px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">{item.label}</p>
                <p className="text-sm font-medium text-ink mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Current sim time */}
          {sim.currentSimTime && (
            <div className="text-xs text-ink-secondary">
              <span className="font-medium">Current simulated time:</span>{' '}
              {new Date(sim.currentSimTime).toLocaleString()}
            </div>
          )}

          {/* CSV Upload — only for draft simulations */}
          {sim.status === 'draft' && (
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-2">Upload price data (CSV)</p>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id={`upload-${sim.id}`}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading…' : 'Choose CSV'}
                </Button>
                <span className="text-xs text-ink-tertiary">
                  Run <code className="bg-surface-tertiary px-1 py-0.5 rounded">bloomberg_to_simtrader.py</code> first to prepare your file
                </span>
              </div>
              {uploadMsg && (
                <Alert
                  variant={uploadMsg.type === 'success' ? 'success' : 'error'}
                  message={uploadMsg.text}
                  className="mt-2"
                />
              )}
            </div>
          )}

          {/* Warning if trying to start without data */}
          {sim.status === 'draft' && (
            <Alert
              variant="warning"
              message="Upload a CSV before starting. The simulation clock needs price data to run."
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Create simulation modal ───────────────────────────────────────────────────
function CreateSimulationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    description: '',
    speedMultiplier: 60,
    startingCash: 100000,
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k === 'name' || k === 'description' ? e.target.value : Number(e.target.value) }))

  const create = useMutation({
    mutationFn: () => adminSimApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'simulations'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
      <div className="bg-surface rounded-xl border border-border shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">New simulation</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate() }}
          className="p-5 space-y-4"
        >
          {create.isError && (
            <Alert
              variant="error"
              message={(create.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create'}
            />
          )}

          <Input
            label="Simulation name"
            placeholder="Spring 2026 — Week 3"
            value={form.name}
            onChange={set('name')}
            required
            autoFocus
          />
          <Input
            label="Description (optional)"
            placeholder="Volatile market scenario — teaches stop-loss orders"
            value={form.description}
            onChange={set('description')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Speed multiplier"
              type="number"
              min={1}
              max={300}
              value={form.speedMultiplier}
              onChange={set('speedMultiplier')}
              hint="60 = 1 wall second per sim minute"
            />
            <Input
              label="Starting cash (PKR)"
              type="number"
              min={1000}
              value={form.startingCash}
              onChange={set('startingCash')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" loading={create.isPending}>Create simulation</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSimulationsPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'simulations'],
    queryFn: simulationApi.list,
    refetchInterval: 5000,
  })

  const sims = data?.simulations ?? []
  const active   = sims.filter(s => s.status === 'active')
  const drafts   = sims.filter(s => s.status === 'draft')
  const paused   = sims.filter(s => s.status === 'paused')
  const completed = sims.filter(s => s.status === 'completed')

  const grouped = [
    { label: 'Active',    items: active    },
    { label: 'Paused',   items: paused    },
    { label: 'Draft',    items: drafts    },
    { label: 'Completed', items: completed },
  ].filter(g => g.items.length > 0)

  return (
    <div className="p-8 max-w-4xl">
      {showCreate && <CreateSimulationModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">Simulations</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Create simulations, upload Bloomberg CSV data, and control playback
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          New simulation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : sims.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-8 h-8" />}
          title="No simulations yet"
          description="Create your first simulation, upload Bloomberg PSX data, then start it for students."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-2">
                {group.label} ({group.items.length})
              </h2>
              <div className="space-y-2">
                {group.items.map(sim => (
                  <SimulationRow key={sim.id} sim={sim} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <Card className="mt-8 bg-surface-secondary" padding="md">
        <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-3">
          How to run a simulation
        </p>
        <ol className="space-y-2">
          {[
            'Create a new simulation (set speed and starting cash)',
            'Pull 1-minute OHLCV bars from Bloomberg Terminal for your PSX stocks',
            'Run bloomberg_to_simtrader.py to convert the data',
            'Upload the CSV file using the "Choose CSV" button above',
            'Click Start — students can now connect and trade',
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-ink-secondary">
              <span className="w-4 h-4 rounded-full bg-ink text-surface text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
