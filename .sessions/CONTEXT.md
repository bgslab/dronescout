# DroneScout - Project Context
**Last Updated:** November 2, 2025
**Current Version:** V9.0
**Status:** ✅ V9.0 Complete - Real Photos + Live Weather + Spot Discovery

---

## 📖 WHAT IS DRONESCOUT?

**DroneScout** is a personal drone flight planning and logging app for travel documentation with the Skydio X10 drone. It helps FAA Part 107 certified pilots plan scenic flights, assess risks/regulations, and sync completed missions with full telemetry and media from Skydio Cloud.

**Key Use Cases:**
- Plan scenic flights at travel destinations
- Sync completed flights from Skydio Cloud automatically
- View flight paths on maps with GPS tracks
- Analyze telemetry data (speed, altitude, distance)
- Rate flights and build personal flight history
- Document travel with aerial photography

---

## 🏗️ ARCHITECTURE

### Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Mapping:** Leaflet.js 1.9.4
- **Storage:** localStorage (offline-capable)
- **Backend:** Cloudflare Workers (secure API proxy)
- **APIs:**
  - Skydio Cloud v0 (flight data)
  - Google Street View Static API (real photos) ✨ NEW in V9
  - OpenWeather API (live weather + flying conditions) ✨ NEW in V9
  - Overpass API / OpenStreetMap (spot discovery) ✨ ENHANCED in V9
  - OpenStreetMap Nominatim (geocoding)
  - Unsplash (fallback images)
