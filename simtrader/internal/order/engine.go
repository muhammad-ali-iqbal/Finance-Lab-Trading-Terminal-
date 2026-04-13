// internal/order/engine.go
//
// The order fill engine runs synchronously on every simulation tick.
// It checks all pending limit and stop orders against the new bar's prices
// and fills them if conditions are met.
//
// Fill rules (price-taker model — prices come from CSV, not student orders):
//
//   MARKET order  → fills immediately at bar's close price
//                   (submitted between ticks, filled on next tick's close)
//
//   LIMIT BUY     → fills if bar's LOW ≤ limit price
//                   (the price dipped to or below the limit during the bar)
//                   fill price = min(limit_price, bar.close)
//
//   LIMIT SELL    → fills if bar's HIGH ≥ limit price
//                   fill price = max(limit_price, bar.close)
//
//   STOP BUY      → triggers if bar's HIGH ≥ stop price
//                   (converts to market, fills at bar's close)
//
//   STOP SELL     → triggers if bar's LOW ≤ stop price
//                   fills at bar's close

package order

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/simtrader/backend/internal/types"
)

// Engine processes orders. Implements types.OrderFiller.
type Engine struct {
	db *pgxpool.Pool
}

func NewEngine(db *pgxpool.Pool) *Engine {
	return &Engine{db: db}
}

// ProcessTickOrders is called by the clock on every tick.
// It checks all pending orders for each symbol and fills eligible ones.
func (e *Engine) ProcessTickOrders(ctx context.Context, simID uuid.UUID, ticks []types.PriceTick) error {
	// Build a price map: symbol → tick (for O(1) lookup per order)
	priceMap := make(map[string]types.PriceTick, len(ticks))
	for _, t := range ticks {
		priceMap[t.Symbol] = t
	}

	for _, tick := range ticks {
		if err := e.processSymbolOrders(ctx, simID, tick); err != nil {
			// Log but don't abort other symbols
			log.Printf("[engine] error processing orders for %s: %v", tick.Symbol, err)
		}
	}
	return nil
}

// processSymbolOrders fills all eligible pending orders for one symbol at one tick.
func (e *Engine) processSymbolOrders(ctx context.Context, simID uuid.UUID, tick types.PriceTick) error {
	// Fetch all pending orders for this symbol in this simulation.
	// We use FOR UPDATE SKIP LOCKED to prevent double-fills if multiple
	// goroutines ever ran (they don't in v1, but defensive is correct).
	query := `
		SELECT o.id, o.portfolio_id, o.user_id, o.side, o.type,
		       o.quantity, o.limit_price, o.stop_price
		FROM orders o
		WHERE o.simulation_id = $1
		  AND o.symbol = $2
		  AND o.status = 'pending'
		FOR UPDATE SKIP LOCKED`

	rows, err := e.db.Query(ctx, query, simID, tick.Symbol)
	if err != nil {
		return fmt.Errorf("fetch pending orders: %w", err)
	}
	defer rows.Close()

	type pendingOrder struct {
		id          uuid.UUID
		portfolioID uuid.UUID
		userID      uuid.UUID
		side        string
		orderType   string
		quantity    int64
		limitPrice  *float64
		stopPrice   *float64
	}

	var orders []pendingOrder
	for rows.Next() {
		var o pendingOrder
		if err := rows.Scan(
			&o.id, &o.portfolioID, &o.userID, &o.side, &o.orderType,
			&o.quantity, &o.limitPrice, &o.stopPrice,
		); err != nil {
			return err
		}
		orders = append(orders, o)
	}
	rows.Close()

	for _, o := range orders {
		fillPrice, shouldFill := e.determineFill(o.orderType, o.side, o.limitPrice, o.stopPrice, tick)
		if !shouldFill {
			continue
		}

		if err := e.executeFill(ctx, o.id, o.portfolioID, o.side, tick.Symbol, o.quantity, fillPrice, tick.SimTime); err != nil {
			log.Printf("[engine] fill error order=%s: %v", o.id, err)
		}
	}

	return nil
}

// determineFill decides whether an order fills on this tick and at what price.
func (e *Engine) determineFill(
	orderType, side string,
	limitPrice, stopPrice *float64,
	tick types.PriceTick,
) (float64, bool) {
	switch orderType {
	case "market":
		// Market orders always fill at the bar's close
		return tick.Close, true

	case "limit":
		if limitPrice == nil {
			return 0, false
		}
		lp := *limitPrice
		if side == "buy" {
			// Fill if bar's low touched or went below the limit
			if tick.Low <= lp {
				// Fill at limit price (or close if close is better)
				if tick.Close < lp {
					return tick.Close, true
				}
				return lp, true
			}
		} else { // sell
			// Fill if bar's high touched or exceeded the limit
			if tick.High >= lp {
				if tick.Close > lp {
					return tick.Close, true
				}
				return lp, true
			}
		}

	case "stop":
		if stopPrice == nil {
			return 0, false
		}
		sp := *stopPrice
		if side == "buy" {
			// Triggers if price rose to or above stop
			if tick.High >= sp {
				return tick.Close, true
			}
		} else { // sell stop (stop-loss)
			// Triggers if price fell to or below stop
			if tick.Low <= sp {
				return tick.Close, true
			}
		}
	}

	return 0, false
}

