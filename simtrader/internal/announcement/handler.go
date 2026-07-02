// internal/announcement/handler.go

package announcement

import (
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
)

const (
	maxSubjectLen = 200
	maxHeadingLen = 150
	maxBodyLen    = 5000
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the admin announcement endpoints.
func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	admin := app.Group("/api/admin/announcements", authMW, adminMW)
	admin.Get("/", h.List)
	admin.Post("/", h.Create)
}

type createRequest struct {
	Subject        string   `json:"subject"`
	Heading        string   `json:"heading"`
	Body           string   `json:"body"`
	ExcludeUserIDs []string `json:"excludeUserIds"`
}

// Create godoc
// POST /api/admin/announcements
// Body: { subject, heading, body }
// Logs the announcement and sends it to every active student in the
// background; responds immediately once the recipient list is resolved.
func (h *Handler) Create(c *fiber.Ctx) error {
	var req createRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	req.Subject = strings.TrimSpace(req.Subject)
	req.Heading = strings.TrimSpace(req.Heading)
	req.Body = strings.TrimSpace(req.Body)

	if req.Subject == "" || req.Heading == "" || req.Body == "" {
		return httputil.BadRequest(c, "subject, heading and body are required")
	}
	if len(req.Subject) > maxSubjectLen || len(req.Heading) > maxHeadingLen || len(req.Body) > maxBodyLen {
		return httputil.BadRequest(c, "subject, heading or body exceeds the maximum length")
	}
	// Reject control characters in the subject to prevent header injection
	// into the raw "Subject: %s\r\n" write in auth.SMTPMailer.send.
	if strings.ContainsAny(req.Subject, "\r\n") {
		return httputil.BadRequest(c, "subject cannot contain line breaks")
	}

	claims := middleware.GetClaims(c)
	adminID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return httputil.InternalError(c)
	}

	excludeIDs := make([]uuid.UUID, 0, len(req.ExcludeUserIDs))
	for _, raw := range req.ExcludeUserIDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			return httputil.BadRequest(c, "invalid excluded user id")
		}
		excludeIDs = append(excludeIDs, id)
	}

	a, err := h.svc.CreateAndSend(c.Context(), adminID, req.Subject, req.Heading, req.Body, excludeIDs)
	if err != nil {
		log.Printf("[announcement] create failed: %v", err)
		return httputil.BadRequest(c, "Could not send announcement: "+err.Error())
	}

	return c.Status(fiber.StatusAccepted).JSON(a)
}

// List godoc
// GET /api/admin/announcements
func (h *Handler) List(c *fiber.Ctx) error {
	items, err := h.svc.List(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"announcements": items, "total": len(items)})
}
