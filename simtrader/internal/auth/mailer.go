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
	// FrontendURL must stay a bare origin (scheme://host) — it also feeds CORS's
	// AllowOrigins, which rejects a path component — so the reverse-proxy
	// subpath (if any) is appended separately via BasePath.
	registrationURL := fmt.Sprintf("%s%s/register?token=%s", m.cfg.FrontendURL, m.cfg.BasePath, inviteToken)

	subject := "You've been invited to SimTrader"

	plain := fmt.Sprintf(`Hello,

You've been invited to join SimTrader, a stock market simulation platform.
Learn markets by participating in them.

Click the link below to set up your account. This link expires in 7 days.

%s

If you didn't expect this invitation, you can ignore this email.

© SimTrader — IBA Finance Lab`, registrationURL)

	// Three %s: button href, fallback <a> href, fallback display text.
	html := fmt.Sprintf(inviteHTMLTemplate, registrationURL, registrationURL, registrationURL)

	return m.send(toEmail, subject, plain, html)
}

// SendPasswordReset sends a password reset link.
func (m *SMTPMailer) SendPasswordReset(toEmail, firstName, resetToken string) error {
	resetURL := fmt.Sprintf("%s%s/reset-password?token=%s", m.cfg.FrontendURL, m.cfg.BasePath, resetToken)

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

// SendAnnouncement sends a pre-rendered branded announcement email to one
// recipient. Exported (unlike send/deliver) so the announcement package can
// reuse the existing SMTP delivery plumbing without duplicating MIME/TLS/LOGIN
// auth code. The caller is responsible for escaping any admin-supplied text
// baked into htmlBody.
func (m *SMTPMailer) SendAnnouncement(toEmail, subject, htmlBody, plainBody string) error {
	return m.send(toEmail, subject, plainBody, htmlBody)
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

func (n *NoOpMailer) SendAnnouncement(toEmail, subject, htmlBody, plainBody string) error {
	fmt.Printf("[DEV EMAIL] Announcement to %s: %s\n", toEmail, subject)
	return nil
}

// ---------------------------------------------------------------------------
// HTML templates (IBA-branded, inline styles for email client compatibility)
// inviteHTMLTemplate: three %s — (1) button href, (2) fallback <a> href,
//                                 (3) fallback link display text.
// resetHTMLTemplate:  one %s  — CTA href.
// ---------------------------------------------------------------------------

const inviteHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You've been invited to SimTrader</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<style>
body { margin: 0; padding: 0; background-color: #F4F1EC; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media only screen and (max-width: 600px) {
  .em-outer       { padding: 24px 12px !important; }
  .em-iba-title   { letter-spacing: 1px !important; }
  .em-header-band { padding: 18px 24px 16px !important; }
  .em-body        { padding: 28px 20px 28px !important; }
  .em-h1          { font-size: 22px !important; }
  .em-body-p      { font-size: 15px !important; }
  .em-btn         { display: block !important; padding: 14px 20px !important; text-align: center !important; box-sizing: border-box !important; width: 100%% !important; }
}
</style>
</head>
<body>
<div class="em-outer" style="min-height: 100vh; background-color: #F4F1EC; padding: 48px 16px; font-family: 'EB Garamond', Georgia, serif; animation: fadeIn 0.6s ease both;">
  <div style="max-width: 580px; margin: 0 auto;">

    <!-- IBA header -->
    <div style="text-align: center; padding-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 14px; justify-content: center; margin-bottom: 20px;">
        <div style="flex: 1; height: 1px; background: linear-gradient(to right, transparent, #8B1A2A);"></div>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="8" y="0" width="2" height="18" fill="#8B1A2A" opacity="0.5"/>
          <rect x="0" y="8" width="18" height="2" fill="#8B1A2A" opacity="0.5"/>
          <rect x="3" y="3" width="2" height="2" fill="#C9A84C"/>
          <rect x="13" y="3" width="2" height="2" fill="#C9A84C"/>
          <rect x="3" y="13" width="2" height="2" fill="#C9A84C"/>
          <rect x="13" y="13" width="2" height="2" fill="#C9A84C"/>
        </svg>
        <div style="flex: 1; height: 1px; background: linear-gradient(to left, transparent, #8B1A2A);"></div>
      </div>
      <div class="em-iba-title" style="font-size: 11px; font-family: 'EB Garamond', Georgia, serif; letter-spacing: 3px; color: #8B1A2A; text-transform: uppercase; font-weight: 500; margin-bottom: 6px;">
        Institute of Business Administration
      </div>
      <div style="font-size: 11px; font-family: 'EB Garamond', Georgia, serif; letter-spacing: 2px; color: #9A7B4A; text-transform: uppercase;">
        Finance Laboratory &mdash; Karachi
      </div>
    </div>

    <!-- Main card -->
    <div style="background-color: #FFFFFF; border-top: 3px solid #8B1A2A; box-shadow: 0 2px 24px rgba(0,0,0,0.07), 0 0 0 1px rgba(139,26,42,0.06);">

      <!-- Maroon header band -->
      <div class="em-header-band" style="background-color: #8B1A2A; padding: 28px 48px 24px; text-align: center;">
        <div style="font-family: 'Cormorant Garamond', 'EB Garamond', Georgia, serif; font-size: 28px; font-weight: 600; color: #F4F1EC; letter-spacing: 1px; font-style: italic; margin-bottom: 4px;">
          SimTrader
        </div>
        <div style="font-size: 10px; letter-spacing: 4px; color: #C9A84C; text-transform: uppercase; font-family: 'EB Garamond', Georgia, serif;">
          Market Simulation Platform
        </div>
      </div>

      <!-- Gold rule -->
      <div style="height: 2px; background: linear-gradient(to right, #8B1A2A, #C9A84C, #8B1A2A);"></div>

      <!-- Body -->
      <div class="em-body" style="padding: 44px 52px 40px;">

        <p style="margin: 0 0 6px 0; font-size: 13px; letter-spacing: 2.5px; color: #9A7B4A; text-transform: uppercase; font-family: 'EB Garamond', Georgia, serif;">
          Formal Invitation
        </p>

        <h1 class="em-h1" style="margin: 0 0 20px 0; font-family: 'Cormorant Garamond', 'EB Garamond', Georgia, serif; font-size: 30px; font-weight: 600; color: #1A0A0E; letter-spacing: -0.3px; line-height: 1.2;">
          You Have Been Invited<br>to Join SimTrader
        </h1>

        <div style="width: 48px; height: 1px; background-color: #C9A84C; margin-bottom: 24px;"></div>

        <p class="em-body-p" style="margin: 0 0 18px 0; font-size: 17px; color: #2A1A1E; line-height: 1.75;">
          On behalf of the <strong style="font-weight: 600; color: #8B1A2A;">IBA Finance Laboratory</strong>, we are pleased to extend this invitation for you to participate in <em>SimTrader</em> &mdash; the Institute's designated stock market simulation platform.
        </p>

        <p class="em-body-p" style="margin: 0 0 18px 0; font-size: 17px; color: #3A2A2E; line-height: 1.75;">
          SimTrader is deployed as part of the IBA's commitment to applied financial education, enabling students and faculty to engage with live market conditions, construct and manage portfolios, and develop rigorous analytical judgment in a consequence-free environment.
        </p>

        <p class="em-body-p" style="margin: 0 0 32px 0; font-size: 17px; color: #3A2A2E; line-height: 1.75;">
          You are cordially invited to complete your registration and commence participation at your earliest convenience.
        </p>

        <!-- CTA button -->
        <div style="text-align: center; margin: 0 0 32px 0;">
          <a class="em-btn" href="%s" style="display: inline-block; padding: 14px 36px; background-color: #8B1A2A; border-bottom: 2px solid #5E1020; font-family: 'EB Garamond', Georgia, serif; font-size: 15px; font-weight: 600; color: #F4F1EC; text-decoration: none; letter-spacing: 2px; text-transform: uppercase;">
            Verify Your Account
          </a>
        </div>

        <!-- Fallback link for clients where the button does not render/respond -->
        <p style="margin: 0 0 28px 0; font-size: 14px; color: #7A6A6E; line-height: 1.6; font-style: italic;">
          Should the button above fail to respond, kindly copy and paste the following link into your browser:
          <a href="%s" style="color: #8B1A2A; word-break: break-all; text-decoration: underline; font-style: normal;">%s</a>
        </p>

        <!-- Expiry / disregard notice -->
        <div style="border-top: 1px solid #E8E0D4; padding-top: 24px;">
          <p style="margin: 0; font-size: 14px; color: #9A8A8E; line-height: 1.7; font-style: italic;">
            This invitation is valid for <strong style="font-weight: 600; color: #6A5A5E;">72 hours</strong> from the time of issuance. If you did not anticipate this communication, no further action is required and this message may be disregarded without consequence.
          </p>
        </div>

      </div>
    </div>

    <!-- Footer -->
    <div style="padding: 28px 0 0; text-align: center;">
      <div style="display: flex; align-items: center; gap: 14px; justify-content: center; margin-bottom: 18px;">
        <div style="flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(201,168,76,0.33));"></div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="4" y="0" width="2" height="10" fill="#C9A84C" opacity="0.4"/>
          <rect x="0" y="4" width="10" height="2" fill="#C9A84C" opacity="0.4"/>
        </svg>
        <div style="flex: 1; height: 1px; background: linear-gradient(to left, transparent, rgba(201,168,76,0.33));"></div>
      </div>
      <p style="margin: 0 0 4px 0; font-size: 12px; letter-spacing: 1.5px; color: #8B1A2A; text-transform: uppercase; font-family: 'EB Garamond', Georgia, serif;">
        SimTrader &mdash; IBA Finance Laboratory
      </p>
      <p style="margin: 0; font-size: 12px; color: #A89A8E; letter-spacing: 0.5px; line-height: 1.6;">
        University Road, Karachi 75270 &mdash; Pakistan<br>
        &copy; 2026 Institute of Business Administration. All rights reserved.
      </p>
    </div>

  </div>
</div>
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
