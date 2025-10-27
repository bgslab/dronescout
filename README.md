# dronescout
Personal drone flight planning and logging app for travel documentation with Skydio X10.
# DroneScout

**Personal drone flight planning and logging app for travel documentation with Skydio X10.**

Plan scenic flights at your destination, assess risks and regulations, log completed missions with full telemetry and media from Skydio Cloud.

## Overview

DroneScout helps FAA Part 107 certified pilots document travel with high-quality aerial photography. Enter any location, get AI-ranked scenic flight recommendations with specific heading/shot guidance, risk assessment, weather/airspace checks, and auto-sync completed flights from your Skydio X10 with full GPS tracks, video, photos, and telemetry.

**Built for:** Personal use + commercial side-income exploration  
**Platform:** Browser-based (mobile-first, no dependencies)  
**Drone:** Skydio X10 (Nightsense, BVLOS, 400ft AGL optimized)

## Core Features

- **Trip Planner:** Enter destination → Get ranked scenic spots with specific flight instructions (heading, lookpoint, shot type)
- **Risk Assessment:** Per-location safety scores (terrain, obstacles, population density, weather)
- **Regulatory Checks:** FAA airspace, NOTAMs, Part 107 compliance verification
- **Weather Integration:** Wind, visibility, ceiling forecasts for safe flight planning
- **Flight Learning:** Algorithm adjusts spot recommendations based on your ratings (what you actually shoot)
- **Skydio Cloud Sync:** Auto-import completed flights with GPS traces, media, telemetry
- **Flight History:** Manual logging + synced flights with side-by-side comparison
- **Settings:** Preferences (cityscape/landscape/nature/architecture weighting), sync configuration

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Mapping:** Leaflet.js
- **Persistence:** localStorage (offline-capable)
- **Backend:** Cloudflare Workers (secure API proxy)
- **APIs:** Skydio Cloud, OpenWeather, FAA Airspace Data, future LAANC

## Project Phases

### Phase 1: Backend Proxy ✅ Ready
Cloudflare Worker proxy for secure Skydio API calls (CORS + token protection)
- POST `/sync-flights` - Fetch all completed flights (paginated)
- GET `/flight/:id/details` - Flight telemetry track
- GET `/flight/:id/media` - Photos/videos with GPS tags

### Phase 2: Cloud Sync Integration 🔄 Next
Settings tab + History tab updates with Skydio Cloud flights
- Manual Worker URL config
- "Sync Now" button for manual sync
- Synced vs manual flight badges
- Media links, basic flight details

### Phase 3: Enhanced Features 📋 Polish
- Media gallery with thumbnails + full-screen viewer
- Flight path visualization on maps with playback
- Telemetry charts (altitude, speed, battery, duration)
- Aircraft info, launch location, stats comparison
- UX polish (skeleton screens, pull-to-refresh, offline indicator)

## Architecture Notes

**Design Principles:**
- Consumer app feel (clean, fast, mobile-first)
- Complete working code only (no placeholders)
- Manual user control > automation
- Offline-friendly where possible
- Navy/cyan aviation theming

**Security:**
- API token stored in Cloudflare Worker secrets only
- Browser never touches Skydio authentication
- Worker handles all API calls server-side
- CORS properly configured

## Getting Started

1. Install Node.js + Wrangler CLI
2. Deploy Cloudflare Worker (provided in `/worker`)
3. Configure Worker URL in Settings tab
4. Sync flights or plan new trip

See `DRONESCOUT_COMPLETE_HANDOFF.md` for full deployment guide.

## Use Cases

**Travel Documentation:** Flying to client meetings? Enter hotel location → Get scenic shots you can actually get with X10
**Study Tool:** Part 107 students can explore real airspace rules, weather impacts, terrain risks
**Flight Log:** Build personal flight history with photos, videos, GPS tracks, telemetry stats
**Portfolio Building:** Export synced flights with media for commercial photography business exploration

## Regulatory Compliance

- Built by FAA Part 107 certified pilot with BVLOS authorization
- Assumes 400ft AGL ceiling (Part 107 limits)
- Checks real-time NOTAMs, airspace restrictions, local ordinances
- Educational resource for drone safety and regulations
- Personal use app (commercial features exploratory)

## Author

Built by Skydio employee, travel drone enthusiast, licensed pilot.

---

**Status:** Active development  
**Next:** Deploy Phase 2 (Cloud sync + History updates)
