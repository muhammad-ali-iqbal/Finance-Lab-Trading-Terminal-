// internal/challenge/reconciler.go
//
// Nightly EOD reconciler: fills pending challenge orders using PSX close prices
// and takes a daily portfolio snapshot for every participant.
//
// Triggered automatically after psx_tracker POSTs EOD prices, or manually
// via POST /api/admin/challenges/:id/reconcile.

package challenge

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pktLocation is UTC+5 (Pakistan Standard Time, no DST).
var pktLocation = time.FixedZone("PKT", 5*60*60)

type Reconciler struct {
	repo *Repository
	db   *pgxpool.Pool

	// mu serialises reconciliation runs. Three sources can trigger a run (the
	// nightly goroutine, the EOD-prices webhook, and admin reconcile); without
	// this they could fill the same pending order twice (AVAIL-02). Combined
	// with the per-order transaction + status guard below, fills are idempotent.
	mu sync.Mutex
}

func NewReconciler(repo *Repository, db *pgxpool.Pool) *Reconciler {
	return &Reconciler{repo: repo, db: db}
}

// Start launches the nightly goroutine. It runs once at 16:35 PKT each day.
// Call in main.go: go reconciler.Start(ctx).
func (r *Reconciler) Start(ctx context.Context) {
	log.Println("[challenge] reconciler started — fires daily at 16:35 PKT")
	for {
		next := nextRun()
		log.Printf("[challenge] next reconciliation at %s", next.In(pktLocation).Format("2006-01-02 15:04 PKT"))
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		date := time.Now().In(pktLocation).Format("2006-01-02")
		log.Printf("[challenge] running EOD reconciliation for %s", date)
		r.RunForDate(date)
	}
}

// nextRun returns the next 16:35 PKT wall-clock time (today if not yet passed,
// tomorrow if already past).
func nextRun() time.Time {
	now := time.Now().In(pktLocation)
	target := time.Date(now.Year(), now.Month(), now.Day(), 16, 35, 0, 0, pktLocation)
	if now.After(target) {
		target = target.Add(24 * time.Hour)
	}
	return target
}

// RunForDate reconciles all active challenges for the given date (YYYY-MM-DD).
// Called both by the goroutine and by the psx_tracker ingest webhook.
func (r *Reconciler) RunForDate(date string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	challenges, err := r.repo.ListActive(ctx)
	if err != nil {
		log.Printf("[challenge] reconcile list error: %v", err)
		return
	}
	for _, ch := range challenges {
		if ch.Status != "active" {
			continue
		}
		n, err := r.RunForChallenge(ctx, ch.ID, date)
		if err != nil {
			log.Printf("[challenge] reconcile challenge %s error: %v", ch.ID, err)
			continue
		}
		log.Printf("[challenge] %s (%s): filled %d orders, snapshots taken", ch.Name, date, n)
	}
}

