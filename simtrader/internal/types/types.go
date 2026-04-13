// internal/types/types.go
//
// Shared primitive types used across packages.
// This package imports NOTHING from this project — only stdlib and third-party.
// That makes it safe to import from auth, user, middleware, simulation etc.
// without creating cycles.

package types

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

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

// PriceTick is one bar of OHLCV data for one symbol at one simulated time.
// Used by both simulation (reads from DB) and order (fills orders).
type PriceTick struct {
	ID           int64     `json:"-"`
	SimulationID uuid.UUID `json:"-"`
	Symbol       string    `json:"symbol"`
	SimTime      time.Time `json:"timestamp"`
	Open         float64   `json:"open"`
	High         float64   `json:"high"`
	Low          float64   `json:"low"`
	Close        float64   `json:"close"`
	Volume       int64     `json:"volume"`
}

// OrderFiller is implemented by the order service.
// The simulation clock calls it on every tick so limit/stop orders get checked.
type OrderFiller interface {
	ProcessTickOrders(ctx context.Context, simID uuid.UUID, ticks []PriceTick) error
}
