// internal/user/handler.go
//
// User management endpoints — primarily for the admin panel.
// Invite students, list all users, block/unblock accounts, view profiles.

package user

import (
	"context"
	"errors"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/passwords"
)

// maxNameLen bounds free-text name fields to prevent DB bloat (INPUT-01).
const maxNameLen = 100

// PasswordVerifier breaks the circular dependency between user and auth packages.
// auth.Service implements this interface — user/handler.go never imports auth directly.
type PasswordVerifier interface {
	VerifyPassword(ctx context.Context, email, password string) error
	InviteStudent(ctx context.Context, email string) (*User, error)
}

// ChallengeAccessGranter lets the bulk-invite flow grant challenge access
// without the user package importing challenge (same dependency-breaking
// trick as PasswordVerifier above). *challenge.Repository implements it.
type ChallengeAccessGranter interface {
	GrantAccess(ctx context.Context, challengeID, userID, grantedBy uuid.UUID, capital float64) error
	GetChallengeCapital(ctx context.Context, challengeID uuid.UUID) (float64, error)
}

type Handler struct {
	repo     *Repository
	verifier PasswordVerifier
	// access is optional — nil simply means the bulk-invite endpoint cannot
	// also grant challenge access.
	access ChallengeAccessGranter
	// basePath prefixes avatar URLs returned to the browser (e.g. "/simtrader")
	// so they resolve back through the reverse proxy correctly when this app
	// isn't served from the domain root. Empty when served from the root.
	basePath string
}

func NewHandler(repo *Repository, verifier PasswordVerifier, basePath string, access ChallengeAccessGranter) *Handler {
	return &Handler{repo: repo, verifier: verifier, basePath: basePath, access: access}
}

// adminUserID returns the calling admin's id, or uuid.Nil when it cannot be
// parsed — audit columns like challenge_access.granted_by are nullable, so an
// unparseable id must not fail the request.
func adminUserID(c *fiber.Ctx) uuid.UUID {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return uuid.Nil
	}
	id, err := uuid.Parse(claims.UserID)
	if err != nil {
		return uuid.Nil
	}
	return id
}

// RegisterRoutes mounts user management routes.
// Admin routes are protected by both RequireAuth and RequireRole(admin).
func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	// Current user — any authenticated user
	me := app.Group("/api/me", authMW)
	me.Get("/", h.GetMyProfile)
	me.Put("/", h.UpdateMyProfile)
	me.Put("/password", h.ChangeMyPassword)
	me.Put("/display-preference", h.UpdateDisplayPreference)
	me.Post("/avatar", h.UploadAvatar)
	me.Put("/avatar/preset", h.SetPresetAvatar)
	me.Delete("/avatar", h.RemoveAvatar)

	// Admin user management
	admin := app.Group("/api/admin/users", authMW, adminMW)
	admin.Get("/", h.ListUsers)
	admin.Post("/invite", h.InviteStudent)
	admin.Post("/invite/bulk", h.BulkInviteStudents)
	admin.Get("/:id", h.GetUser)
	admin.Post("/:id/block", h.BlockUser)
	admin.Post("/:id/unblock", h.UnblockUser)
	admin.Delete("/:id", h.DeleteUser)
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

type updateDisplayPreferenceRequest struct {
	SymbolDisplay string `json:"symbolDisplay"`
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
	if len(req.FirstName) > maxNameLen || len(req.LastName) > maxNameLen {
		return httputil.BadRequest(c, "first and last name must be at most 100 characters")
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
	if req.CurrentPassword == "" {
		return httputil.BadRequest(c, "current password is required")
	}
	if msg, ok := passwords.Validate(req.NewPassword); !ok {
		return httputil.BadRequest(c, msg)
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

	// Direct update for authenticated password change (not reset flow).
	// ResetPassword persists whatever string it's given verbatim into
	// password_hash, so the new password must be bcrypt-hashed here first —
	// passing plaintext would silently break subsequent bcrypt logins.
	hash, err := passwords.Hash(req.NewPassword)
	if err != nil {
		return httputil.InternalError(c)
	}
	if err := h.repo.ResetPassword(c.Context(), uid, hash); err != nil {
		return httputil.InternalError(c)
	}

	// Revoke all other sessions — forces re-login on other devices.
	_ = h.repo.RevokeAllUserTokens(c.Context(), uid)

	return c.JSON(fiber.Map{"message": "Password updated. Please log in again on other devices."})
}

// UpdateDisplayPreference godoc
// PUT /api/me/display-preference
// Body: { symbolDisplay: "ticker" | "name" }
func (h *Handler) UpdateDisplayPreference(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	uid, _ := uuid.Parse(claims.UserID)

	var req updateDisplayPreferenceRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	pref := SymbolDisplay(req.SymbolDisplay)
	if pref != SymbolDisplayTicker && pref != SymbolDisplayName {
		return httputil.BadRequest(c, "symbolDisplay must be 'ticker' or 'name'")
	}

	if err := h.repo.SetSymbolDisplay(c.Context(), uid, pref); err != nil {
		return httputil.InternalError(c)
	}

	u, err := h.repo.GetByID(c.Context(), uid)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(u.ToPublicProfile())
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
		log.Printf("[invite] email failed for %s: %v", req.Email, err)
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

// DeleteUser permanently removes a student account.
// DELETE /api/admin/users/:id
func (h *Handler) DeleteUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid user id")
	}
	u, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		return httputil.InternalError(c)
	}
	if u == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}
	if u.Role == RoleAdmin {
		return httputil.BadRequest(c, "cannot delete admin accounts")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httputil.InternalError(c)
	}
	return c.SendStatus(fiber.StatusNoContent)
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

	// Verify the actual file bytes, not just the client-supplied extension
	// (INPUT-02). Sniff the first 512 bytes and confirm a real raster-image
	// signature, so a non-image payload can't be stored under an image name.
	if !hasImageSignature(file) {
		return httputil.BadRequest(c, "file content is not a valid image")
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

	avatarURL := h.basePath + "/uploads/avatars/" + filename
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

	avatarURL := h.basePath + "/avatars/" + req.Preset + ".svg"
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

// hasImageSignature opens the uploaded file, reads the first 512 bytes, and
// confirms they sniff to a raster image content type (INPUT-02).
func hasImageSignature(fh *multipart.FileHeader) bool {
	f, err := fh.Open()
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	ct := http.DetectContentType(buf[:n])
	switch ct {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		return true
	default:
		return false
	}
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

