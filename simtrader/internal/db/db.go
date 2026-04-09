// internal/db/db.go
//
// Why pgx instead of database/sql?
// pgx is the native PostgreSQL driver for Go. It supports pgx-specific
// features like advisory locks (needed later for simulation), LISTEN/NOTIFY,
// and has better performance than the generic database/sql interface.
// The pool handles connection reuse automatically — you never manage
// individual connections yourself.

package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the shared database connection pool.
// One pool for the entire application — pgx handles concurrency internally.
var Pool *pgxpool.Pool

// Connect opens the connection pool and verifies the database is reachable.
// Call this once at application startup.
func Connect(databaseURL string) error {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Pool sizing — for 50-200 students, these limits are deliberately
	// conservative. PostgreSQL default max_connections is 100; we leave
	// room for admin tooling and migrations.
	config.MaxConns = 20
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	// HealthCheckPeriod pings idle connections so stale ones are
	// detected before a real query hits them.
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Ping to verify the database is actually reachable at startup.
	// Fail fast — better to crash on boot than silently serve errors.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	Pool = pool
	return nil
}

// Close shuts down the pool gracefully. Call in main() via defer.
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
