// internal/dividend/handler.go

package dividend

import (
	"log"
	"regexp"

	"github.com/gofiber/fiber/v2"
	"github.com/simtrader/backend/internal/httputil"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the dividend endpoints. Any authenticated user
// (student or admin) can read them.
func (h *Handler) RegisterRoutes(app *fiber.App, authMW fiber.Handler) {
	app.Get("/api/dividends", authMW, h.List)
	app.Get("/api/dividends/symbols", authMW, h.Symbols)
}

// PSX tickers are short alphanumerics (a few carry dots, e.g. index symbols).
var symbolRe = regexp.MustCompile(`^[A-Za-z0-9.\-]{1,15}$`)

// List godoc
// GET /api/dividends?symbol=HBL
// Returns the latest PSX dividend/bonus/right announcements, optionally
// filtered by ticker symbol. Data is proxied from dps.psx.com.pk and cached.
func (h *Handler) List(c *fiber.Ctx) error {
	symbol := c.Query("symbol")
	if symbol != "" && !symbolRe.MatchString(symbol) {
		return httputil.BadRequest(c, "invalid symbol")
	}

	res, err := h.svc.List(c.Context(), symbol)
	if err != nil {
		log.Printf("[dividend] fetch failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Could not fetch dividend announcements from PSX. Please try again later.",
		})
	}
	return c.JSON(res)
}

// Symbols godoc
// GET /api/dividends/symbols
// Returns the PSX listed-securities directory (ticker + company name) for
// client-side search suggestions. Cached daily.
func (h *Handler) Symbols(c *fiber.Ctx) error {
	symbols, err := h.svc.Symbols(c.Context())
	if err != nil {
		log.Printf("[dividend] symbols fetch failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Could not fetch the PSX symbol directory. Please try again later.",
		})
	}
	return c.JSON(fiber.Map{"symbols": symbols, "total": len(symbols)})
}