- **Deployment:** GitHub Pages (https://bgslab.github.io/dronescout/)

### File Structure
```
dronescout/
├── index.html                       # Main app (SPA with all UI/logic)
├── cloudflare-worker.js             # Backend proxy (Skydio + Google + Weather APIs)
├── streetview-test.html             # Street View integration test page
├── spot-discovery-test.html         # Street View + Weather test page
├── full-spot-discovery-test.html    # Complete spot discovery demo ⭐
├── .sessions/                       # Session management & documentation
│   ├── README.md                    # Session organization guide
│   ├── CONTEXT.md                   # This file - project context
│   ├── SESSION_V1-V7_SUMMARY.md    # Gray map tiles debugging
│   ├── SESSION_V8_SUMMARY.md       # Telemetry + inline maps
│   ├── V9_TECHNICAL_STRATEGY.md    # V9.0 planning document
│   ├── SESSION_V9_PHASE2_STREETVIEW.md  # Street View integration
│   └── SESSION_V9_PHASE3_WEATHER_SPOTS.md  # Weather + Full V9.0 ✨ NEW
├── README.md                        # Project overview
└── [legacy docs]                    # V1-V7 handoff docs (archived)
```

### Data Flow
```
User Browser (index.html)
    ↓
localStorage (flights, ratings, settings)
    ↓
Cloudflare Worker (cloudflare-worker.js)
    ↓
Skydio Cloud API v0
```

---

## 🎯 CURRENT FEATURES (V8.0)

### 1. **Flight History Tab**
- View all flights (synced from Skydio + manual entries)
- Newest flights first (reverse chronological order)
- Expandable sections for:
  - **Flight Telemetry**: Speed, Altitude, Distance metrics
  - **Flight Path Map**: Inline Leaflet map (no tab switching)
- Rating system (5-star + wouldFlyAgain)
- Smart flight names: "SkydioX10-r6h6 - Afternoon in Lake Villa, Illinois (20m)"

### 2. **Telemetry Display**
Six key metrics with dual units (Imperial + Metric):
- **Max Speed**: mph + m/s
- **Avg Speed**: mph + m/s
- **Max Altitude**: ft + m AGL (height above takeoff)
- **Avg Altitude**: ft + m AGL
- **Distance Traveled**: miles + km (total GPS path)
- **Max Range from Launch**: miles + feet (furthest from takeoff)

### 3. **Inline Maps**
- Maps display within flight cards on History page
- Expandable `<details>` element (lazy loading)
- GPS track visualization with Start (green) and End (red) markers
- Blue polyline showing flight path
- Median filtering to remove GPS outliers
- Point reduction for large tracks (>500 points)
- Optional "Open Full Screen Map" for detailed view

### 4. **Smart Flight Naming**
Flight names auto-generate with:
- **Drone Model**: "SkydioX10-r6h6" (from vehicle serial)
- **Time of Day**: Morning/Afternoon/Evening/Night (based on hour)
- **Location**: Reverse geocoded from GPS (e.g., "Lake Villa, Illinois")
- **Duration**: Minutes (e.g., "20m")

**Example:** "SkydioX10-r6h6 - Afternoon in Lake Villa, Illinois (20m)"

### 5. **Auto-Geocoding**
- Automatic reverse geocoding during Skydio sync
- OpenStreetMap Nominatim API (free)
- Rate-limited to 1 request/second (API requirement)
- Progress indicator: "Resolving locations... (3/10)"
- Cached in localStorage (no re-fetching)

### 6. **Trip Planner Tab**
- Manual trip planning with location, date, notes
- Mock scenic spots with Unsplash imagery (V9.0 will enhance this)
- Risk assessment (safety, weather, airspace)
- Map view with flight path drawing

### 7. **Settings Tab**
- Skydio Cloud sync configuration
- Worker URL setup
- Organization token (masked)
- Connection status indicator
- Last sync timestamp
- **Clear & Re-sync** button (purge localStorage + re-sync)

---

## 🔑 KEY TECHNICAL DECISIONS

### Why localStorage?
- ✅ Offline-first design
- ✅ No backend database needed
- ✅ Fast access (no network calls)
- ✅ User owns their data
- ⚠️ 5MB limit (mitigated by caching strategy)

### Why Cloudflare Workers?
- ✅ Hides Skydio API token from browser
- ✅ CORS proxy for API calls
- ✅ Free tier (100,000 requests/day)
- ✅ Global edge network (low latency)

### Why Vanilla JS?
- ✅ No build step
- ✅ No dependencies to manage
- ✅ Lightweight (~100KB total)
- ✅ Direct DOM manipulation (fast)
- ✅ Easy to understand and modify

### Why Leaflet.js?
- ✅ Industry-standard mapping library
- ✅ Small bundle size (~40KB)
- ✅ Works offline (with cached tiles)
- ✅ Mobile-friendly touch controls

---

## 🗄️ DATA STRUCTURES

### localStorage Schema
```javascript
{
  // Flights (synced + manual)
  flights: [
    {
      id: "flight_uuid",
      type: "synced", // or "manual"
      synced: true,
      name: "Flight display name",
      created_at: "2025-11-02T14:30:00Z",
      duration_seconds: 1200,
      location: { lat: 42.237539, lon: -88.392306 },
      locationName: "Lake Villa, Illinois", // geocoded
      notes: "User notes",
      mediaUrls: ["https://..."],
      telemetry: {
        track: [{ timestamp, lat, lon, velocity, height_above_takeoff, ... }],
        stats: {
          velocity: { max, avg, min, ... },
          height_above_takeoff: { max, avg, min, ... },
          _distance_traveled: { miles, kilometers, total },
          _max_distance_from_launch: { miles, feet, total }
        }
      },
      metadata: { vehicle_serial: "SkydioX10-r6h6", ... }
    }
  ],

  // Flight ratings
  ratings: [
    {
      flightId: "flight_uuid",
      descAccuracy: 5,
      shotTypeMatch: 4,
      accessibility: 5,
      wouldFlyAgain: true,
      notes: "Amazing spot!"
    }
  ],

  // Sync settings
  syncSettings: {
    workerUrl: "https://worker.user.workers.dev",
    connectionStatus: "connected",
    lastSync: "2025-11-02T14:00:00Z"
  }
}
```

---

## 📡 SKYDIO CLOUD API

### Authentication
- **API Version:** v0 (organization tokens)
- **Token Type:** Direct token auth (no "Bearer" prefix)
- **Storage:** Cloudflare Worker secrets only (never in browser)

### Endpoints Used
1. **List Flights:** `GET /api/v0/organization_flights?limit=100`
2. **Flight Details:** `GET /api/v0/flights/{id}`
3. **Flight Telemetry:** `GET /api/v0/flights/{id}/telemetry`

### Telemetry Fields Available
- `gps` - GPS coordinates (lat/lon arrays with timestamps)
- `velocity` - 3D velocity vector `[vx, vy, vz]` in m/s
- `height_above_takeoff` - Altitude AGL in meters
- `battery_percentage` - Battery level (0-100)
- `gps_num_satellites` - GPS satellite count
- `horizontal_accuracy_estimate` - GPS accuracy
- `vertical_accuracy_estimate` - GPS accuracy
- `hybrid_altitude` - MSL altitude (backup field)
- ~~`altitude`~~ - **DO NOT USE** (all zeros, broken field)

### Velocity Handling (Critical!)
Skydio returns velocity as **3D vector**, not scalar:
```javascript
velocity: {
  timestamps: [...],
  data: [
    [vx1, vy1, vz1],  // First point
    [vx2, vy2, vz2],  // Second point
    ...
  ]
}
```

Must calculate magnitude: `speed = sqrt(vx² + vy² + vz²)`

---

## 🐛 KNOWN BUGS & FIXES

### ✅ FIXED: Gray Map Tiles (V1-V7)
**Problem:** Leaflet maps showing gray tiles instead of OpenStreetMap imagery
**Root Cause:** Container sizing issues, tab switching, `invalidateSize()` timing
**Fix:** See `.sessions/SESSION_V1-V7_SUMMARY.md`

### ✅ FIXED: Velocity Missing (V8)
**Problem:** Speed metrics not displaying
**Root Cause:** Velocity field is array `[vx, vy, vz]`, not scalar
**Fix:** Calculate magnitude in `cloudflare-worker.js:311-335`

### ✅ FIXED: Inline Map Disappearing (V8)
**Problem:** Map loads then immediately closes
**Root Cause:** `render()` call destroying DOM and resetting `<details>` state
**Fix:** Remove `render()` call from `loadInlineFlightMap()`

### ✅ FIXED: Telemetry Not Auto-Loading (V8)
**Problem:** Telemetry section still showing "Click to load" after map loads
**Root Cause:** DOM not updated after telemetry fetched
**Fix:** Manually update telemetry DOM in `loadInlineFlightMap()` after fetch

---

## 🚀 VERSION HISTORY

### V1-V7: Gray Map Tiles Debugging (Oct-Nov 2025)
**Focus:** Fixing Leaflet map rendering issues
**Summary:** `.sessions/SESSION_V1-V7_SUMMARY.md`
**Outcome:** Maps work reliably on History + Planner tabs

### V8.0: Telemetry + Inline Maps (Nov 2, 2025)
**Focus:** Enhanced telemetry display + inline map UX
**Summary:** `.sessions/SESSION_V8_SUMMARY.md`
**Tag:** `v8.0`
**Key Features:**
- Simplified telemetry (Speed, Altitude, Distance)
- Inline maps (no tab switching)
- Smart flight names with geocoding
- Auto-geocoding during sync
- Clear & Re-sync button
- Dual unit display (Imperial + Metric)

**All Commits:**
1. `d77bee4` - FEAT: Reverse flight order + expandable telemetry sections
2. `74ad27b` - FEAT: Comprehensive telemetry field inspection
3. `b6cc909` - FEAT: Dynamic telemetry field parsing from Skydio API
4. `06ba0c2` - FIX: Correct telemetry field names to match Skydio API
5. `0b6cc66` - FIX: Handle velocity as vector array (calculate magnitude)
6. `fd2edf0` - FEAT: Simplified telemetry - Speed, Altitude, Distance only
7. `40fd96c` - FEAT: Add Max Range from Launch metric
8. `8fa3e12` - FEAT: Inline flight path maps (no tab switching)
9. `db0388c` - FIX: Remove render() call that was closing inline map
10. `fd5160f` - FEAT: Auto-load telemetry + reverse geocoding for locations
11. `7979a26` - FEAT: Auto-geocode flight locations during sync
12. `aac811c` - FEAT: Better rating modal + Clear & Re-sync button
13. `584640d` - DOCS: Complete V8.0 session summary
14. `3ad688c` - DOCS: Add session management system

### V9.0: Trip Planner Transformation ✅ COMPLETE
**Focus:** Location-based spot discovery engine with real photos and live weather
**Documentation:**
- Strategy: `.sessions/V9_TECHNICAL_STRATEGY.md`
- Phase 2 (Street View): `.sessions/SESSION_V9_PHASE2_STREETVIEW.md`
- Phase 3 (Weather + Complete): `.sessions/SESSION_V9_PHASE3_WEATHER_SPOTS.md`

**Status:**
- ✅ **Phase 1:** Technical strategy & API planning
- ✅ **Phase 2:** Google Street View API integration
- ✅ **Phase 3:** OpenWeather API + Full Spot Discovery **COMPLETE!**
- ⏳ **Phase 4:** Airspace classification (V10.0 - awaiting Aloft API approval)
- ⏳ **Phase 5:** Community flight paths (V10.0)

**V9.0 Complete Feature Set:**
1. **Real Spot Discovery**
   - Overpass API finds actual viewpoints, parks, beaches, peaks
   - Any location worldwide
   - Sorted by distance from search center

2. **Actual Location Photos**
   - Google Street View images (when available)
   - Automatic Unsplash fallback
   - Photo source badges and metadata

3. **Live Weather Data**
   - OpenWeather API: temp, wind, visibility, conditions
   - Fetched in real-time for each spot
   - Updates every search

4. **Drone Flying Safety Assessment**
   - Automatic risk evaluation (Low/Medium/High)
   - Wind, visibility, precipitation analysis
   - Specific warnings and recommendations
   - FAA VLOS compliance checking

5. **Beautiful UI/UX**
   - Professional weather cards
   - Flying status badges (Good/Caution/Do Not Fly)
   - Responsive design
   - Real-time data display

**API Keys Secured:**
- Google Maps API: `AIzaSyDzWCokRTf0EIwEJ_fCrpLud-F-5JiRfYY`
- OpenWeather API: `00d5cc9b2a976560920093ea685c2b09`
- Both stored as Cloudflare Worker secrets

**Test Pages:**
- `streetview-test.html` - Street View only
- `spot-discovery-test.html` - Street View + Weather
- `full-spot-discovery-test.html` - Complete end-to-end demo ⭐

---

## 📍 WHERE TO FIND CODE

### Flight History Rendering
- **File:** `index.html`
- **Lines:** 2600-2800 (renderHistoryTab function)
- **Features:** Flight cards, telemetry sections, inline maps

### Inline Map Loading
- **File:** `index.html`
- **Lines:** 1747-1908 (loadInlineFlightMap function)
- **Key Logic:** GPS filtering, Leaflet map creation, telemetry update

### Smart Flight Names
- **File:** `index.html`
- **Lines:** 1901-1938 (generateFlightName function)
- **Logic:** Time of day + drone model + location + duration

### Reverse Geocoding
- **File:** `index.html`
- **Lines:** 1975-2069 (reverseGeocode + reverseGeocodeAllFlights)
- **API:** OpenStreetMap Nominatim with rate limiting

### Telemetry Stats Calculation
- **File:** `cloudflare-worker.js`
- **Lines:** 212-402 (field inspection + stats + distance metrics)
- **Critical:** Velocity magnitude calculation, Haversine distance

### Telemetry Display
- **File:** `index.html`
- **Lines:** 2071-2120 (renderAllTelemetryStats function)
- **Output:** 6 metrics with dual units

### Street View Integration (V9.0) ✨ NEW
- **File:** `index.html`
- **Lines:** 1080-1181 (fetchLocationImage + checkStreetViewAvailability)
- **Worker:** `cloudflare-worker.js` lines 537-633
- **Features:** Real photos with Unsplash fallback, metadata display

---

## 🔧 DEVELOPMENT WORKFLOW

### Making Changes
1. Edit `index.html` or `cloudflare-worker.js`
2. Test locally: `open index.html` (or python -m http.server)
3. Test worker: `wrangler dev cloudflare-worker.js`
4. Commit with descriptive message (FEAT/FIX/DOCS prefix)
5. Push to GitHub: `git push origin main`
6. GitHub Pages auto-deploys (~2 minutes)

### Testing Checklist
- [ ] History tab loads flights
- [ ] Sync with Skydio works
- [ ] Telemetry sections expand/collapse
- [ ] Inline maps load when opened
- [ ] GPS tracks render correctly
- [ ] Flight names show location
- [ ] Rating modal opens/saves
- [ ] Clear & Re-sync purges data
- [ ] Mobile responsive (test on phone)

### Deployment
- **URL:** https://bgslab.github.io/dronescout/
- **Method:** GitHub Pages (automatic)
- **Branch:** `main`
- **Worker:** Separate Cloudflare deployment

---

## 📚 EXTERNAL DEPENDENCIES

### APIs (Current)
1. **Skydio Cloud API v0** - Flight data
   - Authentication: Organization token
   - Rate limits: Unknown (reasonable use)
   - Cost: Free (internal Skydio use)

2. **OpenStreetMap Nominatim** - Geocoding
   - Rate limit: 1 request/second
   - Cost: Free (attribution required)
   - Fallback: None (graceful degradation)

3. **Unsplash API** - Stock imagery (Trip Planner)
   - API Key: `PWgTvrIDkfEdi93dvP2knidPZa7z8IbdhnvbZRrBIw4`
   - Rate limit: 50 requests/hour
   - Cost: Free (demo tier)

### CDN Libraries
1. **Leaflet.js 1.9.4** - Maps
   - CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
   - Size: ~40KB
   - Offline: Cached after first load

2. **OpenStreetMap Tiles**
   - Source: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
   - Cost: Free (attribution required)
   - Fallback: CartoDB tiles (if OSM fails)

---

## 🎯 NEXT PRIORITIES (V9.0)

See `.sessions/V9_TECHNICAL_STRATEGY.md` for full technical strategy.

**High-Level Vision:**
Transform Trip Planner into location-based spot discovery:
1. User enters "New York City"
2. System finds real flying spots (parks, viewpoints, landmarks)
3. Display real Google photos of each spot
4. Show current weather and airspace classification
5. Community flight path recommendations (heading, altitude, tips)
6. One-click pre-populate Trip Planner with selected spot

**Key Decisions Needed:**
- Google Street View API (real photos) - requires API key
- OpenWeather API (live weather) - free tier available
- Airspace approach: Heuristic estimation vs FAA B4UFLY API

---

## 🙋 FREQUENTLY ASKED QUESTIONS

### Q: Why no framework (React, Vue, etc.)?
**A:** Intentional design choice. Vanilla JS keeps bundle size tiny, eliminates build step, and makes code easy to understand. For a personal project with one developer, frameworks add complexity without benefits.

### Q: Will this work offline?
**A:** Partially. localStorage persists all flight data offline. Maps work if tiles are cached. Sync requires internet. Trip Planner can be used offline for cached locations.

### Q: Can I use this with other drones?
**A:** Not currently. Tightly integrated with Skydio Cloud API. Could theoretically support DJI FlightHub or other platforms with adapter layer.

### Q: What's the 5MB localStorage limit?
**A:** Browser limit for localStorage per domain. DroneScout uses ~2KB per flight, so ~2,500 flights fit in 5MB. LRU eviction strategy can be added if needed.

### Q: Why GitHub Pages for deployment?
**A:** Free, automatic, fast, reliable. Perfect for static sites. No server maintenance.

### Q: How do I get a Skydio API token?
**A:** Contact Skydio support or check developer portal. Requires Skydio Cloud access.

---

## 🤝 CONTRIBUTING

This is a **personal project**, but learnings are shared openly.

If you want to adapt this for your own use:
1. Fork the repository
2. Update Cloudflare Worker with your own Skydio token
3. Deploy worker to your Cloudflare account
4. Update `index.html` with your worker URL
5. Deploy to your own GitHub Pages

**License:** Open source (check repo for license file)

---

## 📞 SUPPORT & CONTACT

**Project Maintainer:** John Akalaonu (Skydio employee)
**GitHub Issues:** https://github.com/bgslab/dronescout/issues
**Email:** Available on GitHub profile

**For Claude Code Sessions:**
- Start new session by uploading this CONTEXT.md file
- Reference session summaries in `.sessions/` for detailed history
- Tag major versions with git tags (`v8.0`, `v9.0`, etc.)

---

## 🔖 QUICK REFERENCE

### Important Code Locations
- **Main App:** `index.html` (~3,700 lines)
- **Worker Proxy:** `cloudflare-worker.js` (~450 lines)
- **Session Docs:** `.sessions/` directory

### Git Commands
```bash
# Tag new version
git tag -a v9.0 -m "V9.0: Trip Planner spot discovery"
git push origin v9.0

# View commit history
git log --oneline

# See changes between versions
git diff v8.0..v9.0
```

### localStorage Inspection (Browser Console)
```javascript
// View all data
console.log(JSON.stringify(localStorage, null, 2));

// Clear all DroneScout data
localStorage.clear();

// View specific keys
JSON.parse(localStorage.getItem('flights'));
JSON.parse(localStorage.getItem('ratings'));
```

### Worker Testing
```bash
# Local development
wrangler dev cloudflare-worker.js

# Deploy to production
npx wrangler deploy

# View logs
wrangler tail
```

---

**Last Updated:** November 2, 2025
**Current Version:** V8.0
**Next Version:** V9.0 (Trip Planner transformation)

---

*This document is the single source of truth for DroneScout project context. Update it after each major version release.*
