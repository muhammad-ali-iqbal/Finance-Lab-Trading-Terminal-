// internal/passwords/passwords_test.go

package passwords

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestValidate(t *testing.T) {
	cases := []struct {
		name string
		pw   string
		ok   bool
	}{
		{"too short", "short1234567", true}, // 12 chars exactly, not denylisted
		{"below minimum", strings.Repeat("a", MinLength-1), false},
		{"at minimum", strings.Repeat("a", MinLength), true},
		{"at maximum", strings.Repeat("a", MaxLength), true},
		{"above maximum", strings.Repeat("a", MaxLength+1), false},
		{"denylisted, case/space insensitive", "  Password123  ", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, ok := Validate(c.pw)
			if ok != c.ok {
				t.Errorf("Validate(%q) ok = %v, want %v", c.pw, ok, c.ok)
			}
		})
	}
}

// Hash must produce a value bcrypt itself can verify — the exact property
// user/handler.go's ChangeMyPassword relies on now that it hashes before
// calling Repository.ResetPassword (which previously received the raw
// plaintext password and stored it directly, breaking subsequent logins).
func TestHashRoundTrips(t *testing.T) {
	pw := "a-reasonably-long-passphrase"
	hash, err := Hash(pw)
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	if hash == pw {
		t.Fatal("Hash() returned the plaintext unchanged")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)); err != nil {
		t.Errorf("bcrypt could not verify Hash() output: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("wrong-password")); err == nil {
		t.Error("bcrypt verified an incorrect password against the hash")
	}
}
