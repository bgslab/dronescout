# DroneScout V10.0: Intelligent Recommendation System
**Design Document**
*From "Pretty Photo Finder" → "Intelligent Flight Planner"*

---

## 🎯 Core Problem Statement

**Current State (V9.0):**
- Recommends spots based on: distance (40%) + photo aesthetics (60%) + weather display
- 25-mile fixed radius (too large, 30+ min drive)
- No legal viability checking (airspace, LAANC, local rules)
- No accessibility intelligence (private property, permits, access points)
- No user-specific capabilities (waivers, drone specs, experience)
- Essentially recommends "pretty places" without considering if you can legally/safely fly

**Target State (V10.0):**
- Smart recommendations based on: legal viability + accessibility + safety + user capabilities + preferences
- Configurable search radius (5/10/15/25 mi)
- FAA airspace integration with LAANC approval likelihood
- Land ownership and access intelligence
- User profile with waivers/certifications/drone specs
- Personalized scoring based on pilot capabilities

---

## 🏗️ System Architecture

### 1. User Profile System
**Purpose:** Store pilot capabilities to personalize recommendations

```javascript
userProfile = {
  // Certifications & Waivers
  certifications: {
    part107: true,
    part107Expiry: "2026-08-15",
    trustCertified: false
  },

  activeWaivers: [
    {
      type: "over_people",  // Category 1-4
      category: 1,           // Cat 1 = sustained flight over people
      expiryDate: "2025-12-31",
      notes: "Parachute system equipped"
    },
    {
      type: "night_operations",
      expiryDate: "2026-06-30"
    },
    {
      type: "beyond_vlos",
      expiryDate: "2025-10-15"
    }
  ],

  // Drone Specifications
  drones: [
    {
      id: "main_drone_1",
      name: "DJI Mavic 3",
      weight_lbs: 1.98,
      hasParachute: true,
      hasRemoteID: true,
      maxAltitude_ft: 1640,  // 500m
      hasNightLights: true,
      category: 1  // FAA category for over-people ops
    }
  ],

  // Experience & Preferences
  experience: "advanced",  // beginner | intermediate | advanced
  preferences: {
    maxDriveTime_min: 20,  // Implies ~15 mile radius
    preferredRadius_mi: 15,
    avoidCrowds: false,     // Can fly over crowds with waiver
    timeOfDay: "any"        // dawn | day | dusk | night | any
  },

  // Shot Type Preferences (from sliders)
  shotPreferences: {
    cityscape: 70,
    nature: 30,
    // Derived: landscape = 100-cityscape, architecture = 100-nature
  }
}
```

**Storage:** localStorage with cloud sync option (Cloudflare KV)

---

### 2. Intelligent Scoring Algorithm

**Goal:** Rank spots by *realistic flyability* not just aesthetics

#### Scoring Components (Total = 100 points)

```javascript
spotScore = {
  // Legal Viability (35 points)
  airspaceCompliance: 15,      // Class G = 15, LAANC auto-approval = 12, manual approval = 8, restricted = 0
  localRegulations: 10,         // No local bans = 10, permit required = 5, banned = 0
  populationDensity: 10,        // Check against user waivers (over-people category)

  // Accessibility (25 points)
  landAccess: 15,               // Public land = 15, public w/ permit = 10, private (known access) = 5, restricted = 0
  proximity: 10,                // Within user's preferred radius (weighted by distance)

  // Safety Context (20 points)
  obstacleRisk: 10,             // Power lines, towers, trees (from OSM)
  emergencyLanding: 5,          // Open areas nearby for emergency landing
  cellCoverage: 5,              // Signal strength for RTH and control

  // Photo Quality (20 points)
  preferenceMatch: 15,          // How well shot types match user sliders
  weatherConditions: 5          // Current flying conditions (wind, vis, precip)
}
```

**Key Logic Changes:**
- **Waivers unlock spots:** If user has Cat 1 over-people waiver, urban spots don't get penalized
- **Radius filtering:** Hard filter by user preference (5/10/15/25 mi) before scoring
- **Legal viability is gating:** Spots in restricted airspace get 0 points regardless of beauty
- **Accessibility is critical:** Can't recommend private property with no access

