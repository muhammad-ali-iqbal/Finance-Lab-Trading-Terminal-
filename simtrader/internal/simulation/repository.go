// internal/simulation/repository.go

package simulation

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/simtrader/backend/internal/types"
)

var (
	ErrNotFound  = errors.New("simulation not found")
	ErrNoTicks   = errors.New("no price ticks found for simulation")
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Create inserts a new simulation in draft status.
func (r *Repository) Create(ctx context.Context, s *Simulation) error {
	query := `
		INSERT INTO simulations (id, name, description, status, speed_multiplier, starting_cash, created_by)
		VALUES ($1, $2, $3, 'draft', $4, $5, $6)`
	_, err := r.db.Exec(ctx, query,
		s.ID, s.Name, s.Description, s.SpeedMultiplier, s.StartingCash, s.CreatedBy)
	return err
}

// GetByID fetches a simulation by UUID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Simulation, error) {
	query := `
		SELECT id, name, description, status, current_sim_time,
		       speed_multiplier, starting_cash, created_by, created_at, updated_at
		FROM simulations WHERE id = $1`
	return r.scanOne(r.db.QueryRow(ctx, query, id))
}

// GetSimStatus returns the status and starting cash for a simulation.
// This is a lightweight version used by order and portfolio handlers.
func (r *Repository) GetSimStatus(ctx context.Context, id uuid.UUID) (string, float64, error) {
	query := `
		SELECT status, starting_cash
		FROM simulations WHERE id = $1`
	var status string
	var startingCash float64
	err := r.db.QueryRow(ctx, query, id).Scan(&status, &startingCash)
	if err != nil {
		return "", 0, err
	}
	return status, startingCash, nil
}

// GetActive returns the currently active simulation (there should be at most one).
func (r *Repository) GetActive(ctx context.Context) (*Simulation, error) {
	query := `
		SELECT id, name, description, status, current_sim_time,
		       speed_multiplier, starting_cash, created_by, created_at, updated_at
		FROM simulations WHERE status = 'active'
		ORDER BY updated_at DESC LIMIT 1`
	return r.scanOne(r.db.QueryRow(ctx, query))
}

// List returns all simulations ordered by newest first.
func (r *Repository) List(ctx context.Context) ([]*Simulation, error) {
	query := `
		SELECT id, name, description, status, current_sim_time,
		       speed_multiplier, starting_cash, created_by, created_at, updated_at
		FROM simulations ORDER BY created_at DESC`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sims []*Simulation
	for rows.Next() {
		s, err := r.scanOne(pgx.Row(rows))
		if err != nil {
			return nil, err
		}
		sims = append(sims, s)
	}
	return sims, rows.Err()
}

