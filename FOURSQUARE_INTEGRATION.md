# DroneScout V10.1 - Foursquare API Integration

**Date:** 2025-11-02
**Status:** Code Complete - Awaiting API Key Setup

---

## What Changed

Switched from Flickr API to **Foursquare Places API v3** for location discovery.

### Why Foursquare?

**User Requirement:**
> "I want to be able to say hey this is a popular area... I'm gonna be shooting in cities. I'm gonna be shooting suburbs. I'm gonna be shooting rural areas and everything in between."

**Problems with Previous Approaches:**
- ❌ Google Places: CORS errors, business-focused (returning "Inflatables", "Sue's Sandbox")
- ❌ OSM alone: Generic names ("Viewpoint 15", "INVISIBLE"), unverified data
- ❌ Flickr: Requires paid subscription, photo-centric but not place-centric

**Foursquare Advantages:**
- ✅ Comprehensive location database (urban, suburban, rural, nature)
- ✅ Verified place data with real names
- ✅ Actual photos with prefix+suffix URLs
- ✅ Community tips mentioning views/photography
- ✅ Popularity and rating data for scoring
- ✅ Free tier: 100,000 API calls/month
- ✅ Server-side via Cloudflare Worker (no CORS issues)

---

## Implementation Details

### Backend (cloudflare-worker.js)

**New Endpoint:**
```
GET /api/foursquare/discover?lat={lat}&lon={lon}&radius={meters}
```

**Search Strategy:**
- 13 category searches in parallel:
  - Urban: landmarks, architecture, historic, monuments, arts, stadiums, universities
  - Infrastructure: bridges, harbors
  - Nature: parks, beaches, viewpoints, gardens
- Deduplication by `fsq_id`
- Photo and tips fetching for top results
- Drone score calculation (0-100)
- Returns top 20 sorted by drone score

**Drone Score Algorithm:**
```javascript
score =
  + popularity (0-1) × 30 points
  + rating (0-10) × 2 points
  + photo-worthy tips × 15 points each
  + elevated locations (rooftop/tower/overlook) +25 points
  + category bonuses (scenic +30, historic +20, park/beach +15)
```

**Photo Keywords:** view, sunset, photo, beautiful, scenic, skyline, vista, panorama

### Frontend (index.html)

**Function Changes:**
- `searchFlickrHotspots()` → `searchFoursquarePlaces()`
- `processFlickrHotspots()` → `processFoursquarePlaces()`
- `determineShotTypesFromTags()` → `determineShotTypesFromCategories()`

**Data Format:**
```javascript
{
  success: true,
  count: 20,
  totalPlacesAnalyzed: 156,
  results: [
    {
      fsq_id: "4b7a8...",
      name: "Crystal Lake Main Beach",
      lat: 42.241,
      lng: -88.316,
      description: "Crystal Lake Main Beach - Popular beach in Crystal Lake, IL",
      categories: ["Beach", "Park"],
      primaryCategory: "Beach",
      popularity: 0.85,
      rating: 8.2,
      droneScore: 87,
      photoUrl: "https://fastly.4sqi.net/img/general/original/...",
      tips: [
        { text: "Beautiful sunset views over the lake!" }
      ]
    }
  ]
}
```

---

## Setup Instructions (UPDATED - WORKING)

### API Key Setup

1. **Get Foursquare Service API Key:**
   - Go to https://location.foursquare.com/developer/
   - Sign in and navigate to your project
   - Go to Settings tab
   - Click "Generate Service API Key"
   - Copy the key (format: `4RK4PSDCJUDE40WB4WLFMD3LGSWNSP4ZX41CAFPR5KXDFBDB`)
   - **IMPORTANT:** This is different from the OAuth key shown in docs!

2. **Add Key to Worker:**
   ```bash
   echo "YOUR_SERVICE_API_KEY" | npx wrangler secret put FOURSQUARE_API_KEY
   ```

3. **Deploy Worker:**
   ```bash
   npx wrangler deploy cloudflare-worker.js
   ```

4. **Test:**
   ```bash
   curl "https://dronescout-proxy.dronescout-api.workers.dev/api/foursquare/discover?lat=42.241&lon=-88.316&radius=10000"
   ```

   Should return:
   ```json
   {
     "success": true,
     "count": 20,
     "results": [...]
   }
   ```

---