---

### 3. Data Sources & APIs

#### A. FAA Airspace Data
**Endpoint:** `https://api.faa.gov/`
**Data Needed:**
- Airspace classification (Class B/C/D/E/G)
- LAANC facility maps and approval grids
- UAS Facility Maps (controlled airspace ceiling altitudes)
- TFRs (Temporary Flight Restrictions)

**Implementation:**
- Cache airspace grids (updated monthly)
- Real-time TFR checks for active spot
- LAANC likelihood score based on grid data

#### B. Land Ownership & Access (OSM + Overpass)
**OSM Tags to Check:**
```
access=* (yes/private/no/permissive/customers)
ownership=* (public/private/municipal/state/national_park)
operator=* (e.g., "National Park Service", "Private")
leisure=park + access=yes → Likely public
leisure=nature_reserve + operator="NPS" → Public but may have drone rules
landuse=military → Restricted
```

**Logic:**
- `access=yes` or `access=permissive` → Public access (15 pts)
- `access=customers` or `ownership=private` → Restricted (0 pts)
- National/State Parks → Public but check drone regulations database
- No access tag + tourism=* → Assume public viewpoint (10 pts)

#### C. Population Density (Census API)
**Endpoint:** `https://api.census.gov/data/`
**Data:** Population per square mile by tract
**Logic:**
- <500 ppl/sq mi → Rural, no crowd concerns (10 pts)
- 500-5000 → Suburban, check waivers (if Cat 1 waiver: 10 pts, else 5 pts)
- >5000 → Urban, requires over-people waiver (if Cat 1: 10 pts, else 0 pts)

#### D. Obstacle Data (OSM)
**Tags:**
```
power=line/tower
man_made=tower/mast
barrier=wall/fence
natural=tree_row/wood
highway=* (for line-of-sight obstacles)
```

**Buffer Analysis:** Check 500ft radius around spot for obstacles

#### E. Cell Coverage (OpenCelliD / FCC)
**Fallback:** Assume coverage in urban/suburban, check in rural areas

---

### 4. UI/UX Changes

#### A. Profile Setup (New Tab)
**Location:** Add "Profile" tab in settings
**Sections:**
1. **Certification**
   - Part 107: Yes/No + Expiry
   - TRUST: Yes/No

2. **Active Waivers** (+ Add Waiver button)
   - Type: Over People / Night / Beyond VLOS / Controlled Airspace
   - Category (if over-people): Cat 1-4
   - Expiry Date
   - Notes

3. **Drone Specs** (+ Add Drone button)
   - Model name
   - Weight
   - Has parachute: Yes/No
   - Remote ID: Yes/No/Broadcast
   - Night lights: Yes/No

4. **Preferences**
   - Max drive time: 10/15/20/30/45 min (→ calculates radius)
   - Experience level: Beginner/Intermediate/Advanced
   - Avoid crowds: Yes/No (overridden if waiver present)

#### B. Search Controls
**Replace fixed 25mi with:**
```
┌─────────────────────────────────┐
│ Search Radius: [====●====] 15mi │  ← Slider: 5/10/15/25 mi
│ Max Drive Time: ~20 minutes     │  ← Calculated estimate
└─────────────────────────────────┘
```

#### C. Spot Card Enhancements
**Add Intelligence Badges:**

```
┌──────────────────────────────────────┐
│ 📸 [Photo]              92% Match ✓  │
│                                       │
│ Brooklyn Bridge Park                  │
│ 0.8 mi away                          │
│                                       │
│ ✅ Class G Airspace                  │  ← Legal
│ ⚠️  Permit Required (NYC Parks)      │  ← Accessibility
│ ✓  Cat 1 Waiver Valid               │  ← User-specific
│ ⚡ 8 mph wind, 10mi vis             │  ← Weather
│                                       │
│ Match: 87/100                        │
│ ├─ Legal:   30/35  ⚠️                │
│ ├─ Access:  20/25  ✓                 │
│ ├─ Safety:  18/20  ✓                 │
│ └─ Aesthetics: 19/20  ✓              │
└──────────────────────────────────────┘
```

