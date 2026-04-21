// internal/portfolio/portfolio.go
//
// Portfolio = cash balance + open positions.
// This package handles:
//   - Auto-creating a portfolio when a student first accesses a simulation
//   - Calculating current P&L using the latest simulated prices
//   - Serving the portfolio endpoint to the frontend

package portfolio

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

var ErrNotFound = errors.New("portfolio not found")

// ── Domain types ─────────────────────────────────────────────────────────────

type HistoryPoint struct {
	Time  int64   `json:"time"`  // Unix seconds
	Value float64 `json:"value"`
}

type LeaderboardEntry struct {
	Rank        int       `json:"rank"`
	UserID      uuid.UUID `json:"userId"`
	Name        string    `json:"name"`
	TotalEquity float64   `json:"totalEquity"`
}

type Position struct {
	Symbol           string  `json:"symbol"`
	Quantity         int64   `json:"quantity"`
	AverageCost      float64 `json:"averageCost"`
	CurrentPrice     float64 `json:"currentPrice"`
	MarketValue      float64 `json:"marketValue"`
	UnrealizedPnL    float64 `json:"unrealizedPnL"`
	UnrealizedPnLPct float64 `json:"unrealizedPnLPct"`
}

type Portfolio struct {
	UserID           uuid.UUID  `json:"userId"`
	SimulationID     uuid.UUID  `json:"simulationId"`
	CashBalance      float64    `json:"cashBalance"`
	TotalMarketValue float64    `json:"totalMarketValue"`
	TotalEquity      float64    `json:"totalEquity"`
	UnrealizedPnL    float64    `json:"unrealizedPnL"`
	UnrealizedPnLPct float64    `json:"unrealizedPnLPct"`
	Positions        []Position `json:"positions"`
}

// ── Repository ────────────────────────────────────────────────────────────────

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// EnsureExists creates a portfolio for a student if one doesn't exist yet.
// Called every time a student loads their dashboard — idempotent.
func (r *Repository) EnsureExists(ctx context.Context, simID, userID uuid.UUID, startingCash float64) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO portfolios (id, simulation_id, user_id, cash_balance)
		VALUES (gen_random_uuid(), $1, $2, $3)
		ON CONFLICT (simulation_id, user_id) DO NOTHING`,
		simID, userID, startingCash,
	)
	return err
}

// Get fetches the portfolio with live P&L calculated against current sim prices.
// currentPrices is a map of symbol→close from the latest tick broadcast.
func (r *Repository) Get(ctx context.Context, simID, userID uuid.UUID) (*Portfolio, error) {
	// 1. Get cash balance
	var cashBalance float64
	var portfolioID uuid.UUID
	err := r.db.QueryRow(ctx,
		`SELECT id, cash_balance FROM portfolios WHERE simulation_id=$1 AND user_id=$2`,
		simID, userID,
	).Scan(&portfolioID, &cashBalance)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get portfolio: %w", err)
	}

	// 2. Get open positions
	rows, err := r.db.Query(ctx,
		`SELECT symbol, quantity, average_cost FROM positions
		 WHERE portfolio_id=$1 AND quantity > 0
		 ORDER BY symbol`,
		portfolioID,
	)
	if err != nil {
		return nil, fmt.Errorf("get positions: %w", err)
	}
	defer rows.Close()

	var positions []Position
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.Symbol, &p.Quantity, &p.AverageCost); err != nil {
			return nil, err
		}
		positions = append(positions, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// 3. Enrich positions with the latest price the clock has actually played.
	// We cap at current_sim_time so future (unplayed) ticks are never used.
	for i := range positions {
		var latestClose float64
		err := r.db.QueryRow(ctx, `
			SELECT close FROM price_ticks
			WHERE simulation_id=$1 AND symbol=$2
			  AND sim_time <= (SELECT current_sim_time FROM simulations WHERE id=$1)
			ORDER BY sim_time DESC LIMIT 1`,
			simID, positions[i].Symbol,
		).Scan(&latestClose)
		if err != nil {
			// No played tick yet — use average cost as a neutral placeholder
			latestClose = positions[i].AverageCost
		}
		positions[i].CurrentPrice = latestClose
		positions[i].MarketValue = float64(positions[i].Quantity) * latestClose
		positions[i].UnrealizedPnL = positions[i].MarketValue - (float64(positions[i].Quantity) * positions[i].AverageCost)
		if positions[i].AverageCost > 0 {
			positions[i].UnrealizedPnLPct = ((latestClose - positions[i].AverageCost) / positions[i].AverageCost) * 100
		}
	}

	// 4. Aggregate totals
	var totalMarketValue float64
	for _, p := range positions {
		totalMarketValue += p.MarketValue
	}
	totalEquity := cashBalance + totalMarketValue
	unrealizedPnL := totalMarketValue - func() float64 {
		var cost float64
		for _, p := range positions {
			cost += float64(p.Quantity) * p.AverageCost
		}
		return cost
	}()

	var unrealizedPnLPct float64
	if totalEquity > 0 {
		unrealizedPnLPct = (unrealizedPnL / totalEquity) * 100
	}

	return &Portfolio{
		UserID:           userID,
		SimulationID:     simID,
		CashBalance:      cashBalance,
		TotalMarketValue: totalMarketValue,
		TotalEquity:      totalEquity,
		UnrealizedPnL:    unrealizedPnL,
		UnrealizedPnLPct: unrealizedPnLPct,
		Positions:        positions,
	}, nil
}

// GetHistory returns portfolio value at each played tick, computed on-the-fly
// from current positions. Cash is fixed at the current balance; positions are
// valued at their closing price at each historical timestamp.
func (r *Repository) GetHistory(ctx context.Context, simID, userID uuid.UUID) ([]HistoryPoint, error) {
	var portfolioID uuid.UUID
	var cash float64
	err := r.db.QueryRow(ctx,
		`SELECT id, cash_balance FROM portfolios WHERE simulation_id=$1 AND user_id=$2`,
		simID, userID,
	).Scan(&portfolioID, &cash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT ts.sim_time, $2::float8 + COALESCE(pv.position_value, 0) AS value
		FROM (
			SELECT DISTINCT sim_time
			FROM price_ticks
			WHERE simulation_id = $1
			  AND sim_time <= (SELECT current_sim_time FROM simulations WHERE id = $1)
		) ts
		LEFT JOIN LATERAL (
			SELECT SUM(pos.quantity::float8 * pt.close) AS position_value
			FROM positions pos
			JOIN price_ticks pt
			  ON pt.simulation_id = $1 AND pt.sim_time = ts.sim_time AND pt.symbol = pos.symbol
			WHERE pos.portfolio_id = $3 AND pos.quantity > 0
		) pv ON true
		ORDER BY ts.sim_time`,
		simID, cash, portfolioID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []HistoryPoint
	for rows.Next() {
		var t time.Time
		var v float64
		if err := rows.Scan(&t, &v); err != nil {
			return nil, err
		}
		points = append(points, HistoryPoint{Time: t.Unix(), Value: v})
	}
	return points, rows.Err()
}

