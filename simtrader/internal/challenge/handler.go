// internal/challenge/handler.go
//
// HTTP handlers for the Challenge feature.
// Challenges are semester-long paper-trading competitions backed by live
// PSX EOD data from psx_tracker. Orders fill nightly via the reconciler.

package challenge

import (
	"context"
	"crypto/subtle"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/types"
)

// reDateYMD matches a strict YYYY-MM-DD calendar date. Shared with the date
// validation on the internal EOD ingest endpoint (INPUT-04).
var reDateYMD = regexp.MustCompile(`^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$`)

// reSymbol bounds a PSX ticker to letters, digits and a few separators,
// max 12 chars — used to normalise/validate order symbols (INPUT-03).
var reSymbol = regexp.MustCompile(`^[A-Z0-9.\-]{1,12}$`)

// maxAccessGrantBatch bounds a single grant request so a malformed or hostile
// payload cannot open an unbounded transaction.
const maxAccessGrantBatch = 500

// noAccessMsg is the 403 shown to a student for a challenge they have not been
// granted access to — the frontend renders it as a locked card.
const noAccessMsg = "no access \u2014 your instructor must grant you access to this challenge"

// lastInitial returns the uppercased first rune of a (possibly empty) last
// name, or "" when there is none — avoids an out-of-range rune slice (INPUT-01).
func lastInitial(lastName string) string {
	for _, r := range strings.TrimSpace(lastName) {
		return strings.ToUpper(string(r))
	}
	return ""
}

// ── Domain types ─────────────────────────────────────────────────────────────

