// scripts/hash_password.go
//
// Utility script — run this to generate a bcrypt hash for any password.
// Use it to set the initial admin password in the migration seed,
// or to manually reset a password directly in the database if needed.
//
// Usage:
//   go run scripts/hash_password.go yourpassword
//
// Output:
//   $2a$12$...

//go:build ignore

package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: go run scripts/hash_password.go <password>")
		os.Exit(1)
	}

	password := os.Args[1]
	if len(password) < 8 {
		fmt.Fprintln(os.Stderr, "Error: password must be at least 8 characters")
		os.Exit(1)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error generating hash: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(string(hash))
}
