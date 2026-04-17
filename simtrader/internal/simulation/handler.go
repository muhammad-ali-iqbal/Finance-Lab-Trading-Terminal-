// internal/simulation/handler.go

package simulation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/types"
)

type Handler struct {
	repo        *Repository
	orderEngine types.OrderFiller
	authParser  middleware.TokenParser
}

func NewHandler(repo *Repository, orderEngine types.OrderFiller, authParser middleware.TokenParser) *Handler {
	return &Handler{repo: repo, orderEngine: orderEngine, authParser: authParser}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	// WebSocket — MUST be registered before the auth group.
	// Auth is handled via ?token= query param, NOT Bearer header.
	// If registered after the group, Fiber's group middleware blocks
	// the upgrade with 401 before the handler ever runs.
	app.Get("/api/simulations/:id/ws", h.WebSocketHandler)

	// Public (authenticated students + admins)
	sims := app.Group("/api/simulations", authMW)
	sims.Get("/", h.ListSimulations)
	sims.Get("/active", h.GetActiveSimulation)
	sims.Get("/:id", h.GetSimulation)
	sims.Get("/:id/symbols", h.GetSymbols)
	sims.Get("/:id/ticks/:symbol", h.GetTickHistory)
	sims.Get("/:id/progress", h.GetProgress) // timer + progress for all users

	// Admin only
	admin := app.Group("/api/admin/simulations", authMW, adminMW)
	admin.Post("/", h.CreateSimulation)
	admin.Put("/:id", h.UpdateSimulation)
	admin.Delete("/:id", h.DeleteSimulation)
	admin.Post("/:id/upload", h.UploadCSV)
	admin.Put("/:id/upload", h.ReuploadCSV)
	admin.Post("/:id/start", h.StartSimulation)
	admin.Post("/:id/pause", h.PauseSimulation)
	admin.Post("/:id/resume", h.ResumeSimulation)
	admin.Post("/:id/complete", h.CompleteSimulation)
	admin.Post("/:id/restart", h.RestartSimulation) // reset clock to beginning
}

// ── Student endpoints ─────────────────────────────────────────────────────────

func (h *Handler) ListSimulations(c *fiber.Ctx) error {
	sims, err := h.repo.List(c.Context())
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"simulations": sims})
}

func (h *Handler) GetActiveSimulation(c *fiber.Ctx) error {
	sim, err := h.repo.GetActive(c.Context())
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "No active simulation. Your instructor hasn't started one yet.",
			})
		}
		return httputil.InternalError(c)
	}
	return c.JSON(sim)
}

func (h *Handler) GetSimulation(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}
	sim, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
		}
		return httputil.InternalError(c)
	}
	return c.JSON(sim)
}

func (h *Handler) GetSymbols(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}
	symbols, err := h.repo.GetSymbols(c.Context(), id)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"symbols": symbols})
}

func (h *Handler) GetTickHistory(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}
	symbol := c.Params("symbol")
	ticks, err := h.repo.GetTicksForSymbol(c.Context(), id, symbol)
	if err != nil {
		return httputil.InternalError(c)
	}
	return c.JSON(fiber.Map{"ticks": ticks})
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

// WebSocketHandler upgrades the HTTP connection to WebSocket and registers the
// client with the simulation clock. The clock then pushes ticks to the client.
//
// Authentication: token is passed as ?token=<accessToken> query param
// because browsers can't set Authorization headers on WebSocket connections.
func (h *Handler) WebSocketHandler(c *fiber.Ctx) error {
	// Extract and validate token from query param
	token := c.Query("token")
	if token == "" {
		return c.Status(fiber.StatusUnauthorized).SendString("missing token")
	}

	claims, err := h.authParser.ParseAccessToken(token)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).SendString("invalid or expired token")
	}

	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).SendString("invalid simulation ID")
	}

	userID, _ := uuid.Parse(claims.UserID)

	// Register with the clock
	clock, ok := Registry.Get(simID)
	if !ok {
		return c.Status(fiber.StatusNotFound).SendString("simulation not running")
	}

	// Use Fiber's websocket handler (wraps fasthttp properly)
	return websocket.New(func(conn *websocket.Conn) {
		client := &Client{
			id:   userID,
			conn: conn,
			send: make(chan []byte, 32),
		}

		clock.AddClient(client)
		defer clock.RemoveClient(client)

		log.Printf("[ws] user=%s connected to sim=%s", userID, simID)

		// Write loop — sends queued messages
		go func() {
			for {
				msg, ok := <-client.send
				if !ok {
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					log.Printf("[ws] write error user=%s: %v", userID, err)
					return
				}
			}
		}()

		// Read loop — keep connection alive
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				log.Printf("[ws] user=%s disconnected", userID)
				return
			}
		}
	})(c)
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

