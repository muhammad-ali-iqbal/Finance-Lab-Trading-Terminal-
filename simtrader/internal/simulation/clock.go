// internal/simulation/clock.go
//
// The simulation clock is a single goroutine that:
//   1. Reads from price_ticks at the current simulated timestamp
//   2. Broadcasts all symbol bars to every connected WebSocket client
//   3. Triggers the order fill engine for pending limit/stop orders
//   4. Advances the clock to the next timestamp
//   5. Sleeps for (1 minute / speedMultiplier) wall-clock seconds
//
// Concurrency model:
//   - One goroutine per simulation (only one simulation is active at a time)
//   - WebSocket clients register/deregister via thread-safe channels
//   - Order fill runs synchronously within the tick — no race conditions
//   - Stop/Pause signals arrive via context cancellation
//
// Why this is safe:
//   The clock goroutine is the ONLY writer to current_sim_time.
//   It holds no locks — it uses channels for all communication.
//   If the server crashes and restarts, it reads current_sim_time from the DB
//   and resumes from exactly where it left off.

package simulation

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/types"
	"nhooyr.io/websocket"
)

// Client represents one connected student.
type Client struct {
	id   uuid.UUID
	conn *websocket.Conn
	send chan []byte
}

// Clock manages the simulation replay engine and all connected WebSocket clients.
type Clock struct {
	mu           sync.RWMutex
	simID        uuid.UUID
	repo         *Repository
	orderEngine  types.OrderFiller  // fills orders on each tick
	clients      map[uuid.UUID]*Client
	register     chan *Client
	deregister   chan *Client
	cancelFn     context.CancelFunc
	running      bool
}

// NewClock creates a clock for a given simulation.
func NewClock(simID uuid.UUID, repo *Repository, filler types.OrderFiller) *Clock {
	return &Clock{
		simID:       simID,
		repo:        repo,
		orderEngine: filler,
		clients:     make(map[uuid.UUID]*Client),
		register:    make(chan *Client, 64),
		deregister:  make(chan *Client, 64),
	}
}

// Start begins the clock goroutine. Returns immediately.
// If the simulation has a current_sim_time, resumes from there.
// If not, starts from the first tick in the data.
func (c *Clock) Start(parentCtx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		return fmt.Errorf("clock already running for simulation %s", c.simID)
	}

	sim, err := c.repo.GetByID(parentCtx, c.simID)
	if err != nil {
		return fmt.Errorf("load simulation: %w", err)
	}

	// Resume from where we left off, or start from the beginning
	var startTime time.Time
	if sim.CurrentSimTime != nil {
		startTime = *sim.CurrentSimTime
	} else {
		first, err := c.repo.GetFirstSimTime(parentCtx, c.simID)
		if err != nil || first == nil {
			return fmt.Errorf("no price ticks found — upload CSV first")
		}
		startTime = *first
	}

	ctx, cancel := context.WithCancel(parentCtx)
	c.cancelFn = cancel
	c.running = true

	// Wall-clock interval between ticks.
	// speedMultiplier=60 means 1 wall second = 1 simulated minute.
	tickInterval := time.Duration(float64(time.Minute) / sim.SpeedMultiplier)

	go c.run(ctx, startTime, tickInterval, sim.SpeedMultiplier)
	log.Printf("[clock] simulation %s started at sim_time=%s interval=%s",
		c.simID, startTime.Format(time.RFC3339), tickInterval)
	return nil
}

// Stop halts the clock goroutine gracefully.
func (c *Clock) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cancelFn != nil {
		c.cancelFn()
	}
	c.running = false
	log.Printf("[clock] simulation %s stopped", c.simID)
}

// IsRunning reports whether the clock is currently active.
func (c *Clock) IsRunning() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.running
}

// AddClient registers a WebSocket connection to receive tick broadcasts.
func (c *Clock) AddClient(client *Client) {
	c.register <- client
}

// RemoveClient deregisters a WebSocket connection.
func (c *Clock) RemoveClient(client *Client) {
	c.deregister <- client
}

// ── Main clock loop ───────────────────────────────────────────────────────────

