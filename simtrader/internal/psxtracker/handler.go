// internal/psxtracker/handler.go
//
// Admin-only HTTP handlers that run psx_tracker CLI commands and return
// their combined stdout+stderr output as JSON. Lets the admin operate the
// data pipeline entirely from the SimTrader UI without touching a terminal.

package psxtracker

import (
	"bytes"
	"context"
	"os/exec"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/simtrader/backend/internal/httputil"
)

type Handler struct {
	trackerDir string
	python     string
}

func NewHandler(trackerDir, python string) *Handler {
	return &Handler{trackerDir: trackerDir, python: python}
}

func (h *Handler) RegisterRoutes(app *fiber.App, authMW, adminMW fiber.Handler) {
	grp := app.Group("/api/admin/psx", authMW, adminMW)
	grp.Post("/fetch",    h.Fetch)
	grp.Post("/backfill", h.Backfill)
	grp.Post("/tickers",  h.Tickers)
	grp.Get("/status",    h.Status)
	grp.Post("/sync",     h.Sync)
}

// run executes a command in trackerDir, capturing combined stdout+stderr.
func (h *Handler) run(timeout time.Duration, script string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, h.python, append([]string{script}, args...)...)
	cmd.Dir = h.trackerDir

	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf

	err := cmd.Run()
	return strings.TrimSpace(buf.String()), err
}

func respond(c *fiber.Ctx, output string, err error) error {
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"ok":     false,
			"output": output,
			"error":  err.Error(),
		})
	}
	return c.JSON(fiber.Map{"ok": true, "output": output})
}

// POST /api/admin/psx/fetch
// Runs: python main.py fetch
func (h *Handler) Fetch(c *fiber.Ctx) error {
	out, err := h.run(10*time.Minute, "main.py", "fetch")
	return respond(c, out, err)
}

// POST /api/admin/psx/backfill   body: {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
// Runs: python main.py backfill <from> [<to>]
func (h *Handler) Backfill(c *fiber.Ctx) error {
	var req struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := c.BodyParser(&req); err != nil || req.From == "" {
		return httputil.BadRequest(c, "from date required (YYYY-MM-DD)")
	}
	args := []string{"backfill", req.From}
	if req.To != "" {
		args = append(args, req.To)
	}
	out, err := h.run(30*time.Minute, "main.py", args...)
	return respond(c, out, err)
}

// POST /api/admin/psx/tickers
// Runs: python main.py tickers
func (h *Handler) Tickers(c *fiber.Ctx) error {
	out, err := h.run(5*time.Minute, "main.py", "tickers")
	return respond(c, out, err)
}

// GET /api/admin/psx/status
// Runs: python main.py status
func (h *Handler) Status(c *fiber.Ctx) error {
	out, err := h.run(30*time.Second, "main.py", "status")
	return respond(c, out, err)
}

// POST /api/admin/psx/sync   body: {"from":"YYYY-MM-DD"}  (from is optional)
// Runs: python sync_to_simtrader.py [<from>]
func (h *Handler) Sync(c *fiber.Ctx) error {
	var req struct {
		From string `json:"from"`
	}
	_ = c.BodyParser(&req)
	args := []string{}
	if req.From != "" {
		args = append(args, req.From)
	}
	out, err := h.run(30*time.Minute, "sync_to_simtrader.py", args...)
	return respond(c, out, err)
}
