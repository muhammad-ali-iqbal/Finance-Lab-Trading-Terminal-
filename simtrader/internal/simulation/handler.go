// internal/simulation/handler.go

package simulation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/order"
	"nhooyr.io/websocket"
)

type Handler struct {
	repo   *Repository
	engine *order.Engine
}

func NewHandler(repo *Repository, engine *order.Engine) *Handler {
	return &Handler{repo: repo, engine: engine}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	// Public (authenticated students + admins)
	sims := app.Group("/api/simulations", authMW)
	sims.Get("/", h.ListSimulations)
	sims.Get("/active", h.GetActiveSimulation)
	sims.Get("/:id", h.GetSimulation)
	sims.Get("/:id/symbols", h.GetSymbols)
	sims.Get("/:id/ticks/:symbol", h.GetTickHistory)

	// WebSocket — students connect here to receive live ticks
	// Note: Fiber doesn't handle WebSocket natively with nhooyr.
	// We register a special handler that hijacks the connection.
	app.Get("/api/simulations/:id/ws", h.WebSocketHandler)

	// Admin only
	admin := app.Group("/api/admin/simulations", authMW, adminMW)
	admin.Post("/", h.CreateSimulation)
	admin.Post("/:id/upload", h.UploadCSV)
	admin.Post("/:id/start", h.StartSimulation)
	admin.Post("/:id/pause", h.PauseSimulation)
	admin.Post("/:id/resume", h.ResumeSimulation)
	admin.Post("/:id/complete", h.CompleteSimulation)
}

// ── Student endpoints ─────────────────────────────────────────────────────────

func (h *Handler) ListSimulations(c *fiber.Ctx) error {
	sims, err := h.repo.List(c.Context())
	if err != nil {
		return internalError(c)
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
		return internalError(c)
	}
	return c.JSON(sim)
}

func (h *Handler) GetSimulation(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "invalid simulation ID")
	}
	sim, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
		}
		return internalError(c)
	}
	return c.JSON(sim)
}

func (h *Handler) GetSymbols(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "invalid simulation ID")
	}
	symbols, err := h.repo.GetSymbols(c.Context(), id)
	if err != nil {
		return internalError(c)
	}
	return c.JSON(fiber.Map{"symbols": symbols})
}

func (h *Handler) GetTickHistory(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "invalid simulation ID")
	}
	symbol := c.Params("symbol")
	ticks, err := h.repo.GetTicksForSymbol(c.Context(), id, symbol)
	if err != nil {
		return internalError(c)
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
	// Validate token from query param
	claims := middleware.GetClaims(c)
	if claims == nil {
		return c.Status(fiber.StatusUnauthorized).SendString("unauthorized")
	}

	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).SendString("invalid simulation ID")
	}

	// Upgrade to WebSocket using nhooyr library
	// Fiber doesn't natively support WebSocket hijacking, so we use the
	// underlying net/http request.
	w, ok := c.Locals("responseWriter").(http.ResponseWriter)
	r, ok2 := c.Locals("request").(*http.Request)
	if !ok || !ok2 {
		// Fallback: use Fiber's adapter
		return c.Status(fiber.StatusInternalServerError).SendString("ws upgrade failed")
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // CORS handled at Fiber level
	})
	if err != nil {
		log.Printf("[ws] accept error: %v", err)
		return nil
	}

	userID, _ := uuid.Parse(claims.UserID)
	client := &Client{
		id:   userID,
		conn: conn,
		send: make(chan []byte, 32), // buffer 32 ticks — about 30 seconds at 60× speed
	}

	// Register with the clock
	clock, ok := Registry.Get(simID)
	if !ok {
		conn.Close(websocket.StatusNormalClosure, "simulation not running")
		return nil
	}
	clock.AddClient(client)

	ctx := conn.CloseRead(context.Background())

	// Write loop — sends queued messages to the client
	go func() {
		defer func() {
			clock.RemoveClient(client)
			conn.Close(websocket.StatusNormalClosure, "done")
		}()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-client.send:
				if !ok {
					return
				}
				writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(writeCtx, websocket.MessageText, msg)
				cancel()
				if err != nil {
					log.Printf("[ws] write error user=%s: %v", userID, err)
					return
				}
			}
		}
	}()

	// Block until the client disconnects
	<-ctx.Done()
	return nil
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
		return badRequest(c, "invalid request body")
	}
	if req.Name == "" {
		return badRequest(c, "name is required")
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
		return internalError(c)
	}

	return c.Status(fiber.StatusCreated).JSON(sim)
}

// UploadCSV accepts a multipart file upload and ingests it into price_ticks.
// The simulation must be in 'draft' status.
func (h *Handler) UploadCSV(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status != StatusDraft {
		return badRequest(c, "can only upload CSV to a simulation in draft status")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return badRequest(c, "file is required (field name: 'file')")
	}
	if file.Size > 50*1024*1024 { // 50MB max
		return badRequest(c, "file too large (max 50MB)")
	}

	f, err := file.Open()
	if err != nil {
		return internalError(c)
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

func (h *Handler) StartSimulation(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "invalid simulation ID")
	}

	sim, err := h.repo.GetByID(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if sim.Status != StatusDraft && sim.Status != StatusPaused {
		return badRequest(c, "simulation must be in draft or paused status to start")
	}

	// Check no other simulation is currently active
	active, err := h.repo.GetActive(c.Context())
	if err == nil && active != nil && active.ID != simID {
		return badRequest(c, "another simulation is already active. Complete or pause it first.")
	}

	// Mark active in DB
	if err := h.repo.UpdateStatus(c.Context(), simID, StatusActive); err != nil {
		return internalError(c)
	}

	// Create and start the clock
	clock := NewClock(simID, h.repo, h.engine)
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
		return badRequest(c, "invalid simulation ID")
	}

	if clock, ok := Registry.Get(simID); ok {
		clock.Stop()
		Registry.Remove(simID)
	}

	if err := h.repo.UpdateStatus(c.Context(), simID, StatusPaused); err != nil {
		return internalError(c)
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
		return badRequest(c, "invalid simulation ID")
	}

	if clock, ok := Registry.Get(simID); ok {
		clock.Stop()
		Registry.Remove(simID)
	}

	if err := h.repo.UpdateStatus(c.Context(), simID, StatusCompleted); err != nil {
		return internalError(c)
	}

	return c.JSON(fiber.Map{"message": "Simulation marked as completed."})
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

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg})
}

func internalError(c *fiber.Ctx) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": "Something went wrong. Please try again.",
	})
}
