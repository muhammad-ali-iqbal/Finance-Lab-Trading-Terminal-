// internal/announcement/repository.go

package announcement

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Announcement is a single admin broadcast email send.
type Announcement struct {
	ID              uuid.UUID  `json:"id"`
	Subject         string     `json:"subject"`
	Heading         string     `json:"heading"`
	Body            string     `json:"body"`
	CreatedBy       uuid.UUID  `json:"createdBy"`
	Status          string     `json:"status"` // pending|sending|completed|failed
	RecipientCount  int        `json:"recipientCount"`
	SentCount       int        `json:"sentCount"`
	FailedCount     int        `json:"failedCount"`
	CreatedAt       time.Time  `json:"createdAt"`
	CompletedAt     *time.Time `json:"completedAt"`
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Create inserts a new pending announcement row and populates its
// generated id/created_at/status fields.
func (r *Repository) Create(ctx context.Context, a *Announcement) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO announcements (subject, heading, body, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, status, created_at`,
		a.Subject, a.Heading, a.Body, a.CreatedBy,
	).Scan(&a.ID, &a.Status, &a.CreatedAt)
}

// List returns the most recent announcements, newest first.
func (r *Repository) List(ctx context.Context, limit int) ([]*Announcement, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, subject, heading, body, created_by, status,
		       recipient_count, sent_count, failed_count, created_at, completed_at
		FROM announcements
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Announcement
	for rows.Next() {
		a := &Announcement{}
		if err := rows.Scan(&a.ID, &a.Subject, &a.Heading, &a.Body, &a.CreatedBy, &a.Status,
			&a.RecipientCount, &a.SentCount, &a.FailedCount, &a.CreatedAt, &a.CompletedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// MarkSending transitions a pending row to sending once the recipient list
// has been resolved.
func (r *Repository) MarkSending(ctx context.Context, id uuid.UUID, recipientCount int) error {
	_, err := r.db.Exec(ctx, `
		UPDATE announcements SET status = 'sending', recipient_count = $2 WHERE id = $1`,
		id, recipientCount)
	return err
}

// Complete records the final sent/failed counts once the batch finishes.
func (r *Repository) Complete(ctx context.Context, id uuid.UUID, sent, failed int) error {
	_, err := r.db.Exec(ctx, `
		UPDATE announcements
		SET status = 'completed', sent_count = $2, failed_count = $3, completed_at = NOW()
		WHERE id = $1`,
		id, sent, failed)
	return err
}

// MarkFailed is used when the batch never got a chance to start sending
// (e.g. no active students to notify).
func (r *Repository) MarkFailed(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `
		UPDATE announcements SET status = 'failed', completed_at = NOW() WHERE id = $1`, id)
	return err
}