type Challenge struct {
	ID             uuid.UUID `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	StartDate      string    `json:"startDate"`
	EndDate        string    `json:"endDate"`
	InitialCapital float64   `json:"initialCapital"`
	Status         string    `json:"status"`
	CreatedBy      uuid.UUID `json:"createdBy"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Participant struct {
	ID          uuid.UUID `json:"id"`
	ChallengeID uuid.UUID `json:"challengeId"`
	UserID      uuid.UUID `json:"userId"`
	CashBalance float64   `json:"cashBalance"`
	JoinedAt    time.Time `json:"joinedAt"`
}

type ChallengeOrder struct {
	ID            uuid.UUID  `json:"id"`
	ChallengeID   uuid.UUID  `json:"challengeId"`
	ParticipantID uuid.UUID  `json:"participantId"`
	Symbol        string     `json:"symbol"`
	Side          string     `json:"side"`
	OrderType     string     `json:"orderType"`
	Quantity      int        `json:"quantity"`
	LimitPrice    *float64   `json:"limitPrice"`
	Status        string     `json:"status"`
	FillPrice     *float64   `json:"fillPrice"`
	FillDate      *string    `json:"fillDate"`
	RejectReason  *string    `json:"rejectReason,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

type ChallengePosition struct {
	ID            uuid.UUID `json:"id"`
	ChallengeID   uuid.UUID `json:"challengeId"`
	ParticipantID uuid.UUID `json:"participantId"`
	Symbol        string    `json:"symbol"`
	Quantity      int       `json:"quantity"`
	AvgCost       float64   `json:"avgCost"`
}

type Snapshot struct {
	ID             uuid.UUID `json:"id"`
	ChallengeID    uuid.UUID `json:"challengeId"`
	ParticipantID  uuid.UUID `json:"participantId"`
	Date           string    `json:"date"`
	PortfolioValue float64   `json:"portfolioValue"`
	CashBalance    float64   `json:"cashBalance"`
}

type EODPrice struct {
	Symbol string  `json:"symbol"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume int64   `json:"volume"`
}

// Security is a ticker -> company name mapping, scraped from PSX's own
// symbols directory by psx_tracker.
type Security struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
	Sector string `json:"sector,omitempty"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

type Handler struct {
	repo        *Repository
	reconciler  *Reconciler
	internalKey string
}

func NewHandler(repo *Repository, reconciler *Reconciler, internalKey string) *Handler {
	return &Handler{repo: repo, reconciler: reconciler, internalKey: internalKey}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW, internalLimiter fiber.Handler) {
	// Internal — psx_tracker webhook (no JWT, shared secret header).
	// Rate-limited because it is reachable through the public nginx proxy (NET-01).
	app.Post("/api/internal/eod-prices", internalLimiter, h.IngestEODPrices)
	app.Post("/api/internal/securities", internalLimiter, h.IngestSecurities)

	// EOD chart data — auth required, not challenge-specific
	eod := app.Group("/api/eod", authMW)
	eod.Get("/symbols",  h.EODSymbols)
	eod.Get("/:symbol",  h.EODHistory)

	// Ticker -> company name lookup — auth required, not challenge-specific
	app.Get("/api/securities", authMW, h.ListSecurities)

	// Admin routes
	adm := app.Group("/api/admin/challenges", authMW, adminMW)
	adm.Post("/",                       h.AdminCreate)
	adm.Get("/",                        h.AdminList)
	adm.Get("/:id",                     h.AdminGet)
	adm.Put("/:id",                     h.AdminUpdate)
	adm.Post("/:id/activate",           h.AdminActivate)
	adm.Post("/:id/complete",           h.AdminComplete)
	adm.Post("/:id/enroll-all",         h.AdminEnrollAll)
	adm.Post("/:id/reconcile",          h.AdminReconcile)
	adm.Get("/:id/leaderboard",         h.AdminLeaderboard)
	adm.Get("/:id/access",              h.AdminListAccess)
	adm.Post("/:id/access",             h.AdminGrantAccess)
	adm.Delete("/:id/access/:uid",      h.AdminRevokeAccess)
	adm.Get("/:id/participants/:pid/orders", h.AdminParticipantOrders)

	// Student routes
	stu := app.Group("/api/challenges", authMW)
	stu.Get("/",                         h.StudentList)
	stu.Get("/:id",                      h.StudentGet)
	stu.Post("/:id/join",                h.StudentJoin)
	stu.Get("/:id/portfolio",            h.StudentPortfolio)
	stu.Get("/:id/portfolio/history",    h.StudentPortfolioHistory)
	stu.Post("/:id/orders",              h.StudentPlaceOrder)
	stu.Get("/:id/orders",               h.StudentListOrders)
	stu.Post("/:id/orders/:oid/cancel",  h.StudentCancelOrder)
	stu.Get("/:id/leaderboard",          h.StudentLeaderboard)
	stu.Get("/:id/dividends",            h.StudentDividends)
}

// ── Internal ──────────────────────────────────────────────────────────────────

func (h *Handler) IngestEODPrices(c *fiber.Ctx) error {
	if subtle.ConstantTimeCompare([]byte(c.Get("X-Internal-Secret")), []byte(h.internalKey)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		Date   string     `json:"date"`
		Prices []EODPrice `json:"prices"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	if req.Date == "" || len(req.Prices) == 0 {
		return httputil.BadRequest(c, "date and prices required")
	}
	// Validate the date shape before it is persisted / passed to the reconciler
	// so a malformed value fails fast with 400 rather than a Postgres cast error
	// (INPUT-04).
	if !reDateYMD.MatchString(req.Date) {
		return httputil.BadRequest(c, "date must be YYYY-MM-DD")
	}

	if err := h.repo.UpsertEODPrices(c.Context(), req.Date, req.Prices); err != nil {
		return httputil.InternalError(c)
	}

	// Trigger reconciliation for the ingested date in the background
	go h.reconciler.RunForDate(req.Date)

	return c.JSON(fiber.Map{"ingested": len(req.Prices), "date": req.Date})
}

