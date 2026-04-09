// internal/auth/mailer.go
//
// Concrete email implementation using SMTP.
// The Service depends on the Mailer interface (in service.go),
// not this struct directly — so you can swap it for a mock in tests.

package auth

import (
	"fmt"
	"net/smtp"

	"github.com/simtrader/backend/internal/config"
)

type SMTPMailer struct {
	cfg *config.Config
}

func NewSMTPMailer(cfg *config.Config) *SMTPMailer {
	return &SMTPMailer{cfg: cfg}
}

// SendInvite sends the registration invite email to a new student.
func (m *SMTPMailer) SendInvite(toEmail, firstName, inviteToken string) error {
	registrationURL := fmt.Sprintf("%s/register?token=%s", m.cfg.FrontendURL, inviteToken)

	subject := "You've been invited to SimTrader"
	body := fmt.Sprintf(`Hello,

You've been invited to join SimTrader, a stock market simulation platform.

Click the link below to set up your account. This link expires in 7 days.

%s

If you didn't expect this invitation, you can ignore this email.

SimTrader`, registrationURL)

	return m.send(toEmail, subject, body)
}

// SendPasswordReset sends a password reset link.
func (m *SMTPMailer) SendPasswordReset(toEmail, firstName, resetToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", m.cfg.FrontendURL, resetToken)

	subject := "Reset your SimTrader password"
	body := fmt.Sprintf(`Hello %s,

We received a request to reset your SimTrader password.

Click the link below to set a new password. This link expires in 1 hour.

%s

If you didn't request a password reset, you can safely ignore this email.
Your password will not change.

SimTrader`, firstName, resetURL)

	return m.send(toEmail, subject, body)
}

// send is the low-level SMTP send. All email goes through here.
func (m *SMTPMailer) send(to, subject, body string) error {
	auth := smtp.PlainAuth("", m.cfg.SMTPUser, m.cfg.SMTPPass, m.cfg.SMTPHost)

	msg := fmt.Sprintf(
		"From: SimTrader <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		m.cfg.EmailFrom, to, subject, body,
	)

	addr := fmt.Sprintf("%s:%s", m.cfg.SMTPHost, m.cfg.SMTPPort)
	if err := smtp.SendMail(addr, auth, m.cfg.EmailFrom, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("smtp send to %s: %w", to, err)
	}
	return nil
}

// NoOpMailer is used in development when you don't want to send real emails.
// Set ENV=development and it prints to stdout instead.
type NoOpMailer struct{}

func (n *NoOpMailer) SendInvite(toEmail, firstName, inviteToken string) error {
	fmt.Printf("[DEV EMAIL] Invite to %s → token: %s\n", toEmail, inviteToken)
	return nil
}

func (n *NoOpMailer) SendPasswordReset(toEmail, firstName, resetToken string) error {
	fmt.Printf("[DEV EMAIL] Password reset for %s → token: %s\n", toEmail, resetToken)
	return nil
}
