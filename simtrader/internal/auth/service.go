// internal/auth/service.go
//
// The service layer contains business logic — it orchestrates the
// repository (database), token generation, and email sending.
// It knows nothing about HTTP — no fiber.Ctx, no status codes.
// This makes the logic testable in isolation.

package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/config"
	"github.com/simtrader/backend/internal/types"
	"github.com/simtrader/backend/internal/user"
	"golang.org/x/crypto/bcrypt"
)

// Sentinel errors returned to the handler layer.
// Handlers map these to the correct HTTP status codes.
var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountNotActive   = errors.New("account is not active")
	ErrAccountBlocked     = errors.New("account has been blocked")
)

// bcrypt cost factor — 12 is the minimum recommended for production.
// Higher = slower to hash (good for security), slower for tests (annoying).
// Do not lower below 12 in production.
const bcryptCost = 12

// TokenPair is what we return after a successful login or token refresh.
type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

type Service struct {
	users  *user.Repository
	cfg    *config.Config
	mailer Mailer
}

// Mailer is an interface so we can swap real email for a no-op in tests.
type Mailer interface {
	SendInvite(toEmail, firstName, inviteToken string) error
	SendPasswordReset(toEmail, firstName, resetToken string) error
}

func NewService(users *user.Repository, cfg *config.Config, mailer Mailer) *Service {
	return &Service{users: users, cfg: cfg, mailer: mailer}
}

// VerifyPassword checks a password against the stored hash without issuing tokens.
// Satisfies user.PasswordVerifier — used by user/handler.go for password changes.
func (s *Service) VerifyPassword(ctx context.Context, email, password string) error {
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		return ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return ErrInvalidCredentials
	}
	return nil
}

// Login authenticates a user and returns a token pair.
// Deliberately vague error messages — never tell attackers which part was wrong.
func (s *Service) Login(ctx context.Context, email, password string) (*TokenPair, *user.User, error) {
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			// Still run bcrypt to prevent timing attacks that reveal
			// whether the email exists in the system.
			_ = bcrypt.CompareHashAndPassword([]byte("$2a$12$dummy.hash.to.prevent.timing.attack"), []byte(password))
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("login: %w", err)
	}

	if u.Status == user.StatusPending {
		return nil, nil, ErrAccountNotActive
	}
	if u.Status == user.StatusBlocked {
		return nil, nil, ErrAccountBlocked
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.issueTokenPair(ctx, u)
	if err != nil {
		return nil, nil, err
	}
	return tokens, u, nil
}

// InviteStudent creates a pending student account and emails the invite link.
// Admin-only — the handler enforces the role check.
func (s *Service) InviteStudent(ctx context.Context, email string) (*user.User, error) {
	inviteToken, err := generateSecureToken()
	if err != nil {
		return nil, fmt.Errorf("generate invite token: %w", err)
	}

	u := &user.User{
		ID:          uuid.New(),
		Email:       email,
		Role:        user.RoleStudent,
		Status:      user.StatusPending,
		InviteToken: &inviteToken,
	}

	if err := s.users.Create(ctx, u); err != nil {
		return nil, err // propagates ErrEmailTaken to handler
	}

	// Send the invite email. If it fails, log it but don't roll back —
	// admin can resend. A failed email != failed invite creation.
	if err := s.mailer.SendInvite(u.Email, u.Email, inviteToken); err != nil {
		// In production, log this to Sentry. For now, return so handler can warn.
		return u, fmt.Errorf("user created but email failed: %w", err)
	}

	return u, nil
}

// CompleteRegistration handles the student clicking their invite link.
// They supply their name, password, and the token from the URL.
func (s *Service) CompleteRegistration(ctx context.Context, inviteToken, firstName, lastName, password string) (*TokenPair, *user.User, error) {
	u, err := s.users.GetByInviteToken(ctx, inviteToken)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			return nil, nil, user.ErrInvalidToken
		}
		return nil, nil, err
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, nil, fmt.Errorf("hash password: %w", err)
	}

	if err := s.users.CompleteRegistration(ctx, u.ID, hash, firstName, lastName); err != nil {
		return nil, nil, err
	}

	// Reload the updated user
	u, err = s.users.GetByID(ctx, u.ID)
	if err != nil {
		return nil, nil, err
	}

	tokens, err := s.issueTokenPair(ctx, u)
	if err != nil {
		return nil, nil, err
	}
	return tokens, u, nil
}

