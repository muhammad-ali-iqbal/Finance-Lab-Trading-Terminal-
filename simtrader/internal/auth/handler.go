// internal/auth/handler.go
//
// Handlers translate HTTP ↔ service layer.
// They validate input, call the service, and map errors to HTTP codes.
// No business logic lives here — if you find yourself writing an if/else
// about user state in a handler, move it to the service.

package auth

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/user"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes attaches all auth routes to a Fiber app.
// Public routes — no auth middleware.
func (h *Handler) RegisterRoutes(app *fiber.App) {
	auth := app.Group("/api/auth")
	auth.Post("/login", h.Login)
	auth.Post("/register", h.CompleteRegistration) // student clicks invite link
	auth.Post("/refresh", h.RefreshTokens)
	auth.Post("/logout", h.Logout)
	auth.Post("/forgot-password", h.ForgotPassword)
	auth.Post("/reset-password", h.ResetPassword)
}

// ── Request / Response shapes ────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	InviteToken string `json:"inviteToken"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Password    string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type logoutRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

type resetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

type authResponse struct {
	AccessToken  string             `json:"accessToken"`
	RefreshToken string             `json:"refreshToken"`
	User         user.PublicProfile `json:"user"`
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// Login godoc
// POST /api/auth/login
// Body: { email, password }
// Returns: { accessToken, refreshToken, user }
func (h *Handler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return httputil.BadRequest(c, "email and password are required")
	}

	tokens, u, err := h.service.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		return mapAuthError(c, err)
	}

	return c.JSON(authResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         u.ToPublicProfile(),
	})
}

// CompleteRegistration godoc
// POST /api/auth/register
// Body: { inviteToken, firstName, lastName, password }
// Returns: { accessToken, refreshToken, user }
func (h *Handler) CompleteRegistration(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	if req.InviteToken == "" {
		return httputil.BadRequest(c, "invite token is required")
	}
	if req.FirstName == "" || req.LastName == "" {
		return httputil.BadRequest(c, "first name and last name are required")
	}
	if len(req.Password) < 8 {
		return httputil.BadRequest(c, "password must be at least 8 characters")
	}

	tokens, u, err := h.service.CompleteRegistration(
		c.Context(), req.InviteToken, req.FirstName, req.LastName, req.Password,
	)
	if err != nil {
		return mapAuthError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(authResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         u.ToPublicProfile(),
	})
}

// RefreshTokens godoc
// POST /api/auth/refresh
// Body: { refreshToken }
// Returns: { accessToken, refreshToken, user }
func (h *Handler) RefreshTokens(c *fiber.Ctx) error {
	var req refreshRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.RefreshToken == "" {
		return httputil.BadRequest(c, "refresh token is required")
	}

	tokens, u, err := h.service.RefreshTokens(c.Context(), req.RefreshToken)
	if err != nil {
		return mapAuthError(c, err)
	}

	return c.JSON(authResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         u.ToPublicProfile(),
	})
}

// Logout godoc
// POST /api/auth/logout
// Body: { refreshToken }
func (h *Handler) Logout(c *fiber.Ctx) error {
	var req logoutRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	// Best-effort logout — even if token not found, return success.
	// The client should discard tokens regardless.
	_ = h.service.Logout(c.Context(), req.RefreshToken)
	return c.SendStatus(fiber.StatusNoContent)
}

// ForgotPassword godoc
// POST /api/auth/forgot-password
// Body: { email }
// Always returns 200 — prevents email enumeration.
func (h *Handler) ForgotPassword(c *fiber.Ctx) error {
	var req forgotPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.Email == "" {
		return httputil.BadRequest(c, "email is required")
	}

	// Service always returns nil to prevent email enumeration.
	_ = h.service.ForgotPassword(c.Context(), req.Email)

	return c.JSON(fiber.Map{
		"message": "If that email is registered, a reset link has been sent.",
	})
}

// ResetPassword godoc
// POST /api/auth/reset-password
// Body: { token, newPassword }
func (h *Handler) ResetPassword(c *fiber.Ctx) error {
	var req resetPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.Token == "" {
		return httputil.BadRequest(c, "reset token is required")
	}
	if len(req.NewPassword) < 8 {
		return httputil.BadRequest(c, "password must be at least 8 characters")
	}

	if err := h.service.ResetPassword(c.Context(), req.Token, req.NewPassword); err != nil {
		return mapAuthError(c, err)
	}

	return c.JSON(fiber.Map{"message": "Password updated successfully."})
}

// ── Error mapping ─────────────────────────────────────────────────────────────

// mapAuthError converts service-layer errors to HTTP responses.
// This is the only place that knows both the error domain and HTTP codes.
func mapAuthError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid email or password.",
		})
	case errors.Is(err, ErrAccountBlocked):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Your account has been suspended. Contact your instructor.",
		})
	case errors.Is(err, ErrAccountNotActive):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Please complete your registration using the invite link.",
		})
	case errors.Is(err, user.ErrEmailTaken):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "An account with this email already exists.",
		})
	case errors.Is(err, user.ErrInvalidToken):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "This link is invalid or has expired.",
		})
	default:
		// Log the real error (Sentry in production), return generic message.
		// Never expose internal errors to clients.
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Something went wrong. Please try again.",
		})
	}
}
