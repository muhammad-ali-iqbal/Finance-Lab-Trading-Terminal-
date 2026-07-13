// internal/dividend/parse_test.go

package dividend

import (
	"testing"
	"time"
)

func TestParseAnnouncement(t *testing.T) {
	cases := []struct {
		in      string
		kind    string
		percent float64
		ok      bool
	}{
		// Real strings captured from dps.psx.com.pk/payouts
		{"60%(i) (D)", KindDividend, 60, true},
		{"60%(F) (D)", KindDividend, 60, true},
		{"50%(iii) (D)", KindDividend, 50, true},
		{"129.111%(i) (D)", KindDividend, 129.111, true},
		{"10% (B)", KindBonus, 10, true},
		{"25%(R)", KindRight, 25, true},
		// Rejections
		{"", "", 0, false},
		{"TBA", "", 0, false},
		{"10% (D) 5% (B)", "", 0, false}, // ambiguous combined announcement
		{"0%(F) (D)", "", 0, false},      // zero payout
	}
	for _, c := range cases {
		got, ok := ParseAnnouncement(c.in)
		if ok != c.ok {
			t.Errorf("ParseAnnouncement(%q) ok = %v, want %v", c.in, ok, c.ok)
			continue
		}
		if ok && (got.Kind != c.kind || got.Percent != c.percent) {
			t.Errorf("ParseAnnouncement(%q) = %+v, want kind=%s percent=%v", c.in, got, c.kind, c.percent)
		}
	}
}

func TestParseBookClosureStart(t *testing.T) {
	pkt := time.FixedZone("PKT", 5*60*60)

	got, ok := ParseBookClosureStart("29/04/2026 - 30/04/2026", pkt)
	if !ok {
		t.Fatal("expected range to parse")
	}
	if got.Format("2006-01-02") != "2026-04-29" {
		t.Errorf("start = %s, want 2026-04-29", got.Format("2006-01-02"))
	}

	got, ok = ParseBookClosureStart("21/07/2026", pkt)
	if !ok || got.Format("2006-01-02") != "2026-07-21" {
		t.Errorf("single date parse = %v %v", got, ok)
	}

	if _, ok := ParseBookClosureStart("TBA", pkt); ok {
		t.Error("expected TBA to fail")
	}
	if _, ok := ParseBookClosureStart("", pkt); ok {
		t.Error("expected empty to fail")
	}
}
