// internal/challenge/repository.go

package challenge

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// ── Challenge CRUD ────────────────────────────────────────────────────────────

func (r *Repository) Insert(ctx context.Context, c *Challenge) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenges (id, name, description, start_date, end_date, initial_capital, status, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)`,
		c.ID, c.Name, c.Description, c.StartDate, c.EndDate, c.InitialCapital, c.CreatedBy,
	)
	return err
}

func (r *Repository) Update(ctx context.Context, c *Challenge) error {
	_, err := r.db.Exec(ctx, `
		UPDATE challenges SET name=$2, description=$3, start_date=$4, end_date=$5, initial_capital=$6
		WHERE id=$1`,
		c.ID, c.Name, c.Description, c.StartDate, c.EndDate, c.InitialCapital,
	)
	return err
}

func (r *Repository) SetStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE challenges SET status=$2 WHERE id=$1`, id, status)
	return err
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Challenge, error) {
	c := &Challenge{}
	err := r.db.QueryRow(ctx, `
		SELECT id, name, description, start_date::text, end_date::text, initial_capital, status, created_by, created_at
		FROM challenges WHERE id=$1`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.StartDate, &c.EndDate,
		&c.InitialCapital, &c.Status, &c.CreatedBy, &c.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}

func (r *Repository) ListAll(ctx context.Context) ([]Challenge, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, description, start_date::text, end_date::text, initial_capital, status, created_by, created_at
		FROM challenges ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChallenges(rows)
}

func (r *Repository) ListActive(ctx context.Context) ([]Challenge, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, description, start_date::text, end_date::text, initial_capital, status, created_by, created_at
		FROM challenges WHERE status IN ('active','completed') ORDER BY start_date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChallenges(rows)
}

func scanChallenges(rows pgx.Rows) ([]Challenge, error) {
	var out []Challenge
	for rows.Next() {
		var c Challenge
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.StartDate, &c.EndDate,
			&c.InitialCapital, &c.Status, &c.CreatedBy, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Participants ──────────────────────────────────────────────────────────────

func (r *Repository) JoinChallenge(ctx context.Context, challengeID, userID uuid.UUID, capital float64) (*Participant, error) {
	p := &Participant{
		ID:          uuid.New(),
		ChallengeID: challengeID,
		UserID:      userID,
		CashBalance: capital,
		JoinedAt:    time.Now(),
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenge_participants (id, challenge_id, user_id, cash_balance)
		VALUES ($1,$2,$3,$4) ON CONFLICT (challenge_id, user_id) DO NOTHING`,
		p.ID, p.ChallengeID, p.UserID, p.CashBalance,
	)
	if err != nil {
		return nil, err
	}
	// Re-fetch to get the actual (possibly pre-existing) row
	return r.GetParticipant(ctx, challengeID, userID)
}

func (r *Repository) GetParticipant(ctx context.Context, challengeID, userID uuid.UUID) (*Participant, error) {
	p := &Participant{}
	err := r.db.QueryRow(ctx, `
		SELECT id, challenge_id, user_id, cash_balance, joined_at
		FROM challenge_participants WHERE challenge_id=$1 AND user_id=$2`,
		challengeID, userID,
	).Scan(&p.ID, &p.ChallengeID, &p.UserID, &p.CashBalance, &p.JoinedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

func (r *Repository) ListParticipants(ctx context.Context, challengeID uuid.UUID) ([]Participant, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, user_id, cash_balance, joined_at
		FROM challenge_participants WHERE challenge_id=$1 ORDER BY joined_at`,
		challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Participant
	for rows.Next() {
		var p Participant
		if err := rows.Scan(&p.ID, &p.ChallengeID, &p.UserID, &p.CashBalance, &p.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) EnrollUser(ctx context.Context, challengeID, userID uuid.UUID, capital float64) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenge_participants (id, challenge_id, user_id, cash_balance)
		VALUES ($1,$2,$3,$4) ON CONFLICT (challenge_id, user_id) DO NOTHING`,
		uuid.New(), challengeID, userID, capital,
	)
	return err
}

func (r *Repository) GetParticipantByID(ctx context.Context, participantID uuid.UUID) (*Participant, error) {
	p := &Participant{}
	err := r.db.QueryRow(ctx, `
		SELECT id, challenge_id, user_id, cash_balance, joined_at
		FROM challenge_participants WHERE id=$1`, participantID,
	).Scan(&p.ID, &p.ChallengeID, &p.UserID, &p.CashBalance, &p.JoinedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *Repository) ListNonParticipantUsers(ctx context.Context, challengeID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id FROM users
		WHERE status='active' AND role='student'
		  AND id NOT IN (SELECT user_id FROM challenge_participants WHERE challenge_id=$1)`,
		challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ── Orders ────────────────────────────────────────────────────────────────────

func (r *Repository) InsertOrder(ctx context.Context, o *ChallengeOrder) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenge_orders
		  (id, challenge_id, participant_id, symbol, side, order_type, quantity, limit_price, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
		o.ID, o.ChallengeID, o.ParticipantID, o.Symbol,
		o.Side, o.OrderType, o.Quantity, o.LimitPrice,
	)
	return err
}

func (r *Repository) ListOrders(ctx context.Context, participantID uuid.UUID) ([]ChallengeOrder, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, symbol, side, order_type,
		       quantity, limit_price, status, fill_price, fill_date::text, reject_reason, created_at
		FROM challenge_orders WHERE participant_id=$1 ORDER BY created_at DESC`,
		participantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOrders(rows)
}

func (r *Repository) CancelOrder(ctx context.Context, orderID, participantID uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE challenge_orders SET status='cancelled'
		WHERE id=$1 AND participant_id=$2 AND status='pending'`,
		orderID, participantID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repository) ListPendingOrders(ctx context.Context, challengeID uuid.UUID) ([]ChallengeOrder, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, symbol, side, order_type,
		       quantity, limit_price, status, fill_price, fill_date::text, reject_reason, created_at
		FROM challenge_orders
		WHERE challenge_id=$1 AND status='pending'
		ORDER BY created_at`,
		challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOrders(rows)
}

func scanOrders(rows pgx.Rows) ([]ChallengeOrder, error) {
	var out []ChallengeOrder
	for rows.Next() {
		var o ChallengeOrder
		if err := rows.Scan(&o.ID, &o.ChallengeID, &o.ParticipantID, &o.Symbol,
			&o.Side, &o.OrderType, &o.Quantity, &o.LimitPrice,
			&o.Status, &o.FillPrice, &o.FillDate, &o.RejectReason, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// ── Positions ─────────────────────────────────────────────────────────────────

func (r *Repository) GetPositions(ctx context.Context, participantID uuid.UUID) ([]ChallengePosition, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, symbol, quantity, avg_cost
		FROM challenge_positions
		WHERE participant_id=$1 AND quantity > 0`,
		participantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChallengePosition
	for rows.Next() {
		var p ChallengePosition
		if err := rows.Scan(&p.ID, &p.ChallengeID, &p.ParticipantID, &p.Symbol, &p.Quantity, &p.AvgCost); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListHeldPositionsByChallenge returns every position with shares held across
// all participants of a challenge — the working set for the reconciler's
// corporate-action (dividend/bonus) pass.
func (r *Repository) ListHeldPositionsByChallenge(ctx context.Context, challengeID uuid.UUID) ([]ChallengePosition, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, symbol, quantity, avg_cost
		FROM challenge_positions
		WHERE challenge_id=$1 AND quantity > 0`,
		challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChallengePosition
	for rows.Next() {
		var p ChallengePosition
		if err := rows.Scan(&p.ID, &p.ChallengeID, &p.ParticipantID, &p.Symbol, &p.Quantity, &p.AvgCost); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListDividends returns the payouts applied to one participant, newest first.
func (r *Repository) ListDividends(ctx context.Context, participantID uuid.UUID) ([]DividendRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, symbol, kind, announcement, percent,
		       to_char(book_closure_start, 'YYYY-MM-DD'), quantity_held,
		       cash_credited, shares_credited, applied_at
		FROM challenge_dividends
		WHERE participant_id=$1
		ORDER BY applied_at DESC`,
		participantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DividendRecord
	for rows.Next() {
		var d DividendRecord
		if err := rows.Scan(&d.ID, &d.ChallengeID, &d.ParticipantID, &d.Symbol, &d.Kind,
			&d.Announcement, &d.Percent, &d.BookClosureStart, &d.QuantityHeld,
			&d.CashCredited, &d.SharesCredited, &d.AppliedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *Repository) UpsertPosition(ctx context.Context, p *ChallengePosition) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenge_positions (id, challenge_id, participant_id, symbol, quantity, avg_cost)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (participant_id, symbol) DO UPDATE
		  SET quantity=$5, avg_cost=$6`,
		p.ID, p.ChallengeID, p.ParticipantID, p.Symbol, p.Quantity, p.AvgCost,
	)
	return err
}

func (r *Repository) UpdateCash(ctx context.Context, participantID uuid.UUID, cash float64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE challenge_participants SET cash_balance=$2 WHERE id=$1`,
		participantID, cash,
	)
	return err
}

func (r *Repository) FillOrder(ctx context.Context, orderID uuid.UUID, fillPrice float64, fillDate string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE challenge_orders SET status='filled', fill_price=$2, fill_date=$3 WHERE id=$1`,
		orderID, fillPrice, fillDate,
	)
	return err
}

func (r *Repository) RejectOrder(ctx context.Context, orderID uuid.UUID, reason string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE challenge_orders SET status='rejected', reject_reason=$2 WHERE id=$1`,
		orderID, reason,
	)
	return err
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

func (r *Repository) UpsertSnapshot(ctx context.Context, s *Snapshot) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO challenge_snapshots
		  (id, challenge_id, participant_id, snapshot_date, portfolio_value, cash_balance)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (participant_id, snapshot_date)
		DO UPDATE SET portfolio_value=$5, cash_balance=$6`,
		s.ID, s.ChallengeID, s.ParticipantID, s.Date, s.PortfolioValue, s.CashBalance,
	)
	return err
}

func (r *Repository) GetSnapshots(ctx context.Context, participantID uuid.UUID) ([]Snapshot, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, challenge_id, participant_id, snapshot_date::text, portfolio_value, cash_balance
		FROM challenge_snapshots WHERE participant_id=$1 ORDER BY snapshot_date`,
		participantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Snapshot
	for rows.Next() {
		var s Snapshot
		if err := rows.Scan(&s.ID, &s.ChallengeID, &s.ParticipantID, &s.Date, &s.PortfolioValue, &s.CashBalance); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// ── EOD Prices ────────────────────────────────────────────────────────────────

func (r *Repository) UpsertEODPrices(ctx context.Context, date string, prices []EODPrice) error {
	for _, p := range prices {
		if _, err := r.db.Exec(ctx, `
			INSERT INTO eod_prices (symbol, trade_date, open, high, low, close, volume)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (symbol, trade_date) DO UPDATE
			  SET open=$3, high=$4, low=$5, close=$6, volume=$7, ingested_at=NOW()`,
			p.Symbol, date, p.Open, p.High, p.Low, p.Close, p.Volume,
		); err != nil {
			return err
		}
	}
	return nil
}

// UpsertSecurities stores/updates ticker -> company name mappings pushed by
// psx_tracker after each ticker refresh.
func (r *Repository) UpsertSecurities(ctx context.Context, securities []Security) error {
	for _, s := range securities {
		if _, err := r.db.Exec(ctx, `
			INSERT INTO securities (symbol, name, sector)
			VALUES ($1,$2,$3)
			ON CONFLICT (symbol) DO UPDATE
			  SET name=$2, sector=$3, updated_at=NOW()`,
			s.Symbol, s.Name, nullIfEmpty(s.Sector),
		); err != nil {
			return err
		}
	}
	return nil
}

// ListSecurities returns the full ticker -> company name lookup.
func (r *Repository) ListSecurities(ctx context.Context) ([]Security, error) {
	rows, err := r.db.Query(ctx, `SELECT symbol, name, COALESCE(sector, '') FROM securities ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Security
	for rows.Next() {
		var s Security
		if err := rows.Scan(&s.Symbol, &s.Name, &s.Sector); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (r *Repository) GetLatestPrices(ctx context.Context, symbols []string) (map[string]float64, error) {
	if len(symbols) == 0 {
		return map[string]float64{}, nil
	}
	prices := make(map[string]float64, len(symbols))
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT ON (symbol) symbol, close
		FROM eod_prices
		WHERE symbol = ANY($1)
		ORDER BY symbol, trade_date DESC`,
		symbols,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sym string
		var close float64
		if err := rows.Scan(&sym, &close); err != nil {
			return nil, err
		}
		prices[sym] = close
	}
	return prices, rows.Err()
}

func (r *Repository) GetPricesForDate(ctx context.Context, symbols []string, date string) (map[string]EODPrice, error) {
	prices := make(map[string]EODPrice)
	if len(symbols) == 0 {
		return prices, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT symbol, open, high, low, close, volume
		FROM eod_prices WHERE symbol = ANY($1) AND trade_date=$2`,
		symbols, date,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p EODPrice
		if err := rows.Scan(&p.Symbol, &p.Open, &p.High, &p.Low, &p.Close, &p.Volume); err != nil {
			return nil, err
		}
		prices[p.Symbol] = p
	}
	return prices, rows.Err()
}

func (r *Repository) GetEODSymbols(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT DISTINCT symbol FROM eod_prices ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var syms []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		syms = append(syms, s)
	}
	return syms, rows.Err()
}

type EODBar struct {
	Time   string  `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume int64   `json:"volume"`
}

func (r *Repository) GetEODHistory(ctx context.Context, symbol string) ([]EODBar, error) {
	rows, err := r.db.Query(ctx, `
		SELECT trade_date::text, open, high, low, close, volume
		FROM eod_prices WHERE symbol=$1 ORDER BY trade_date`,
		symbol,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var bars []EODBar
	for rows.Next() {
		var b EODBar
		if err := rows.Scan(&b.Time, &b.Open, &b.High, &b.Low, &b.Close, &b.Volume); err != nil {
			return nil, err
		}
		bars = append(bars, b)
	}
	return bars, rows.Err()
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

// LeaderboardRow joins participant + user for admin view
type LeaderboardRow struct {
	ParticipantID  uuid.UUID `json:"participantId"`
	UserID         uuid.UUID `json:"userId"`
	FirstName      string    `json:"firstName"`
	LastName       string    `json:"lastName"`
	Email          string    `json:"email"`
	CashBalance    float64   `json:"cashBalance"`
	PortfolioValue float64   `json:"portfolioValue"` // set by service layer
	ReturnPct      float64   `json:"returnPct"`      // set by service layer
	Rank           int       `json:"rank"`
}

func (r *Repository) GetLeaderboardRows(ctx context.Context, challengeID uuid.UUID) ([]LeaderboardRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT cp.id, cp.user_id, u.first_name, u.last_name, u.email, cp.cash_balance
		FROM challenge_participants cp
		JOIN users u ON u.id = cp.user_id
		WHERE cp.challenge_id=$1
		ORDER BY cp.joined_at`,
		challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LeaderboardRow
	for rows.Next() {
		var row LeaderboardRow
		if err := rows.Scan(&row.ParticipantID, &row.UserID,
			&row.FirstName, &row.LastName, &row.Email, &row.CashBalance); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *Repository) GetParticipantCount(ctx context.Context, challengeID uuid.UUID) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM challenge_participants WHERE challenge_id=$1`, challengeID,
	).Scan(&n)
	return n, err
}
