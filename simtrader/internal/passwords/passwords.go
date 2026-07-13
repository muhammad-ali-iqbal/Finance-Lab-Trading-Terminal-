// internal/passwords/passwords.go
//
// Server-side password policy (AUTH-03). Imported by both the auth and user
// handlers; depends on nothing project-internal so it creates no import cycle.

package passwords

import (
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost is the shared hashing cost factor — 12 is the minimum
// recommended for production. Every code path that persists a password
// (registration, reset, authenticated change) must hash through Hash so a
// mistaken direct write can never store plaintext in password_hash.
const BcryptCost = 12

// Hash bcrypt-hashes a plaintext password. Intentionally slow.
func Hash(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	return string(bytes), err
}

// MinLength is the minimum acceptable password length.
const MinLength = 12

// MaxLength caps the password at bcrypt's 72-byte significant input. Anything
// longer is silently truncated by bcrypt, which would mislead users into a
// false sense of strength, so we reject it explicitly.
const MaxLength = 72

// commonDenylist is a small set of the most-guessed passwords. Not exhaustive —
// a deterrent against the laziest choices, complementing the length floor.
var commonDenylist = map[string]bool{
	"password":     true,
	"password1":    true,
	"password123":  true,
	"123456789012": true,
	"qwertyuiop":   true,
	"changeme123!": true,
	"letmein12345": true,
	"adminadmin":   true,
	"simtrader123": true,
}

// Validate returns a human-readable error string and false when the password
// fails policy, or "" and true when it is acceptable.
func Validate(pw string) (string, bool) {
	if len(pw) < MinLength {
		return "password must be at least 12 characters", false
	}
	if len(pw) > MaxLength {
		return "password must be at most 72 characters", false
	}
	if commonDenylist[strings.ToLower(strings.TrimSpace(pw))] {
		return "password is too common — choose something less guessable", false
	}
	return "", true
}
