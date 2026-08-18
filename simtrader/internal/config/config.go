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

	// InternalSecret is the shared secret psx_tracker sends with EOD price ingestion.
	InternalSecret string

	// CorsAllowAny, when true AND Env == "development", makes CORS reflect any
	// origin. It must be opted into explicitly (CORS_ALLOW_ANY=true) so a stray
	// ENV=development can no longer silently enable wildcard reflection (CORS-01).
	CorsAllowAny bool

	// PSXTrackerDir is the absolute path to the psx_tracker directory.
	// Used by the admin PSX panel to run tracker commands from the UI.
	PSXTrackerDir string

	// PythonCmd is the Python executable name (python or python3).
	PythonCmd string

	// BasePath is the subpath SimTrader is served under behind the reverse
	// proxy (e.g. "/simtrader"), or "" when served from the domain root.
	// Caddy's handle_path strips it before requests reach this container, so
	// internal routing is unaffected — but avatar URLs returned to the
	// browser (UploadAvatar/SetPreset) must include it, or the browser will
	// resolve them against the domain root instead of back through the proxy.
	BasePath string
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
	cfg.Env = getEnv("ENV", "production")
	cfg.FrontendURL = getEnv("FRONTEND_URL", "http://localhost:5173")
	cfg.PSXTrackerDir = getEnv("PSX_TRACKER_DIR", "../psx_tracker")
	cfg.PythonCmd = getEnv("PYTHON_CMD", "python")
	cfg.BasePath = getEnv("BASE_PATH", "")

	// Required — app cannot function without these
	cfg.DatabaseURL = requireEnv("DATABASE_URL", &missing)
	cfg.JWTAccessSecret = requireEnv("JWT_ACCESS_SECRET", &missing)
	cfg.JWTRefreshSecret = requireEnv("JWT_REFRESH_SECRET", &missing)
	cfg.InternalSecret = requireEnv("INTERNAL_SECRET", &missing)

	// Email — optional in development (NoOpMailer is used instead)
	cfg.SMTPHost  = getEnv("SMTP_HOST",  "")
	cfg.SMTPPort  = getEnv("SMTP_PORT",  "587")
	cfg.SMTPUser  = getEnv("SMTP_USER",  "")
	cfg.SMTPPass  = getEnv("SMTP_PASS",  "")
	cfg.EmailFrom = getEnv("EMAIL_FROM", "noreply@simtrader.app")

	cfg.CorsAllowAny = getEnv("CORS_ALLOW_ANY", "") == "true"

	// Parse durations, failing fast on a malformed value instead of silently
	// falling back (AUTH-06) — a bad JWT_REFRESH_EXPIRY otherwise becomes 15m.
	var badDurations []string
	cfg.JWTAccessExpiry = parseDuration(getEnv("JWT_ACCESS_EXPIRY", "15m"), "JWT_ACCESS_EXPIRY", &badDurations)
	cfg.JWTRefreshExpiry = parseDuration(getEnv("JWT_REFRESH_EXPIRY", "168h"), "JWT_REFRESH_EXPIRY", &badDurations) // 7 days

	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %v", missing)
	}
	if len(badDurations) > 0 {
		return nil, fmt.Errorf("malformed duration environment variables: %v", badDurations)
	}

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

func parseDuration(s, key string, bad *[]string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		*bad = append(*bad, key)
		return 15 * time.Minute // placeholder; Load() will refuse to start
	}
	return d
}
