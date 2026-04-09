// src/pages/student/ProfilePage.tsx
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Card, Alert, Divider } from '@/components/ui'

export function ProfilePage() {
  const { user, setUser } = useAuthStore(s => ({ user: s.user, setUser: s.setUser }))
  const qc = useQueryClient()

  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName]   = useState(user?.lastName  ?? '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [profileMsg, setProfileMsg] = useState<'success' | null>(null)
  const [pwMsg, setPwMsg] = useState<'success' | null>(null)

  const updateProfile = useMutation({
    mutationFn: () => userApi.updateProfile(firstName, lastName),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
      setProfileMsg('success')
      setTimeout(() => setProfileMsg(null), 3000)
    },
  })

  const changePw = useMutation({
    mutationFn: () => userApi.changePassword(currentPw, newPw),
    onSuccess: () => {
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setPwMsg('success')
      setTimeout(() => setPwMsg(null), 3000)
    },
  })

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink tracking-tight">Profile</h1>
        <p className="text-sm text-ink-secondary mt-0.5">Manage your account details</p>
      </div>

      {/* Profile info */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Personal information</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); updateProfile.mutate() }}
          className="space-y-4"
        >
          {profileMsg === 'success' && <Alert variant="success" message="Profile updated." />}
          {updateProfile.isError && <Alert variant="error" message="Failed to update profile." />}

          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            <Input label="Last name"  value={lastName}  onChange={e => setLastName(e.target.value)}  required />
          </div>

          <Input label="Email" value={user?.email ?? ''} disabled hint="Email cannot be changed. Contact your instructor if needed." />

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-ink-tertiary capitalize">Role: {user?.role}</span>
            <Button type="submit" size="sm" loading={updateProfile.isPending}>Save changes</Button>
          </div>
        </form>
      </Card>

      <Divider />

      {/* Change password */}
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Change password</h2>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (newPw !== confirmPw || newPw.length < 8) return
            changePw.mutate()
          }}
          className="space-y-4"
        >
          {pwMsg === 'success' && <Alert variant="success" message="Password updated. You will be logged out of other devices." />}
          {changePw.isError && (
            <Alert
              variant="error"
              message={(changePw.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update password.'}
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
            autoComplete="new-password"
            error={confirmPw.length > 0 && newPw !== confirmPw ? 'Passwords do not match' : undefined}
            required
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              loading={changePw.isPending}
              disabled={newPw !== confirmPw || newPw.length < 8}
            >
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
