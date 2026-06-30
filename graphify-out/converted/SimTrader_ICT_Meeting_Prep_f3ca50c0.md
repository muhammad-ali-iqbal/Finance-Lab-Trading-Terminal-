<!-- converted from SimTrader_ICT_Meeting_Prep.docx -->

SimTrader — IBA ICT Deployment Meeting
Preparation Brief  ·  Finance Lab, School of Business Studies
Prepared for: Muhammad Ali Iqbal   |   ICT Contact: Wajeeh sb

1. What This Meeting Actually Is
ICT asked to meet to better understand the deployment process and discuss next steps. In practice this means the email Q&A satisfied them enough to move forward, and they now want to (a) put a face to the project, (b) confirm you are a competent owner they can work with, and (c) sort out the practical handoff — access, networking, and who does what. This is a working session, not an interrogation.
Success looks like: you walk out with a subdomain assigned, an access model agreed (SSH vs. they-deploy), and a rough go-live date.
2. Your 60-Second Opening
Lead with this so they immediately understand scope and risk level:
“SimTrader is an educational paper-trading platform for Finance Lab students — no real money, no real brokerage connections. Students get a simulated portfolio and trade using historical and end-of-day Pakistan Stock Exchange prices. It is a standard containerized web app: a React frontend, a Go backend, and a PostgreSQL database, all running in Docker. It needs to be reachable from off-campus because students use it from home. The only outside connection it makes is fetching public PSX closing prices once a day.”
That single paragraph kills half their anxieties: no money, no sensitive PII, no inbound third-party feeds, standard stack, standard container deployment.
3. The Architecture, Explained Simply
Sketch this on the whiteboard if there is one:
Internet
                       |
                       v
            [ Reverse Proxy / TLS ]   <- 443 in, 80 redirects
                       |
        +--------------+---------------+
        v              v               v
   [ Frontend ]   [ Go Backend ]   (WebSocket)
    React/Nginx        | Port 8080 - internal only
                       v
               [ PostgreSQL 16 ]   <- Port 5432, internal only
                       ^
               [ PSX Tracker ]  (Python, daily job)
                       |
                       v  outbound 443
             https://dps.psx.com.pk  (public PSX prices)

  Outbound 587 (STARTTLS) -> SMTP relay  (invite & reset emails)
Four containers: frontend, backend, database, and PSX tracker. Everything talks over an internal Docker network; only the proxy is exposed publicly.
4. What They Will Likely Ask — and Your Answers
5. What You Must Ask (Don't Leave Without These)
Tier 1 — blockers, get answers today:
- Subdomain:  Can we get the subdomain simtrader.iba.edu.pk? Everything (DNS, SSL, the URL students use) depends on this.
- Access model:  Will I get SSH access for deployment and maintenance, or does deployment go through your team?
- Outbound internet:  Does the server reach the internet directly, or through a proxy? Our daily PSX price fetch will silently fail behind an unconfigured proxy.
Tier 2 — need soon, can follow up:
- Static IP / hostname:  Needed before DNS and SSL setup.
- SSL certificate:  Do you provision/renew it, or do we? (If us, we need port 80 open for Let's Encrypt renewal.)
- Backup policy:  Is the VM volume on your snapshot schedule? We will handle database-level pg_dump exports ourselves.
- Update process:  Can we push Docker updates directly, or does each change need a review/ticket?
- Timeline:  What is a realistic go-live date so we can plan around the semester?
6. Decisions to Walk Out With
- Subdomain name confirmed
- Access model agreed (SSH vs. managed deploy)
- Who owns the SSL certificate
- A target date or next milestone
7. Traps — Don't Do These
- Do not over-promise on SSO. “Future phase” is fine; “yes we'll integrate AD” commits you to weeks of work with their identity team.
- Do not agree to deploy on a box you've never seen without first confirming Docker, outbound access, and resources are actually there.
- Do not say “it's totally secure.” Say “we ran an internal audit and these controls are in place” — confident, not arrogant.
- Do not get talked into campus-only. It defeats the purpose; hold that line politely.
- Do not let it end without a next step. “We'll be in touch” = limbo. Pin a date.
8. One-Page Fact Sheet

Prepared as an internal briefing document. Not for distribution to external parties.
| They Ask | You Say |
| --- | --- |
| What data does it store? Is it sensitive? | Student names, emails, and simulated trading activity. Passwords are bcrypt-hashed (never plaintext). No real financial data, no payment info, no national ID. The most sensitive item is email addresses. |
| Why not use IBA SSO / Active Directory? | Current version uses self-contained JWT accounts with invite-only registration. SSO integration with IBA's identity provider is a sensible future phase — we welcome it, but it is not built yet. |
| Who maintains it after go-live? | The Finance Lab owns it; I am the technical point of contact. (Be honest about whether anyone backs you up — orphaned apps are ICT's nightmare.) |
| How do updates get deployed? | Docker-based, so updates are a pull-and-restart. We would like to push updates ourselves via SSH; happy to follow whatever change process you require. |
| What is the expected load? | Roughly 30-50 concurrent students during an active session. The 2 vCPU / 4 GB spec covers that; we can scale up if a class is larger. |
| Has it had a security review? | An internal audit was done before submission — parameterized queries throughout (no SQL injection), rate limiting on login, role-based access, non-root containers, secrets injected via environment and not committed to code. Happy to support a formal pen-test if policy requires it. |
| Can it be campus-network only? | Unfortunately no — students need off-campus access, which is the whole point of remote simulations. But every endpoint is authenticated; there is no anonymous access. |
| Who owns OS-level patching / the VM? | We expect ICT to own the host OS and VM; we own everything inside the containers. Worth confirming that split explicitly. |
| Item | Detail |
| --- | --- |
| Stack | Go 1.22 / Fiber v2 · Python 3.10+ · React 18 / TS 5.5 / Vite 5 · PostgreSQL 16 · Docker |
| Server | 2 vCPU min (4 recommended) · 4 GB RAM · 30 GB storage · Ubuntu 22.04 LTS · Docker Engine 24+ / Compose v2 · reverse proxy (Nginx/Caddy) |
| Ports | 443 in (all traffic) · 80 in (redirect + cert renewal) · 5432 & 8080 internal only |
| Outbound | 443 -> dps.psx.com.pk (daily, public, no auth) · 587 STARTTLS -> SMTP relay (emails) |
| Auth | JWT · 15-min access / 7-day refresh with rotation · bcrypt cost 12 · invite-only |
| Data | Names, emails, simulated trades — no money, no payment data |
| Backups | ICT = VM snapshots · You = pg_dump exports |