type createSimRequest struct {
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	SpeedMultiplier float64 `json:"speedMultiplier"`
	StartingCash    float64 `json:"startingCash"`
}

func (h *Handler) CreateSimulation(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	createdBy, _ := uuid.Parse(claims.UserID)

	var req createSimRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}
	if req.Name == "" {
		return httputil.BadRequest(c, "name is required")
	}
	if req.SpeedMultiplier <= 0 {
		req.SpeedMultiplier = 60.0 // default: 1 wall second = 1 sim minute
	}
	if req.StartingCash <= 0 {
		req.StartingCash = 100_000.00 // default: PKR 100,000
	}

	sim := &Simulation{
		ID:              uuid.New(),
		Name:            req.Name,
		Description:     req.Description,
		SpeedMultiplier: req.SpeedMultiplier,
		StartingCash:    req.StartingCash,
		CreatedBy:       createdBy,
	}

	if err := h.repo.Create(c.Context(), sim); err != nil {
		return httputil.InternalError(c)
	}

	return c.Status(fiber.StatusCreated).JSON(sim)
}

// UploadCSV accepts a multipart file upload and ingests it into price_ticks.
// The simulation must be in 'draft' status.
func (h *Handler) UploadCSV(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status != StatusDraft {
		return httputil.BadRequest(c, "can only upload CSV to a simulation in draft status")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return httputil.BadRequest(c, "file is required (field name: 'file')")
	}
	if file.Size > 50*1024*1024 { // 50MB max
		return httputil.BadRequest(c, "file too large (max 50MB)")
	}

	f, err := file.Open()
	if err != nil {
		return httputil.InternalError(c)
	}
	defer f.Close()

	count, err := h.repo.IngestCSV(c.Context(), simID, f)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": fmt.Sprintf("CSV ingestion failed: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"message":    "CSV uploaded and ingested successfully.",
		"rowsLoaded": count,
	})
}

// UpdateSimulation allows admin to rename or update description.
// Only allowed when simulation is in draft status.
func (h *Handler) UpdateSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status != StatusDraft {
		return httputil.BadRequest(c, "can only edit a simulation in draft status")
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	if req.Name != nil {
		if err := h.repo.UpdateName(c.Context(), simID, *req.Name); err != nil {
			return httputil.InternalError(c)
		}
	}
	if req.Description != nil {
		if err := h.repo.UpdateDescription(c.Context(), simID, *req.Description); err != nil {
			return httputil.InternalError(c)
		}
	}

	return c.JSON(fiber.Map{"message": "Simulation updated."})
}

// DeleteSimulation permanently removes a simulation and all associated data.
// Only allowed when simulation is NOT active.
func (h *Handler) DeleteSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status == StatusActive {
		return httputil.BadRequest(c, "cannot delete an active simulation. Pause it first.")
	}

	if err := h.repo.Delete(c.Context(), simID); err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(fiber.Map{"message": "Simulation deleted."})
}

// ReuploadCSV replaces existing price data with a new CSV upload.
// Allowed for draft, paused, or completed simulations (not active).
func (h *Handler) ReuploadCSV(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status == StatusActive {
		return httputil.BadRequest(c, "cannot replace CSV data while simulation is running. Pause it first.")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return httputil.BadRequest(c, "file is required (field name: 'file')")
	}
	if file.Size > 50*1024*1024 { // 50MB max
		return httputil.BadRequest(c, "file too large (max 50MB)")
	}

	f, err := file.Open()
	if err != nil {
		return httputil.InternalError(c)
	}
	defer f.Close()

	count, err := h.repo.IngestCSV(c.Context(), simID, f)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": fmt.Sprintf("CSV ingestion failed: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"message":    "CSV data replaced successfully.",
		"rowsLoaded": count,
	})
}

func (h *Handler) StartSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status != StatusDraft && sim.Status != StatusPaused {
		return httputil.BadRequest(c, "simulation must be in draft or paused status to start")
	}

	// Check no other simulation is currently active
	active, err := h.repo.GetActive(c.Context())
	if err == nil && active != nil && active.ID != simID {
		return httputil.BadRequest(c, "another simulation is already active. Complete or pause it first.")
	}

	// Mark active in DB
	if err := h.repo.UpdateStatus(c.Context(), simID, StatusActive); err != nil {
		return httputil.InternalError(c)
	}

	// Create and start the clock
	clock := NewClock(simID, h.repo, h.orderEngine)
	if err := clock.Start(context.Background()); err != nil {
		// Roll back status
		_ = h.repo.UpdateStatus(c.Context(), simID, StatusDraft)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to start clock: %v", err),
		})
	}

	// Register globally so WebSocket handler can find it
	Registry.Register(simID, clock)

	return c.JSON(fiber.Map{"message": "Simulation started.", "simulationId": simID})
}

