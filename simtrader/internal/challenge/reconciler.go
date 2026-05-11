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
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pktLocation is UTC+5 (Pakistan Standard Time, no DST).
var pktLocation = time.FixedZone("PKT", 5*60*60)

type Reconciler struct {
	repo *Repository
	db   *pgxpool.Pool
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

		// Load participant cash
		participant, err := r.repo.GetParticipantByID(ctx, o.ParticipantID)
		if err != nil || participant == nil {
			continue
		}

		if o.Side == "buy" {
			cost := float64(o.Quantity) * fillPrice
			if cost > participant.CashBalance {
				if err := r.repo.RejectOrder(ctx, o.ID, "insufficient cash at fill time"); err != nil {
					log.Printf("[challenge] reject order %s: %v", o.ID, err)
				}
				continue
			}
			// Deduct cash
			newCash := participant.CashBalance - cost
			if err := r.repo.UpdateCash(ctx, o.ParticipantID, newCash); err != nil {
				continue
			}
			participant.CashBalance = newCash

			// Update position (weighted avg cost)
			if err := r.updatePosition(ctx, o, fillPrice); err != nil {
				continue
			}
		} else { // sell
			positions, _ := r.repo.GetPositions(ctx, o.ParticipantID)
			held := 0
			for _, pos := range positions {
				if pos.Symbol == o.Symbol {
					held = pos.Quantity
					break
				}
			}
			if o.Quantity > held {
				if err := r.repo.RejectOrder(ctx, o.ID, "insufficient shares at fill time"); err != nil {
					log.Printf("[challenge] reject order %s: %v", o.ID, err)
				}
				continue
			}
			proceeds := float64(o.Quantity) * fillPrice
			newCash := participant.CashBalance + proceeds
			if err := r.repo.UpdateCash(ctx, o.ParticipantID, newCash); err != nil {
				continue
			}
			participant.CashBalance = newCash
			if err := r.updatePosition(ctx, o, fillPrice); err != nil {
				continue
			}
		}

		if err := r.repo.FillOrder(ctx, o.ID, fillPrice, date); err != nil {
			log.Printf("[challenge] fill order %s: %v", o.ID, err)
			continue
		}
		filled++
	}

	// Take daily portfolio snapshots for all participants
	if err := r.takeSnapshots(ctx, challengeID, date); err != nil {
		log.Printf("[challenge] snapshot error: %v", err)
	}

	return filled, nil
}

func (r *Reconciler) updatePosition(ctx context.Context, o ChallengeOrder, fillPrice float64) error {
	positions, err := r.repo.GetPositions(ctx, o.ParticipantID)
	if err != nil {
		return err
	}

	var existing *ChallengePosition
	for i := range positions {
		if positions[i].Symbol == o.Symbol {
			existing = &positions[i]
			break
		}
	}

	var pos ChallengePosition
	if existing != nil {
		pos = *existing
	} else {
		pos = ChallengePosition{
			ID:            uuid.New(),
			ChallengeID:   o.ChallengeID,
			ParticipantID: o.ParticipantID,
			Symbol:        o.Symbol,
		}
	}

	if o.Side == "buy" {
		oldValue := float64(pos.Quantity) * pos.AvgCost
		newValue := float64(o.Quantity) * fillPrice
		pos.Quantity += o.Quantity
		if pos.Quantity > 0 {
			pos.AvgCost = (oldValue + newValue) / float64(pos.Quantity)
		}
	} else {
		pos.Quantity -= o.Quantity
		if pos.Quantity < 0 {
			pos.Quantity = 0
		}
		// avg_cost unchanged on sell
	}

	return r.repo.UpsertPosition(ctx, &pos)
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
