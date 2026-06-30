// internal/middleware/auth.go

package middleware

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/types"
)

const claimsKey = "claims"

// TokenParser is satisfied by auth.Service — middleware never imports auth directly.
type TokenParser interface {
	ParseAccessToken(token string) (*types.Claims, error)
}

// StatusGuard answers "is this user still active?" with a short-lived in-memory
// cache so a blocked student loses access within seconds rather than waiting up
// to 15 minutes for their access token to expire (AUTH-04). The cache bounds the
// added DB load to roughly one query per user per TTL.
type StatusGuard struct {
	lookup func(ctx context.Context, id uuid.UUID) (string, error)
	ttl    time.Duration
	mu     sync.Mutex
	cache  map[uuid.UUID]statusEntry
}

type statusEntry struct {
	blocked bool
	expires time.Time
}

// NewStatusGuard builds a guard. lookup returns the user's status string.
func NewStatusGuard(lookup func(ctx context.Context, id uuid.UUID) (string, error), ttl time.Duration) *StatusGuard {
	return &StatusGuard{lookup: lookup, ttl: ttl, cache: map[uuid.UUID]statusEntry{}}
}

// isBlocked reports whether the user is blocked, consulting the cache first.
// On a lookup error it fails open (returns false) so a transient DB blip does
// not lock everyone out — the refresh path still re-checks status authoritatively.
func (g *StatusGuard) isBlocked(ctx context.Context, id uuid.UUID) bool {
	now := time.Now()
	g.mu.Lock()
	if e, ok := g.cache[id]; ok && now.Before(e.expires) {
		g.mu.Unlock()
		return e.blocked
	}
	g.mu.Unlock()

	status, err := g.lookup(ctx, id)
	if err != nil {
		return false
	}
	blocked := status == "blocked"
	g.mu.Lock()
	g.cache[id] = statusEntry{blocked: blocked, expires: now.Add(g.ttl)}
	g.mu.Unlock()
	return blocked
}

// RequireAuth validates the Bearer token and stores claims in the request
// context. If guard is non-nil, it also rejects users blocked since the token
// was issued.
func RequireAuth(parser TokenParser, guard *StatusGuard) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := extractBearerToken(c)
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Authentication required.",
			})
		}
		claims, err := parser.ParseAccessToken(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired session. Please log in again.",
			})
		}
		if guard != nil {
			if id, err := uuid.Parse(claims.UserID); err == nil && guard.isBlocked(c.Context(), id) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "Your account has been suspended. Contact your instructor.",
				})
			}
		}
		c.Locals(claimsKey, claims)
		return c.Next()
	}
}

// RequireRole checks the authenticated user has one of the allowed roles.
// Must be chained after RequireAuth.
func RequireRole(roles ...types.Role) fiber.Handler {
	allowed := make(map[types.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *fiber.Ctx) error {
		claims := GetClaims(c)
		if claims == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Authentication required.",
			})
		}
		if !allowed[claims.Role] {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You don't have permission to access this resource.",
			})
		}
		return c.Next()
	}
}

// GetClaims retrieves JWT claims stored by RequireAuth.
func GetClaims(c *fiber.Ctx) *types.Claims {
	claims, _ := c.Locals(claimsKey).(*types.Claims)
	return claims
}

func extractBearerToken(c *fiber.Ctx) string {
	header := c.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
