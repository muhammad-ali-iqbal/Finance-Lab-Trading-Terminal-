// internal/auth/mailer.go
//
// Concrete email implementation using SMTP.
// The Service depends on the Mailer interface (in service.go),
// not this struct directly — so you can swap it for a mock in tests.

package auth

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"mime/multipart"
	"mime/quotedprintable"
	"net/smtp"
	"net/textproto"

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

	plain := fmt.Sprintf(`Hello,

You've been invited to join SimTrader, a stock market simulation platform.
Learn markets by participating in them.

Click the link below to set up your account. This link expires in 7 days.

%s

If you didn't expect this invitation, you can ignore this email.

© SimTrader — IBA Finance Lab`, registrationURL)

	html := fmt.Sprintf(inviteHTMLTemplate, registrationURL)

	return m.send(toEmail, subject, plain, html)
}

// SendPasswordReset sends a password reset link.
func (m *SMTPMailer) SendPasswordReset(toEmail, firstName, resetToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", m.cfg.FrontendURL, resetToken)

	subject := "Reset your SimTrader password"

	plain := fmt.Sprintf(`Hello %s,

We received a request to reset your SimTrader password.

Click the link below to set a new password. This link expires in 1 hour.

%s

If you didn't request a password reset, you can safely ignore this email.
Your password will not change.

© SimTrader — IBA Finance Lab`, firstName, resetURL)

	html := fmt.Sprintf(resetHTMLTemplate, resetURL)

	return m.send(toEmail, subject, plain, html)
}

// send builds a multipart/alternative MIME message and delivers it via SMTP.
func (m *SMTPMailer) send(to, subject, plainText, htmlText string) error {
	var buf bytes.Buffer

	// Top-level headers
	fmt.Fprintf(&buf, "From: SimTrader <%s>\r\n", m.cfg.EmailFrom)
	fmt.Fprintf(&buf, "To: %s\r\n", to)
	fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")

	mw := multipart.NewWriter(&buf)
	fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", mw.Boundary())

	// text/plain part
	plainHeader := textproto.MIMEHeader{}
	plainHeader.Set("Content-Type", "text/plain; charset=UTF-8")
	plainHeader.Set("Content-Transfer-Encoding", "quoted-printable")
	pw, err := mw.CreatePart(plainHeader)
	if err != nil {
		return fmt.Errorf("smtp create plain part: %w", err)
	}
	qpw := quotedprintable.NewWriter(pw)
	if _, err = qpw.Write([]byte(plainText)); err != nil {
		return fmt.Errorf("smtp write plain body: %w", err)
	}
	qpw.Close()

	// text/html part
	htmlHeader := textproto.MIMEHeader{}
	htmlHeader.Set("Content-Type", "text/html; charset=UTF-8")
	htmlHeader.Set("Content-Transfer-Encoding", "quoted-printable")
	hw, err := mw.CreatePart(htmlHeader)
	if err != nil {
		return fmt.Errorf("smtp create html part: %w", err)
	}
	qph := quotedprintable.NewWriter(hw)
	if _, err = qph.Write([]byte(htmlText)); err != nil {
		return fmt.Errorf("smtp write html body: %w", err)
	}
	qph.Close()

	mw.Close()

	// Deliver with TLS enforced (AVAIL-05). Port 465 = implicit TLS; otherwise
	// require STARTTLS and abort if the server does not advertise it, so
	// credentials and message bodies are never sent over a cleartext link.
	return m.deliver(to, buf.Bytes())
}

// deliver sends a pre-built message with mandatory transport encryption.
func (m *SMTPMailer) deliver(to string, msg []byte) error {
	addr := fmt.Sprintf("%s:%s", m.cfg.SMTPHost, m.cfg.SMTPPort)
	tlsCfg := &tls.Config{ServerName: m.cfg.SMTPHost, MinVersion: tls.VersionTLS12}

	var client *smtp.Client
	var err error
	if m.cfg.SMTPPort == "465" {
		// Implicit TLS.
		conn, derr := tls.Dial("tcp", addr, tlsCfg)
		if derr != nil {
			return fmt.Errorf("smtp tls dial %s: %w", addr, derr)
		}
		client, err = smtp.NewClient(conn, m.cfg.SMTPHost)
	} else {
		client, err = smtp.Dial(addr)
	}
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	defer client.Close()

	if m.cfg.SMTPPort != "465" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server %s does not support STARTTLS — refusing to send over cleartext", addr)
		}
		if err := client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	if m.cfg.SMTPUser != "" {
		if err := client.Auth(newLoginAuth(m.cfg.SMTPUser, m.cfg.SMTPPass)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(m.cfg.EmailFrom); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to %s: %w", to, err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close: %w", err)
	}
	return client.Quit()
}

