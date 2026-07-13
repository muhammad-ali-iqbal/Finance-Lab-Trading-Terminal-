// internal/dividend/parse.go
//
// Parsing of PSX payout announcement strings into structured values, used by
// the challenge reconciler to credit dividends/bonus shares to participants.

package dividend

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Payout kinds as encoded in the PSX announcement suffix.
const (
	KindDividend = "dividend" // (D) — cash dividend, % of face value
	KindBonus    = "bonus"    // (B) — bonus share issue, % of holding
	KindRight    = "right"    // (R) — right issue (requires subscription; not auto-applied)
)

// ParsedPayout is the structured form of an announcement like "60%(i) (D)".
type ParsedPayout struct {
	Kind    string  // KindDividend | KindBonus | KindRight
	Percent float64 // the announced percentage, e.g. 60 for "60%(i) (D)"
}

var percentRe = regexp.MustCompile(`(\d+(?:\.\d+)?)\s*%`)

// ParseAnnouncement extracts the payout kind and percentage from the PSX
// "Dividend Announcement" cell, e.g. "60%(i) (D)" → dividend 60%,
// "10% (B)" → bonus 10%. Returns ok=false for ambiguous strings (more than
// one kind marker), missing/zero percentages, or unrecognised kinds — callers
// must skip those rather than guess.
func ParseAnnouncement(s string) (ParsedPayout, bool) {
	var p ParsedPayout

	kinds := 0
	if strings.Contains(s, "(D)") {
		p.Kind = KindDividend
		kinds++
	}
	if strings.Contains(s, "(B)") {
		p.Kind = KindBonus
		kinds++
	}
	if strings.Contains(s, "(R)") {
		p.Kind = KindRight
		kinds++
	}
	if kinds != 1 {
		return ParsedPayout{}, false
	}

	m := percentRe.FindStringSubmatch(s)
	if m == nil {
		return ParsedPayout{}, false
	}
	pct, err := strconv.ParseFloat(m[1], 64)
	if err != nil || pct <= 0 {
		return ParsedPayout{}, false
	}
	p.Percent = pct
	return p, true
}

// ParseBookClosureStart returns the first date of a PSX book-closure cell,
// e.g. "29/04/2026 - 30/04/2026" (or a single "29/04/2026") → 2026-04-29.
// The date is returned in the location given (book closure is a Pakistan
// calendar date; pass the PKT zone so day comparisons line up).
func ParseBookClosureStart(s string, loc *time.Location) (time.Time, bool) {
	first := strings.TrimSpace(strings.SplitN(s, "-", 2)[0])
	t, err := time.ParseInLocation("02/01/2006", first, loc)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