// GetLeaderboard ranks all students in a simulation by total equity (cash + live positions).
func (r *Repository) GetLeaderboard(ctx context.Context, simID uuid.UUID) ([]LeaderboardEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id,
			u.first_name || ' ' || u.last_name AS name,
			port.cash_balance + COALESCE(
				(SELECT SUM(pos.quantity::float8 * pt.close)
				 FROM positions pos
				 LEFT JOIN LATERAL (
					 SELECT close FROM price_ticks
					 WHERE simulation_id = $1 AND symbol = pos.symbol
					   AND sim_time <= (SELECT current_sim_time FROM simulations WHERE id = $1)
					 ORDER BY sim_time DESC LIMIT 1
				 ) pt ON true
				 WHERE pos.portfolio_id = port.id AND pos.quantity > 0
				), 0
			) AS total_equity
		FROM portfolios port
		JOIN users u ON u.id = port.user_id
		WHERE port.simulation_id = $1
		ORDER BY total_equity DESC`,
		simID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []LeaderboardEntry
	rank := 1
	for rows.Next() {
		var e LeaderboardEntry
		e.Rank = rank
		if err := rows.Scan(&e.UserID, &e.Name, &e.TotalEquity); err != nil {
			return nil, err
		}
		entries = append(entries, e)
		rank++
	}
	return entries, rows.Err()
}

// ── Handler ───────────────────────────────────────────────────────────────────

type Handler struct {
	repo    *Repository
	simRepo SimRepo
}

// SimRepo is the minimal interface portfolio needs from simulation.Repository.
// Defined here to avoid importing the simulation package (would cause cycles).
type SimRepo interface {
	GetSimStatus(ctx context.Context, id uuid.UUID) (string, float64, error)
}

func NewHandler(repo *Repository, simRepo SimRepo) *Handler {
	return &Handler{repo: repo, simRepo: simRepo}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW fiber.Handler) {
	g := app.Group("/api/simulations", authMW)
	g.Get("/:id/portfolio", h.GetPortfolio)
	g.Get("/:id/portfolio/history", h.GetPortfolioHistory)
	g.Get("/:id/leaderboard", h.GetLeaderboard)
}

// GetPortfolio godoc
// GET /api/simulations/:id/portfolio
// Auto-creates the portfolio if the student hasn't joined yet.
func (h *Handler) GetPortfolio(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	// Get simulation starting cash
	_, startingCash, err := h.simRepo.GetSimStatus(c.Context(), simID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Simulation not found."})
	}

	// Auto-create portfolio on first visit (idempotent)
	if err := h.repo.EnsureExists(c.Context(), simID, userID, startingCash); err != nil {
		return httputil.InternalError(c)
	}

	portfolio, err := h.repo.Get(c.Context(), simID, userID)
	if err != nil {
		return httputil.InternalError(c)
	}

	return c.JSON(portfolio)
}

// GetPortfolioHistory godoc
// GET /api/simulations/:id/portfolio/history
func (h *Handler) GetPortfolioHistory(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	points, err := h.repo.GetHistory(c.Context(), simID, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.JSON([]HistoryPoint{})
		}
		return httputil.InternalError(c)
	}
	if points == nil {
		points = []HistoryPoint{}
	}
	return c.JSON(points)
}

// GetLeaderboard godoc
// GET /api/simulations/:id/leaderboard
func (h *Handler) GetLeaderboard(c *fiber.Ctx) error {
	simID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httputil.BadRequest(c, "invalid simulation ID")
	}

	entries, err := h.repo.GetLeaderboard(c.Context(), simID)
	if err != nil {
		return httputil.InternalError(c)
	}
	if entries == nil {
		entries = []LeaderboardEntry{}
	}
	return c.JSON(entries)
}