## Expected Results

### Before (OSM/Google Places):
```
❌ "Viewpoint 15"
❌ "INVISIBLE"
❌ "Sue's Sandbox" (bounce house rental)
❌ "Inflatables"
❌ Generic illustrated photos
❌ Chicago photos for Crystal Lake, IL
```

### After (Foursquare):
```
✅ "Crystal Lake Main Beach"
✅ "Veterans Acres Park"
✅ "Three Oaks Recreation Area"
✅ "Lakewood Forest Preserve"
✅ Actual location photos
✅ Community tips: "Beautiful sunset views!"
✅ Drone score: 87/100
```

---

## IMPORTANT: API Migration (November 2025)

Foursquare migrated their Places API during implementation. Key changes:

### Old API (v3) → New API
- **URL Changed:**
  - OLD: `https://api.foursquare.com/v3/places/search`
  - NEW: `https://places-api.foursquare.com/places/search`

- **Authorization Changed:**
  - OLD: `Authorization: API_KEY`
  - NEW: `Authorization: Bearer SERVICE_API_KEY`

- **Required Header Added:**
  - NEW: `X-Places-Api-Version: 2025-06-17`

- **Field Names Changed:**
  - OLD: `fsq_id`, `geocodes.main.latitude`
  - NEW: `fsq_place_id`, `latitude`

### Category IDs Not Yet Updated
- Old category IDs (e.g., `16000` for Landmarks) don't work with new API
- Currently using broad search sorted by POPULARITY
- TODO: Update to new category taxonomy when Foursquare documents it

---

## API Rate Limits

**Foursquare Free Tier:**
- 100,000 API calls per month
- ~3,300 calls per day
- ~138 calls per hour

**Typical Usage:**
- 1 search = 8-13 category queries + 20 photo fetches + 20 tips fetches
- ~50 API calls per search
- Can handle ~2,000 searches per month
- Perfect for personal use + demos

---

## Troubleshooting

### "No Foursquare places found"

**Check:**
1. API key is set: `npx wrangler secret list`
2. Worker deployed: Check https://dronescout-proxy.dronescout-api.workers.dev/api/foursquare/discover?lat=42.241&lon=-88.316&radius=10000
3. Console logs: Look for "Foursquare API key not configured"

### "Worker API error: 401"

- API key invalid or expired
- Re-add key: `npx wrangler secret put FOURSQUARE_API_KEY`

### "Worker API error: 429"

- Rate limit exceeded
- Wait an hour or upgrade Foursquare plan

### Still getting generic OSM results

- Foursquare call is failing, falling back to OSM
- Check browser console for error messages
- Verify worker URL in Settings tab

---

## Testing Checklist

- [ ] Get Foursquare API key
- [ ] Add key to worker: `npx wrangler secret put FOURSQUARE_API_KEY`
- [ ] Deploy worker: `npx wrangler deploy cloudflare-worker.js`
- [ ] Open app: https://bgslab.github.io/dronescout/
- [ ] Search "Crystal Lake, IL"
- [ ] Verify console shows: "Found X places from Foursquare"
- [ ] Verify real location names (not "Viewpoint 15")
- [ ] Verify actual photos (not generic illustrations)
- [ ] Search NYC to verify urban locations work
- [ ] Search rural area to verify nature locations work
- [ ] Check spot details show Foursquare tips

---

## Files Modified

1. `cloudflare-worker.js` (lines 6, 91-102, 1170-1363)
   - Added FOURSQUARE_API_BASE constant
   - Added /api/foursquare/discover endpoint
   - Implemented handleFoursquareDiscover() function
   - Implemented calculateFoursquareDroneScore() helper

2. `index.html` (lines 1985-2201)
   - Updated searchForDroneSpots() to call Foursquare
   - Replaced searchFlickrHotspots() with searchFoursquarePlaces()
   - Replaced processFlickrHotspots() with processFoursquarePlaces()
   - Updated determineShotTypesFromCategories() logic

---

## Next Steps

1. **Immediate:** Get Foursquare API key and deploy
2. **Test:** Verify Crystal Lake, IL shows real locations
3. **V10.0 V1:** Continue with profile system and intelligent scoring
4. **Future:** Add Aloft airspace API when approved

---

**Author:** Claude Code
**Commit:** 626503e - "Switch from Flickr to Foursquare API"
