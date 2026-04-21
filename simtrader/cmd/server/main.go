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
	fiberlogger "github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/simtrader/backend/internal/auth"
	"github.com/simtrader/backend/internal/config"
	"github.com/simtrader/backend/internal/db"
	"github.com/simtrader/backend/internal/middleware"
	"github.com/simtrader/backend/internal/order"
	"github.com/simtrader/backend/internal/portfolio"
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
	if err := db.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()
	log.Println("✓ Database connected")

	// ── 3. Dependency wiring ───────────────────────────────────────────────────

	// Auth
	userRepo := user.NewRepository(db.Pool)
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

	// Middleware
	authMW := middleware.RequireAuth(authService)
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

	// ── 4. HTTP server ─────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		ErrorHandler: jsonErrorHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
		BodyLimit:    60 * 1024 * 1024, // 60MB for CSV uploads
	})

	// ── Global middleware ──────────────────────────────────────────────────────
	app.Use(recover.New(recover.Config{
		EnableStackTrace: cfg.Env == "development",
	}))
	app.Use(fiberlogger.New(fiberlogger.Config{
		Format: "${time} | ${status} | ${latency} | ${method} ${path}\n",
	}))
	app.Use(cors.New(cors.Config{
		// In development, accept any origin so LAN devices (mobile/laptop via IP)
		// and localhost both work without reconfiguration.
		AllowOriginsFunc: func(origin string) bool { return cfg.Env == "development" },
		AllowOrigins:     cfg.FrontendURL,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Upgrade",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	// ── Health check ───────────────────────────────────────────────────────────
	app.Get("/health", func(c *fiber.Ctx) error {
		if err := db.Pool.Ping(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "unhealthy", "db": "unreachable",
			})
		}
		return c.JSON(fiber.Map{"status": "healthy", "version": "1.0.0"})
	})

	// ── Routes ─────────────────────────────────────────────────────────────────
	authHandler.RegisterRoutes(app)
	userHandler.RegisterRoutes(app, authMW, adminMW)
	simHandler.RegisterRoutes(app, authMW, adminMW)
	orderHandler.RegisterRoutes(app, authMW)
	portfolioHandler.RegisterRoutes(app, authMW)

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
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	log.Println("✓ Server stopped cleanly.")
}

func jsonErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}
