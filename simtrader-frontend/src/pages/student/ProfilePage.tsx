// src/pages/student/ProfilePage.tsx
import { useState, useRef, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { Button, Input, Card, Alert, Divider } from '@/components/ui'
import { Upload, Check } from 'lucide-react'
import clsx from 'clsx'

const PRESETS = [
  'avatar-01', 'avatar-02', 'avatar-03', 'avatar-04',
  'avatar-05', 'avatar-06', 'avatar-07', 'avatar-08',
]

function AvatarDisplay({ url, initials, size = 'lg' }: { url?: string; initials: string; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-20 h-20' : 'w-8 h-8'
  const textCls = size === 'lg' ? 'text-xl font-bold' : 'text-xs font-semibold'
  if (url) {
    return (
      <img
        src={url}
        alt="Avatar"
        className={clsx(dim, 'rounded-full object-cover flex-shrink-0')}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className={clsx(dim, 'rounded-full bg-ink dark:bg-dark-ink flex items-center justify-center flex-shrink-0')}>
      <span className={clsx(textCls, 'text-surface dark:text-dark-surface')}>{initials}</span>
    </div>
  )
}

export function ProfilePage() {
  const { user, setUser } = useAuthStore(s => ({ user: s.user, setUser: s.setUser }))
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName]   = useState(user?.lastName  ?? '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [profileMsg, setProfileMsg] = useState<'success' | null>(null)
  const [pwMsg, setPwMsg] = useState<'success' | null>(null)
  const [avatarMsg, setAvatarMsg] = useState<'success' | null>(null)

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`

  const updateProfile = useMutation({
    mutationFn: () => userApi.updateProfile({ firstName, lastName }),
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

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => userApi.uploadAvatar(file),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
      setAvatarMsg('success')
      setTimeout(() => setAvatarMsg(null), 3000)
    },
  })

  const setPreset = useMutation({
    mutationFn: (preset: string) => userApi.setPresetAvatar(preset),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
      setAvatarMsg('success')
      setTimeout(() => setAvatarMsg(null), 3000)
    },
  })

  const removeAvatar = useMutation({
    mutationFn: () => userApi.removeAvatar(),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const avatarLoading = uploadAvatar.isPending || setPreset.isPending || removeAvatar.isPending

  const updateDisplay = useMutation({
    mutationFn: (symbolDisplay: 'ticker' | 'name') => userApi.updateDisplayPreference(symbolDisplay),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-ink tracking-tight">Profile</h1>
        <p className="text-sm text-ink-secondary dark:text-dark-ink-secondary mt-0.5">Manage your account details</p>
      </div>

      {/* Avatar */}
      <Card>
        <h2 className="text-sm font-semibold text-ink dark:text-dark-ink mb-4">Profile picture</h2>

        {avatarMsg === 'success' && <Alert variant="success" message="Avatar updated." />}
        {(uploadAvatar.isError || setPreset.isError) && <Alert variant="error" message="Failed to update avatar." />}

        <div className="flex items-center gap-4 mb-5">
          <AvatarDisplay url={user?.avatarUrl || undefined} initials={initials} size="lg" />
          <div>
            <p className="text-sm font-medium text-ink dark:text-dark-ink">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5">
              {user?.avatarUrl ? 'Custom avatar set' : 'Using initials'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={avatarLoading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload photo
              </Button>
              {user?.avatarUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={avatarLoading}
                  onClick={() => removeAvatar.mutate()}
                >
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) uploadAvatar.mutate(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary uppercase tracking-wide font-medium mb-2">
          Choose a preset
        </p>
        <div className="grid grid-cols-8 gap-2">
          {PRESETS.map(preset => {
            const isSelected = user?.avatarUrl === `/avatars/${preset}.svg`
            return (
              <button
                key={preset}
                disabled={avatarLoading}
                onClick={() => setPreset.mutate(preset)}
                className={clsx(
                  'rounded-full overflow-hidden transition-all',
                  isSelected
                    ? 'ring-2 ring-offset-2 ring-iba dark:ring-dark-iba ring-offset-surface dark:ring-offset-dark-surface'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <img src={`/avatars/${preset}.svg`} alt={preset} className="w-full h-full" />
              </button>
            )
          })}
        </div>
      </Card>

      {/* Profile info */}
      <Card>
        <h2 className="text-sm font-semibold text-ink dark:text-dark-ink mb-4">Personal information</h2>
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
            <span className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary capitalize">Role: {user?.role}</span>
            <Button type="submit" size="sm" loading={updateProfile.isPending}>Save changes</Button>
          </div>
        </form>
      </Card>

      <Divider />

      {/* Display preferences */}
      <Card>
        <h2 className="text-sm font-semibold text-ink dark:text-dark-ink mb-1">Display</h2>
        <p className="text-xs text-ink-tertiary dark:text-dark-ink-tertiary mb-4">
          Choose how stock symbols are shown across the app.
        </p>

        {updateDisplay.isError && <Alert variant="error" message="Failed to update display preference." />}

        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'ticker' as const, label: 'Ticker', example: 'MEBL' },
            { value: 'name' as const,   label: 'Company name', example: 'Meezan Bank Limited' },
          ]).map(opt => {
            const selected = (user?.symbolDisplay ?? 'ticker') === opt.value
            return (
              <button
                key={opt.value}
                disabled={updateDisplay.isPending}
                onClick={() => updateDisplay.mutate(opt.value)}
                className={clsx(
                  'relative text-left rounded-lg border p-3 transition-colors',
                  selected
                    ? 'border-iba dark:border-dark-iba bg-iba/5 dark:bg-dark-iba/10'
                    : 'border-border dark:border-dark-border hover:bg-surface-secondary dark:hover:bg-dark-surface-secondary',
                )}
              >
                {selected && (
                  <Check className="w-3.5 h-3.5 text-iba dark:text-dark-iba absolute top-2.5 right-2.5" />
                )}
                <p className="text-xs font-medium text-ink dark:text-dark-ink">{opt.label}</p>
                <p className="text-[11px] text-ink-tertiary dark:text-dark-ink-tertiary mt-0.5 font-mono">{opt.example}</p>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Change password */}
      <Card>
        <h2 className="text-sm font-semibold text-ink dark:text-dark-ink mb-4">Change password</h2>
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
