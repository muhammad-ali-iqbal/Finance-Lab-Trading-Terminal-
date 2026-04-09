// internal/user/repository.go
//
// The repository layer owns ALL database queries for users.
// No other layer touches SQL directly.
// This makes it easy to test business logic without a real database,
// and easy to change queries without hunting through the codebase.

package user

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sentinel errors — callers check for these specifically.
// Using errors.Is() instead of string matching is safer and cleaner.
var (
	ErrNotFound      = errors.New("user not found")
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidToken  = errors.New("invalid or expired token")
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Create inserts a new user. Used when admin invites a student.
func (r *Repository) Create(ctx context.Context, u *User) error {
	query := `
		INSERT INTO users (
			id, email, password_hash, first_name, last_name,
			role, status, invite_token, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
		)`

	_, err := r.db.Exec(ctx, query,
		u.ID, u.Email, u.PasswordHash, u.FirstName, u.LastName,
		u.Role, u.Status, u.InviteToken,
	)
	if err != nil {
		// pgx error codes: 23505 = unique_violation (duplicate email)
		if isDuplicateError(err) {
			return ErrEmailTaken
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// GetByID fetches a user by UUID. Returns ErrNotFound if not in DB.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name,
		       role, status, invite_token, reset_token, reset_expiry,
		       created_at, updated_at
		FROM users WHERE id = $1`

	return r.scanOne(r.db.QueryRow(ctx, query, id))
}

// GetByEmail fetches a user by email address. Used during login.
func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name,
		       role, status, invite_token, reset_token, reset_expiry,
		       created_at, updated_at
		FROM users WHERE LOWER(email) = LOWER($1)`

	return r.scanOne(r.db.QueryRow(ctx, query, email))
}

// GetByInviteToken finds the pending user for a registration link.
func (r *Repository) GetByInviteToken(ctx context.Context, token string) (*User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name,
		       role, status, invite_token, reset_token, reset_expiry,
		       created_at, updated_at
		FROM users WHERE invite_token = $1 AND status = 'pending'`

	return r.scanOne(r.db.QueryRow(ctx, query, token))
}

// GetByResetToken finds a user with a valid (non-expired) password reset token.
func (r *Repository) GetByResetToken(ctx context.Context, token string) (*User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name,
		       role, status, invite_token, reset_token, reset_expiry,
		       created_at, updated_at
		FROM users
		WHERE reset_token = $1 AND reset_expiry > NOW()`

	u, err := r.scanOne(r.db.QueryRow(ctx, query, token))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidToken
		}
		return nil, err
	}
	return u, nil
}

// CompleteRegistration sets the password, clears the invite token,
// and marks the user active — all in one atomic UPDATE.
func (r *Repository) CompleteRegistration(ctx context.Context, id uuid.UUID, passwordHash, firstName, lastName string) error {
	query := `
		UPDATE users
		SET password_hash = $2,
		    first_name    = $3,
		    last_name     = $4,
		    status        = 'active',
		    invite_token  = NULL,
		    updated_at    = NOW()
		WHERE id = $1 AND status = 'pending'`

	result, err := r.db.Exec(ctx, query, id, passwordHash, firstName, lastName)
	if err != nil {
		return fmt.Errorf("complete registration: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetResetToken stores a password reset token with an expiry.
func (r *Repository) SetResetToken(ctx context.Context, id uuid.UUID, token string, expiry time.Time) error {
	query := `
		UPDATE users
		SET reset_token  = $2,
		    reset_expiry = $3,
		    updated_at   = NOW()
		WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id, token, expiry)
	return err
}

// ResetPassword updates the password hash and clears the reset token atomically.
func (r *Repository) ResetPassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	query := `
		UPDATE users
		SET password_hash = $2,
		    reset_token   = NULL,
		    reset_expiry  = NULL,
		    updated_at    = NOW()
		WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id, passwordHash)
	return err
}

// SetStatus blocks or unblocks a user. Admin-only operation.
func (r *Repository) SetStatus(ctx context.Context, id uuid.UUID, status Status) error {
	query := `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id, status)
	if err != nil {
		return fmt.Errorf("set status: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// List returns all users, optionally filtered by role.
// Used in the admin user management screen.
func (r *Repository) List(ctx context.Context, role *Role) ([]*User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name,
		       role, status, invite_token, reset_token, reset_expiry,
		       created_at, updated_at
		FROM users`

	args := []any{}
	if role != nil {
		query += " WHERE role = $1"
		args = append(args, *role)
	}
	query += " ORDER BY created_at DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := scanUser(rows.Scan, u); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// StoreRefreshToken saves a refresh token hash for a user session.
// We store the hash, never the raw token — same principle as passwords.
func (r *Repository) StoreRefreshToken(ctx context.Context, userID uuid.UUID, tokenHash string, expiry time.Time) error {
	query := `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, NOW())`
	_, err := r.db.Exec(ctx, query, userID, tokenHash, expiry)
	return err
}

// ValidateRefreshToken checks the token hash exists and is not expired.
func (r *Repository) ValidateRefreshToken(ctx context.Context, tokenHash string) (*uuid.UUID, error) {
	query := `
		SELECT user_id FROM refresh_tokens
		WHERE token_hash = $1 AND expires_at > NOW() AND revoked = false`

	var userID uuid.UUID
	err := r.db.QueryRow(ctx, query, tokenHash).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidToken
		}
		return nil, err
	}
	return &userID, nil
}

// RevokeRefreshToken marks a token as revoked. Called on logout.
func (r *Repository) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	query := `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`
	_, err := r.db.Exec(ctx, query, tokenHash)
	return err
}

// RevokeAllUserTokens logs out all sessions for a user.
// Used when admin blocks a student — ensures they can't stay logged in.
func (r *Repository) RevokeAllUserTokens(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`
	_, err := r.db.Exec(ctx, query, userID)
	return err
}

// ── helpers ─────────────────────────────────────────────────────────────────

// scanOne wraps a single row scan, mapping pgx.ErrNoRows to ErrNotFound.
func (r *Repository) scanOne(row pgx.Row) (*User, error) {
	u := &User{}
	err := scanUser(row.Scan, u)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return u, nil
}

// scanUser is a single source of truth for scanning a user row.
// Both QueryRow and rows.Next use the same function.
type scanFn func(dest ...any) error

func scanUser(scan scanFn, u *User) error {
	return scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.FirstName, &u.LastName,
		&u.Role, &u.Status, &u.InviteToken, &u.ResetToken, &u.ResetExpiry,
		&u.CreatedAt, &u.UpdatedAt,
	)
}

func isDuplicateError(err error) bool {
	return err != nil && len(err.Error()) > 0 &&
		contains(err.Error(), "23505")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > 0 && containsRune(s, substr))
}

func containsRune(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
