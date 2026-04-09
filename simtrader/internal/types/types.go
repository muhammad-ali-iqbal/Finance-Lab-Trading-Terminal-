// internal/types/types.go
//
// Shared primitive types used across packages.
// This package imports NOTHING from this project — only stdlib and third-party.
// That makes it safe to import from auth, user, middleware, simulation etc.
// without creating cycles.

package types

import "github.com/golang-jwt/jwt/v5"

// Role controls what a user can do.
type Role string

const (
	RoleAdmin   Role = "admin"
	RoleStudent Role = "student"
)

// Claims is the JWT access token payload.
// Stored in fiber.Ctx by RequireAuth middleware.
type Claims struct {
	UserID string `json:"userId"`
	Role   Role   `json:"role"`
	jwt.RegisteredClaims
}
