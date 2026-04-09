// internal/middleware/auth.go

package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/simtrader/backend/internal/types"
)

const claimsKey = "claims"

// TokenParser is satisfied by auth.Service — middleware never imports auth directly.
type TokenParser interface {
	ParseAccessToken(token string) (*types.Claims, error)
}

// RequireAuth validates the Bearer token and stores claims in the request context.
func RequireAuth(parser TokenParser) fiber.Handler {
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
