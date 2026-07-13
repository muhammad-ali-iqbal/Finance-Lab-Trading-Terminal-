// src/utils/password.ts
//
// Mirrors the backend password policy (simtrader/internal/passwords/passwords.go)
// so every form's requirements checklist and submit-disable logic actually
// matches what the server will accept — previously each of Register, Reset
// and Change-password enforced its own (weaker, inconsistent) 8-character
// rule and the server rejected passwords the UI had just accepted.

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 72

export const passwordRequirements = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p: string) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    label: `At most ${PASSWORD_MAX_LENGTH} characters`,
    test: (p: string) => p.length <= PASSWORD_MAX_LENGTH,
  },
]

export function isPasswordValid(p: string): boolean {
  return passwordRequirements.every(r => r.test(p))
}
