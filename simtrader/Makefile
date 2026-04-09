# Makefile
#
# Common development commands. Run `make help` to see all options.
# Requires: Go 1.22+, psql (PostgreSQL client), make

.PHONY: help run build migrate seed hash tidy lint clean

# Default target
help:
	@echo ""
	@echo "SimTrader Backend — available commands:"
	@echo ""
	@echo "  make run          Start the development server (reads .env)"
	@echo "  make build        Compile to a single binary at ./bin/server"
	@echo "  make migrate      Run database migrations (requires DATABASE_URL in .env)"
	@echo "  make hash p=xxx   Generate a bcrypt hash for password 'xxx'"
	@echo "  make tidy         Download dependencies and tidy go.mod"
	@echo "  make lint         Run go vet (basic static analysis)"
	@echo "  make clean        Remove compiled binary"
	@echo ""

# Run dev server — auto-reads .env via godotenv
run:
	@echo "Starting SimTrader backend..."
	go run ./cmd/server/main.go

# Build production binary
build:
	@mkdir -p bin
	CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/server ./cmd/server/main.go
	@echo "✓ Built: bin/server"

# Run migrations against the database in .env
migrate:
	@if [ -z "$$DATABASE_URL" ]; then \
		export $$(cat .env | grep DATABASE_URL | xargs); \
	fi; \
	psql $$DATABASE_URL -f migrations/001_create_users.sql
	@echo "✓ Migrations applied"

# Generate bcrypt hash: make hash p=MyPassword123
hash:
	go run scripts/hash_password.go $(p)

# Download all dependencies declared in go.mod
tidy:
	go mod tidy
	@echo "✓ Dependencies resolved"

# Basic static analysis — catches common Go mistakes
lint:
	go vet ./...
	@echo "✓ Vet passed"

# Remove build artifacts
clean:
	rm -rf bin/
	@echo "✓ Cleaned"