// IngestSecurities godoc
// POST /api/internal/securities
// Body: { securities: [{symbol, name, sector}] }
// Called by psx_tracker after each ticker refresh — same shared-secret auth
// as the EOD price ingest above.
func (h *Handler) IngestSecurities(c *fiber.Ctx) error {
	if subtle.ConstantTimeCompare([]byte(c.Get("X-Internal-Secret")), []byte(h.internalKey)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		Securities []Security `json:"securities"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	if len(req.Securities) == 0 {
		return httputil.BadRequest(c, "securities required")
	}

	if err := h.repo.UpsertSecurities(c.Context(), req.Securities); err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(fiber.Map{"ingested": len(req.Securities)})
}

// ListSecurities godoc
// GET /api/securities
// Ticker -> company name lookup, used by the frontend's display preference.
func (h *Handler) ListSecurities(c *fiber.Ctx) error {
	securities, err := h.repo.ListSecurities(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	if securities == nil {
		securities = []Security{}
	}
	return c.JSON(fiber.Map{"securities": securities})
}

// ── Admin handlers ────────────────────────────────────────────────────────────

func (h *Handler) AdminCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req struct {
		Name           string  `json:"name"`
		Description    string  `json:"description"`
		StartDate      string  `json:"startDate"`
		EndDate        string  `json:"endDate"`
		InitialCapital float64 `json:"initialCapital"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	if req.Name == "" || req.StartDate == "" || req.EndDate == "" {
		return httputil.BadRequest(c, "name, startDate and endDate are required")
	}
	if len(req.Name) > 200 || len(req.Description) > 2000 {
		return httputil.BadRequest(c, "name must be ≤200 and description ≤2000 characters")
	}
	if req.InitialCapital <= 0 {
		req.InitialCapital = 100000
	}

	ch := &Challenge{
		ID:             uuid.New(),
		Name:           req.Name,
		Description:    req.Description,
		StartDate:      req.StartDate,
		EndDate:        req.EndDate,
		InitialCapital: req.InitialCapital,
		CreatedBy:      userID,
		CreatedAt:      time.Now(),
	}
	if err := h.repo.Insert(c.Context(), ch); err != nil {
		return httputil.InternalError(c)
	}
	return c.Status(fiber.StatusCreated).JSON(ch)
}

func (h *Handler) AdminList(c *fiber.Ctx) error {
	challenges, err := h.repo.ListAll(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	if challenges == nil {
		challenges = []Challenge{}
	}
	// Attach participant count
	type item struct {
		Challenge
		ParticipantCount int `json:"participantCount"`
	}
	out := make([]item, 0, len(challenges))
	for _, ch := range challenges {
		n, _ := h.repo.GetParticipantCount(c.Context(), ch.ID)
		out = append(out, item{Challenge: ch, ParticipantCount: n})
	}
	return c.JSON(fiber.Map{"challenges": out})
}

func (h *Handler) AdminGet(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	return c.JSON(ch)
}

func (h *Handler) AdminUpdate(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	var req struct {
		Name           string  `json:"name"`
		Description    string  `json:"description"`
		StartDate      string  `json:"startDate"`
		EndDate        string  `json:"endDate"`
		InitialCapital float64 `json:"initialCapital"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	if len(req.Name) > 200 || len(req.Description) > 2000 {
		return httputil.BadRequest(c, "name must be ≤200 and description ≤2000 characters")
	}
	if req.Name != "" {
		ch.Name = req.Name
	}
	ch.Description = req.Description
	if req.StartDate != "" {
		ch.StartDate = req.StartDate
	}
	if req.EndDate != "" {
		ch.EndDate = req.EndDate
	}
	if req.InitialCapital > 0 {
		ch.InitialCapital = req.InitialCapital
	}
	if err := h.repo.Update(c.Context(), ch); err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(ch)
}

func (h *Handler) AdminActivate(c *fiber.Ctx) error {
	return h.adminSetStatus(c, "active")
}

func (h *Handler) AdminComplete(c *fiber.Ctx) error {
	return h.adminSetStatus(c, "completed")
}

func (h *Handler) adminSetStatus(c *fiber.Ctx, status string) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	if err := h.repo.SetStatus(c.Context(), id, status); err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"status": status})
}

func (h *Handler) AdminEnrollAll(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	userIDs, err := h.repo.ListUngrantedUsers(c.Context(), id)
	if err != nil {
		return httputil.InternalError(c)
	}
	granted, err := h.repo.GrantAccessBulk(c.Context(), id, userIDs, adminID(c), ch.InitialCapital)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"enrolled": granted})
}

func (h *Handler) AdminReconcile(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	date := c.Query("date", time.Now().Format("2006-01-02"))
	filled, payouts, err := h.reconciler.RunForChallenge(c.Context(), id, date)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"filled": filled, "payoutsApplied": payouts, "date": date})
}

func (h *Handler) AdminLeaderboard(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	board, err := h.buildLeaderboard(c.Context(), id, ch.InitialCapital, false)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"leaderboard": board})
}

// AdminParticipantOrders lets an admin drill into a single enrolled student's
// own order/decision ledger for a challenge — the admin equivalent of
// StudentListOrders, but keyed by an arbitrary participant ID instead of the
// caller's own JWT identity.
func (h *Handler) AdminParticipantOrders(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	pid, err := uuid.Parse(c.Params("pid"))
	if err != nil {
		return httputil.BadRequest(c, "invalid participant id")
	}
	p, err := h.repo.GetParticipantByID(c.Context(), pid)
	if err != nil || p == nil || p.ChallengeID != id {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "participant not found"})
	}
	orders, err := h.repo.ListOrders(c.Context(), pid)
	if err != nil {
		return httputil.InternalError(c)
	}
	if orders == nil {
		orders = []ChallengeOrder{}
	}
	return c.JSON(fiber.Map{"orders": orders})
}

// ── Admin access control ───────────────────────────────
//
// A challenge is locked by default. Granting access unlocks it for a student
// and enrols them in the same step; revoking locks them out but keeps their
// portfolio, orders and leaderboard placement (see Repository.RevokeAccess).

// adminID returns the calling admin's user id, or uuid.Nil if it cannot be
// parsed — granted_by is nullable, so an unparseable id is not fatal.
func adminID(c *fiber.Ctx) uuid.UUID {
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

// AdminListAccess godoc
// GET /api/admin/challenges/:id/access
// Every non-blocked student with their granted/joined state for this challenge.
func (h *Handler) AdminListAccess(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	roster, err := h.repo.ListAccessRoster(c.Context(), id)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"roster": roster})
}

// AdminGrantAccess godoc
// POST /api/admin/challenges/:id/access
// Body: { userIds: [uuid, ...] } — grants access and enrols each student.
func (h *Handler) AdminGrantAccess(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}

	var req struct {
		UserIDs []string `json:"userIds"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	if len(req.UserIDs) == 0 {
		return httputil.BadRequest(c, "userIds is required")
	}
	if len(req.UserIDs) > maxAccessGrantBatch {
		return httputil.BadRequest(c, "too many users in one request")
	}

	ids := make([]uuid.UUID, 0, len(req.UserIDs))
	for _, raw := range req.UserIDs {
		uid, err := uuid.Parse(raw)
		if err != nil {
			return httputil.BadRequest(c, "invalid user id: "+raw)
		}
		ids = append(ids, uid)
	}

	granted, err := h.repo.GrantAccessBulk(c.Context(), id, ids, adminID(c), ch.InitialCapital)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"granted": granted})
}

// AdminRevokeAccess godoc
// DELETE /api/admin/challenges/:id/access/:uid
// Locks the student out. Their participant row and history are preserved, so
// re-granting restores the portfolio exactly as it was.
func (h *Handler) AdminRevokeAccess(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	uid, err := uuid.Parse(c.Params("uid"))
	if err != nil {
		return httputil.BadRequest(c, "invalid user id")
	}
	if err := h.repo.RevokeAccess(c.Context(), id, uid); err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"revoked": true})
}