func (h *Handler) PauseSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	if clock, ok := Registry.Get(simID); ok {
		clock.Stop()
		Registry.Remove(simID)
	}

	if err := h.repo.UpdateStatus(c.Context(), simID, StatusPaused); err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(fiber.Map{"message": "Simulation paused."})
}

func (h *Handler) ResumeSimulation(c *fiber.Ctx) error {
	// Resume is the same as Start — the clock reads current_sim_time from DB
	return h.StartSimulation(c)
}

func (h *Handler) CompleteSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	if clock, ok := Registry.Get(simID); ok {
		clock.Stop()
		Registry.Remove(simID)
	}

	if err := h.repo.UpdateStatus(c.Context(), simID, StatusCompleted); err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(fiber.Map{"message": "Simulation marked as completed."})
}

// GetProgress godoc
// GET /api/simulations/:id/progress
// Returns timing info for the simulation timer on both admin and student views.
// Accessible to all authenticated users.
func (h *Handler) GetProgress(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
		}
		return httputil.InternalError(c)
	}

	firstTime, err := h.repo.GetFirstSimTime(c.Context(), simID)
	if err != nil || firstTime == nil {
		// No data uploaded yet
		return c.JSON(fiber.Map{
			"status":          sim.Status,
			"hasData":         false,
			"progressPct":     0,
			"currentSimTime":  nil,
			"firstSimTime":    nil,
			"lastSimTime":     nil,
			"elapsedMinutes":  0,
			"totalMinutes":    0,
			"remainingMinutes": 0,
		})
	}

	lastTime, err := h.repo.GetLastSimTime(c.Context(), simID)
	if err != nil || lastTime == nil {
		lastTime = firstTime
	}

	totalMinutes := int(lastTime.Sub(*firstTime).Minutes())
	if totalMinutes <= 0 {
		totalMinutes = 1
	}

	var elapsedMinutes int
	var progressPct float64

	if sim.CurrentSimTime != nil {
		elapsedMinutes = int(sim.CurrentSimTime.Sub(*firstTime).Minutes())
		if elapsedMinutes < 0 {
			elapsedMinutes = 0
		}
		progressPct = float64(elapsedMinutes) / float64(totalMinutes) * 100
		if progressPct > 100 {
			progressPct = 100
		}
	}

	return c.JSON(fiber.Map{
		"status":           sim.Status,
		"hasData":          true,
		"progressPct":      progressPct,
		"currentSimTime":   sim.CurrentSimTime,
		"firstSimTime":     firstTime,
		"lastSimTime":      lastTime,
		"elapsedMinutes":   elapsedMinutes,
		"totalMinutes":     totalMinutes,
		"remainingMinutes": totalMinutes - elapsedMinutes,
		"speedMultiplier":  sim.SpeedMultiplier,
	})
}

// RestartSimulation godoc
// POST /api/admin/simulations/:id/restart
// Stops the clock, resets current_sim_time to the first tick, then restarts.
// Admin only.
func (h *Handler) RestartSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	// Stop the current clock if running
	if clock, ok := Registry.Get(simID); ok {
		clock.Stop()
		Registry.Remove(simID)
	}

	// Reset current_sim_time to NULL so the clock starts from the beginning
	if err := h.repo.ResetSimTime(c.Context(), simID); err != nil {
		return httputil.InternalError(c)
	}

	// Set status back to draft so StartSimulation can proceed
	if err := h.repo.UpdateStatus(c.Context(), simID, StatusDraft); err != nil {
		return httputil.InternalError(c)
	}

	// Immediately start again
	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return httputil.InternalError(c)
	}
	_ = sim

	if err := h.repo.UpdateStatus(c.Context(), simID, StatusActive); err != nil {
		return httputil.InternalError(c)
	}

	clock := NewClock(simID, h.repo, h.orderEngine)
	if err := clock.Start(c.Context()); err != nil {
		_ = h.repo.UpdateStatus(c.Context(), simID, StatusDraft)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to restart clock: %v", err),
		})
	}
	Registry.Register(simID, clock)

	return c.JSON(fiber.Map{"message": "Simulation restarted from the beginning."})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (h *Handler) ensurePortfolio(ctx context.Context, simID, userID uuid.UUID, startingCash float64) error {
	// Create portfolio if it doesn't exist yet
	_, err := h.repo.db.Exec(ctx, `
		INSERT INTO portfolios (id, simulation_id, user_id, cash_balance)
		VALUES (gen_random_uuid(), $1, $2, $3)
		ON CONFLICT (simulation_id, user_id) DO NOTHING`,
		simID, userID, startingCash,
	)
	if err != nil {
		return err
	}
	// Record starting cash transaction if this was a new portfolio
	return nil
}

// json helper (used for WebSocket messages internally)
var _ = json.Marshal
