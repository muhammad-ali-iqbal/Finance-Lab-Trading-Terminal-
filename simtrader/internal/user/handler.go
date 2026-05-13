// internal/user/handler.go
//
// User management endpoints — primarily for the admin panel.
// Invite students, list all users, block/unblock accounts, view profiles.

package user

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
)

// PasswordVerifier breaks the circular dependency between user and auth packages.
// auth.Service implements this interface — user/handler.go never imports auth directly.
type PasswordVerifier interface {
	VerifyPassword(ctx context.Context, email, password string) error
	InviteStudent(ctx context.Context, email string) (*User, error)
}

type Handler struct {
	repo     *Repository
	verifier PasswordVerifier
}

func NewHandler(repo *Repository, verifier PasswordVerifier) *Handler {
	return &Handler{repo: repo, verifier: verifier}
}

// RegisterRoutes mounts user management routes.
// Admin routes are protected by both RequireAuth and RequireRole(admin).
func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	// Current user — any authenticated user
	me := app.Group("/api/me", authMW)
	me.Get("/", h.GetMyProfile)
	me.Put("/", h.UpdateMyProfile)
	me.Put("/password", h.ChangeMyPassword)
	me.Post("/avatar", h.UploadAvatar)
	me.Put("/avatar/preset", h.SetPresetAvatar)
	me.Delete("/avatar", h.RemoveAvatar)

	// Admin user management
	admin := app.Group("/api/admin/users", authMW, adminMW)
	admin.Get("/", h.ListUsers)
	admin.Post("/invite", h.InviteStudent)
	admin.Get("/:id", h.GetUser)
	admin.Post("/:id/block", h.BlockUser)
	admin.Post("/:id/unblock", h.UnblockUser)
}

// ── Request shapes ────────────────────────────────────────────────────────────

type inviteRequest struct {
	Email string `json:"email"`
}

type updateProfileRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// GetMyProfile godoc
// GET /api/me
// Returns the authenticated user's public profile.
func (h *Handler) GetMyProfile(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found."})
		}
		return httputil.InternalError(c)
	}

	return c.JSON(u.ToPublicProfile())
}

// UpdateMyProfile godoc
// PUT /api/me
// Body: { firstName, lastName }
func (h *Handler) UpdateMyProfile(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	var req updateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.FirstName == "" || req.LastName == "" {
		return httputil.BadRequest(c, "first name and last name are required")
	}

	// We do a targeted UPDATE rather than a full model save.
	// This prevents accidental overwrites of fields we didn't intend to change.
	query := `UPDATE users SET first_name=$2, last_name=$3, updated_at=NOW() WHERE id=$1`
	if _, err := h.repo.db.Exec(c.Context(), query, uid, req.FirstName, req.LastName); err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(u.ToPublicProfile())
}

// ChangeMyPassword godoc
// PUT /api/me/password
// Body: { currentPassword, newPassword }
func (h *Handler) ChangeMyPassword(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	var req changePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.CurrentPassword == "" || len(req.NewPassword) < 8 {
		return httputil.BadRequest(c, "current password required; new password must be 8+ characters")
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}

	// Verify current password via the interface (auth.Service satisfies this).
	if err := h.verifier.VerifyPassword(c.Context(), u.Email, req.CurrentPassword); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Current password is incorrect.",
		})
	}

	// Direct update for authenticated password change (not reset flow)
	if err := h.repo.ResetPassword(c.Context(), uid, req.NewPassword); err != nil {
		return httputil.InternalError(c)
	}

	// Revoke all other sessions — forces re-login on other devices.
	_ = h.repo.RevokeAllUserTokens(c.Context(), uid)

	return c.JSON(fiber.Map{"message": "Password updated. Please log in again on other devices."})
}

// ListUsers godoc
// GET /api/admin/users?role=student
// Admin: list all users, optionally filtered by role.
func (h *Handler) ListUsers(c *fiber.Ctx) error {
	var role *Role
	if r := c.Query("role"); r != "" {
		parsed := Role(r)
		role = &parsed
	}

	users, err := h.repo.List(c.Context(), role)
	if err != nil {
		return httputil.InternalError(c)
	}

	profiles := make([]PublicProfile, 0, len(users))
	for _, u := range users {
		profiles = append(profiles, u.ToPublicProfile())
	}
	return c.JSON(fiber.Map{"users": profiles, "total": len(profiles)})
}

