// internal/simulation/model.go

package simulation

import (
	"time"

	"github.com/google/uuid"
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

// PriceTick is one bar of OHLCV data for one symbol at one simulated time.
type PriceTick struct {
	ID           int64     `json:"-"`
	SimulationID uuid.UUID `json:"-"`
	Symbol       string    `json:"symbol"`
	SimTime      time.Time `json:"timestamp"`
	Open         float64   `json:"open"`
	High         float64   `json:"high"`
	Low          float64   `json:"low"`
	Close        float64   `json:"close"`
	Volume       int64     `json:"volume"`
}

// TickBroadcast is the WebSocket message sent to students each clock tick.
// Contains all symbols' bars for the current simulated minute.
type TickBroadcast struct {
	SimulationTime time.Time   `json:"simulationTime"`
	Ticks          []PriceTick `json:"ticks"`
}
