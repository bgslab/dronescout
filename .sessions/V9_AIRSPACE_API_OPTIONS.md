# V9.0 Airspace API Options - UPDATED
**Date:** November 2, 2025
**Status:** Premium APIs Available!

---

## 🎯 USER DECISION: GO PREMIUM

**User wants:** "I definitely wanna go premium the whole way with the images and all the information"

**Great news:** Both Aloft and AirMap/Wing OpenSky offer professional airspace APIs!

---

## ✅ RECOMMENDED: ALOFT API (Best for DroneScout)

### Why Aloft is Perfect

**✅ Developer-Friendly:**
- Full REST API with documentation
- API registration available at: `air.aloft.ai/airspace-api/register`
- Developer portal: `www.aloft.ai/developer/`
- Sandbox mode for testing (doesn't affect production)

**✅ Comprehensive Airspace Data:**
- FAA map layers (airspace classifications)
- Real-time TFRs (Temporary Flight Restrictions)
- Sectional maps
- Stadiums and special use airspace
- LAANC grid data (where authorizations are available)
- Dynamic airspace updates

**✅ LAANC Integration:**
- Programmatic LAANC authorization requests
- Near real-time approvals in controlled airspace
- "Notify and Fly" functionality via API
- **This is HUGE** - users can request airspace authorization directly from DroneScout!

**✅ Pricing:**
- Free basic tier available for personal use
- Commercial API access (contact for pricing)
- No federal funding dependency (private sector, reliable)

---

## 📡 ALOFT API FEATURES FOR DRONESCOUT

### What We Can Display

#### 1. **Airspace Classification**
```javascript
// API call
GET https://air.aloft.ai/airspace-api/v1/advisories
{
  "geometry": {
    "type": "Point",
    "coordinates": [-122.4194, 37.7749] // San Francisco
  }
}

// Response
{
  "airspace": {
    "class": "B",
    "floor": 0,
    "ceiling": 10000,
    "authority": "FAA",
    "requirements": ["LAANC authorization required"],
    "controllingAgency": "San Francisco TRACON"
  },
  "restrictions": [
    {
      "type": "TFR",
      "reason": "VIP Movement",
      "active": true,
      "radius": 30
    }
  ]
}
```

**Display on Spot Card:**
```
✈️ Airspace: Class B (0-10,000 ft)
🚨 LAANC Authorization Required
⚠️ Active TFR: VIP Movement (30nm radius)
```

---

#### 2. **LAANC Availability**
```javascript
// Check if LAANC is available at location
GET https://air.aloft.ai/airspace-api/v1/laanc/availability
{
  "coordinates": [-122.4194, 37.7749],
  "altitude": 250 // feet AGL
}

// Response
{
  "laancAvailable": true,
  "maxAltitude": 400,
  "gridValue": 200, // Max altitude without waiver
  "facilityMap": "SFO",
  "processingTime": "near-realtime"
}
```

**Display on Spot Card:**
```
🟢 LAANC Available
Max Altitude: 200 ft AGL (auto-approval)
Up to 400 ft: Requires manual approval
Processing: Near real-time
```

---

#### 3. **Real-Time NOTAMs & TFRs**
```javascript
// Get active advisories
GET https://air.aloft.ai/airspace-api/v1/advisories/active
{
  "bounds": {
    "north": 37.8,
    "south": 37.7,
    "east": -122.3,
    "west": -122.5
  }
}

// Response
{
  "advisories": [
    {
      "type": "NOTAM",
      "title": "Stadium TFR",
      "effectiveStart": "2025-11-02T19:00:00Z",
      "effectiveEnd": "2025-11-02T22:00:00Z",
      "description": "Giants game - no drone ops within 3nm",
      "severity": "high"
    }
  ]
}
```

**Display on Spot Card:**
```
🚨 Active NOTAM:
Stadium TFR - Giants game
No ops within 3nm
Active: 7pm - 10pm today
```

---

#### 4. **Weather Integration** (Aloft includes weather)
```javascript
// Aloft can also provide weather data
GET https://air.aloft.ai/airspace-api/v1/weather
{
  "coordinates": [-122.4194, 37.7749]
}

// Response
{
  "current": {
    "temp": 65,
    "wind": { "speed": 12, "direction": 270 },
    "visibility": 10,
    "conditions": "Partly Cloudy",
    "ceiling": 5000
  },
  "forecast": { ... }
}
```

**One API for airspace + weather!**

---

## 🆚 ALTERNATIVE: WING OPENSKY API

### Why Wing OpenSky Could Work

**✅ Approved LAANC Provider:**
- FAA-approved in USA
- CASA-approved in Australia
- Near real-time authorizations

**✅ API Available:**
- Wing developed an API for companies to integrate OpenSky
- Example: Measure (AgEagle) uses it for their platform

**⚠️ Considerations:**
- API access requires partnership with Wing
- Primarily designed for B2B integrations
- May require approval for individual app use

**Contact:** Wing developer relations for API access

---

## 🆚 ALTERNATIVE: AIRSPACE LINK (AIRHUB API)

### Features
- Detailed controlled/uncontrolled airspace data
- GIS and LAANC grid information
- Sandbox mode for testing
- Developer-friendly REST API

### Pricing
- Commercial API (contact for quote)
- `airspacelink.com/developers`

---

## 💰 COST COMPARISON

| Provider | Free Tier | Commercial Pricing | LAANC | Real-time TFRs | Weather |
|----------|-----------|-------------------|-------|----------------|---------|
| **Aloft** | ✅ Personal use | Contact sales | ✅ Yes | ✅ Yes | ✅ Yes |
| **Wing OpenSky** | ❌ B2B only | Contact Wing | ✅ Yes | ✅ Yes | ⚠️ Unknown |
| **Airspace Link** | ✅ Sandbox | Contact sales | ✅ Yes | ✅ Yes | ❌ No |
| **FAA Direct** | ✅ Free | Free | ❌ No API | ⚠️ Limited | ❌ No |
| **Heuristic** | ✅ Free | Free | ❌ No | ❌ No | ❌ No |

---

## 🎯 RECOMMENDATION FOR DRONESCOUT V9.0

### **Use Aloft API**

**Phase 1 Approach:**

**Immediate (V9.0):**
1. Register for Aloft API developer access
2. Use free/personal tier for testing and initial release
3. Display airspace classifications (Class B/C/D/E/G)
4. Show LAANC availability and max altitudes
5. Display active TFRs and NOTAMs
6. Show nearest controlled airports

**Features:**
```
Spot Card Display:
┌─────────────────────────────────────────┐
│  [Photo: Golden Gate Vista Point]      │
│                                         │
│  📍 Golden Gate Vista Point             │
│  2.3 mi away · ⭐ 95% match             │
│                                         │
│  ✈️ Airspace Information                │
│  Class B (0-10,000 ft MSL)             │
│  🟢 LAANC Available                     │
│  Max Auto-Approval: 200 ft AGL         │
│  Up to 400 ft: Manual approval needed  │
│                                         │
│  🚨 Active Restrictions                 │
│  TFR: VIP Movement (active until 5pm)  │
│                                         │
│  🌤️ Current Weather                     │
│  65°F, Partly Cloudy                   │
│  Wind: 12 mph W                        │
│  Visibility: 10+ miles                 │
│  Ceiling: 5,000 ft                     │
│                                         │
│  🔴 Risk: Challenging                   │
│  (Class B airspace + active TFR)       │
│                                         │
│  [Request LAANC] [View Details]        │
└─────────────────────────────────────────┘
```

---

**Scale Up (V10.0+):**
When DroneScout has 100+ active users:
1. Upgrade to commercial Aloft API tier
2. Enable LAANC authorization requests from app
3. Users can request airspace authorization without leaving DroneScout
4. Auto-receive approvals in near real-time
5. Store authorization in trip plan

**Future Features:**
```
[Request LAANC Authorization]
↓
┌─────────────────────────────────────────┐
│  LAANC Authorization Request            │
├─────────────────────────────────────────┤
│  Location: Golden Gate Vista Point      │
│  Altitude: 250 ft AGL                   │
│  Date: Nov 2, 2025                      │
│  Time: 2:00 PM - 4:00 PM                │
│                                         │
│  ✅ Auto-approval available              │
│  Estimated response: <1 minute          │
│                                         │
│  [Submit Request]                       │
└─────────────────────────────────────────┘

(1 minute later)

┌─────────────────────────────────────────┐
│  ✅ LAANC Authorization APPROVED         │
├─────────────────────────────────────────┤
│  Authorization #: LAX-2025-110212       │
│  Valid: Nov 2, 2:00 PM - 4:00 PM        │
│  Max Altitude: 250 ft AGL               │
│                                         │
│  Controlling Facility: SFO TRACON       │
│                                         │
│  📱 Saved to trip plan                  │
│  📧 Confirmation emailed                │
│                                         │
│  [View Authorization] [Add to Calendar] │
└─────────────────────────────────────────┘
```

---

## 📋 IMPLEMENTATION PLAN

### Step 1: Register for Aloft API (Before Session 1)

**Actions:**
1. Go to `air.aloft.ai/airspace-api/register`
2. Create developer account
3. Request API key
4. Review API documentation
5. Test in sandbox mode

**Expected Timeline:** 1-2 business days for approval

---

### Step 2: Integrate Aloft API (V9.0 Phase 3)

**Session 3 Tasks:**

```javascript
// 1. Create Aloft API service in Cloudflare Worker
async function getAirspaceInfo(lat, lon, altitude = 400) {
  const response = await fetch('https://air.aloft.ai/airspace-api/v1/advisories', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALOFT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      altitude: altitude,
      buffer: 0
    })
  });

  return response.json();
}

// 2. Check LAANC availability
async function checkLAANC(lat, lon, altitude) {
  const response = await fetch('https://air.aloft.ai/airspace-api/v1/laanc/availability', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALOFT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      coordinates: [lon, lat],
      altitude: altitude
    })
  });

  return response.json();
}

// 3. Get active TFRs and NOTAMs
async function getActiveAdvisories(bounds) {
  const response = await fetch('https://air.aloft.ai/airspace-api/v1/advisories/active', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALOFT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bounds: bounds
    })
  });

  return response.json();
}
```

---

### Step 3: Display Airspace Data on Spots

**Add to spot data structure:**
```javascript
{
  id: "viewpoint_37.7749_-122.4194",
  name: "Golden Gate Vista Point",
  coordinates: { lat: 37.7749, lon: -122.4194 },

  // NEW: Aloft airspace data
  airspace: {
    class: "B",
    floor: 0,
    ceiling: 10000,
    laancAvailable: true,
    laancMaxAltitude: 200,
    laancProcessingTime: "near-realtime",
    controllingFacility: "SFO TRACON",
    requirements: ["LAANC authorization required"]
  },

  // NEW: Active restrictions
  restrictions: [
    {
      type: "TFR",
      reason: "VIP Movement",
      active: true,
      effectiveStart: "2025-11-02T14:00:00Z",
      effectiveEnd: "2025-11-02T17:00:00Z",
      severity: "high"
    }
  ],

  // NEW: Weather from Aloft
  weather: {
    temp: 65,
    conditions: "Partly Cloudy",
    wind: { speed: 12, direction: 270 },
    visibility: 10,
    ceiling: 5000
  }
}
```

---

### Step 4: Calculate Enhanced Risk Score

**New risk algorithm with real airspace data:**
```javascript
function calculateRiskScore(spot) {
  let score = 0;

  // Airspace complexity (0-40 points)
  switch (spot.airspace.class) {
    case 'B': score += 40; break; // Most complex
    case 'C': score += 30; break;
    case 'D': score += 20; break;
    case 'E': score += 10; break;
    case 'G': score += 0; break;  // Uncontrolled
  }

  // LAANC availability (reduce score if available)
  if (spot.airspace.laancAvailable) {
    score -= 15; // LAANC makes it easier
  }

  // Active restrictions (0-30 points)
  spot.restrictions.forEach(restriction => {
    if (restriction.severity === 'high') score += 30;
    else if (restriction.severity === 'medium') score += 15;
    else score += 5;
  });

  // Weather conditions (0-30 points)
  if (spot.weather.wind.speed > 15) score += 20;
  if (spot.weather.visibility < 3) score += 20;
  if (spot.weather.ceiling < 1000) score += 15;

  // Normalize to 0-100
  score = Math.min(100, Math.max(0, score));

  // Risk labels
  if (score >= 70) return { score, label: 'Challenging', color: '#ef4444' };
  if (score >= 40) return { score, label: 'Moderate', color: '#f97316' };
  return { score, label: 'Easy', color: '#22c55e' };
}
```

---

## 🎯 V9.0 PREMIUM CONFIGURATION

### Required API Keys

1. **Google Cloud Console**
   - Street View Static API
   - Places API (optional, for photos)
   - Free tier: $200/month credit

2. **OpenWeather API**
   - Current weather API
   - Free tier: 1,000 calls/day
   - Backup: Use Aloft weather instead

3. **Aloft API**
   - Airspace, LAANC, TFRs, NOTAMs
   - Free tier: Personal use
   - Commercial: Contact sales

### Total Monthly Cost (100 active users)

| Service | Usage | Cost |
|---------|-------|------|
| Google Street View | ~5,000 images | $0 (within free tier) |
| OpenWeather | ~2,000 requests | $0 (within free tier) |
| Aloft API | ~3,000 queries | $0 (free tier) or ~$50 (commercial) |
| **Total** | | **$0-50/month** |

---

## ✅ FINAL RECOMMENDATION

### **Use Aloft API for V9.0 Premium Experience**

**Why:**
1. ✅ Most comprehensive airspace data
2. ✅ LAANC integration (huge value-add)
3. ✅ Real-time TFRs and NOTAMs
4. ✅ Developer-friendly API
5. ✅ Free tier for testing/personal use
6. ✅ Weather included (can replace OpenWeather)
7. ✅ Future-proof (can add LAANC authorization later)

**User Benefits:**
- See actual airspace classes (not estimates)
- Know LAANC availability before planning
- Get alerted to active TFRs (game days, VIP movements)
- Understand max altitudes at each spot
- One-stop airspace authority (not guessing)

**V10.0 Upgrade Path:**
- Enable LAANC requests from DroneScout
- Auto-receive airspace authorizations
- Store authorizations in trip plans
- Integration with flight logging

---

## 🚀 NEXT STEPS

### Before V9.0 Session 1:

1. **Register for Aloft API**
   - Visit: `air.aloft.ai/airspace-api/register`
   - Create account
   - Request API key
   - Review documentation

2. **Set up Google Cloud**
   - Enable Street View Static API
   - Create API key
   - Test with sample coordinates

3. **Optional: OpenWeather**
   - Sign up for free account
   - Get API key
   - OR: Skip and use Aloft weather instead

### V9.0 Session Breakdown (Updated):

**Session 1:** Core spot discovery (Overpass API + preference ranking)
**Session 2:** Real images (Google Street View) + weather (Aloft or OpenWeather)
**Session 3:** **Airspace data (Aloft API)** + risk rating ← PREMIUM FEATURES
**Session 4:** Community flight paths (localStorage)
**Session 5:** Trip integration (auto-populate)

---

**All API options documented! Ready to go premium! 🚀**

Would you like me to:
1. Start Session 1 immediately (spot discovery + preferences)?
2. Wait for you to set up API keys first?
3. Create a detailed API setup guide?
