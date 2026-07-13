// internal/challenge/dividends.go
//
// Corporate-action pass of the nightly reconciler: credits cash dividends and
// bonus shares to challenge participants whose held stocks pay out.
//
// Model (simplified for the classroom, using PSX conventions):
//   - Cash dividend "60%(i) (D)": percent of the PKR 10 face value standard
//     for PSX equities → 60% = PKR 6.00 per share, credited to cash.
//   - Bonus issue "10% (B)": 10 shares per 100 held, rounded down. Cost basis
//     is unchanged, so avg_cost dilutes proportionally.
//   - Right issues "(R)" require a subscription decision and payment, so they
//     are not auto-applied.
//   - Entitlement: a participant is entitled if they hold the shares when the
//     book-closure start date arrives. The payout is applied on the first
//     reconcile run on/after that date, before that day's order fills, so
//     same-day buys don't collect the payout.
//
// Idempotency: each application inserts into challenge_dividends first, whose
// UNIQUE (participant, symbol, book_closure_start, kind) makes re-runs no-ops.

package challenge

import (
	"context"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/dividend"
)

// faceValue is the standard PKR 10 par value used to convert PSX dividend
// percentages into per-share cash amounts. A handful of PSX stocks have a
// different face value; this simplification is documented to students.
const faceValue = 10.0

// PayoutSource provides PSX payout announcements per symbol. Implemented by
// *dividend.Service (cached proxy of dps.psx.com.pk/payouts).
type PayoutSource interface {
	List(ctx context.Context, symbol string) (*dividend.Result, error)
}

// DividendRecord is one applied payout, as stored in challenge_dividends.
type DividendRecord struct {
	ID               uuid.UUID `json:"id"`
	ChallengeID      uuid.UUID `json:"challengeId"`
	ParticipantID    uuid.UUID `json:"participantId"`
	Symbol           string    `json:"symbol"`
	Kind             string    `json:"kind"` // dividend | bonus
	Announcement     string    `json:"announcement"`
	Percent          float64   `json:"percent"`
	BookClosureStart string    `json:"bookClosureStart"` // YYYY-MM-DD
	QuantityHeld     int       `json:"quantityHeld"`
	CashCredited     float64   `json:"cashCredited"`
	SharesCredited   int       `json:"sharesCredited"`
	AppliedAt        time.Time `json:"appliedAt"`
}

// applyDividends runs the corporate-action pass for one challenge on one
// reconcile date. Returns the number of payouts applied. Failures on a single
// symbol or participant are logged and skipped — one bad announcement must
// not block order fills.
func (r *Reconciler) applyDividends(ctx context.Context, ch *Challenge, date string) int {
	if r.payouts == nil {
		return 0 // no payout source wired (tests)
	}
	reconcileDay, err := time.ParseInLocation("2006-01-02", date, pktLocation)
	if err != nil {
		log.Printf("[challenge] dividends: bad reconcile date %q", date)
		return 0
	}
	challengeStart, err := time.ParseInLocation("2006-01-02", ch.StartDate, pktLocation)
	if err != nil {
		log.Printf("[challenge] dividends: challenge %s has bad start date %q", ch.ID, ch.StartDate)
		return 0
	}

	positions, err := r.repo.ListHeldPositionsByChallenge(ctx, ch.ID)
	if err != nil {
		log.Printf("[challenge] dividends: list positions: %v", err)
		return 0
	}
	if len(positions) == 0 {
		return 0
	}

	// Group holders by symbol so each symbol's payout history is fetched once
	// (the dividend service caches per-symbol responses for ~30 min anyway).
	bySymbol := map[string][]ChallengePosition{}
	for _, p := range positions {
		bySymbol[p.Symbol] = append(bySymbol[p.Symbol], p)
	}

	applied := 0
	for symbol, holders := range bySymbol {
		res, err := r.payouts.List(ctx, symbol)
		if err != nil {
			log.Printf("[challenge] dividends: fetch payouts for %s: %v", symbol, err)
			continue
		}
		for _, payout := range res.Payouts {
			if payout.Symbol != symbol {
				continue // PSX symbol search can prefix-match others
			}
			parsed, ok := dividend.ParseAnnouncement(payout.Announcement)
			if !ok || parsed.Kind == dividend.KindRight {
				continue
			}
			closure, ok := dividend.ParseBookClosureStart(payout.BookClosure, pktLocation)
			if !ok {
				continue
			}
			// Entitlement window: closure must fall inside the challenge and
			// have arrived by the reconcile date.
			if closure.Before(challengeStart) || closure.After(reconcileDay) {
				continue
			}

			for _, pos := range holders {
				ok, err := r.applyPayoutTx(ctx, ch.ID, pos, parsed, payout.Announcement, closure)
				if err != nil {
					log.Printf("[challenge] dividends: apply %s %s to participant %s: %v",
						symbol, parsed.Kind, pos.ParticipantID, err)
					continue
				}
				if ok {
					applied++
				}
			}
		}
	}
	return applied
}

