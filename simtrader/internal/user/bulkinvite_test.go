package user

import (
	"strings"
	"testing"
)

func TestParseEmailList(t *testing.T) {
	tests := []struct {
		name       string
		in         []string
		valid      []string
		invalid    []string
		duplicates int
	}{
		{
			name:  "single address",
			in:    []string{"student@iba.edu.pk"},
			valid: []string{"student@iba.edu.pk"},
		},
		{
			name:  "newline separated paste",
			in:    []string{"a@iba.edu.pk\nb@iba.edu.pk\r\nc@iba.edu.pk"},
			valid: []string{"a@iba.edu.pk", "b@iba.edu.pk", "c@iba.edu.pk"},
		},
		{
			name:  "comma and semicolon separated",
			in:    []string{"a@iba.edu.pk, b@iba.edu.pk; c@iba.edu.pk"},
			valid: []string{"a@iba.edu.pk", "b@iba.edu.pk", "c@iba.edu.pk"},
		},
		{
			name:  "lowercased and trimmed",
			in:    []string{"  Student@IBA.edu.pk  "},
			valid: []string{"student@iba.edu.pk"},
		},
		{
			name:       "duplicates counted once",
			in:         []string{"a@iba.edu.pk", "A@IBA.EDU.PK", "a@iba.edu.pk"},
			valid:      []string{"a@iba.edu.pk"},
			duplicates: 2,
		},
		{
			name:    "malformed addresses reported",
			in:      []string{"not-an-email", "missing@domain", "@nolocal.pk", "two@@at.pk"},
			invalid: []string{"not-an-email", "missing@domain", "@nolocal.pk", "two@@at.pk"},
		},
		{
			name:    "valid and invalid mixed, order preserved",
			in:      []string{"good@iba.edu.pk\nbad\nalso.good@iba.edu.pk"},
			valid:   []string{"good@iba.edu.pk", "also.good@iba.edu.pk"},
			invalid: []string{"bad"},
		},
		{
			name: "blank input yields nothing",
			in:   []string{"", "   ", "\n\t"},
		},
		{
			name:    "over-long address rejected",
			in:      []string{strings.Repeat("a", 250) + "@iba.edu.pk"},
			invalid: []string{strings.Repeat("a", 250) + "@iba.edu.pk"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseEmailList(tc.in)
			assertSlice(t, "valid", got.Valid, tc.valid)
			assertSlice(t, "invalid", got.Invalid, tc.invalid)
			if got.Duplicates != tc.duplicates {
				t.Errorf("duplicates = %d, want %d", got.Duplicates, tc.duplicates)
			}
		})
	}
}

func assertSlice(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%s[%d] = %q, want %q", label, i, got[i], want[i])
		}
	}
}

func TestAppendDetail(t *testing.T) {
	if got := appendDetail("", "b"); got != "b" {
		t.Errorf("appendDetail(\"\", \"b\") = %q, want %q", got, "b")
	}
	if got := appendDetail("a", "b"); got != "a; b" {
		t.Errorf("appendDetail(\"a\", \"b\") = %q, want %q", got, "a; b")
	}
}
