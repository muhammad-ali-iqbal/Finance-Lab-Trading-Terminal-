// internal/user/bulkinvite.go
//
// Bulk student invites. An admin pastes a list of emails (one classroom
// section at a time) and gets a per-email report back, optionally granting
// access to one or more challenges in the same action.
//
// Each email goes through the same PasswordVerifier.InviteStudent call the
// single-invite endpoint uses, so token generation, expiry and mailing stay in
// one place. Partial success is the norm — some addresses are already
// registered, some mails bounce — so the response is always 200 with a row
// per email rather than a single status code.

package user

import (
	"errors"
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/httputil"
)

// maxBulkInvite bounds one request. Invites are sent synchronously so the
// admin gets a real report; the cap keeps that wait bounded.
const maxBulkInvite = 100

// reEmail is a deliberately loose shape check — the real uniqueness and
// deliverability authorities are the users_email_lower_idx unique index and
// the SMTP server. It only exists to keep obvious typos out of the invite loop.
var reEmail = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

// Per-email outcome codes returned to the admin UI.
const (
	inviteStatusInvited       = "invited"
	inviteStatusEmailFailed   = "email_failed"
	inviteStatusAlreadyExists = "already_exists"
	inviteStatusInvalid       = "invalid"
)

type bulkInviteRequest struct {
	Emails []string `json:"emails"`
	// ChallengeIDs optionally grants access to one or more challenges as part
	// of the invite, so a section can be invited and enrolled into several
	// challenges in one step. Access is granted against the pending user row,
	// so it takes effect the moment they finish registration.
	ChallengeIDs []string `json:"challengeIds,omitempty"`
}

// challengeGrant is one challenge (and its resolved starting capital) to
// grant every invitee access to.
type challengeGrant struct {
	id      uuid.UUID
	capital float64
}

type bulkInviteResult struct {
	Email  string `json:"email"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

// parsedEmails is the result of normalising an admin's pasted list.
type parsedEmails struct {
	Valid      []string
	Invalid    []string
	Duplicates int
}

// parseEmailList trims, lowercases, de-duplicates and shape-checks a pasted
// list of addresses. Entries may arrive already split by the client or as
// single strings containing commas/semicolons/newlines, so it splits again
// defensively. Order is preserved so the report reads like the admin's input.
func parseEmailList(raw []string) parsedEmails {
	out := parsedEmails{}
	seen := make(map[string]bool)

	for _, chunk := range raw {
		for _, field := range strings.FieldsFunc(chunk, func(r rune) bool {
			return r == ',' || r == ';' || r == '\n' || r == '\r' || r == '\t' || r == ' '
		}) {
			email := strings.ToLower(strings.TrimSpace(field))
			if email == "" {
				continue
			}
			if seen[email] {
				out.Duplicates++
				continue
			}
			seen[email] = true

			if len(email) > 254 || !reEmail.MatchString(email) {
				out.Invalid = append(out.Invalid, email)
				continue
			}
			out.Valid = append(out.Valid, email)
		}
	}
	return out
}

// BulkInviteStudents godoc
// POST /api/admin/users/invite/bulk
// Body: { emails: [...], challengeIds?: uuid[] }
// Creates a pending student account per address and sends each invite email.
func (h *Handler) BulkInviteStudents(c *fiber.Ctx) error {
	var req bulkInviteRequest
	if err := c.BodyParser(&req); err != nil {
		return httputil.BadRequest(c, "invalid request body")
	}

	parsed := parseEmailList(req.Emails)
	if len(parsed.Valid) == 0 && len(parsed.Invalid) == 0 {
		return httputil.BadRequest(c, "at least one email is required")
	}
	if len(parsed.Valid) > maxBulkInvite {
		return httputil.BadRequest(c, "too many emails in one request (max 100)")
	}

	// Resolve the optional challenges up front so a bad id fails before any
	// invite is sent, and so each starting capital is fetched once.
	var grants []challengeGrant
	if len(req.ChallengeIDs) > 0 {
		if h.access == nil {
			return httputil.BadRequest(c, "challenge access is unavailable")
		}
		for _, raw := range req.ChallengeIDs {
			id, err := uuid.Parse(raw)
			if err != nil {
				return httputil.BadRequest(c, "invalid challengeId")
			}
			initial, err := h.access.GetChallengeCapital(c.Context(), id)
			if err != nil {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "challenge not found"})
			}
			grants = append(grants, challengeGrant{id: id, capital: initial})
		}
	}

	results := make([]bulkInviteResult, 0, len(parsed.Valid)+len(parsed.Invalid))
	for _, email := range parsed.Invalid {
		results = append(results, bulkInviteResult{
			Email:  email,
			Status: inviteStatusInvalid,
			Detail: "not a valid email address",
		})
	}

	invited, failed := 0, 0
	for _, email := range parsed.Valid {
		res := bulkInviteResult{Email: email}
		u, err := h.verifier.InviteStudent(c.Context(), email)

		switch {
		case err == nil:
			res.Status = inviteStatusInvited
			invited++
		case errors.Is(err, ErrEmailTaken):
			// Already has an account — not an error worth failing the batch
			// over, and still a valid target for a challenge grant below.
			res.Status = inviteStatusAlreadyExists
			res.Detail = "account already exists"
			failed++
		default:
			// Same semantics as the single-invite endpoint's 207: the account
			// was created, only the email failed.
			log.Printf("[bulk-invite] email failed for %s: %v", email, err)
			res.Status = inviteStatusEmailFailed
			res.Detail = "account created but invite email failed to send"
			failed++
		}

		for _, g := range grants {
			if detail := h.grantChallengeAccess(c, g.id, g.capital, email, u); detail != "" {
				res.Detail = appendDetail(res.Detail, detail)
			}
		}
		results = append(results, res)
	}

	return c.JSON(fiber.Map{
		"results":    results,
		"invited":    invited,
		"failed":     failed + len(parsed.Invalid),
		"duplicates": parsed.Duplicates,
	})
}

// grantChallengeAccess grants the invited (or pre-existing) student access to
// the selected challenge. A grant failure is reported in the row's detail and
// never fails the invite itself. Returns a detail string, or "" on success.
func (h *Handler) grantChallengeAccess(c *fiber.Ctx, challengeID uuid.UUID, capital float64, email string, u *User) string {
	target := u
	if target == nil {
		// InviteStudent returns nil for an already-taken email; look the
		// existing account up so it still gets the grant.
		existing, err := h.repo.GetByEmail(c.Context(), email)
		if err != nil {
			return "challenge access not granted (account lookup failed)"
		}
		target = existing
	}
	if target == nil {
		return "challenge access not granted (account not found)"
	}
	if err := h.access.GrantAccess(c.Context(), challengeID, target.ID, adminUserID(c), capital); err != nil {
		log.Printf("[bulk-invite] grant failed for %s: %v", email, err)
		return "challenge access not granted"
	}
	return ""
}

func appendDetail(existing, extra string) string {
	if existing == "" {
		return extra
	}
	return existing + "; " + extra
}
