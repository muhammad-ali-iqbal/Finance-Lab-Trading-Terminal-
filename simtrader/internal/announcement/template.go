// internal/announcement/template.go
//
// Renders admin-authored announcement text into the same IBA-branded email
// look used for invites (see auth.inviteHTMLTemplate), minus the CTA button
// (announcements carry no link). Heading/body are admin free text, so every
// dynamic value is explicitly HTML-escaped before being dropped into the
// static, trusted template markup.

package announcement

import (
	"fmt"
	"html"
	"regexp"
	"strings"
)

// RenderHTML builds the branded announcement email body. heading and each
// paragraph derived from body are individually HTML-escaped before being
// interpolated into the static template. Within a paragraph, a small inline
// markdown subset (**bold**, *italic*, [text](url)) is then applied on top
// of the already-escaped text — see formatInline.
func RenderHTML(heading, body string) string {
	escHeading := html.EscapeString(heading)

	var sb strings.Builder
	for _, p := range splitParagraphs(body) {
		sb.WriteString(`<p class="em-body-p" style="margin: 0 0 18px 0; font-size: 17px; color: #3A2A2E; line-height: 1.75;">`)
		sb.WriteString(formatInline(p))
		sb.WriteString(`</p>`)
	}

	return fmt.Sprintf(announcementHTMLTemplate, escHeading, sb.String())
}

// ---------------------------------------------------------------------------
// Inline markdown subset: **bold**, *italic*, [text](url).
// The paragraph is HTML-escaped first, so these regexes only ever see and
// insert markup around already-safe text — admin-authored body text can
// never inject arbitrary HTML.
// ---------------------------------------------------------------------------

var (
	boldRe   = regexp.MustCompile(`\*\*(.+?)\*\*`)
	italicRe = regexp.MustCompile(`\*(.+?)\*`)
	linkRe   = regexp.MustCompile(`\[([^\]\n]+)\]\(([^)\s]+)\)`)
)

// formatInline HTML-escapes p, then applies the inline markdown subset.
func formatInline(p string) string {
	escaped := html.EscapeString(p)
	escaped = boldRe.ReplaceAllString(escaped, `<strong style="font-weight:600;color:#1A0A0E;">$1</strong>`)
	escaped = italicRe.ReplaceAllString(escaped, `<em>$1</em>`)
	escaped = linkRe.ReplaceAllStringFunc(escaped, func(m string) string {
		parts := linkRe.FindStringSubmatch(m)
		text, url := parts[1], parts[2]
		if !isSafeLinkURL(url) {
			return m
		}
		return fmt.Sprintf(`<a href="%s" style="color:#8B1A2A;text-decoration:underline;">%s</a>`, url, text)
	})
	return escaped
}

// isSafeLinkURL rejects schemes like javascript: — only http(s)/mailto links
// are turned into anchors; anything else is left as literal escaped text.
func isSafeLinkURL(url string) bool {
	lower := strings.ToLower(url)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "mailto:")
}

// RenderPlainText builds the plain-text alternative part.
func RenderPlainText(heading, body string) string {
	return fmt.Sprintf(`%s

%s

— SimTrader, IBA Finance Lab`, heading, body)
}

// splitParagraphs treats one-or-more consecutive blank lines as a paragraph
// break (how a plain <textarea> naturally groups text when the admin presses
// Enter twice), collapses single newlines within a paragraph into a space,
// and drops empty paragraphs.
func splitParagraphs(body string) []string {
	body = strings.ReplaceAll(body, "\r\n", "\n")
	blocks := strings.Split(body, "\n\n")
	out := make([]string, 0, len(blocks))
	for _, b := range blocks {
		b = strings.TrimSpace(strings.ReplaceAll(b, "\n", " "))
		if b != "" {
			out = append(out, b)
		}
	}
	return out
}

// announcementHTMLTemplate: two %s holes — (1) heading, (2) paragraphs HTML blob.
const announcementHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SimTrader Announcement</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<style>
body { margin: 0; padding: 0; background-color: #F4F1EC; }
@media only screen and (max-width: 600px) {
  .em-outer       { padding: 24px 12px !important; }
  .em-iba-title   { letter-spacing: 1px !important; }
  .em-header-band { padding: 18px 24px 16px !important; }
  .em-body        { padding: 28px 20px 28px !important; }
  .em-h1          { font-size: 22px !important; }
  .em-body-p      { font-size: 15px !important; }
}
</style>
</head>
<body>
<div class="em-outer" style="min-height: 100vh; background-color: #F4F1EC; padding: 48px 16px; font-family: 'EB Garamond', Georgia, serif;">
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
          Announcement
        </p>

        <h1 class="em-h1" style="margin: 0 0 20px 0; font-family: 'Cormorant Garamond', 'EB Garamond', Georgia, serif; font-size: 30px; font-weight: 600; color: #1A0A0E; letter-spacing: -0.3px; line-height: 1.2;">
          %s
        </h1>

        <div style="width: 48px; height: 1px; background-color: #C9A84C; margin-bottom: 24px;"></div>

        %s

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
