// internal/dividend/service_test.go

package dividend

import "testing"

// Fragment captured verbatim from POST https://dps.psx.com.pk/payouts on
// 2026-07-13 (trimmed to two rows).
const sampleHTML = `<div class="announcementsResults__header"><div>Showing  1 to 25 of 559 entries</div><div><button class="form__button prev disabled" data-offset="0" data-total="559">Prev</button><button class="form__button next" data-offset="0" data-total="559">Next</button></div></div><div class="tbl__wrapper"><table class="tbl" id="announcementsTable"><thead class="tbl__head"><tr><th style="width: 100px;">Symbol</th><th>Company</th><th>Sector</th><th>Dividend Announcement</th><th>Date / Time of Announcement</th><th>Book Closure Date</th></tr></thead><tbody class="tbl__body"><tr><td><a class="tbl__symbol" href="/company/ITANZ"><strong>ITANZ</strong></a></td><td>Itanz Technologies Limited</td><td>TECHNOLOGY &amp; COMMUNICATION</td><td> 10% (B) </td><td>July 10, 2026 4:54 PM</td><td>21/07/2026  - 21/07/2026 </td></tr><tr><td><a class="tbl__symbol" href="/company/GHGL"><strong>GHGL</strong></a></td><td>Ghani Glass Limited</td><td>GLASS &amp; CERAMICS</td><td> 10%(i) (D) </td><td>July 1, 2026 4:57 PM</td><td>04/07/2026  - 07/07/2026 </td></tr></tbody></table></div>`

func TestParsePayoutsHTML(t *testing.T) {
	res := parsePayoutsHTML(sampleHTML)

	if res.Total != 559 {
		t.Errorf("Total = %d, want 559", res.Total)
	}
	if len(res.Payouts) != 2 {
		t.Fatalf("len(Payouts) = %d, want 2", len(res.Payouts))
	}

	p := res.Payouts[0]
	if p.Symbol != "ITANZ" {
		t.Errorf("Symbol = %q, want ITANZ", p.Symbol)
	}
	if p.Company != "Itanz Technologies Limited" {
		t.Errorf("Company = %q", p.Company)
	}
	if p.Sector != "TECHNOLOGY & COMMUNICATION" {
		t.Errorf("Sector = %q, want entities decoded", p.Sector)
	}
	if p.Announcement != "10% (B)" {
		t.Errorf("Announcement = %q, want trimmed %q", p.Announcement, "10% (B)")
	}
	if p.AnnouncedAt != "July 10, 2026 4:54 PM" {
		t.Errorf("AnnouncedAt = %q", p.AnnouncedAt)
	}
	if p.BookClosure != "21/07/2026 - 21/07/2026" {
		t.Errorf("BookClosure = %q, want inner whitespace collapsed", p.BookClosure)
	}

	if res.Payouts[1].Symbol != "GHGL" || res.Payouts[1].Announcement != "10%(i) (D)" {
		t.Errorf("second row = %+v", res.Payouts[1])
	}
}

func TestParsePayoutsHTMLEmpty(t *testing.T) {
	res := parsePayoutsHTML(`<div>Showing 0 entries</div><table></table>`)
	if len(res.Payouts) != 0 {
		t.Errorf("expected no payouts, got %d", len(res.Payouts))
	}
	if res.Payouts == nil {
		t.Error("Payouts must be non-nil so JSON encodes [] not null")
	}
}
