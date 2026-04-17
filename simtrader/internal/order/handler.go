// internal/order/handler.go
//
// HTTP handlers for student order submission and management.
// The actual fill logic lives in engine.go — this file just validates
// requests and persists pending orders to the database.

package order

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/simtrader/backend/internal/httputil"
	"github.com/simtrader/backend/internal/middleware"
)

// ── Domain types ─────────────────────────────────────────────────────────────

type Order struct {
	ID               uuid.UUID  `json:"id"`
	SimulationID     uuid.UUID  `json:"simulationId"`
	PortfolioID      uuid.UUID  `json:"portfolioId"`
	UserID           uuid.UUID  `json:"userId"`
	Symbol           string     `json:"symbol"`
	Side             string     `json:"side"`
	Type             string     `json:"type"`
	Quantity         int64      `json:"quantity"`
	LimitPrice       *float64   `json:"limitPrice"`
	StopPrice        *float64   `json:"stopPrice"`
	Status           string     `json:"status"`
	FilledQuantity   int64      `json:"filledQuantity"`
	AverageFillPrice *float64   `json:"averageFillPrice"`
	RejectionReason  *string    `json:"rejectionReason,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	FilledAt         *time.Time `json:"filledAt"`
}

type OrderBookLevel struct {
	Price      float64 `json:"price"`
	Quantity   int64   `json:"quantity"`
	OrderCount int     `json:"orderCount"`
}

type OrderBook struct {
	Symbol    string           `json:"symbol"`
	Bids      []OrderBookLevel `json:"bids"`
	Asks      []OrderBookLevel `json:"asks"`
	LastPrice float64          `json:"lastPrice"`
	Spread    float64          `json:"spread"`
}

// ── Repository ────────────────────────────────────────────────────────────────

type OrderRepository struct {
	db *pgxpool.Pool
}

func NewOrderRepository(db *pgxpool.Pool) *OrderRepository {
	return &OrderRepository{db: db}
}

func (r *OrderRepository) GetPortfolioID(ctx context.Context, simID, userID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.db.QueryRow(ctx,
		`SELECT id FROM portfolios WHERE simulation_id=$1 AND user_id=$2`,
		simID, userID,
	).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, fmt.Errorf("portfolio not found — load the portfolio page first")
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (r *OrderRepository) Insert(ctx context.Context, o *Order) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO orders (
			id, simulation_id, portfolio_id, user_id, symbol,
			side, type, quantity, limit_price, stop_price, status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
		o.ID, o.SimulationID, o.PortfolioID, o.UserID, o.Symbol,
		o.Side, o.Type, o.Quantity, o.LimitPrice, o.StopPrice,
	)
	return err
}

func (r *OrderRepository) List(ctx context.Context, simID, userID uuid.UUID) ([]Order, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, simulation_id, portfolio_id, user_id, symbol,
		       side, type, quantity, limit_price, stop_price, status,
		       filled_quantity, average_fill_price, rejection_reason,
		       created_at, filled_at
		FROM orders
		WHERE simulation_id=$1 AND user_id=$2
		ORDER BY created_at DESC`,
		simID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.SimulationID, &o.PortfolioID, &o.UserID, &o.Symbol,
			&o.Side, &o.Type, &o.Quantity, &o.LimitPrice, &o.StopPrice, &o.Status,
			&o.FilledQuantity, &o.AverageFillPrice, &o.RejectionReason,
			&o.CreatedAt, &o.FilledAt,
		); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

func (r *OrderRepository) Cancel(ctx context.Context, orderID, userID uuid.UUID) error {
	result, err := r.db.Exec(ctx, `
		UPDATE orders SET status='cancelled', updated_at=NOW()
		WHERE id=$1 AND user_id=$2 AND status='pending'`,
		orderID, userID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("order not found or not cancellable")
	}
	return nil
}

func (r *OrderRepository) GetOrderBook(ctx context.Context, simID uuid.UUID, symbol string) (*OrderBook, error) {
	// Bids — pending buy limit orders grouped by price, descending
	bidRows, err := r.db.Query(ctx, `
		SELECT limit_price, SUM(quantity - filled_quantity), COUNT(*)
		FROM orders
		WHERE simulation_id=$1 AND symbol=$2 AND side='buy'
		  AND type='limit' AND status='pending'
		GROUP BY limit_price
		ORDER BY limit_price DESC
		LIMIT 20`,
		simID, symbol,
	)
	if err != nil {
		return nil, err
	}
	defer bidRows.Close()

	var bids []OrderBookLevel
	for bidRows.Next() {
		var l OrderBookLevel
		if err := bidRows.Scan(&l.Price, &l.Quantity, &l.OrderCount); err != nil {
			return nil, err
		}
		bids = append(bids, l)
	}

	// Asks — pending sell limit orders grouped by price, ascending
	askRows, err := r.db.Query(ctx, `
		SELECT limit_price, SUM(quantity - filled_quantity), COUNT(*)
		FROM orders
		WHERE simulation_id=$1 AND symbol=$2 AND side='sell'
		  AND type='limit' AND status='pending'
		GROUP BY limit_price
		ORDER BY limit_price ASC
		LIMIT 20`,
		simID, symbol,
	)
	if err != nil {
		return nil, err
	}
	defer askRows.Close()

	var asks []OrderBookLevel
	for askRows.Next() {
		var l OrderBookLevel
		if err := askRows.Scan(&l.Price, &l.Quantity, &l.OrderCount); err != nil {
			return nil, err
		}
		asks = append(asks, l)
	}

	// Latest price
	var lastPrice float64
	_ = r.db.QueryRow(ctx, `
		SELECT close FROM price_ticks
		WHERE simulation_id=$1 AND symbol=$2
		ORDER BY sim_time DESC LIMIT 1`,
		simID, symbol,
	).Scan(&lastPrice)

	// Spread
	var spread float64
	if len(bids) > 0 && len(asks) > 0 {
		spread = asks[0].Price - bids[0].Price
		if spread < 0 {
			spread = 0
		}
	}

	return &OrderBook{
		Symbol:    symbol,
		Bids:      bids,
		Asks:      asks,
		LastPrice: lastPrice,
		Spread:    spread,
	}, nil
}

