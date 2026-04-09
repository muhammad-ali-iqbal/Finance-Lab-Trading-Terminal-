// internal/config/config.go
//
// Centralises all environment variable reading.
// The rest of the application imports Config, never os.Getenv directly.
// This means if a variable is missing, the app panics at startup
// with a clear message — not silently mid-request.

package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port string
	Env  string

	DatabaseURL string

	JWTAccessSecret  string
	JWTRefreshSecret string
	JWTAccessExpiry  time.Duration
	JWTRefreshExpiry time.Duration

	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	EmailFrom string

	FrontendURL string
}

// Load reads .env (if present) then environment variables.
// In production (Railway), variables come from the platform — no .env file.
func Load() (*Config, error) {
	// godotenv.Load() silently does nothing if .env doesn't exist,
	// which is correct for production.
	_ = godotenv.Load()

	cfg := &Config{}
	var missing []string

	cfg.Port = getEnv("PORT", "8080")
	cfg.Env = getEnv("ENV", "development")
	cfg.FrontendURL = getEnv("FRONTEND_URL", "http://localhost:5173")

	// Required — app cannot function without these
	cfg.DatabaseURL = requireEnv("DATABASE_URL", &missing)
	cfg.JWTAccessSecret = requireEnv("JWT_ACCESS_SECRET", &missing)
	cfg.JWTRefreshSecret = requireEnv("JWT_REFRESH_SECRET", &missing)

	// Email — required for invite flow
	cfg.SMTPHost = requireEnv("SMTP_HOST", &missing)
	cfg.SMTPPort = getEnv("SMTP_PORT", "587")
	cfg.SMTPUser = requireEnv("SMTP_USER", &missing)
	cfg.SMTPPass = requireEnv("SMTP_PASS", &missing)
	cfg.EmailFrom = getEnv("EMAIL_FROM", "noreply@simtrader.app")

	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %v", missing)
	}

	// Parse durations with safe defaults
	cfg.JWTAccessExpiry = parseDuration(getEnv("JWT_ACCESS_EXPIRY", "15m"))
	cfg.JWTRefreshExpiry = parseDuration(getEnv("JWT_REFRESH_EXPIRY", "168h")) // 7 days

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string, missing *[]string) string {
	v := os.Getenv(key)
	if v == "" {
		*missing = append(*missing, key)
	}
	return v
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 15 * time.Minute // safe default
	}
	return d
}
