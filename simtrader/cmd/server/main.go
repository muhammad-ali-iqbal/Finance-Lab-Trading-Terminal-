// cmd/server/main.go

package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	fiberlogger "github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/announcement"
	"github.com/simtrader/backend/internal/auth"
	"github.com/simtrader/backend/internal/challenge"
	"github.com/simtrader/backend/internal/config"
	"github.com/simtrader/backend/internal/db"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/order"
	"github.com/simtrader/backend/internal/portfolio"
	"github.com/simtrader/backend/internal/psxtracker"
	"github.com/simtrader/backend/internal/simulation"
	"github.com/simtrader/backend/internal/types"
	"github.com/simtrader/backend/internal/user"
)

func main() {
	// ── 1. Config ──────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	// ── 2. Database ────────────────────────────────────────────────────────────
	if err := db.Connect(cfg.DatabaseURL, cfg.Env); err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()
	log.Println("✓ Database connected")

	if err := db.Migrate("migrations"); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}
	log.Println("✓ Migrations applied")

	// ── 3. Dependency wiring ───────────────────────────────────────────────────

	// Auth
	userRepo := user.NewRepository(db.Pool)
	var mailer auth.Mailer
	if cfg.SMTPHost != "" {
		mailer = auth.NewSMTPMailer(cfg)
		log.Printf("✓ Email: SMTP configured (host: %s)", cfg.SMTPHost)
	} else if cfg.Env == "production" {
		// Refuse to start in production with the NoOpMailer, which would print
		// account-takeover-grade invite/reset tokens to the logs (DATA-02).
		log.Fatalf("SMTP_HOST is required when ENV=production (refusing to start with the token-printing NoOpMailer)")
	} else {
		mailer = &auth.NoOpMailer{}
		log.Println("⚠  Email: NoOpMailer active (set SMTP_HOST to enable real sending)")
	}
	authService := auth.NewService(userRepo, cfg, mailer)
	authHandler := auth.NewHandler(authService)
	userHandler := user.NewHandler(userRepo, authService)

	// Middleware. The status guard makes admin blocks take effect within ~30s
	// instead of waiting out the access-token TTL (AUTH-04).
	statusGuard := middleware.NewStatusGuard(func(ctx context.Context, id uuid.UUID) (string, error) {
		s, err := userRepo.GetStatus(ctx, id)
		return string(s), err
	}, 30*time.Second)
	authMW := middleware.RequireAuth(authService, statusGuard)
	adminMW := middleware.RequireRole(types.RoleAdmin)

	// Simulation
	simRepo := simulation.NewRepository(db.Pool)
	orderEngine := order.NewEngine(db.Pool)
	simHandler := simulation.NewHandler(simRepo, orderEngine, authService)

	// Orders
	orderRepo := order.NewOrderRepository(db.Pool)
	orderHandler := order.NewHandler(orderRepo, simRepo)

	// Portfolio
	portfolioRepo := portfolio.NewRepository(db.Pool)
	portfolioHandler := portfolio.NewHandler(portfolioRepo, simRepo)

	// Challenge
	challengeRepo := challenge.NewRepository(db.Pool)
	challengeReconciler := challenge.NewReconciler(challengeRepo, db.Pool)
	challengeHandler := challenge.NewHandler(challengeRepo, challengeReconciler, cfg.InternalSecret)
	ctx, cancelReconciler := context.WithCancel(context.Background())
	go challengeReconciler.Start(ctx)

	// Periodic retention cleanup of expired/revoked tokens (DATA-04).
	go startTokenCleanup(ctx, userRepo)

	// Announcements
	announcementRepo := announcement.NewRepository(db.Pool)
	announcementService := announcement.NewService(announcementRepo, userRepo, mailer)
	announcementHandler := announcement.NewHandler(announcementService)

	// PSX Tracker admin panel
	psxHandler := psxtracker.NewHandler(cfg.PSXTrackerDir, cfg.PythonCmd)

	// ── 4. HTTP server ─────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		ErrorHandler: jsonErrorHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
		BodyLimit:    60 * 1024 * 1024, // 60MB for CSV uploads

		// Trust the X-Real-IP set by our own nginx/reverse proxy so c.IP()
		// resolves to the true client, not the proxy container address. Without
		// this the rate limiter collapses to a single global bucket (NET-03).
		EnableTrustedProxyCheck: true,
		ProxyHeader:             "X-Real-IP",
		TrustedProxies:          trustedProxies(),
	})

	// ── Global middleware ──────────────────────────────────────────────────────
	app.Use(recover.New(recover.Config{
		EnableStackTrace: cfg.Env == "development",
	}))
	app.Use(fiberlogger.New(fiberlogger.Config{
		Format: "${time} | ${status} | ${latency} | ${method} ${path}\n",
	}))

	// Security response headers (NET-02). HSTS is only emitted when the request
	// arrived over HTTPS (set by the TLS-terminating reverse proxy) so plain-HTTP
	// local dev is unaffected. CSP is intentionally strict for the API origin;
	// the SPA is served by nginx, which sets its own CSP.
	app.Use(helmet.New(helmet.Config{
		XFrameOptions:         "DENY",
		ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
		ReferrerPolicy:        "no-referrer",
		HSTSMaxAge:            31536000, // 1 year; subdomains included (default)
		HSTSPreloadEnabled:    true,
		// X-Content-Type-Options: nosniff is emitted by default.
	}))

	app.Use(cors.New(cors.Config{
		// Reflect only explicitly allowed origins. Wildcard reflection with
		// credentials is gated behind an explicit dev-only opt-in (CORS-01).
		AllowOriginsFunc: corsAllow(cfg),
		AllowOrigins:     cfg.FrontendURL,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Upgrade",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	// Serve uploaded user avatars as static files. Force nosniff and an
	// attachment disposition so a payload stored under an image extension can
	// never be sniffed and rendered as active content (INPUT-02).
	app.Use("/uploads", func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Content-Disposition", "inline")
		return c.Next()
	})
	app.Static("/uploads", "./uploads")

	// ── Health check ───────────────────────────────────────────────────────────
	app.Get("/health", func(c *fiber.Ctx) error {
		if err := db.Pool.Ping(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "unhealthy", "db": "unreachable",
			})
		}
		return c.JSON(fiber.Map{"status": "healthy", "version": "1.0.0"})
	})

	tooMany := func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": "too many requests, please try again later",
		})
	}

	// ── Auth rate limiter — 10 req/min per IP on login/register/forgot/reset ──
	authLimiter := limiter.New(limiter.Config{
		Max:          10,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: tooMany,
	})

	// Dedicated limiter for refresh/logout so refresh-token grinding is throttled
	// independently of the login bucket (NET-03).
	refreshLimiter := limiter.New(limiter.Config{
		Max:          30,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: tooMany,
	})

	// Strict limiter for the internal EOD ingestion endpoint, which is reachable
	// through the public nginx proxy. The only legitimate caller is psx_tracker
	// once a day, so a tight cap stops unauthenticated secret-spraying (NET-01).
	internalLimiter := limiter.New(limiter.Config{
		Max:          20,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: tooMany,
	})

	// ── Routes ─────────────────────────────────────────────────────────────────
	authHandler.RegisterRoutes(app, authLimiter, refreshLimiter)
	userHandler.RegisterRoutes(app, authMW, adminMW)
	simHandler.RegisterRoutes(app, authMW, adminMW)
	orderHandler.RegisterRoutes(app, authMW)
	portfolioHandler.RegisterRoutes(app, authMW)
	challengeHandler.RegisterRoutes(app, authMW, adminMW, internalLimiter)
	announcementHandler.RegisterRoutes(app, authMW, adminMW)
	psxHandler.RegisterRoutes(app, authMW, adminMW)

	// 404
	app.Use(func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Route %s %s not found.", c.Method(), c.Path()),
		})
	})

	// ── Graceful shutdown ──────────────────────────────────────────────────────
	go func() {
		addr := fmt.Sprintf(":%s", cfg.Port)
		log.Printf("✓ Server listening on %s (env: %s)", addr, cfg.Env)
		if err := app.Listen(addr); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit
	log.Println("→ Shutdown signal received. Draining connections...")
	cancelReconciler()
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	log.Println("✓ Server stopped cleanly.")
}

