# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are organizers of barrio/amateur basketball leagues and tournaments (3x3 to 5v5, recreational level), running on tight budgets with no dedicated technical or admin staff. Around them:

- **Team captains**, who register their team once (globally) and enroll it into one or more tournaments.
- **Players**, who belong to a team roster and appear in live per-match stats.

Global roles are only `ADMIN` (full platform access) and `PLAYER` (default on signup). "Tournament organizer" and "team captain" are not separate global roles — they are positions derived from data (`Tournament.organizerId`, `Team.captainId`) and enforced per-endpoint.

## Product Purpose

Retro Hoops replaces spreadsheets and WhatsApp groups as the way amateur basketball leagues get organized. It covers the full lifecycle in one place: creating a league/tournament, enrolling teams and rosters, running live score/stat capture during games, and generating elimination brackets — so an organizer with no technical background can run a real tournament without stitching together chat threads and shared sheets.

## Positioning

The differentiator is being a frictionless all-in-one: enrollment, payment status, roster, bracket, and live stats live in a single guided flow with no install and no coordination overhead across separate tools. Competing options (spreadsheets, WhatsApp, generic sports apps) can offer pieces of this, but not the same single ungapped flow from "create the league" to "live boxscore in playoffs."

## Operating Context

- Organizers create a tournament (category, venue, max teams, start date, inscription fee) and manage it from an admin/control view.
- Captains create a team once (global identity, logo, roster) and enroll it into any open tournament; a team can be enrolled in multiple tournaments at once.
- During a match, stats are captured live from a control-table view with a running clock (quarters/periods), feeding automatic PPG/RPG/APG per player.
- Data visibility is segregated: each organizer sees only their own tournaments' enrolled teams; a team's data is scoped to tournaments it's actually enrolled in via `TournamentEnrollment`.

## Capabilities and Constraints

- Backend: Node.js + Express 5, PostgreSQL via Prisma, JWT auth in an HTTP-only cookie, bcrypt password hashing.
- Frontend: server-rendered EJS views + vanilla JS, no build step, no frontend framework.
- Enrollment requires a team to have at least 3 players; duplicate enrollment into the same tournament is blocked at the DB level.
- Undecided / open: no payment processor integration confirmed (payment status/amount fields exist but source of truth for actual payment collection is not established); no confirmed target region beyond Spanish-language copy.

## Brand Commitments

Name: **Retro Hoops**. Existing visual identity is a retro/arcade neon look (already implemented across the app, including a playable arcade mini-game on the landing hero) — treat this as an established, binding identity, not a proposal.

## Evidence on Hand

None yet — the project is in development/portfolio stage, with no real leagues or organizers using it in production. The landing page currently shows illustrative numbers (e.g. "24 ligas activas", "320 equipos", "1580 partidos", "99.9% disponibilidad") as placeholder content; future work must not treat these as real evidence or extend them with further fabricated claims.

## Product Principles

- One flow, not five tools: every step from league creation to live boxscore stays inside the product, never handed off to chat or spreadsheets.
- No technical background assumed: organizers and captains are amateurs running this alongside a day job, not IT staff.
- Data stays scoped to who owns it: organizers see only their tournaments' teams; teams control their own global identity and roster once.
- The retro-arcade identity is the product's voice, not decoration — keep it consistent rather than defaulting to generic sports-SaaS polish.