**Color Coding:**
- ✅ Green: Fully compliant, no issues
- ⚠️ Yellow: Minor issue (permit needed, but accessible)
- 🚫 Red: Major blocker (restricted airspace, no waiver)

#### D. Spot Detail View
**Add "Flight Viability" Section:**

```
═══════════════════════════════════════
🛩️  FLIGHT VIABILITY BREAKDOWN
═══════════════════════════════════════

Legal Status (30/35) ⚠️
├─ Airspace: Class G (unrestricted) ✅ 15/15
├─ Local Rules: NYC Parks permit req ⚠️ 5/10
└─ Population: >5000/sq mi, Cat 1 OK ✅ 10/10

Accessibility (20/25) ✓
├─ Land Access: Public park ✅ 15/15
├─ Distance: 0.8 mi (4 min drive) ✅ 5/10

Safety (18/20) ✓
├─ Obstacles: Minimal, open waterfront ✅ 10/10
├─ Emergency Landing: Water nearby ⚠️ 3/5
└─ Cell Coverage: Excellent (5G) ✅ 5/5

Photo Quality (19/20) ✓
├─ Preference Match: 95% cityscape ✅ 15/15
└─ Weather: Good conditions ✅ 4/5

═══════════════════════════════════════
📋 RECOMMENDATIONS
═══════════════════════════════════════
✓ Apply for NYC Parks filming permit
  → parks.ny.gov/permits (free, 48hr turnaround)
✓ Check for active TFRs before flight
⚠️ Emergency landing limited to grass areas
✓ Launch from designated viewpoint area
```

---

### 5. Implementation Phases

#### Phase 1: Foundation (Week 1)
- [ ] Create user profile schema and UI
- [ ] Add radius control slider (5/10/15/25 mi)
- [ ] Implement profile storage (localStorage + cloud sync)
- [ ] Update search to filter by radius before scoring

**Deliverable:** Users can set waivers/drones and control search radius

#### Phase 2: Legal Intelligence (Week 2)
- [ ] Integrate FAA API for airspace classification
- [ ] Add LAANC grid data (cache locally)
- [ ] Implement TFR checking
- [ ] Add airspace compliance scoring (15 pts)

**Deliverable:** Spots show airspace class and restrictions

#### Phase 3: Accessibility Intelligence (Week 3)
- [ ] Enhance OSM query with access/ownership tags
- [ ] Build land access scoring logic (15 pts)
- [ ] Add population density via Census API (10 pts)
- [ ] Implement waiver-aware population scoring

**Deliverable:** Spots filtered by land access and crowd density

#### Phase 4: Safety Context (Week 4)
- [ ] Add OSM obstacle detection (power lines, towers)
- [ ] Implement emergency landing zone analysis
- [ ] Add cell coverage data (FCC/OpenCelliD)
- [ ] Build safety scoring (20 pts)

**Deliverable:** Safety context displayed for each spot

#### Phase 5: UI Polish & Intelligence Display (Week 5)
- [ ] Redesign spot cards with viability badges
- [ ] Add detailed breakdown in spot detail view
- [ ] Implement color-coded status indicators
- [ ] Add actionable recommendations ("Apply for permit")

**Deliverable:** Full V10.0 intelligence displayed clearly

#### Phase 6: Learning & Optimization (Week 6)
- [ ] Track user acceptances/rejections of spots
- [ ] Adjust scoring weights based on user behavior
- [ ] Add "Why this spot?" explanations
- [ ] Implement spot comparison tool

**Deliverable:** System learns from user preferences

---

## 📊 Example: NYC Search Comparison

### V9.0 (Current) - "Pretty Photo Finder"
**Search:** New York City, 25 mi radius
**Top 3 Results:**
1. Brooklyn Bridge Park (0.8 mi) - 92% match - Pretty waterfront
2. Central Park (2.1 mi) - 88% match - Iconic landscape
3. Rockefeller Center (1.2 mi) - 85% match - Cityscape view