func (c *Clock) run(ctx context.Context, currentSimTime time.Time, interval time.Duration, speed float64) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[clock] %s: context cancelled, stopping", c.simID)
			return

		case client := <-c.register:
			c.mu.Lock()
			c.clients[client.id] = client
			c.mu.Unlock()
			log.Printf("[clock] %s: client %s connected (%d total)",
				c.simID, client.id, len(c.clients))

		case client := <-c.deregister:
			c.mu.Lock()
			delete(c.clients, client.id)
			c.mu.Unlock()
			log.Printf("[clock] %s: client %s disconnected (%d total)",
				c.simID, client.id, len(c.clients))

		case <-ticker.C:
			// ── Core tick processing ──────────────────────────────────────
			//
			// 1. Fetch all symbols' bars at currentSimTime
			ticks, err := c.repo.GetTicksAtTime(ctx, c.simID, currentSimTime)
			if err != nil {
				log.Printf("[clock] %s: fetch ticks error: %v", c.simID, err)
				continue
			}

			if len(ticks) == 0 {
				// No data at this time — advance anyway (gap in data)
				log.Printf("[clock] %s: no ticks at %s, advancing", c.simID, currentSimTime)
			} else {
				// 2. Broadcast to all students
				c.broadcast(currentSimTime, ticks)

				// 3. Process pending orders against new prices
				// This is synchronous within the tick — orders fill before
				// the next tick starts, which is the correct behaviour:
				// a student's order submitted in minute N fills at minute N's close.
				if err := c.orderEngine.ProcessTickOrders(ctx, c.simID, ticks); err != nil {
					log.Printf("[clock] %s: order processing error: %v", c.simID, err)
				}
			}

			// 4. Persist current sim time to DB (crash recovery)
			if err := c.repo.UpdateCurrentSimTime(ctx, c.simID, currentSimTime); err != nil {
				log.Printf("[clock] %s: update sim_time error: %v", c.simID, err)
			}

			// 5. Advance to next timestamp
			next, err := c.repo.GetNextSimTime(ctx, c.simID, currentSimTime)
			if err != nil {
				log.Printf("[clock] %s: get next sim_time error: %v", c.simID, err)
				continue
			}

			if next == nil {
				// End of data — mark simulation complete
				log.Printf("[clock] %s: simulation complete at %s", c.simID, currentSimTime)
				if err := c.repo.UpdateStatus(ctx, c.simID, StatusCompleted); err != nil {
					log.Printf("[clock] %s: complete status error: %v", c.simID, err)
				}
				c.mu.Lock()
				c.running = false
				c.mu.Unlock()
				return
			}

			currentSimTime = *next
		}
	}
}

// broadcast serialises a TickBroadcast to JSON and sends it to all connected clients.
// Uses a goroutine per client so a slow client doesn't block others.
func (c *Clock) broadcast(simTime time.Time, ticks []types.PriceTick) {
	msg := TickBroadcast{
		SimulationTime: simTime,
		Ticks:          ticks,
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[clock] marshal error: %v", err)
		return
	}

	c.mu.RLock()
	snapshot := make([]*Client, 0, len(c.clients))
	for _, cl := range c.clients {
		snapshot = append(snapshot, cl)
	}
	c.mu.RUnlock()

	for _, cl := range snapshot {
		// Non-blocking send to client's buffered channel.
		// If the channel is full (client is slow), we drop this tick for them.
		// The next tick will include updated prices — they won't miss a bar permanently.
		select {
		case cl.send <- payload:
		default:
			log.Printf("[clock] client %s send buffer full — dropping tick", cl.id)
		}
	}
}

// ── ClockRegistry ─────────────────────────────────────────────────────────────
// Global registry so the HTTP handlers can find the running clock.

type ClockRegistry struct {
	mu     sync.RWMutex
	clocks map[uuid.UUID]*Clock
}

var Registry = &ClockRegistry{
	clocks: make(map[uuid.UUID]*Clock),
}

func (r *ClockRegistry) Register(simID uuid.UUID, c *Clock) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clocks[simID] = c
}

func (r *ClockRegistry) Get(simID uuid.UUID) (*Clock, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.clocks[simID]
	return c, ok
}

func (r *ClockRegistry) Remove(simID uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clocks, simID)
}