// loginAuth implements smtp.Auth for the LOGIN mechanism required by Office 365.
// Go's built-in smtp.PlainAuth uses PLAIN, which Office 365 rejects (504 5.7.4).
type loginAuth struct{ username, password string }

func newLoginAuth(username, password string) smtp.Auth {
	return &loginAuth{username, password}
}

func (a *loginAuth) Start(_ *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if more {
		switch string(fromServer) {
		case "Username:":
			return []byte(a.username), nil
		case "Password:":
			return []byte(a.password), nil
		default:
			return nil, fmt.Errorf("smtp login: unexpected challenge: %s", fromServer)
		}
	}
	return nil, nil
}

// NoOpMailer is used in development when you don't want to send real emails.
// Set ENV=development and it prints to stdout instead.
type NoOpMailer struct{}

// NOTE: NoOpMailer prints the full token because the local dev registration
// flow needs it. This is safe because main.go refuses to start with the
// NoOpMailer when ENV=production (DATA-02) — so these tokens only ever reach a
// developer's own console, never production log aggregation.
func (n *NoOpMailer) SendInvite(toEmail, firstName, inviteToken string) error {
	fmt.Printf("[DEV EMAIL] Invite to %s → token: %s\n", toEmail, inviteToken)
	return nil
}

func (n *NoOpMailer) SendPasswordReset(toEmail, firstName, resetToken string) error {
	fmt.Printf("[DEV EMAIL] Password reset for %s → token: %s\n", toEmail, resetToken)
	return nil
}

// ---------------------------------------------------------------------------
// HTML templates (inline, email-client-safe: table layout, inline styles)
// %s is replaced with the CTA URL via fmt.Sprintf before sending.
// ---------------------------------------------------------------------------

const inviteHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You've been invited to SimTrader</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8F8F7;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%%;">

          <!-- Logo / brand -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:22px;font-weight:700;color:#0F0F0E;letter-spacing:-0.5px;">SimTrader</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:8px;padding:40px 48px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#0F0F0E;letter-spacing:-0.3px;">
                You've been invited
              </h1>
              <p style="margin:0 0 24px 0;font-size:15px;color:#6B6B6B;line-height:1.5;">
                Learn markets by participating in them.
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;color:#3A3A3A;line-height:1.6;">
                You've been invited to join <strong>SimTrader</strong>, a stock market simulation platform used at the IBA Finance Lab. Click the button below to create your account and start trading.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="border-radius:6px;background-color:#0F0F0E;">
                    <a href="%s"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#F2F1EF;text-decoration:none;border-radius:6px;letter-spacing:0.1px;">
                      Set Up Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9A9A9A;line-height:1.5;">
                This invitation link expires in 7 days. If you didn't expect this email, you can safely ignore it.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#ACACAC;">
                &copy; SimTrader &mdash; IBA Finance Lab
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

const resetHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your SimTrader password</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8F8F7;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%%;">

          <!-- Logo / brand -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:22px;font-weight:700;color:#0F0F0E;letter-spacing:-0.5px;">SimTrader</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:8px;padding:40px 48px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#0F0F0E;letter-spacing:-0.3px;">
                Reset your password
              </h1>
              <p style="margin:0 0 24px 0;font-size:15px;color:#6B6B6B;line-height:1.5;">
                SimTrader &mdash; IBA Finance Lab
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;color:#3A3A3A;line-height:1.6;">
                We received a request to reset your <strong>SimTrader</strong> password. Click the button below to choose a new password.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
                <tr>
                  <td style="border-radius:6px;background-color:#0F0F0E;">
                    <a href="%s"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#F2F1EF;text-decoration:none;border-radius:6px;letter-spacing:0.1px;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <p style="margin:0 0 0 0;font-size:13px;color:#9A9A9A;line-height:1.5;">
                This link expires in <strong style="color:#6B6B6B;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#ACACAC;">
                &copy; SimTrader &mdash; IBA Finance Lab
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