**Problems:**
- ❌ All in controlled airspace (Class B/C) - likely LAANC denials
- ❌ NYC Parks ban drones without permits
- ❌ Rockefeller = massive crowds, no over-people waiver = illegal
- ❌ User drives 15 min to location, can't legally fly

---

### V10.0 (Intelligent) - "Flight Planner"
**Search:** New York City, 15 mi radius
**User Profile:** Part 107 + Cat 1 over-people waiver + parachute drone

**Top 3 Results:**
1. **Floyd Bennett Field** (8.2 mi) - 87/100 ✅
   - ✅ Class G airspace (uncontrolled)
   - ✅ Public land, no permit needed
   - ✅ Cat 1 waiver valid (low crowd density)
   - ✅ Open areas, minimal obstacles
   - ⚠️ 8 mi away (15 min drive)
   - 🏞️ 70% landscape match

2. **Coney Island Beach** (10.1 mi) - 82/100 ⚠️
   - ✅ Class G airspace
   - ⚠️ NYC Parks permit required (free, 48hr)
   - ✅ Cat 1 waiver valid
   - ✅ Beach = good emergency landing
   - ⚠️ 10 mi away (18 min drive)
   - 🌊 75% landscape, 25% cityscape

3. **Brooklyn Navy Yard** (3.8 mi) - 78/100 ⚠️
   - ⚠️ Class D airspace (LAANC likely approval <100ft)
   - ✅ Industrial area, access permitted
   - ✅ Cat 1 waiver valid (industrial, low crowd)
   - ⚠️ Power lines present
   - ✅ 3.8 mi (8 min drive)
   - 🏙️ 85% cityscape, 15% architecture

**Why V10.0 is better:**
- ✅ All spots are *actually flyable* given user's capabilities
- ✅ Realistic drive times within user preference (15 mi)
- ✅ Clear warnings about permits/approvals needed
- ✅ Spots ranked by total viability, not just prettiness
- ✅ User knows exactly what to do ("Apply for permit")

---

## 🚀 Success Metrics

**V9.0 (Current):**
- User searches → sees spots → drives there → can't legally fly → frustrated

**V10.0 (Target):**
- User searches → sees spots → checks viability → drives to legal spot → flies successfully
- **Metric:** "Successful flight rate" (% of recommended spots that result in actual flights)
- **Target:** >80% of recommended spots are actually flyable

---

## 🔧 Technical Considerations

### API Rate Limits
- **FAA API:** 1000 req/day (cache aggressively)
- **Census API:** 500 req/day (cache by zip code)
- **OSM Overpass:** 10k req/day (current usage ~50/day)

### Caching Strategy
- **Airspace grids:** 30-day TTL (static data)
- **TFRs:** 1-hour TTL (can change rapidly)
- **Population density:** 90-day TTL (rarely changes)
- **Land access:** 7-day TTL (OSM updates weekly)
- **Weather:** 15-min TTL (current)

### Performance
- Scoring 40 spots with full intelligence: ~500ms target
- Use Web Workers for heavy calculations
- Pre-fetch common search areas (NYC, LA, SF)

---

## 💬 Open Questions

1. **FAA API Key:** Do we have access? Need to apply?
2. **Permit Database:** Should we maintain a database of known local drone regulations?
3. **User Verification:** Should we verify Part 107 certs, or trust self-reporting?
4. **Liability:** Do we need legal disclaimers that recommendations aren't flight authorizations?
5. **Monetization:** Premium features (detailed airspace analysis, automated permit applications)?

---

## 📝 Next Steps

**Immediate (This Session):**
1. Review this design with user
2. Get feedback on priorities (which phases to do first?)
3. Discuss FAA API access and data sources
4. Decide: Full V10.0 or incremental rollout?

**User Decisions Needed:**
- Do you want Phase 1 (profile + radius control) immediately, or architect all 6 phases first?
- Any features in this design that aren't important to you?
- Any missing features you want to see?

---

**Author:** Claude Code
**Date:** 2025-11-02
**Status:** Design Review - Awaiting User Feedback
