// internal/dividend/service.go

// Package dividend proxies the PSX Data Portal payouts page
// (https://dps.psx.com.pk/payouts) so the frontend can show live dividend /
// bonus / right announcements without hitting PSX directly (CORS) and without
// hammering their server (results are cached in memory).
package dividend

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	psxPayoutsURL = "https://dps.psx.com.pk/payouts"
	psxSymbolsURL = "https://dps.psx.com.pk/symbols"
	// PSX caps the page size at 100 server-side; asking for more still
	// returns 100, so this is the freshest window we can get per request.
	pageSize = 100
	cacheTTL = 30 * time.Minute
	// The listed-companies directory changes rarely; refresh daily.
	symbolsTTL = 24 * time.Hour
	// Upper bound on distinct symbol queries kept in the cache so student
	// searches can't grow the map without limit.
	maxCacheEntries = 256
)

// Payout is one row of the PSX payouts table. Date fields are passed through
// as published by PSX (already human-readable, Pakistan time) rather than
// re-parsed, so a format drift on their side degrades to raw text instead of
// dropped rows.
type Payout struct {
	Symbol       string `json:"symbol"`
	Company      string `json:"company"`
	Sector       string `json:"sector"`
	Announcement string `json:"announcement"` // e.g. "60%(i) (D)", "10% (B)"
	AnnouncedAt  string `json:"announcedAt"`  // e.g. "April 17, 2026 5:10 PM"
	BookClosure  string `json:"bookClosure"`  // e.g. "29/04/2026 - 30/04/2026"
}

// Result is the parsed payload for one PSX query.
type Result struct {
	Payouts   []Payout  `json:"payouts"`
	Total     int       `json:"total"` // total entries PSX reports for the query
	FetchedAt time.Time `json:"fetchedAt"`
}

type cacheEntry struct {
	result    *Result
	expiresAt time.Time
}

// Symbol is one entry of the PSX listed-securities directory, used by the
// frontend for search suggestions (match by ticker or company name).
type Symbol struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
	Sector string `json:"sectorName"`
	IsDebt bool   `json:"isDebt"`
}

type Service struct {
	client *http.Client

	mu    sync.Mutex
	cache map[string]cacheEntry // key: upper-cased symbol filter ("" = all)

	symbolsMu        sync.Mutex
	symbols          []Symbol
	symbolsExpiresAt time.Time
}

func NewService() *Service {
	return &Service{
		client: &http.Client{Timeout: 15 * time.Second},
		cache:  make(map[string]cacheEntry),
	}
}

// List returns the latest payouts, optionally filtered by symbol (the filter
// is applied server-side by PSX). Responses are cached for cacheTTL.
func (s *Service) List(ctx context.Context, symbol string) (*Result, error) {
	key := strings.ToUpper(strings.TrimSpace(symbol))

	s.mu.Lock()
	if e, ok := s.cache[key]; ok && time.Now().Before(e.expiresAt) {
		s.mu.Unlock()
		return e.result, nil
	}
	s.mu.Unlock()

	res, err := s.fetch(ctx, key)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.pruneLocked()
	s.cache[key] = cacheEntry{result: res, expiresAt: time.Now().Add(cacheTTL)}
	s.mu.Unlock()
	return res, nil
}

// Symbols returns the PSX listed-securities directory (ticker + company
// name), cached for symbolsTTL. Debt instruments (TFCs, sukuk) are dropped —
// they don't appear in equity payout searches and only add noise.
func (s *Service) Symbols(ctx context.Context) ([]Symbol, error) {
	s.symbolsMu.Lock()
	defer s.symbolsMu.Unlock()
	if s.symbols != nil && time.Now().Before(s.symbolsExpiresAt) {
		return s.symbols, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, psxSymbolsURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SimTrader/1.0 (IBA Finance Lab)")

	resp, err := s.client.Do(req)
	if err != nil {
		// Serve a stale directory over an error if we have one.
		if s.symbols != nil {
			return s.symbols, nil
		}
		return nil, fmt.Errorf("psx symbols request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		if s.symbols != nil {
			return s.symbols, nil
		}
		return nil, fmt.Errorf("psx symbols returned status %d", resp.StatusCode)
	}

	var all []Symbol
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&all); err != nil {
		return nil, fmt.Errorf("psx symbols decode failed: %w", err)
	}
	equities := make([]Symbol, 0, len(all))
	for _, sym := range all {
		if !sym.IsDebt && sym.Symbol != "" {
			equities = append(equities, sym)
		}
	}

	s.symbols = equities
	s.symbolsExpiresAt = time.Now().Add(symbolsTTL)
	return equities, nil
}

// pruneLocked drops expired entries and, if the cache is still at capacity,
// clears it entirely (a full refetch is cheap relative to unbounded growth).
func (s *Service) pruneLocked() {
	now := time.Now()
	for k, e := range s.cache {
		if now.After(e.expiresAt) {
			delete(s.cache, k)
		}
	}
	if len(s.cache) >= maxCacheEntries {
		s.cache = make(map[string]cacheEntry)
	}
}

func (s *Service) fetch(ctx context.Context, symbol string) (*Result, error) {
	form := url.Values{
		"symbol":    {symbol},
		"count":     {strconv.Itoa(pageSize)},
		"offset":    {"0"},
		"date_from": {""},
		"date_to":   {""},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, psxPayoutsURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "SimTrader/1.0 (IBA Finance Lab)")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("psx payouts request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("psx payouts returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 2MB guard
	if err != nil {
		return nil, err
	}
	return parsePayoutsHTML(string(body)), nil
}

// The AJAX response is a server-rendered HTML fragment:
//
//	<div class="announcementsResults__header"><div>Showing 1 to 25 of 559 entries</div>...
//	<table ...><tbody>
//	  <tr><td><a ...><strong>HBL</strong></a></td><td>Habib Bank Limited</td>
//	      <td>COMMERCIAL BANKS</td><td> 60%(i) (D) </td>
//	      <td>April 17, 2026 5:10 PM</td><td>29/04/2026  - 30/04/2026 </td></tr>
var (
	rowRe   = regexp.MustCompile(`(?s)<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>`)
	tagRe   = regexp.MustCompile(`<[^>]*>`)
	spaceRe = regexp.MustCompile(`\s+`)
	totalRe = regexp.MustCompile(`of\s+(\d+)\s+entries`)
)

func parsePayoutsHTML(doc string) *Result {
	res := &Result{Payouts: []Payout{}, FetchedAt: time.Now()}

	if m := totalRe.FindStringSubmatch(doc); m != nil {
		res.Total, _ = strconv.Atoi(m[1])
	}

	for _, m := range rowRe.FindAllStringSubmatch(doc, -1) {
		p := Payout{
			Symbol:       cleanCell(m[1]),
			Company:      cleanCell(m[2]),
			Sector:       cleanCell(m[3]),
			Announcement: cleanCell(m[4]),
			AnnouncedAt:  cleanCell(m[5]),
			BookClosure:  cleanCell(m[6]),
		}
		if p.Symbol == "" {
			continue
		}
		res.Payouts = append(res.Payouts, p)
	}
	if res.Total == 0 {
		res.Total = len(res.Payouts)
	}
	return res
}

// cleanCell strips tags, decodes entities and collapses whitespace.
func cleanCell(s string) string {
	s = tagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	return strings.TrimSpace(spaceRe.ReplaceAllString(s, " "))
}