// RunForChallenge processes all pending orders for one challenge on a given date
// and records daily snapshots. Returns the number of orders filled.
func (r *Reconciler) RunForChallenge(ctx context.Context, challengeID uuid.UUID, date string) (int, error) {
	// Serialise all reconciliation so concurrent triggers cannot double-fill.
	r.mu.Lock()
	defer r.mu.Unlock()

	orders, err := r.repo.ListPendingOrders(ctx, challengeID)
	if err != nil {
		return 0, err
	}
	if len(orders) == 0 {
		// Still take snapshots even if no orders pending
		if err := r.takeSnapshots(ctx, challengeID, date); err != nil {
			return 0, err
		}
		return 0, nil
	}

	// Collect distinct symbols
	symSet := map[string]struct{}{}
	for _, o := range orders {
		symSet[o.Symbol] = struct{}{}
	}
	syms := make([]string, 0, len(symSet))
	for s := range symSet {
		syms = append(syms, s)
	}

	prices, err := r.repo.GetPricesForDate(ctx, syms, date)
	if err != nil {
		return 0, err
	}

	filled := 0
	for _, o := range orders {
		eod, ok := prices[o.Symbol]
		if !ok {
			// No data for this symbol today — skip, leave pending
			continue
		}

		fillPrice := 0.0
		shouldFill := false

		switch o.OrderType {
		case "market":
			fillPrice = eod.Close
			shouldFill = true
		case "limit":
			if o.LimitPrice == nil {
				continue
			}
			lp := *o.LimitPrice
			if o.Side == "buy" && eod.Low <= lp {
				fillPrice = lp
				shouldFill = true
			} else if o.Side == "sell" && eod.High >= lp {
				fillPrice = lp
				shouldFill = true
			}
		}

		if !shouldFill {
			continue
		}

		// All cash/position/order writes for this order happen in one atomic
		// transaction so a partial failure can never deduct cash without
		// granting shares, and the status guard prevents a double-fill
		// (AVAIL-01 / AVAIL-02).
		didFill, err := r.fillOrder(ctx, o, fillPrice, date)
		if err != nil {
			log.Printf("[challenge] fill order %s: %v", o.ID, err)
			continue
		}
		if didFill {
			filled++
		}
	}

	// Take daily portfolio snapshots for all participants
	if err := r.takeSnapshots(ctx, challengeID, date); err != nil {
		log.Printf("[challenge] snapshot error: %v", err)
	}

	return filled, nil
}

// fillOrder fills a single pending order inside one database transaction.
// It locks the order row (idempotency), the participant cash row, and the
// position row, performs the cash + position + order-status writes atomically,
// and only commits if the order was still pending. Returns true if the order
// was filled, false if it was rejected or already processed by another run.
func (r *Reconciler) fillOrder(ctx context.Context, o ChallengeOrder, fillPrice float64, date string) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) // no-op once committed

	// Lock the order row and confirm it is still pending. This is the core
	// idempotency guard: a concurrent run blocks here and then sees a
	// non-pending status, so the same order is never filled twice.
	var status string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM challenge_orders WHERE id=$1 FOR UPDATE`, o.ID,
	).Scan(&status); err != nil {
		return false, err
	}
	if status != "pending" {
		return false, nil // already filled/rejected/cancelled elsewhere
	}

	// Lock the participant cash row for the duration of the transaction.
	var cash float64
	if err := tx.QueryRow(ctx,
		`SELECT cash_balance FROM challenge_participants WHERE id=$1 FOR UPDATE`, o.ParticipantID,
	).Scan(&cash); err != nil {
		return false, err
	}

	if o.Side == "buy" {
		cost := float64(o.Quantity) * fillPrice
		if cost > cash {
			if _, err := tx.Exec(ctx,
				`UPDATE challenge_orders SET status='rejected', reject_reason=$2 WHERE id=$1 AND status='pending'`,
				o.ID, "insufficient cash at fill time"); err != nil {
				return false, err
			}
			return false, tx.Commit(ctx)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE challenge_participants SET cash_balance = cash_balance - $2 WHERE id=$1`,
			o.ParticipantID, cost); err != nil {
			return false, err
		}
		if err := upsertPositionTx(ctx, tx, o, fillPrice, true); err != nil {
			return false, err
		}
	} else { // sell
		held, err := lockedHeldQty(ctx, tx, o.ParticipantID, o.Symbol)
		if err != nil {
			return false, err
		}
		if o.Quantity > held {
			if _, err := tx.Exec(ctx,
				`UPDATE challenge_orders SET status='rejected', reject_reason=$2 WHERE id=$1 AND status='pending'`,
				o.ID, "insufficient shares at fill time"); err != nil {
				return false, err
			}
			return false, tx.Commit(ctx)
		}
		proceeds := float64(o.Quantity) * fillPrice
		if _, err := tx.Exec(ctx,
			`UPDATE challenge_participants SET cash_balance = cash_balance + $2 WHERE id=$1`,
			o.ParticipantID, proceeds); err != nil {
			return false, err
		}
		if err := upsertPositionTx(ctx, tx, o, fillPrice, false); err != nil {
			return false, err
		}
	}

	// Fill with a status guard — if a concurrent run beat us to it, this
	// affects zero rows and we roll back rather than double-count.
	tag, err := tx.Exec(ctx,
		`UPDATE challenge_orders SET status='filled', fill_price=$2, fill_date=$3 WHERE id=$1 AND status='pending'`,
		o.ID, fillPrice, date)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil // lost the race; defer rolls back
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// lockedHeldQty returns the quantity currently held for a symbol, locking the
// position row FOR UPDATE so the sell check and the subsequent write are atomic.
func lockedHeldQty(ctx context.Context, tx pgx.Tx, participantID uuid.UUID, symbol string) (int, error) {
	var qty int
	err := tx.QueryRow(ctx,
		`SELECT quantity FROM challenge_positions WHERE participant_id=$1 AND symbol=$2 FOR UPDATE`,
		participantID, symbol,
	).Scan(&qty)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return qty, nil
}