// applyPayoutTx credits one payout to one participant atomically. Returns
// true if the payout was applied now, false if it had already been applied
// (or the position vanished in the meantime).
func (r *Reconciler) applyPayoutTx(
	ctx context.Context,
	challengeID uuid.UUID,
	pos ChallengePosition,
	parsed dividend.ParsedPayout,
	announcement string,
	closure time.Time,
) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) // no-op once committed

	// Lock the position row and re-read the live quantity — it may have
	// changed since the un-locked listing.
	var qty int
	var avg float64
	if err := tx.QueryRow(ctx,
		`SELECT quantity, avg_cost FROM challenge_positions WHERE id=$1 FOR UPDATE`, pos.ID,
	).Scan(&qty, &avg); err != nil {
		return false, err
	}
	if qty <= 0 {
		return false, nil
	}

	cashCredit := 0.0
	sharesCredit := 0
	switch parsed.Kind {
	case dividend.KindDividend:
		perShare := parsed.Percent / 100 * faceValue
		cashCredit = math.Round(float64(qty)*perShare*100) / 100
	case dividend.KindBonus:
		sharesCredit = int(math.Floor(float64(qty) * parsed.Percent / 100))
	default:
		return false, nil
	}

	// Idempotency guard: the ledger insert claims this payout. ON CONFLICT
	// DO NOTHING → zero rows means another run already applied it.
	tag, err := tx.Exec(ctx, `
		INSERT INTO challenge_dividends
			(challenge_id, participant_id, symbol, kind, announcement, percent,
			 book_closure_start, quantity_held, cash_credited, shares_credited)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (participant_id, symbol, book_closure_start, kind) DO NOTHING`,
		challengeID, pos.ParticipantID, pos.Symbol, parsed.Kind, announcement,
		parsed.Percent, closure.Format("2006-01-02"), qty, cashCredit, sharesCredit)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil // already applied by an earlier run
	}

	switch parsed.Kind {
	case dividend.KindDividend:
		if _, err := tx.Exec(ctx,
			`UPDATE challenge_participants SET cash_balance = cash_balance + $2 WHERE id=$1`,
			pos.ParticipantID, cashCredit); err != nil {
			return false, err
		}
	case dividend.KindBonus:
		if sharesCredit > 0 {
			// Cost basis unchanged → avg cost dilutes across the larger holding.
			newQty := qty + sharesCredit
			newAvg := float64(qty) * avg / float64(newQty)
			if _, err := tx.Exec(ctx,
				`UPDATE challenge_positions SET quantity=$2, avg_cost=$3 WHERE id=$1`,
				pos.ID, newQty, newAvg); err != nil {
				return false, err
			}
		}
		// sharesCredit == 0 (holding too small for even one bonus share):
		// keep the ledger row so the payout isn't re-evaluated every night.
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
