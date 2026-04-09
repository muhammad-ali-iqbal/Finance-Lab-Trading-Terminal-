// internal/user/model.go
//
// Domain models — these are Go structs that map to your database rows.
// They are NOT the HTTP request/response shapes (those are in handler.go).
// Keeping them separate means your database schema and your API can
// evolve independently.

package user

import (
	"time"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/types"
)

// Role aliases types.Role so existing code compiles unchanged.
type Role = types.Role

const (
	RoleAdmin   = types.RoleAdmin
	RoleStudent = types.RoleStudent
)

// Status controls whether a user can log in.
type Status string

const (
	StatusPending  Status = "pending"  // Invited, not yet registered
	StatusActive   Status = "active"   // Fully registered and can log in
	StatusBlocked  Status = "blocked"  // Admin has blocked this account
)

// User is the core domain entity.
type User struct {
	ID           uuid.UUID  `json:"id"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`         // Never serialised to JSON
	FirstName    string     `json:"firstName"`
	LastName     string     `json:"lastName"`
	Role         Role       `json:"role"`
	Status       Status     `json:"status"`
	InviteToken  *string    `json:"-"`         // Non-nil until registration complete
	ResetToken   *string    `json:"-"`
	ResetExpiry  *time.Time `json:"-"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// PublicProfile is what the API returns — strips sensitive fields.
type PublicProfile struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FirstName string    `json:"firstName"`
	LastName  string    `json:"lastName"`
	Role      Role      `json:"role"`
	Status    Status    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

func (u *User) ToPublicProfile() PublicProfile {
	return PublicProfile{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Role:      u.Role,
		Status:    u.Status,
		CreatedAt: u.CreatedAt,
	}
}