// executeFill applies the fill atomically:
//   1. Verify portfolio has enough cash (buy) or shares (sell)
//   2. Update order status → filled
//   3. Update position (create or update)
//   4. Update cash balance
//   5. Insert immutable transaction record
// All in a single DB transaction — either everything succeeds or nothing does.
func (e *Engine) executeFill(
	ctx context.Context,
	orderID, portfolioID uuid.UUID,
	side, symbol string,
	quantity int64,
	fillPrice float64,
	fillTime time.Time,
) error {
	totalCost := float64(quantity) * fillPrice

	tx, err := e.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// ── 1. Get current portfolio cash ─────────────────────────────
	var cashBalance float64
	err = tx.QueryRow(ctx,
		`SELECT cash_balance FROM portfolios WHERE id = $1 FOR UPDATE`,
		portfolioID,
	).Scan(&cashBalance)
	if err != nil {
		return fmt.Errorf("get portfolio: %w", err)
	}

	if side == "buy" {
		if cashBalance < totalCost {
			// Reject — not enough cash
			_, err = tx.Exec(ctx,
				`UPDATE orders SET status='rejected', rejection_reason=$2, updated_at=NOW() WHERE id=$1`,
				orderID, fmt.Sprintf("insufficient cash: need $%.2f, have $%.2f", totalCost, cashBalance),
			)
			if err != nil {
				return err
			}
			return tx.Commit(ctx)
		}
	} else {
		// Sell — check position
		var held int64
		err = tx.QueryRow(ctx,
			`SELECT COALESCE(quantity, 0) FROM positions WHERE portfolio_id=$1 AND symbol=$2`,
			portfolioID, symbol,
		).Scan(&held)
		if err != nil {
			// No position at all
			held = 0
		}
		if held < quantity {
			_, err = tx.Exec(ctx,
				`UPDATE orders SET status='rejected', rejection_reason=$2, updated_at=NOW() WHERE id=$1`,
				orderID, fmt.Sprintf("insufficient shares: need %d, have %d", quantity, held),
			)
			if err != nil {
				return err
			}
			return tx.Commit(ctx)
		}
	}

	// ── 2. Update order → filled ──────────────────────────────────
	_, err = tx.Exec(ctx, `
		UPDATE orders
		SET status='filled', filled_quantity=$2, average_fill_price=$3,
		    filled_at=$4, updated_at=NOW()
		WHERE id=$1`,
		orderID, quantity, fillPrice, fillTime,
	)
	if err != nil {
		return fmt.Errorf("update order: %w", err)
	}

	// ── 3. Update position ────────────────────────────────────────
	if side == "buy" {
		// Upsert position with weighted average cost
		_, err = tx.Exec(ctx, `
			INSERT INTO positions (id, portfolio_id, symbol, quantity, average_cost)
			VALUES (gen_random_uuid(), $1, $2, $3, $4)
			ON CONFLICT (portfolio_id, symbol) DO UPDATE
			SET quantity     = positions.quantity + $3,
			    average_cost = (positions.average_cost * positions.quantity + $4 * $3)
			                   / (positions.quantity + $3),
			    updated_at   = NOW()`,
			portfolioID, symbol, quantity, fillPrice,
		)
	} else {
		// Reduce position; delete row if quantity reaches 0
		_, err = tx.Exec(ctx, `
			UPDATE positions
			SET quantity   = quantity - $3,
			    updated_at = NOW()
			WHERE portfolio_id = $1 AND symbol = $2`,
			portfolioID, symbol, quantity,
		)
		if err == nil {
			// Remove zero-quantity positions
			_, err = tx.Exec(ctx,
				`DELETE FROM positions WHERE portfolio_id=$1 AND symbol=$2 AND quantity <= 0`,
				portfolioID, symbol,
			)
		}
	}
	if err != nil {
		return fmt.Errorf("update position: %w", err)
	}

	// ── 4. Update cash balance ────────────────────────────────────
	cashDelta := totalCost
	if side == "buy" {
		cashDelta = -totalCost // debit
	}
	var newBalance float64
	err = tx.QueryRow(ctx, `
		UPDATE portfolios
		SET cash_balance = cash_balance + $2, updated_at = NOW()
		WHERE id = $1
		RETURNING cash_balance`,
		portfolioID, cashDelta,
	).Scan(&newBalance)
	if err != nil {
		return fmt.Errorf("update cash: %w", err)
	}

	// ── 5. Insert immutable transaction record ────────────────────
	txType := "buy_fill"
	if side == "sell" {
		txType = "sell_fill"
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO transactions (id, portfolio_id, order_id, type, symbol, quantity, price, amount, balance_after)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
		portfolioID, orderID, txType, symbol, quantity, fillPrice, cashDelta, newBalance,
	)
	if err != nil {
		return fmt.Errorf("insert transaction: %w", err)
	}

	return tx.Commit(ctx)
}