// InviteStudent godoc
// POST /api/admin/users/invite
// Body: { email }
// Admin creates a pending student account and sends the invite email.
func (h *Handler) InviteStudent(c *fiber.Ctx) error {
	var req inviteRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.Email == "" {
		return httputil.BadRequest(c, "email is required")
	}

	u, err := h.verifier.InviteStudent(c.Context(), req.Email)
	if err != nil {
		if errors.Is(err, ErrEmailTaken) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "An account with this email already exists.",
			})
		}
		// Email send failure — user was created but email failed.
		// Return 207 Multi-Status so the frontend can warn the admin.
		return c.Status(fiber.StatusMultiStatus).JSON(fiber.Map{
			"warning": "Student account created but invite email failed to send. Share the invite link manually.",
			"user":    u.ToPublicProfile(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Invite sent successfully.",
		"user":    u.ToPublicProfile(),
	})
}

// GetUser godoc
// GET /api/admin/users/:id
func (h *Handler) GetUser(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid user ID")
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found."})
		}
		return httputil.InternalError(c)
	}

	return c.JSON(u.ToPublicProfile())
}

// BlockUser godoc
// POST /api/admin/users/:id/block
// Blocks the account AND revokes all active sessions immediately.
func (h *Handler) BlockUser(c *fiber.Ctx) error {
	return h.setUserStatus(c, StatusBlocked)
}

// UnblockUser godoc
// POST /api/admin/users/:id/unblock
func (h *Handler) UnblockUser(c *fiber.Ctx) error {
	return h.setUserStatus(c, StatusActive)
}

// UploadAvatar godoc
// POST /api/me/avatar
// Multipart form field: "file" (JPEG, PNG, WebP or GIF)
func (h *Handler) UploadAvatar(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	file, err := c.FormFile("file")
	if err != nil {
		return httputil.BadRequest(c, "file field is required")
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		return httputil.BadRequest(c, "only JPEG, PNG, WebP or GIF images are allowed")
	}

	dir := "./uploads/avatars"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return httputil.InternalError(c)
	}
	filename := uid.String() + ext
	dest := filepath.Join(dir, filename)
	if err := c.SaveFile(file, dest); err != nil {
		return httputil.InternalError(c)
	}

	avatarURL := "/uploads/avatars/" + filename
	if err := h.repo.SetAvatarURL(c.Context(), uid, avatarURL); err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(u.ToPublicProfile())
}

type setPresetRequest struct {
	Preset string `json:"preset"`
}

var validPresets = map[string]bool{
	"avatar-01": true, "avatar-02": true, "avatar-03": true, "avatar-04": true,
	"avatar-05": true, "avatar-06": true, "avatar-07": true, "avatar-08": true,
}

// SetPresetAvatar godoc
// PUT /api/me/avatar/preset
// Body: { preset: "avatar-01" }
func (h *Handler) SetPresetAvatar(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	var req setPresetRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if !validPresets[req.Preset] {
		return httputil.BadRequest(c, "invalid preset name")
	}

	avatarURL := "/avatars/" + req.Preset + ".svg"
	if err := h.repo.SetAvatarURL(c.Context(), uid, avatarURL); err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(u.ToPublicProfile())
}

// RemoveAvatar godoc
// DELETE /api/me/avatar
// Clears the avatar_url so the sidebar falls back to initials.
func (h *Handler) RemoveAvatar(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	if err := h.repo.SetAvatarURL(c.Context(), uid, ""); err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(u.ToPublicProfile())
}

func (h *Handler) setUserStatus(c *fiber.Ctx, status Status) error {
	uid, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid user ID")
	}

	// Prevent admin from blocking themselves.
	claims := middleware.GetClaims(c)
	if claims.UserID == uid.String() {
		return httputil.BadRequest(c, "you cannot change your own account status")
	}

	if err := h.repo.SetStatus(c.Context(), uid, status); err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found."})
		}
		return httputil.InternalError(c)
	}

	// If blocking, immediately revoke all sessions so the student can't
	// keep using the app until their access token expires.
	if status == StatusBlocked {
		_ = h.repo.RevokeAllUserTokens(c.Context(), uid)
	}

	return c.JSON(fiber.Map{
		"message": "User status updated.",
		"status":  status,
	})
}

