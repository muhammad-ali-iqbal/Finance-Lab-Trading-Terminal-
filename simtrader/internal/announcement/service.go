// internal/announcement/service.go
//
// Orchestrates sending an admin-authored announcement to every active
// student. Sends happen in a background goroutine so the admin's HTTP
// request doesn't block on a sequential SMTP loop over the whole roster.

package announcement

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/simtrader/backend/internal/user"
)

// Mailer is the narrow interface this package needs — both auth.SMTPMailer
// and auth.NoOpMailer satisfy it.
type Mailer interface {
	SendAnnouncement(toEmail, subject, htmlBody, plainBody string) error
}

// StudentLister breaks the dependency down to just what's needed from
// *user.Repository, matching this codebase's existing pattern of narrow
// interfaces at package boundaries.
type StudentLister interface {
	ListActiveByRole(ctx context.Context, role user.Role) ([]*user.User, error)
}

type Service struct {
	repo   *Repository
	users  StudentLister
	mailer Mailer
}

func NewService(repo *Repository, users StudentLister, mailer Mailer) *Service {
	return &Service{repo: repo, users: users, mailer: mailer}
}

// CreateAndSend logs the announcement, resolves the current active-student
// list (minus any excluded student IDs), and kicks off a background send. It
// returns as soon as the row is in "sending" state — callers should not
// expect final send counts back.
func (s *Service) CreateAndSend(ctx context.Context, adminID uuid.UUID, subject, heading, body string, excludeIDs []uuid.UUID) (*Announcement, error) {
	a := &Announcement{Subject: subject, Heading: heading, Body: body, CreatedBy: adminID}
	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}

	all, err := s.users.ListActiveByRole(ctx, user.RoleStudent)
	if err != nil {
		_ = s.repo.MarkFailed(ctx, a.ID)
		return nil, err
	}

	students := excludeStudents(all, excludeIDs)
	if len(students) == 0 {
		_ = s.repo.MarkFailed(ctx, a.ID)
		return nil, errors.New("no active students to notify")
	}

	if err := s.repo.MarkSending(ctx, a.ID, len(students)); err != nil {
		return nil, err
	}
	a.Status = "sending"
	a.RecipientCount = len(students)

	go s.sendBatch(a.ID, subject, heading, body, students)

	return a, nil
}

// sendBatch sends sequentially — net/smtp opens one TCP+TLS connection per
// send, and a classroom roster (tens to a couple hundred students) completes
// within a few minutes, which is fine for a background job. A detached
// context with its own timeout keeps a stuck SMTP connection from leaking
// the goroutine forever.
func (s *Service) sendBatch(id uuid.UUID, subject, heading, body string, students []*user.User) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	html := RenderHTML(heading, body)
	plain := RenderPlainText(heading, body)

	sent, failed := 0, 0
	for _, stu := range students {
		if err := s.mailer.SendAnnouncement(stu.Email, subject, html, plain); err != nil {
			failed++
			log.Printf("[announcement] send failed to %s: %v", stu.Email, err)
			continue
		}
		sent++
	}

	if err := s.repo.Complete(ctx, id, sent, failed); err != nil {
		log.Printf("[announcement] failed to record completion for %s: %v", id, err)
	}
}

// List returns recent announcement history, most recent first.
func (s *Service) List(ctx context.Context) ([]*Announcement, error) {
	return s.repo.List(ctx, 50)
}

// excludeStudents filters out any student whose ID appears in excludeIDs.
func excludeStudents(students []*user.User, excludeIDs []uuid.UUID) []*user.User {
	if len(excludeIDs) == 0 {
		return students
	}
	skip := make(map[uuid.UUID]bool, len(excludeIDs))
	for _, id := range excludeIDs {
		skip[id] = true
	}
	out := make([]*user.User, 0, len(students))
	for _, stu := range students {
		if !skip[stu.ID] {
			out = append(out, stu)
		}
	}
	return out
}