// ForgotPassword generates a reset token and emails it.
// Always returns success to caller — prevents email enumeration.
func (s *Service) ForgotPassword(ctx context.Context, email string) error {
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		// Don't reveal whether the email exists — just silently succeed.
		return nil
	}

	if u.Status != user.StatusActive {
		return nil // same — don't leak status
	}

	resetToken, err := generateSecureToken()
	if err != nil {
		return fmt.Errorf("generate reset token: %w", err)
	}

	expiry := time.Now().Add(1 * time.Hour)
	if err := s.users.SetResetToken(ctx, u.ID, resetToken, expiry); err != nil {
		return fmt.Errorf("set reset token: %w", err)
	}

	_ = s.mailer.SendPasswordReset(u.Email, u.FirstName, resetToken)
	return nil
}

// ResetPassword validates the reset token and sets the new password.
func (s *Service) ResetPassword(ctx context.Context, resetToken, newPassword string) error {
	u, err := s.users.GetByResetToken(ctx, resetToken)
	if err != nil {
		return err // propagates ErrInvalidToken
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.users.ResetPassword(ctx, u.ID, hash); err != nil {
		return err
	}

	// Revoke all existing sessions after a password reset —
	// if someone was accessing the account unauthorised, kick them out.
	_ = s.users.RevokeAllUserTokens(ctx, u.ID)
	return nil
}

// RefreshTokens validates a refresh token and issues a new token pair.
// Implements refresh token rotation — each use invalidates the old token.
func (s *Service) RefreshTokens(ctx context.Context, rawRefreshToken string) (*TokenPair, *user.User, error) {
	tokenHash := hashToken(rawRefreshToken)

	userID, err := s.users.ValidateRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, nil, err
	}

	// Revoke the used token immediately — rotation means one use only.
	if err := s.users.RevokeRefreshToken(ctx, tokenHash); err != nil {
		return nil, nil, err
	}

	u, err := s.users.GetByID(ctx, *userID)
	if err != nil {
		return nil, nil, err
	}

	if u.Status == user.StatusBlocked {
		return nil, nil, ErrAccountBlocked
	}

	tokens, err := s.issueTokenPair(ctx, u)
	if err != nil {
		return nil, nil, err
	}
	return tokens, u, nil
}

// Logout revokes the refresh token. Access tokens expire naturally.
func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	tokenHash := hashToken(rawRefreshToken)
	return s.users.RevokeRefreshToken(ctx, tokenHash)
}

// ── Token helpers ────────────────────────────────────────────────────────────

// issueTokenPair creates both access and refresh tokens and persists the refresh token.
func (s *Service) issueTokenPair(ctx context.Context, u *user.User) (*TokenPair, error) {
	accessToken, err := s.createAccessToken(u)
	if err != nil {
		return nil, err
	}

	rawRefreshToken, err := generateSecureToken()
	if err != nil {
		return nil, err
	}

	refreshExpiry := time.Now().Add(s.cfg.JWTRefreshExpiry)
	tokenHash := hashToken(rawRefreshToken)
	if err := s.users.StoreRefreshToken(ctx, u.ID, tokenHash, refreshExpiry); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: rawRefreshToken,
	}, nil
}

// createAccessToken mints a short-lived signed JWT.
func (s *Service) createAccessToken(u *user.User) (string, error) {
	claims := types.Claims{
		UserID: u.ID.String(),
		Role:   types.Role(u.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.JWTAccessExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "simtrader",
			Subject:   u.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTAccessSecret))
}

// ParseAccessToken validates a JWT and extracts claims.
// Called by the auth middleware on every protected request.
func (s *Service) ParseAccessToken(tokenString string) (*types.Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &types.Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTAccessSecret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*types.Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

// hashPassword uses bcrypt. This is intentionally slow.
func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(bytes), err
}

// generateSecureToken creates a cryptographically random 32-byte hex string.
// Used for invite tokens and password reset tokens.
func generateSecureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashToken SHA-256s a token before database storage.
// We never store raw tokens — if the DB is compromised, tokens are useless.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