// ── Student handlers ──────────────────────────────────────────────────────────

// requireAccess resolves the caller's participant row for a challenge. It is
// the single gate every challenge-scoped student endpoint goes through:
// students without an access grant are refused even when a participant row
// still exists from an earlier grant (revoke keeps that row deliberately).
// Admins bypass the access check so admin tooling reusing these routes keeps
// working. A nil participant means the caller has already been answered (403
// or 500) — note the fiber response helpers return nil on a successful write,
// so the participant, not the error, is what says whether to continue.
func (h *Handler) requireAccess(c *fiber.Ctx, challengeID, userID uuid.UUID) (*Participant, error) {
	claims := middleware.GetClaims(c)
	if claims == nil || claims.Role != types.RoleAdmin {
		ok, err := h.repo.HasAccess(c.Context(), challengeID, userID)
		if err != nil {
			return nil, httputil.InternalError(c)
		}
		if !ok {
			return nil, c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": noAccessMsg})
		}
	}
	p, err := h.repo.GetParticipant(c.Context(), challengeID, userID)
	if err != nil {
		return nil, httputil.InternalError(c)
	}
	if p == nil {
		return nil, c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not enrolled"})
	}
	return p, nil
}


func (h *Handler) StudentList(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	challenges, err := h.repo.ListActive(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	if challenges == nil {
		challenges = []Challenge{}
	}

	// One query for the caller's whole access set, rather than a per-challenge
	// lookup. Locked challenges are still returned — the student sees them as
	// a locked card, not a hole in the list.
	access, err := h.repo.ListAccessibleChallengeIDs(c.Context(), userID)
	if err != nil {
		return httputil.InternalError(c)
	}
	isAdmin := claims != nil && claims.Role == types.RoleAdmin

	type item struct {
		Challenge
		ParticipantCount int  `json:"participantCount"`
		Joined           bool `json:"joined"`
		HasAccess        bool `json:"hasAccess"`
	}
	out := make([]item, 0, len(challenges))
	for _, ch := range challenges {
		n, _ := h.repo.GetParticipantCount(c.Context(), ch.ID)
		p, _ := h.repo.GetParticipant(c.Context(), ch.ID, userID)
		out = append(out, item{
			Challenge:        ch,
			ParticipantCount: n,
			Joined:           p != nil,
			HasAccess:        isAdmin || access[ch.ID],
		})
	}
	return c.JSON(fiber.Map{"challenges": out})
}

func (h *Handler) StudentGet(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	// Metadata is returned even without access so the detail page can render a
	// locked state; no participant data is included.
	hasAccess, err := h.repo.HasAccess(c.Context(), id, userID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if claims != nil && claims.Role == types.RoleAdmin {
		hasAccess = true
	}
	p, _ := h.repo.GetParticipant(c.Context(), id, userID)
	return c.JSON(fiber.Map{"challenge": ch, "joined": p != nil, "hasAccess": hasAccess})
}

func (h *Handler) StudentJoin(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	if ch.Status != "active" {
		return httputil.BadRequest(c, "challenge is not active")
	}
	// Granting access already enrols the student, so this path is a defensive
	// fallback rather than the normal flow — but it must not become a way
	// around the access list.
	hasAccess, err := h.repo.HasAccess(c.Context(), id, userID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if !hasAccess {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": noAccessMsg})
	}
	p, err := h.repo.JoinChallenge(c.Context(), id, userID, ch.InitialCapital)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.Status(fiber.StatusCreated).JSON(p)
}

func (h *Handler) StudentPortfolio(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}
	positions, err := h.repo.GetPositions(c.Context(), p.ID)
	if err != nil {
		return httputil.InternalError(c)
	}

	// Get latest prices for held symbols
	symbols := make([]string, 0, len(positions))
	for _, pos := range positions {
		symbols = append(symbols, pos.Symbol)
	}
	prices, err := h.repo.GetLatestPrices(c.Context(), symbols)
	if err != nil {
		return httputil.InternalError(c)
	}

	type positionView struct {
		ChallengePosition
		CurrentPrice   float64 `json:"currentPrice"`
		MarketValue    float64 `json:"marketValue"`
		UnrealizedPnL  float64 `json:"unrealizedPnL"`
		UnrealizedPnLPct float64 `json:"unrealizedPnLPct"`
	}

	var totalMV float64
	posViews := make([]positionView, 0, len(positions))
	for _, pos := range positions {
		price := prices[pos.Symbol]
		if price == 0 {
			price = pos.AvgCost // fallback if no EOD data yet
		}
		mv := float64(pos.Quantity) * price
		pnl := mv - float64(pos.Quantity)*pos.AvgCost
		pnlPct := 0.0
		if pos.AvgCost > 0 {
			pnlPct = (price - pos.AvgCost) / pos.AvgCost * 100
		}
		totalMV += mv
		posViews = append(posViews, positionView{
			ChallengePosition: pos,
			CurrentPrice:      price,
			MarketValue:       mv,
			UnrealizedPnL:     pnl,
			UnrealizedPnLPct:  pnlPct,
		})
	}

	totalValue := totalMV + p.CashBalance
	returnPct := (totalValue - ch.InitialCapital) / ch.InitialCapital * 100

	return c.JSON(fiber.Map{
		"cashBalance":    p.CashBalance,
		"marketValue":    totalMV,
		"totalValue":     totalValue,
		"initialCapital": ch.InitialCapital,
		"returnPct":      returnPct,
		"positions":      posViews,
	})
}

func (h *Handler) StudentPortfolioHistory(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}
	snaps, err := h.repo.GetSnapshots(c.Context(), p.ID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if snaps == nil {
		snaps = []Snapshot{}
	}
	return c.JSON(fiber.Map{"history": snaps})
}

func (h *Handler) StudentPlaceOrder(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	if ch.Status != "active" {
		return httputil.BadRequest(c, "challenge is not active")
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}

	var req struct {
		Symbol     string   `json:"symbol"`
		Side       string   `json:"side"`
		OrderType  string   `json:"orderType"`
		Quantity   int      `json:"quantity"`
		LimitPrice *float64 `json:"limitPrice"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid body")
	}
	// Normalise and validate the symbol (INPUT-03): uppercase, trimmed, bounded.
	req.Symbol = strings.ToUpper(strings.TrimSpace(req.Symbol))
	if req.Symbol == "" || req.Side == "" || req.Quantity <= 0 {
		return httputil.BadRequest(c, "symbol, side and quantity are required")
	}
	if !reSymbol.MatchString(req.Symbol) {
		return httputil.BadRequest(c, "invalid symbol")
	}
	// Reject symbols we have no market data for, but only once EOD data exists —
	// before the first ingest the known-symbol set is empty and we cannot judge.
	if known, err := h.repo.GetEODSymbols(c.Context()); err == nil && len(known) > 0 {
		valid := false
		for _, s := range known {
			if s == req.Symbol {
				valid = true
				break
			}
		}
		if !valid {
			return httputil.BadRequest(c, "unknown symbol — no market data available")
		}
	}
	if req.Side != "buy" && req.Side != "sell" {
		return httputil.BadRequest(c, "side must be buy or sell")
	}
	if req.OrderType == "" {
		req.OrderType = "market"
	}
	if req.OrderType != "market" && req.OrderType != "limit" {
		return httputil.BadRequest(c, "orderType must be market or limit")
	}
	if req.OrderType == "limit" && (req.LimitPrice == nil || *req.LimitPrice <= 0) {
		return httputil.BadRequest(c, "limitPrice required for limit orders")
	}

	// For buy orders: check estimated cost against cash balance
	if req.Side == "buy" {
		var estPrice float64
		if req.LimitPrice != nil {
			estPrice = *req.LimitPrice
		} else {
			// Try to get latest price
			prices, _ := h.repo.GetLatestPrices(c.Context(), []string{req.Symbol})
			estPrice = prices[req.Symbol]
		}
		if estPrice > 0 {
			cost := float64(req.Quantity) * estPrice
			if cost > p.CashBalance {
				return httputil.BadRequest(c, "insufficient cash balance")
			}
		}
	}

	// For sell orders: check positions
	if req.Side == "sell" {
		positions, _ := h.repo.GetPositions(c.Context(), p.ID)
		held := 0
		for _, pos := range positions {
			if pos.Symbol == req.Symbol {
				held = pos.Quantity
				break
			}
		}
		if req.Quantity > held {
			return httputil.BadRequest(c, "insufficient shares to sell")
		}
	}

	order := &ChallengeOrder{
		ID:            uuid.New(),
		ChallengeID:   id,
		ParticipantID: p.ID,
		Symbol:        req.Symbol,
		Side:          req.Side,
		OrderType:     req.OrderType,
		Quantity:      req.Quantity,
		LimitPrice:    req.LimitPrice,
		CreatedAt:     time.Now(),
	}
	if err := h.repo.InsertOrder(c.Context(), order); err != nil {
		return httputil.InternalError(c)
	}
	return c.Status(fiber.StatusCreated).JSON(order)
}

func (h *Handler) StudentListOrders(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}
	orders, err := h.repo.ListOrders(c.Context(), p.ID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if orders == nil {
		orders = []ChallengeOrder{}
	}
	return c.JSON(fiber.Map{"orders": orders})
}

func (h *Handler) StudentCancelOrder(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	oid, err := uuid.Parse(c.Params("oid"))
	if err != nil {
		return httputil.BadRequest(c, "invalid order id")
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}
	if err := h.repo.CancelOrder(c.Context(), oid, p.ID); err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "order not found or already processed"})
		}
		return httputil.InternalError(c)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// StudentDividends godoc
// GET /api/challenges/:id/dividends
// The participant's applied dividend/bonus payouts, newest first.
func (h *Handler) StudentDividends(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	p, respErr := h.requireAccess(c, id, userID)
	if p == nil {
		return respErr
	}
	dividends, err := h.repo.ListDividends(c.Context(), p.ID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if dividends == nil {
		dividends = []DividendRecord{}
	}
	return c.JSON(fiber.Map{"dividends": dividends})
}

func (h *Handler) StudentLeaderboard(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	// Ensure student role — admin gets full names via their endpoint
	if claims.Role != types.RoleStudent {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid id")
	}
	ch, err := h.repo.GetByID(c.Context(), id)
	if err != nil || ch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
	}
	userID, _ := uuid.Parse(claims.UserID)
	hasAccess, err := h.repo.HasAccess(c.Context(), id, userID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if !hasAccess {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": noAccessMsg})
	}
	board, err := h.buildLeaderboard(c.Context(), id, ch.InitialCapital, true /* anonymize */)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"leaderboard": board})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type leaderboardEntry struct {
	Rank           int     `json:"rank"`
	ParticipantID  string  `json:"participantId"`
	DisplayName    string  `json:"displayName"`
	Email          string  `json:"email,omitempty"` // omitted when anonymized
	CashBalance    float64 `json:"cashBalance"`
	PortfolioValue float64 `json:"portfolioValue"`
	ReturnPct      float64 `json:"returnPct"`
}

func (h *Handler) buildLeaderboard(ctx context.Context, challengeID uuid.UUID, initialCapital float64, anonymize bool) ([]leaderboardEntry, error) {
	rows, err := h.repo.GetLeaderboardRows(ctx, challengeID)
	if err != nil {
		return nil, err
	}

	// Collect all participant IDs and their symbols
	type participantInfo struct {
		row       LeaderboardRow
		positions []ChallengePosition
	}
	infos := make([]participantInfo, 0, len(rows))
	allSymbols := map[string]struct{}{}

	for _, row := range rows {
		positions, _ := h.repo.GetPositions(ctx, row.ParticipantID)
		for _, pos := range positions {
			allSymbols[pos.Symbol] = struct{}{}
		}
		infos = append(infos, participantInfo{row: row, positions: positions})
	}

	// Fetch latest prices for all symbols once
	syms := make([]string, 0, len(allSymbols))
	for s := range allSymbols {
		syms = append(syms, s)
	}
	prices, err := h.repo.GetLatestPrices(ctx, syms)
	if err != nil {
		return nil, err
	}

	entries := make([]leaderboardEntry, 0, len(infos))
	for i, info := range infos {
		var mv float64
		for _, pos := range info.positions {
			price := prices[pos.Symbol]
			if price == 0 {
				price = pos.AvgCost
			}
			mv += float64(pos.Quantity) * price
		}
		total := mv + info.row.CashBalance
		ret := (total - initialCapital) / initialCapital * 100

		// Anonymized student view: "First L." — guard against an empty last
		// name, which would otherwise panic on the rune slice (INPUT-01).
		displayName := info.row.FirstName
		if li := lastInitial(info.row.LastName); li != "" {
			displayName += " " + li + "."
		}

		e := leaderboardEntry{
			ParticipantID:  info.row.ParticipantID.String(),
			DisplayName:    displayName,
			CashBalance:    info.row.CashBalance,
			PortfolioValue: total,
			ReturnPct:      ret,
		}
		if !anonymize {
			e.DisplayName = info.row.FirstName + " " + info.row.LastName
			e.Email = info.row.Email
		}
		_ = i
		entries = append(entries, e)
	}

	// Sort by portfolio value descending
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].PortfolioValue > entries[j].PortfolioValue
	})
	for i := range entries {
		entries[i].Rank = i + 1
	}

	return entries, nil
}

// ── EOD chart endpoints ───────────────────────────────────────────────────────

func (h *Handler) EODSymbols(c *fiber.Ctx) error {
	syms, err := h.repo.GetEODSymbols(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	if syms == nil {
		syms = []string{}
	}
	return c.JSON(fiber.Map{"symbols": syms})
}

func (h *Handler) EODHistory(c *fiber.Ctx) error {
	symbol := c.Params("symbol")
	if symbol == "" {
		return httputil.BadRequest(c, "symbol required")
	}
	bars, err := h.repo.GetEODHistory(c.Context(), symbol)
	if err != nil {
		return httputil.InternalError(c)
	}
	if bars == nil {
		bars = []EODBar{}
	}
	return c.JSON(fiber.Map{"bars": bars})
}
