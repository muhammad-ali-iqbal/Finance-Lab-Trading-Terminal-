// src/pages/admin/AdminSimulationsPage.tsx
import { useState, useRef, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { simulationApi } from '@/api'
import { SimulationTimer } from '@/components/simulation/SimulationTimer'
import { Card, Button, Input, Badge, Alert, Spinner, EmptyState } from '@/components/ui'
import {
  PlayCircle, PauseCircle, CheckCircle2, RotateCcw,
  Upload, Plus, X, Activity, ChevronDown, ChevronUp
} from 'lucide-react'
import type { Simulation } from '@/api'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
    active: 'success', paused: 'warning', completed: 'neutral', draft: 'neutral',
  }
  return <Badge variant={map[status] ?? 'neutral'}>{status}</Badge>
}

function SimulationCard({ sim }: { sim: Simulation }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(
    sim.status === 'active' || sim.status === 'paused'
  )
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'simulations'] })
    qc.invalidateQueries({ queryKey: ['simulation', sim.id, 'progress'] })
  }

  const start    = useMutation({ mutationFn: () => simulationApi.start(sim.id),    onSuccess: invalidate })
  const pause    = useMutation({ mutationFn: () => simulationApi.pause(sim.id),    onSuccess: invalidate })
  const resume   = useMutation({ mutationFn: () => simulationApi.resume(sim.id),   onSuccess: invalidate })
  const complete = useMutation({ mutationFn: () => simulationApi.complete(sim.id), onSuccess: invalidate })
  const restart  = useMutation({ mutationFn: () => simulationApi.restart(sim.id),  onSuccess: invalidate })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const result = await simulationApi.uploadCSV(sim.id, file)
      setUploadMsg({ type: 'success', text: `✓ Loaded ${(result.rowsLoaded ?? 0).toLocaleString()} rows` })
      invalidate()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setUploadMsg({ type: 'error', text: msg })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const hasTimer = sim.status === 'active' || sim.status === 'paused' || sim.status === 'completed'
  const canRestart = sim.status === 'active' || sim.status === 'paused' || sim.status === 'completed'

  const borderColor =
    sim.status === 'active'    ? 'border-success/40' :
    sim.status === 'paused'    ? 'border-warning/40' : 'border-border'

  return (
    <div className={`border rounded-lg overflow-hidden ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface">
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-0.5 text-ink-tertiary hover:text-ink flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{sim.name}</p>
          {sim.description && (
            <p className="text-xs text-ink-tertiary truncate">{sim.description}</p>
          )}
        </div>

        <span className="text-xs text-ink-tertiary hidden sm:block flex-shrink-0">
          {sim.speedMultiplier}× · PKR {(sim.startingCash ?? 100000).toLocaleString()}
        </span>
        <StatusBadge status={sim.status} />

        {/* Control buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sim.status === 'draft' && (
            <Button size="sm" onClick={() => start.mutate()} loading={start.isPending}>
              <PlayCircle className="w-3.5 h-3.5" /> Start
            </Button>
          )}
          {sim.status === 'active' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => pause.mutate()} loading={pause.isPending}>
                <PauseCircle className="w-3.5 h-3.5" /> Pause
              </Button>
              <Button size="sm" variant="ghost" onClick={() => complete.mutate()} loading={complete.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5" /> End
              </Button>
            </>
          )}
          {sim.status === 'paused' && (
            <>
              <Button size="sm" onClick={() => resume.mutate()} loading={resume.isPending}>
                <PlayCircle className="w-3.5 h-3.5" /> Resume
              </Button>
              <Button size="sm" variant="ghost" onClick={() => complete.mutate()} loading={complete.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5" /> End
              </Button>
            </>
          )}
          {canRestart && (
            <Button
              size="sm"
              variant="ghost"
              title="Restart simulation clock from beginning"
              loading={restart.isPending}
              onClick={() => {
                if (confirm(
                  'Restart the simulation clock from market open?\n\n' +
                  'Student portfolios and order history are preserved — only the clock resets.'
                )) restart.mutate()
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-surface-secondary px-4 py-4 space-y-4">

          {/* ── Timer ── */}
          {hasTimer && (
            <SimulationTimer simulationId={sim.id} showSimTime />
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Status',        value: sim.status },
              { label: 'Speed',         value: `${sim.speedMultiplier}× replay` },
              { label: 'Starting cash', value: `PKR ${(sim.startingCash ?? 100000).toLocaleString()}` },
              { label: 'Created',       value: new Date(sim.createdAt).toLocaleDateString() },
            ].map(item => (
              <div key={item.label} className="bg-surface rounded border border-border px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">{item.label}</p>
                <p className="text-sm font-medium text-ink mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          {/* CSV upload (draft only) */}
          {sim.status === 'draft' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-secondary">Upload price data (CSV)</p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading…' : 'Choose CSV file'}
                </Button>
                <span className="text-xs text-ink-tertiary">
                  Run <code className="bg-surface-tertiary px-1 rounded">bloomberg_to_simtrader.py</code> first
                </span>
              </div>
              {uploadMsg && (
                <Alert
                  variant={uploadMsg.type === 'success' ? 'success' : 'error'}
                  message={uploadMsg.text}
                />
              )}
              <Alert
                variant="warning"
                message="Upload a CSV before starting — the clock needs price data to broadcast."
              />
            </div>
          )}

          {/* Restart note */}
          {(sim.status === 'active' || sim.status === 'paused') && (
            <p className="text-xs text-ink-tertiary flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3 flex-shrink-0" />
              Use <strong className="text-ink-secondary font-medium">↺</strong> to restart the clock from market open.
              Student portfolios and orders are preserved.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Create modal ─────────────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', description: '', speedMultiplier: 60, startingCash: 100000,
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({
      ...f,
      [k]: (k === 'name' || k === 'description') ? e.target.value : Number(e.target.value),
    }))

  const create = useMutation({
    mutationFn: () => simulationApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'simulations'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
      <div className="bg-surface rounded-xl border border-border shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">New simulation</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate() }} className="p-5 space-y-4">
          {create.isError && (
            <Alert variant="error" message={
              (create.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create'
            } />
          )}
          <Input label="Simulation name" placeholder="Spring 2026 — Week 3" value={form.name} onChange={set('name')} required autoFocus />
          <Input label="Description (optional)" placeholder="Volatile market — teaches stop-loss orders" value={form.description} onChange={set('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Speed multiplier" type="number" min={1} max={300} value={form.speedMultiplier} onChange={set('speedMultiplier')} hint="60 = 1 sec per sim min" />
            <Input label="Starting cash (PKR)" type="number" min={1000} value={form.startingCash} onChange={set('startingCash')} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminSimulationsPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'simulations'],
    queryFn: simulationApi.list,
    refetchInterval: 5000,
  })

  const sims = data?.simulations ?? []
  const groups = [
    { label: 'Active',    items: sims.filter(s => s.status === 'active')    },
    { label: 'Paused',   items: sims.filter(s => s.status === 'paused')    },
    { label: 'Draft',    items: sims.filter(s => s.status === 'draft')     },
    { label: 'Completed', items: sims.filter(s => s.status === 'completed') },
  ].filter(g => g.items.length > 0)

  return (
    <div className="p-8 max-w-4xl">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">Simulations</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Create simulations, upload Bloomberg PSX data, control playback
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New simulation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : sims.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-8 h-8" />}
          title="No simulations yet"
          description="Create your first simulation, upload Bloomberg PSX data, then start it."
        />
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-2">
                {group.label} ({group.items.length})
              </h2>
              <div className="space-y-2">
                {group.items.map(sim => <SimulationCard key={sim.id} sim={sim} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card className="mt-8 bg-surface-secondary" padding="md">
        <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-3">How to run</p>
        <ol className="space-y-2">
          {[
            'Create a new simulation with name, speed, and starting cash',
            'Export 1-minute OHLCV bars from Bloomberg Terminal for PSX stocks',
            'Run bloomberg_to_simtrader.py to convert the Bloomberg export to CSV',
            'Upload the CSV — all price ticks are loaded into the database',
            'Click Start — the clock broadcasts ticks to connected students in real time',
            'Use Pause / Resume to control pacing, ↺ to reset the clock to market open',
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-ink-secondary">
              <span className="w-4 h-4 rounded-full bg-ink text-surface text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
