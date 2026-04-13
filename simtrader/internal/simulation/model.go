// internal/simulation/model.go

package simulation

import (
	"time"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/types"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusActive    Status = "active"
	StatusPaused    Status = "paused"
	StatusCompleted Status = "completed"
)

type Simulation struct {
	ID              uuid.UUID  `json:"id"`
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	Status          Status     `json:"status"`
	CurrentSimTime  *time.Time `json:"currentSimTime"`
	SpeedMultiplier float64    `json:"speedMultiplier"`
	StartingCash    float64    `json:"startingCash"`
	CreatedBy       uuid.UUID  `json:"createdBy"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// TickBroadcast is the WebSocket message sent to students each clock tick.
// Contains all symbols' bars for the current simulated minute.
type TickBroadcast struct {
	SimulationTime time.Time          `json:"simulationTime"`
	Ticks          []types.PriceTick `json:"ticks"`
}