// ── Handler ───────────────────────────────────────────────────────────────────

type Handler struct {
	repo    *OrderRepository
	simRepo SimulationRepo
}

// SimulationRepo is the minimal interface we need from simulation.Repository.
// We define it here rather than importing simulation to avoid import cycles.
type SimulationRepo interface {
	GetSimStatus(ctx context.Context, id uuid.UUID) (string, float64, error)
}

func NewHandler(repo *OrderRepository, simRepo SimulationRepo) *Handler {
	return &Handler{repo: repo, simRepo: simRepo}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW fiber.Handler) {
	g := app.Group("/api/simulations/:id", authMW)
	g.Post("/orders", h.SubmitOrder)
	g.Get("/orders", h.ListOrders)
	g.Delete("/orders/:orderID", h.CancelOrder)
	g.Get("/orderbook/:symbol", h.GetOrderBook)
}

// ── Request shapes ────────────────────────────────────────────────────────────

type submitOrderRequest struct {
	Symbol     string   `json:"symbol"`
	Side       string   `json:"side"`
	Type       string   `json:"type"`
	Quantity   int64    `json:"quantity"`
	LimitPrice *float64 `json:"limitPrice"`
	StopPrice  *float64 `json:"stopPrice"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// SubmitOrder godoc
// POST /api/simulations/:id/orders
// Body: { symbol, side, type, quantity, limitPrice?, stopPrice? }
func (h *Handler) SubmitOrder(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req submitOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	// ── Validation ────────────────────────────────────────────────
	if req.Symbol == "" {
		return httputil.BadRequest(c, "symbol is required")
	}
	if req.Side != "buy" && req.Side != "sell" {
		return httputil.BadRequest(c, "side must be 'buy' or 'sell'")
	}
	if req.Type != "market" && req.Type != "limit" && req.Type != "stop" {
		return httputil.BadRequest(c, "type must be 'market', 'limit', or 'stop'")
	}
	if req.Quantity <= 0 {
		return httputil.BadRequest(c, "quantity must be greater than 0")
	}
	if req.Type == "limit" && req.LimitPrice == nil {
		return httputil.BadRequest(c, "limitPrice is required for limit orders")
	}
	if req.Type == "stop" && req.StopPrice == nil {
		return httputil.BadRequest(c, "stopPrice is required for stop orders")
	}
	if req.LimitPrice != nil && *req.LimitPrice <= 0 {
		return httputil.BadRequest(c, "limitPrice must be positive")
	}
	if req.StopPrice != nil && *req.StopPrice <= 0 {
		return httputil.BadRequest(c, "stopPrice must be positive")
	}

	// ── Check simulation is active ────────────────────────────────
	status, _, err := h.simRepo.GetSimStatus(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}
	if status != "active" {
		return httputil.BadRequest(c, fmt.Sprintf("simulation is %s — orders can only be placed in active simulations", status))
	}

	// ── Get portfolio ID ──────────────────────────────────────────
	portfolioID, err := h.repo.GetPortfolioID(c.Context(), simID, userID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Portfolio not found. Load the Portfolio page first to initialise your account.",
		})
	}

	// ── Insert pending order ──────────────────────────────────────
	order := &Order{
		ID:          uuid.New(),
		SimulationID: simID,
		PortfolioID:  portfolioID,
		UserID:       userID,
		Symbol:       req.Symbol,
		Side:         req.Side,
		Type:         req.Type,
		Quantity:     req.Quantity,
		LimitPrice:   req.LimitPrice,
		StopPrice:    req.StopPrice,
	}

	if err := h.repo.Insert(c.Context(), order); err != nil {
		return httputil.InternalError(c)
	}

	// Market orders will be picked up by the engine on the next clock tick.
	// Limit/stop orders wait until price conditions are met.
	return c.Status(fiber.StatusCreated).JSON(order)
}

// ListOrders godoc
// GET /api/simulations/:id/orders
func (h *Handler) ListOrders(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	orders, err := h.repo.List(c.Context(), simID, userID)
	if err != nil {
		return httputil.InternalError(c)
	}

	if orders == nil {
		orders = []Order{} // return [] not null
	}

	return c.JSON(fiber.Map{"orders": orders})
}

// CancelOrder godoc
// DELETE /api/simulations/:id/orders/:orderID
func (h *Handler) CancelOrder(c *fiber.Ctx) error {
	orderID, err := uuid.Parse(c.Params("orderID"))
	if err != nil {
		return httputil.BadRequest(c, "invalid order ID")
	}

	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	if err := h.repo.Cancel(c.Context(), orderID, userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// GetOrderBook godoc
// GET /api/simulations/:id/orderbook/:symbol
func (h *Handler) GetOrderBook(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	symbol := c.Params("symbol")
	if symbol == "" {
		return httputil.BadRequest(c, "symbol is required")
	}

	book, err := h.repo.GetOrderBook(c.Context(), simID, symbol)
	if err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(book)
}
