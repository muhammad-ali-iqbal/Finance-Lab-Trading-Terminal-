// src/pages/admin/AdminSettingsPage.tsx
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { userApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Card, Alert } from '@/components/ui'

export default function AdminSettingsPage() {
  const user = useAuthStore(s => s.user)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [success, setSuccess]     = useState(false)

  const changePw = useMutation({
    mutationFn: () => userApi.changePassword(currentPw, newPw),
    onSuccess: () => {
      setSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setSuccess(false), 4000)
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw || newPw.length < 8) return
    changePw.mutate()
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">Settings</h1>
        <p className="text-sm text-ink-secondary mt-0.5">Manage your admin account</p>
      </div>

      {/* Profile info */}
      <Card className="mb-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Account</h2>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center">
            <span className="text-sm font-semibold text-surface">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-ink-secondary">{user?.email}</p>
          </div>
          <span className="ml-auto text-xs font-medium px-2 py-1 rounded bg-ink text-surface">
            Admin
          </span>
        </div>
      </Card>

      {/* Change password */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Change password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {success && <Alert variant="success" message="Password updated successfully." />}
          {changePw.isError && (
            <Alert
              variant="error"
              message={
                (changePw.error as { response?: { data?: { error?: string } } })
                  ?.response?.data?.error ?? 'Failed to update password'
              }
            />
          )}

          <Input
            label="Current password"
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label="New password"
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            autoComplete="new-password"
            hint="Minimum 8 characters"
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            error={confirmPw.length > 0 && newPw !== confirmPw ? 'Passwords do not match' : undefined}
            required
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              loading={changePw.isPending}
              disabled={newPw !== confirmPw || newPw.length < 8 || !currentPw}
            >
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