// UpdateStatus changes the simulation status.
func (r *Repository) UpdateStatus(ctx context.Context, id uuid.UUID, status Status) error {
	query := `UPDATE simulations SET status = $2, updated_at = NOW() WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id, status)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateName changes the simulation name.
func (r *Repository) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	query := `UPDATE simulations SET name = $2, updated_at = NOW() WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id, name)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateDescription changes the simulation description.
func (r *Repository) UpdateDescription(ctx context.Context, id uuid.UUID, description string) error {
	query := `UPDATE simulations SET description = $2, updated_at = NOW() WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id, description)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete permanently removes a simulation and all cascading data.
func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.Exec(ctx, `DELETE FROM simulations WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateCurrentSimTime atomically updates the clock position.
// Called by the clock goroutine after each tick is broadcast.
func (r *Repository) UpdateCurrentSimTime(ctx context.Context, id uuid.UUID, simTime time.Time) error {
	query := `UPDATE simulations SET current_sim_time = $2, updated_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, simTime)
	return err
}

// IngestCSV bulk-inserts price ticks from a CSV reader.
// Uses COPY for maximum insert speed — handles 400k rows in seconds.
// Validates each row before inserting; returns error on first bad row.
func (r *Repository) IngestCSV(ctx context.Context, simulationID uuid.UUID, reader io.Reader) (int, error) {
	csvReader := csv.NewReader(reader)
	csvReader.TrimLeadingSpace = true

	// Read and validate header
	header, err := csvReader.Read()
	if err != nil {
		return 0, fmt.Errorf("read header: %w", err)
	}
	if err := validateHeader(header); err != nil {
		return 0, err
	}

	// Parse all rows first — validate before touching the database.
	// If row 50,000 is bad, we don't want a half-ingested dataset.
	var ticks []types.PriceTick
	lineNum := 1
	for {
		lineNum++
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, fmt.Errorf("line %d: csv parse error: %w", lineNum, err)
		}

		tick, err := parseCSVRow(simulationID, record, lineNum)
		if err != nil {
			return 0, err
		}
		ticks = append(ticks, tick)
	}

	if len(ticks) == 0 {
		return 0, ErrNoTicks
	}

	// Delete existing ticks for this simulation (re-upload replaces data)
	_, err = r.db.Exec(ctx, `DELETE FROM price_ticks WHERE simulation_id = $1`, simulationID)
	if err != nil {
		return 0, fmt.Errorf("clear existing ticks: %w", err)
	}

	// Bulk insert via COPY — fastest possible PostgreSQL insert method.
	// For 7,800 rows this takes ~50ms; for 400k rows ~2 seconds.
	rows := make([][]any, len(ticks))
	for i, t := range ticks {
		rows[i] = []any{simulationID, t.Symbol, t.SimTime, t.Open, t.High, t.Low, t.Close, t.Volume}
	}

	_, err = r.db.CopyFrom(
		ctx,
		pgx.Identifier{"price_ticks"},
		[]string{"simulation_id", "symbol", "sim_time", "open", "high", "low", "close", "volume"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		return 0, fmt.Errorf("bulk insert: %w", err)
	}

	return len(ticks), nil
}

// GetTicksAtTime returns all symbols' bars at exactly one simulated timestamp.
// This is the hot path — called by the clock goroutine every tick interval.
func (r *Repository) GetTicksAtTime(ctx context.Context, simID uuid.UUID, simTime time.Time) ([]types.PriceTick, error) {
	query := `
		SELECT symbol, sim_time, open, high, low, close, volume
		FROM price_ticks
		WHERE simulation_id = $1 AND sim_time = $2
		ORDER BY symbol`

	rows, err := r.db.Query(ctx, query, simID, simTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ticks []types.PriceTick
	for rows.Next() {
		var t types.PriceTick
		t.SimulationID = simID
		if err := rows.Scan(&t.Symbol, &t.SimTime, &t.Open, &t.High, &t.Low, &t.Close, &t.Volume); err != nil {
			return nil, err
		}
		ticks = append(ticks, t)
	}
	return ticks, rows.Err()
}

// GetNextSimTime returns the next timestamp after the given one.
// Returns nil if we've reached the end of the data.
func (r *Repository) GetNextSimTime(ctx context.Context, simID uuid.UUID, after time.Time) (*time.Time, error) {
	query := `
		SELECT DISTINCT sim_time FROM price_ticks
		WHERE simulation_id = $1 AND sim_time > $2
		ORDER BY sim_time ASC LIMIT 1`

	var next time.Time
	err := r.db.QueryRow(ctx, query, simID, after).Scan(&next)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // end of data
		}
		return nil, err
	}
	return &next, nil
}

// GetFirstSimTime returns the earliest timestamp in the simulation data.
func (r *Repository) GetFirstSimTime(ctx context.Context, simID uuid.UUID) (*time.Time, error) {
	query := `SELECT MIN(sim_time) FROM price_ticks WHERE simulation_id = $1`
	var first time.Time
	err := r.db.QueryRow(ctx, query, simID).Scan(&first)
	if err != nil {
		return nil, err
	}
	return &first, nil
}

// GetSymbols returns the list of symbols in a simulation.
func (r *Repository) GetSymbols(ctx context.Context, simID uuid.UUID) ([]string, error) {
	query := `SELECT DISTINCT symbol FROM price_ticks WHERE simulation_id = $1 ORDER BY symbol`
	rows, err := r.db.Query(ctx, query, simID)
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

// GetTicksForSymbol returns all bars for one symbol — used by the chart history endpoint.
func (r *Repository) GetTicksForSymbol(ctx context.Context, simID uuid.UUID, symbol string) ([]types.PriceTick, error) {
	query := `
		SELECT symbol, sim_time, open, high, low, close, volume
		FROM price_ticks
		WHERE simulation_id = $1 AND symbol = $2
		ORDER BY sim_time ASC`

	rows, err := r.db.Query(ctx, query, simID, strings.ToUpper(symbol))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ticks []types.PriceTick
	for rows.Next() {
		var t types.PriceTick
		if err := rows.Scan(&t.Symbol, &t.SimTime, &t.Open, &t.High, &t.Low, &t.Close, &t.Volume); err != nil {
			return nil, err
		}
		ticks = append(ticks, t)
	}
	return ticks, rows.Err()
}

// ── CSV parsing helpers ───────────────────────────────────────────────────────

func validateHeader(fields []string) error {
	required := map[string]bool{
		"timestamp": false, "symbol": false,
		"open": false, "high": false, "low": false, "close": false, "volume": false,
	}
	for _, f := range fields {
		delete(required, strings.ToLower(strings.TrimSpace(f)))
	}
	if len(required) > 0 {
		missing := make([]string, 0, len(required))
		for k := range required {
			missing = append(missing, k)
		}
		return fmt.Errorf("missing CSV columns: %v", missing)
	}
	return nil
}

func parseCSVRow(simID uuid.UUID, record []string, lineNum int) (types.PriceTick, error) {
	if len(record) < 7 {
		return types.PriceTick{}, fmt.Errorf("line %d: expected 7 columns, got %d", lineNum, len(record))
	}

	// Column order: timestamp,symbol,open,high,low,close,volume
	tsStr  := strings.TrimSpace(record[0])
	symbol := strings.TrimSpace(strings.ToUpper(record[1]))

	simTime, err := time.Parse(time.RFC3339, tsStr)
	if err != nil {
		return types.PriceTick{}, fmt.Errorf("line %d: invalid timestamp %q (use YYYY-MM-DDTHH:MM:SSZ): %w", lineNum, tsStr, err)
	}

	open,  err := strconv.ParseFloat(strings.TrimSpace(record[2]), 64)
	if err != nil { return types.PriceTick{}, fmt.Errorf("line %d: invalid open %q", lineNum, record[2]) }
	high,  err := strconv.ParseFloat(strings.TrimSpace(record[3]), 64)
	if err != nil { return types.PriceTick{}, fmt.Errorf("line %d: invalid high %q", lineNum, record[3]) }
	low,   err := strconv.ParseFloat(strings.TrimSpace(record[4]), 64)
	if err != nil { return types.PriceTick{}, fmt.Errorf("line %d: invalid low %q", lineNum, record[4]) }
	close, err := strconv.ParseFloat(strings.TrimSpace(record[5]), 64)
	if err != nil { return types.PriceTick{}, fmt.Errorf("line %d: invalid close %q", lineNum, record[5]) }
	volume, err := strconv.ParseInt(strings.TrimSpace(record[6]), 10, 64)
	if err != nil { return types.PriceTick{}, fmt.Errorf("line %d: invalid volume %q", lineNum, record[6]) }

	// Validate OHLC logic
	if open <= 0 || high <= 0 || low <= 0 || close <= 0 {
		return types.PriceTick{}, fmt.Errorf("line %d: prices must be positive", lineNum)
	}
	if high < low {
		return types.PriceTick{}, fmt.Errorf("line %d: high (%.4f) < low (%.4f)", lineNum, high, low)
	}

	return types.PriceTick{
		SimulationID: simID,
		Symbol:       symbol,
		SimTime:      simTime.UTC(),
		Open:         open,
		High:         high,
		Low:          low,
		Close:        close,
		Volume:       volume,
	}, nil
}

// ── Row scanner ───────────────────────────────────────────────────────────────

func (r *Repository) scanOne(row pgx.Row) (*Simulation, error) {
	s := &Simulation{}
	err := row.Scan(
		&s.ID, &s.Name, &s.Description, &s.Status, &s.CurrentSimTime,
		&s.SpeedMultiplier, &s.StartingCash, &s.CreatedBy, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return s, nil
}

// GetLastSimTime returns the latest timestamp in the simulation data.
func (r *Repository) GetLastSimTime(ctx context.Context, simID uuid.UUID) (*time.Time, error) {
	query := `SELECT MAX(sim_time) FROM price_ticks WHERE simulation_id = $1`
	var last time.Time
	err := r.db.QueryRow(ctx, query, simID).Scan(&last)
	if err != nil {
		return nil, err
	}
	return &last, nil
}

// ResetSimTime clears current_sim_time so the clock restarts from the first tick.
func (r *Repository) ResetSimTime(ctx context.Context, simID uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		`UPDATE simulations SET current_sim_time = NULL, updated_at = NOW() WHERE id = $1`,
		simID,
	)
	return err
}
