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
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the shared database connection pool.
// One pool for the entire application — pgx handles concurrency internally.
var Pool *pgxpool.Pool

// Connect opens the connection pool and verifies the database is reachable.
// Call this once at application startup. In production it refuses a DATABASE_URL
// that would connect without TLS, so student PII/credentials are never sent in
// cleartext to a managed database (DATA-03).
func Connect(databaseURL, env string) error {
	// In production, require TLS to the database so PII/credentials are never
	// sent in cleartext (DATA-03). The single-host compose deployment runs
	// Postgres on a private docker network with no TLS; that specific case can
	// opt out with DB_REQUIRE_TLS=false (logged loudly). A managed/remote DB
	// must keep TLS on.
	if env == "production" && os.Getenv("DB_REQUIRE_TLS") != "false" {
		if err := requireTLS(databaseURL); err != nil {
			return err
		}
	} else if env == "production" {
		log.Println("⚠  DB_REQUIRE_TLS=false — database TLS enforcement disabled (only safe on a trusted private network)")
	}

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

// requireTLS rejects a DATABASE_URL whose sslmode would permit an unencrypted
// connection (disable/allow/prefer, or unset which defaults to prefer in pgx).
func requireTLS(databaseURL string) error {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return fmt.Errorf("failed to parse database URL: %w", err)
	}
	mode := ""
	if cfg.ConnConfig.TLSConfig == nil {
		mode = "disabled"
	}
	// Inspect the raw sslmode for a precise, actionable error message.
	lower := strings.ToLower(databaseURL)
	for _, weak := range []string{"sslmode=disable", "sslmode=allow", "sslmode=prefer"} {
		if strings.Contains(lower, weak) {
			return fmt.Errorf("DATABASE_URL has %s but ENV=production requires TLS — use sslmode=require (or verify-full)", weak)
		}
	}
	if !strings.Contains(lower, "sslmode=") || mode == "disabled" {
		return fmt.Errorf("DATABASE_URL does not enforce TLS but ENV=production requires it — append sslmode=require")
	}
	return nil
}

// Migrate runs only the *.sql files in migrationsDir that have not been
// applied before. Applied filenames are recorded in a schema_migrations table
// so re-running the server never touches already-applied migrations.
func Migrate(migrationsDir string) error {
	ctx := context.Background()

	// Ensure the tracking table exists.
	_, err := Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// Load the set of already-applied filenames.
	rows, err := Pool.Query(ctx, `SELECT filename FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("query schema_migrations: %w", err)
	}
	applied := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		applied[name] = true
	}
	rows.Close()

	// Collect and sort migration files.
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	// Run only new files, recording each in schema_migrations.
	for _, name := range files {
		if applied[name] {
			continue
		}
		sql, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := Pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := Pool.Exec(ctx, `INSERT INTO schema_migrations (filename) VALUES ($1)`, name); err != nil {
			return fmt.Errorf("record %s: %w", name, err)
		}
		log.Printf("[migrate] ✓ %s", name)
	}
	return nil
}

// Close shuts down the pool gracefully. Call in main() via defer.
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
