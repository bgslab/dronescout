# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Quick commands

- Install Wrangler CLI (required): npm install -g wrangler
- Set Skydio API token (stored as a Cloudflare secret): wrangler secret put SKYDIO_API_TOKEN
- Local dev (use Cloudflare edge so secrets are available): wrangler dev --remote
- Alternative local dev (inject a temp token locally): wrangler dev --var SKYDIO_API_TOKEN:{{YOUR_TOKEN}}
- Deploy to Cloudflare: wrangler deploy
- Tail logs: wrangler tail

### Manual endpoint testing (no formal tests configured)
Set your worker URL once deployed or running remotely:
- BASE_URL=https://<your-worker-subdomain>.workers.dev

- Sync completed flights (POST):
  - curl -X POST "$BASE_URL/sync-flights"
- Get flight details + telemetry (GET):
  - curl "$BASE_URL/flight/<FLIGHT_ID>/details"
- Get flight media (GET):
  - curl "$BASE_URL/flight/<FLIGHT_ID>/media"

## Code architecture (big picture)

- Cloudflare Worker proxy (cloudflare-worker.js) exposes three routes that forward to Skydio Cloud, add CORS, and normalize responses:
  - POST /sync-flights → paginates through completed flights and returns a condensed list for the History UI
  - GET /flight/:id/details → parallel fetch of flight metadata and telemetry; combines into a single payload
  - GET /flight/:id/media → lists media items with URLs and GPS/exif flags
- CORS: Global headers allow GET/POST/OPTIONS with JSON content-type; OPTIONS preflight is handled explicitly.
- Error handling: Non-OK upstream responses throw and are surfaced as JSON { error: <message> } with HTTP 4xx/5xx.
- Config/secrets:
  - SKYDIO_API_TOKEN is provided via Cloudflare Secrets and read as env.SKYDIO_API_TOKEN.
  - wrangler.toml sets the worker name and entrypoint (main = "cloudflare-worker.js").

## What matters from README

- Purpose: Personal drone flight planning + logging; integrates Skydio Cloud for flight sync, telemetry, and media.
- Stack: Browser app (not included here) + Cloudflare Worker proxy (this repo) for secure API access; Leaflet mapping and localStorage are used on the client.
- Security model: Browser never sees the Skydio token; all API calls go through the Worker; configure CORS and keep tokens only in Worker secrets.
- Roadmap context: Current focus is Phase 2 (Cloud sync + History updates) which depends on the three proxy routes implemented here.

## Notes for working sessions

- This repo contains only the Worker; front-end code is not present. Use the curl commands above to exercise routes during development.
- Ensure no tokens are committed to version control; rely on wrangler secret put and wrangler dev --remote to access secrets during local development.
