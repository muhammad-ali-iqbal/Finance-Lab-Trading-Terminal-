// internal/simulation/adapter.go
//
// Thin adapter types so other packages can depend on simulation data
// without importing the full simulation package and risking cycles.

package simulation

import (
	"context"

	"github.com/google/uuid"
)

// GetSimInfo returns a lightweight struct with just what portfolio/order need.
func (r *Repository) GetSimInfo(ctx context.Context, id uuid.UUID) (*Simulation, error) {
	return r.GetByID(ctx, id)
}

// GetActiveSimInfo returns the active simulation's info.
func (r *Repository) GetActiveSimInfo(ctx context.Context) (*Simulation, error) {
	return r.GetActive(ctx)
}
