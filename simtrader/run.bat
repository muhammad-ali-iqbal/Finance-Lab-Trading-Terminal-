@echo off
cd /d "%~dp0"
go run ./cmd/server/main.go
pause