// trustedProxies returns the CIDR ranges Fiber should trust for X-Real-IP /
// X-Forwarded-For. Defaults to the RFC1918 private ranges (the nginx/Caddy
// proxy and the docker network) and can be overridden via TRUSTED_PROXIES.
func trustedProxies() []string {
	if v := os.Getenv("TRUSTED_PROXIES"); v != "" {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	return []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/8"}
}

// corsAllow builds the origin predicate. In production it never reflects
// arbitrary origins. In development it reflects localhost/LAN origins, and only
// reflects ANY origin when CORS_ALLOW_ANY=true is explicitly set (CORS-01).
func corsAllow(cfg *config.Config) func(string) bool {
	return func(origin string) bool {
		if cfg.Env != "development" {
			return false
		}
		if cfg.CorsAllowAny {
			return true
		}
		o := strings.ToLower(origin)
		return strings.Contains(o, "localhost") ||
			strings.Contains(o, "127.0.0.1") ||
			strings.HasPrefix(o, "http://192.168.") ||
			strings.HasPrefix(o, "http://10.") ||
			strings.HasPrefix(o, "http://172.")
	}
}

// startTokenCleanup runs the retention sweep at boot and every 6 hours (DATA-04).
func startTokenCleanup(ctx context.Context, repo *user.Repository) {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	run := func() {
		n, err := repo.CleanupExpiredTokens(ctx)
		if err != nil {
			log.Printf("[cleanup] token cleanup error: %v", err)
			return
		}
		if n > 0 {
			log.Printf("[cleanup] purged %d expired/revoked refresh tokens", n)
		}
	}
	run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

func jsonErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}
