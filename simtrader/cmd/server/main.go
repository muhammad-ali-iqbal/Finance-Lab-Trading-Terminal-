// cmd/server/main.go
//
// Entry point. This file does four things and nothing else:
//   1. Load config
//   2. Connect to the database
//   3. Wire up dependencies (repository → service → handler)
//   4. Start the HTTP server
//
// All business logic lives in internal/. This file is intentionally thin.
// If you find yourself writing logic here, it belongs in a service instead.

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
	fiberlogger "github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/simtrader/backend/internal/auth"
	"github.com/simtrader/backend/internal/config"
	"github.com/simtrader/backend/internal/db"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/types"
	"github.com/simtrader/backend/internal/user"
)

func main() {
	// ── 1. Config ──────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		// Fatal at startup — better than running with missing config.
		log.Fatalf("config error: %v", err)
	}

	// ── 2. Database ────────────────────────────────────────────────────────────
	if err := db.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()
	log.Println("✓ Database connected")

	// ── 3. Dependency wiring ───────────────────────────────────────────────────
	//
	// The dependency graph flows strictly downward:
	//   repository (DB access)
	//       ↓
	//   service (business logic)
	//       ↓
	//   handler (HTTP)
	//       ↓
	//   middleware (cross-cutting)
	//
	// Nothing in a lower layer imports from a higher one.

	userRepo := user.NewRepository(db.Pool)

	// In development, use NoOpMailer — tokens print to console.
	// In production, use real SMTP.
	var mailer auth.Mailer
	if cfg.Env == "development" {
		mailer = &auth.NoOpMailer{}
		log.Println("⚠ Email: using NoOpMailer (tokens will print to console)")
	} else {
		mailer = auth.NewSMTPMailer(cfg)
	}

	authService := auth.NewService(userRepo, cfg, mailer)
	authHandler := auth.NewHandler(authService)
	userHandler := user.NewHandler(userRepo, authService)

	// Middleware factories — curried with their dependencies.
	authMW := middleware.RequireAuth(authService)
	adminMW := middleware.RequireRole(types.RoleAdmin)

	// ── 4. HTTP server ─────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		// Disable the default error handler so our JSON errors are used.
		ErrorHandler: jsonErrorHandler,

		// ReadTimeout prevents slow-loris attacks.
		// WriteTimeout ensures stuck handlers don't hold connections forever.
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,

		// Don't expose the server name in response headers.
		ServerHeader: "",
		AppName:      "",
	})

	// ── Global middleware ──────────────────────────────────────────────────────

	// Recover from panics — returns 500 instead of crashing the whole server.
	// In production a panicking goroutine would only kill that request,
	// but Fiber's recover middleware is still a good safety net.
	app.Use(recover.New(recover.Config{
		EnableStackTrace: cfg.Env == "development",
	}))

	// Request logging — format shows method, path, status, duration.
	// In production you'd ship these logs to a log aggregator (e.g. Logtail).
	app.Use(fiberlogger.New(fiberlogger.Config{
		Format: "${time} | ${status} | ${latency} | ${method} ${path}\n",
	}))

	// CORS — only allow requests from the frontend origin.
	// Never use AllowOrigins: "*" in production — it defeats CORS entirely.
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.FrontendURL,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
		MaxAge:           86400, // Browser caches preflight for 24h
	}))

	// ── Health check ───────────────────────────────────────────────────────────
	// UptimeRobot pings this every 5 minutes.
	// It also checks the DB — a healthy response means the whole stack is up.
	app.Get("/health", func(c *fiber.Ctx) error {
		if err := db.Pool.Ping(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "unhealthy",
				"db":     "unreachable",
			})
		}
		return c.JSON(fiber.Map{
			"status":  "healthy",
			"version": "1.0.0",
		})
	})

	// ── Routes ─────────────────────────────────────────────────────────────────
	authHandler.RegisterRoutes(app)
	userHandler.RegisterRoutes(app, authMW, adminMW)

	// 404 handler — catches any unmatched route.
	app.Use(func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Route %s %s not found.", c.Method(), c.Path()),
		})
	})

	// ── Graceful shutdown ──────────────────────────────────────────────────────
	//
	// When Railway (or any platform) stops the container, it sends SIGTERM.
	// We catch it, stop accepting new connections, and let in-flight requests
	// finish before exiting. Without this, active requests get cut off mid-response.

	// Start server in a goroutine so the main goroutine can listen for signals.
	go func() {
		addr := fmt.Sprintf(":%s", cfg.Port)
		log.Printf("✓ Server listening on %s (env: %s)", addr, cfg.Env)
		if err := app.Listen(addr); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Block until we receive a shutdown signal.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Println("→ Shutdown signal received. Draining connections...")

	// Give in-flight requests 10 seconds to complete.
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		log.Printf("shutdown error: %v", err)
	}

	log.Println("✓ Server stopped cleanly.")
}

// jsonErrorHandler ensures all Fiber errors return JSON, not HTML.
// Without this, framework-level errors (e.g. 413 body too large) return HTML.
func jsonErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}