// upsertPositionTx applies a fill to the participant's position within the
// transaction, recomputing the weighted-average cost on buys.
func upsertPositionTx(ctx context.Context, tx pgx.Tx, o ChallengeOrder, fillPrice float64, isBuy bool) error {
	var id uuid.UUID
	var qty int
	var avg float64
	err := tx.QueryRow(ctx,
		`SELECT id, quantity, avg_cost FROM challenge_positions WHERE participant_id=$1 AND symbol=$2 FOR UPDATE`,
		o.ParticipantID, o.Symbol,
	).Scan(&id, &qty, &avg)
	exists := true
	if errors.Is(err, pgx.ErrNoRows) {
		exists = false
	} else if err != nil {
		return err
	}

	newQty := qty
	newAvg := avg
	if isBuy {
		oldValue := float64(qty) * avg
		newValue := float64(o.Quantity) * fillPrice
		newQty = qty + o.Quantity
		if newQty > 0 {
			newAvg = (oldValue + newValue) / float64(newQty)
		}
	} else {
		newQty = qty - o.Quantity
		if newQty < 0 {
			newQty = 0
		}
		// avg_cost unchanged on sell
	}

	if exists {
		_, err = tx.Exec(ctx,
			`UPDATE challenge_positions SET quantity=$2, avg_cost=$3 WHERE id=$1`,
			id, newQty, newAvg)
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO challenge_positions (id, challenge_id, participant_id, symbol, quantity, avg_cost)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		uuid.New(), o.ChallengeID, o.ParticipantID, o.Symbol, newQty, newAvg)
	return err
}

func (r *Reconciler) takeSnapshots(ctx context.Context, challengeID uuid.UUID, date string) error {
	participants, err := r.repo.ListParticipants(ctx, challengeID)
	if err != nil {
		return err
	}

	for _, p := range participants {
		positions, err := r.repo.GetPositions(ctx, p.ID)
		if err != nil {
			continue
		}
		syms := make([]string, 0, len(positions))
		for _, pos := range positions {
			syms = append(syms, pos.Symbol)
		}
		prices, _ := r.repo.GetLatestPrices(ctx, syms)

		var mv float64
		for _, pos := range positions {
			price := prices[pos.Symbol]
			if price == 0 {
				price = pos.AvgCost
			}
			mv += float64(pos.Quantity) * price
		}

		snap := &Snapshot{
			ID:             uuid.New(),
			ChallengeID:    challengeID,
			ParticipantID:  p.ID,
			Date:           date,
			PortfolioValue: mv + p.CashBalance,
			CashBalance:    p.CashBalance,
		}
		if err := r.repo.UpsertSnapshot(ctx, snap); err != nil {
			log.Printf("[challenge] snapshot participant %s: %v", p.ID, err)
		}
	}
	return nil
}
