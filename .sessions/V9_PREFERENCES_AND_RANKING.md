# V9.0 Addendum: Preference Sliders & Spot Ranking System
**Date:** November 2, 2025
**Supplement to:** V9_TECHNICAL_STRATEGY.md

---

## 🎯 CURRENT STATE (V8.0)

### Preference Sliders ✅ ALREADY IMPLEMENTED

**Location:** `index.html:2643-2673`

The Trip Planner tab currently has **three preference sliders**:

1. **Landscape ↔ Cityscape** (0-100 scale)
   - 0 = Pure landscape
   - 50 = Balanced
   - 100 = Pure cityscape

2. **Architecture ↔ Nature** (0-100 scale)
   - 0 = Pure architecture
   - 50 = Balanced
   - 100 = Pure nature

3. **Serene ↔ Dynamic** (0-100 scale)
   - 0 = Calm, peaceful shots
   - 50 = Balanced
   - 100 = Action, movement, energy

**Storage:**
```javascript
state.preferences = {
  cityscape: 50,
  nature: 50,
  architecture: 50
}
```

Stored in localStorage under key `preferences`.

---

## 📊 CURRENT SPOT RANKING SYSTEM

### How It Works (Learning Algorithm)

**Current Implementation:** `getAdjustedRiskScore()` at line 1340

The app uses **adaptive learning based on flight ratings**:

1. **User rates completed flights** (5-star system):
   - Description Accuracy
   - Shot Type Match
   - Accessibility
   - Would Fly Again (yes/no)

2. **System tracks dominant shot type** for each rated flight:
   ```javascript
   shotTypes: {
     landscape: 80,  // This flight was 80% landscape
     nature: 20,     // 20% nature
     cityscape: 0,
     architecture: 0
   }
   ```

3. **System calculates average rating per shot type:**
   - All "landscape" spots: Avg 4.5 stars
   - All "cityscape" spots: Avg 3.2 stars
   - All "nature" spots: Avg 4.8 stars

4. **System re-ranks spots based on your history:**
   - If you consistently rate "nature" spots highly → nature spots appear higher
   - If you rate "cityscape" spots low → cityscape spots drop in ranking

**Formula:**
```javascript
adjustedScore = baseScore * (avgRatingForThisType / 3)
```

Where:
- `baseScore` = Original risk score (1-100)
- `avgRatingForThisType` = Average of all your ratings for this shot type
- Result capped between 1-100

---

## ❌ WHAT'S MISSING FOR V9.0

### Problem 1: Preferences Don't Affect Initial Ranking

**Current Behavior:**
- User sets sliders: Cityscape=80, Nature=20
- System IGNORES these sliders when finding spots
- Spots are ranked **only by distance** (line 1209-1213)
- Learning algorithm only kicks in **after you've rated flights**

**Expected V9.0 Behavior:**
- User sets sliders: Cityscape=80, Nature=20
- System finds spots and **immediately prioritizes cityscape spots**
- User sees cityscape-heavy results right away (no ratings needed)
- Over time, ratings refine the preferences further

---

### Problem 2: Shot Type Weights Not Used

**Current shotTypes Data:**
```javascript
{
  name: "Golden Gate Bridge Viewpoint",
  shotTypes: {
    cityscape: 80,    // This spot is 80% cityscape
    architecture: 20,
    landscape: 0,
    nature: 0
  }
}
```

**This data exists but isn't used for ranking!**

Should calculate preference match score like:
```javascript
// User preferences
preferences = { cityscape: 80, nature: 20, architecture: 50 }

// Spot shot types
shotTypes = { cityscape: 80, nature: 0, architecture: 20, landscape: 0 }

// Calculate match score
matchScore =
  (shotTypes.cityscape * preferences.cityscape / 100) +
  (shotTypes.nature * preferences.nature / 100) +
  (shotTypes.architecture * preferences.architecture / 100) +
  (shotTypes.landscape * (100 - preferences.cityscape) / 100)

// Normalize to 0-100
preferenceScore = matchScore / (sum of all shotType values) * 100
```

---

## 🚀 V9.0 ENHANCEMENT PLAN

### Phase 1: Use Preferences for Initial Ranking

**Goal:** Spots ranked by preference match + distance (before any ratings)

**Algorithm:**
```javascript
function calculateSpotScore(spot, userLocation, preferences) {
  // 1. Distance component (0-100, closer = higher)
  const distance = calculateDistance(userLocation, spot.coordinates);
  const maxDistance = 25; // miles
  const distanceScore = Math.max(0, 100 - (distance / maxDistance * 100));

  // 2. Preference match component (0-100)
  const shotTypes = spot.shotTypes;

  // Calculate how well spot matches user preferences
  const cityscapeMatch = shotTypes.cityscape * (preferences.cityscape / 100);
  const natureMatch = shotTypes.nature * (preferences.nature / 100);
  const architectureMatch = shotTypes.architecture * (preferences.architecture / 100);
  const landscapeMatch = shotTypes.landscape * ((100 - preferences.cityscape) / 100);

  const totalMatch = cityscapeMatch + natureMatch + architectureMatch + landscapeMatch;
  const maxPossible = Math.max(...Object.values(shotTypes));
  const preferenceScore = (totalMatch / maxPossible) * 100;

  // 3. Combine scores (weighted)
  const finalScore = (distanceScore * 0.4) + (preferenceScore * 0.6);

  return finalScore;
}
```

**Weights:**
- Distance: 40% (still important - closer is better)
- Preference match: 60% (primary factor)

**Result:** User with Cityscape=80 sees urban viewpoints first, even if rural park is closer.

---

### Phase 2: Add Rating-Based Learning (Already Implemented)

**Keep existing `getAdjustedRiskScore()` function**, but enhance it:

```javascript
function calculateFinalSpotScore(spot, userLocation, preferences, ratings) {
  // Start with preference-based score
  let score = calculateSpotScore(spot, userLocation, preferences);

  // If user has rated flights, apply learning adjustment
  if (ratings.length > 0) {
    const dominantType = getDominantShotType(spot.shotTypes);
    const avgRatingForType = getAverageRatingForShotType(dominantType, ratings);

    if (avgRatingForType > 0) {
      // Boost/penalize based on past ratings
      // High ratings (4-5 stars) = boost up to +20%
      // Low ratings (1-2 stars) = penalize down to -20%
      const ratingBonus = ((avgRatingForType - 3) / 2) * 20;
      score += ratingBonus;
    }
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}
```

**User Journey:**
1. **Day 1:** User sets preferences, sees spots ranked by preference match
2. **Day 5:** User rates first 5 flights, system learns their actual preferences
3. **Day 30:** System knows user rates "nature with water" 5-stars, "urban parks" 3-stars
4. **Result:** Even if sliders say Cityscape=50, Nature=50, system shows more "nature with water" spots

---

### Phase 3: Auto-Adjust Preferences Based on Ratings

**Advanced Feature for V10.0+:**

After 10+ rated flights, offer to auto-update preference sliders:

```javascript
function suggestPreferenceUpdates(ratings, flights) {
  const shotTypeRatings = {};

  // Calculate average rating per shot type
  ratings.forEach(rating => {
    const flight = flights.find(f => f.id === rating.flightId);
    const dominantType = getDominantShotType(flight.spotData.shotTypes);

    if (!shotTypeRatings[dominantType]) {
      shotTypeRatings[dominantType] = [];
    }

    const avgRating = (rating.descAccuracy + rating.shotTypeMatch + rating.accessibility) / 3;
    shotTypeRatings[dominantType].push(avgRating);
  });

  // Calculate averages
  const avgByType = {};
  Object.keys(shotTypeRatings).forEach(type => {
    const ratings = shotTypeRatings[type];
    avgByType[type] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  });

  // Suggest new slider positions
  const suggested = {
    cityscape: (avgByType.cityscape || 3) / 5 * 100,
    nature: (avgByType.nature || 3) / 5 * 100,
    architecture: (avgByType.architecture || 3) / 5 * 100
  };

  return suggested;
}
```

**UI:**
```
┌─────────────────────────────────────────┐
│  💡 Update Preferences?                 │
├─────────────────────────────────────────┤
│  Based on your 15 flight ratings, we    │
│  noticed you love nature spots (4.8⭐)   │
│  but rate cityscapes lower (3.2⭐)       │
│                                         │
│  Suggested settings:                    │
│  Nature: 50 → 96 (you love nature!)    │
│  Cityscape: 50 → 32 (less interest)    │
│                                         │
│  [Apply Suggestions] [Keep Manual]     │
└─────────────────────────────────────────┘
```

---

## 🎨 V9.0 UI ENHANCEMENTS

### Enhanced Preference Sliders

**Current:** Just three sliders, no visual feedback

**V9.0 Improvement:** Show real-time spot type distribution

```
┌─────────────────────────────────────────┐
│  🎯 Shot Preferences                    │
├─────────────────────────────────────────┤
│                                         │
│  Landscape ━━━━●━━━━ Cityscape         │
│            50/100                       │
│  📊 12 landscape · 8 cityscape spots    │
│                                         │
│  Architecture ━━━●━━━━━ Nature         │
│            35/100                       │
│  📊 5 architecture · 15 nature spots    │
│                                         │
│  Serene ━━━━━━●━━━ Dynamic             │
│            70/100                       │
│                                         │
│  🧠 Based on 12 rated flights:          │
│  You prefer: Nature (4.8⭐) > Parks     │
│  (4.2⭐) > Cityscape (3.1⭐)             │
│                                         │
│  [Reset to Defaults]                   │
└─────────────────────────────────────────┘
```

---

### Spot Card Enhancements

**Current:** Spots show risk score only

**V9.0:** Show preference match badge

```
┌─────────────────────────────────────────┐
│  [Photo: Golden Gate Bridge]           │
│                                         │
│  📍 Golden Gate Vista Point             │
│  2.3 mi away · ⭐ 95% match             │
│                                         │
│  🎬 Shot Type: 80% Cityscape            │
│  🟢 Matches your preferences            │
│                                         │
│  🌤️ 65°F, Clear, Wind 5mph             │
│  ✈️ Class B Airspace (LAANC)           │
│  🔴 Challenging                         │
│                                         │
│  [View Details] [Plan Flight]          │
└─────────────────────────────────────────┘
```

**Match Badge Colors:**
- 🟢 90-100%: "Perfect Match"
- 🟡 70-89%: "Good Match"
- 🟠 50-69%: "Moderate Match"
- ⚪ <50%: "Low Match"

---

## 📊 SPOT RANKING EXAMPLES

### Example 1: Nature Lover

**User Preferences:**
- Cityscape: 20
- Nature: 95
- Architecture: 30

**Search:** "San Francisco"

**Spot Results (ranked):**

1. **Muir Woods (95% match)** - 12 mi away
   - Shot Types: Nature 80%, Landscape 20%
   - Preference Score: (80 × 0.95) + (20 × 0.80) = 92
   - Distance Penalty: -5 (far)
   - **Final: 95**

2. **Golden Gate Park (78% match)** - 3 mi away
   - Shot Types: Nature 60%, Landscape 30%, Cityscape 10%
   - Preference Score: (60 × 0.95) + (30 × 0.80) + (10 × 0.20) = 83
   - Distance Bonus: +10 (close)
   - **Final: 78**

3. **Coit Tower (32% match)** - 1 mi away
   - Shot Types: Cityscape 70%, Architecture 30%
   - Preference Score: (70 × 0.20) + (30 × 0.30) = 23
   - Distance Bonus: +15 (very close)
   - **Final: 32**

**User sees:** Muir Woods first, even though it's 12 miles away (nature preference strong)

---

### Example 2: Urban Explorer

**User Preferences:**
- Cityscape: 90
- Nature: 15
- Architecture: 75

**Search:** "San Francisco"

**Spot Results (ranked):**

1. **Coit Tower (95% match)** - 1 mi away
   - Shot Types: Cityscape 70%, Architecture 30%
   - Preference Score: (70 × 0.90) + (30 × 0.75) = 85.5
   - Distance Bonus: +15
   - **Final: 95**

2. **Golden Gate Bridge (88% match)** - 4 mi away
   - Shot Types: Cityscape 60%, Architecture 40%
   - Preference Score: (60 × 0.90) + (40 × 0.75) = 84
   - Distance Penalty: -2
   - **Final: 88**

3. **Golden Gate Park (25% match)** - 3 mi away
   - Shot Types: Nature 60%, Landscape 30%
   - Preference Score: (60 × 0.15) + (30 × 0.10) = 12
   - Distance Bonus: +10
   - **Final: 25**

**User sees:** Urban spots first, parks pushed to bottom

---

## 🔧 IMPLEMENTATION TASKS FOR V9.0

### Task 1: Create Spot Scoring Function
**File:** `index.html`
**Where:** After `getAdjustedRiskScore()` (line ~1381)

```javascript
function calculateSpotScore(spot, userLocation, preferences) {
  // Distance component (0-100)
  const distance = calculateDistance(
    userLocation.lat,
    userLocation.lon,
    spot.coordinates.lat,
    spot.coordinates.lon
  );
  const maxDistance = 25; // miles
  const distanceScore = Math.max(0, 100 - (distance / maxDistance * 100));

  // Preference match component (0-100)
  const shotTypes = spot.shotTypes;

  // Map slider values to shot type weights
  // Cityscape slider: 0=landscape, 100=cityscape
  const cityscapeWeight = preferences.cityscape / 100;
  const landscapeWeight = (100 - preferences.cityscape) / 100;

  // Nature slider: 0=architecture, 100=nature
  const natureWeight = preferences.nature / 100;
  const architectureWeight = (100 - preferences.nature) / 100;

  // Calculate weighted match
  const match =
    (shotTypes.cityscape || 0) * cityscapeWeight +
    (shotTypes.landscape || 0) * landscapeWeight +
    (shotTypes.nature || 0) * natureWeight +
    (shotTypes.architecture || 0) * architectureWeight;

  // Normalize (shotTypes sum to ~100)
  const totalShotTypeValue = Object.values(shotTypes).reduce((a, b) => a + b, 0);
  const preferenceScore = totalShotTypeValue > 0 ? (match / totalShotTypeValue) * 100 : 50;

  // Combine: 40% distance + 60% preference
  const finalScore = (distanceScore * 0.4) + (preferenceScore * 0.6);

  return Math.round(finalScore);
}
```

---

### Task 2: Update Spot Sorting in renderTripPlanner
**File:** `index.html`
**Line:** 2588-2591 (replace current sorting)

**Before (V8.0):**
```javascript
const spotsWithAdjustedScores = state.spots.map(spot => ({
  ...spot,
  adjustedScore: getAdjustedRiskScore(spot)
})).sort((a, b) => b.adjustedScore - a.adjustedScore);
```

**After (V9.0):**
```javascript
const spotsWithScores = state.spots.map(spot => {
  // Calculate preference-based score
  const preferenceScore = calculateSpotScore(
    spot,
    state.searchCenter,
    state.preferences
  );

  // Apply learning adjustment if user has ratings
  const learningAdjustment = getLearningAdjustment(spot);

  // Calculate preference match percentage for display
  const matchPercentage = calculatePreferenceMatch(spot.shotTypes, state.preferences);

  return {
    ...spot,
    score: preferenceScore + learningAdjustment,
    matchPercentage: matchPercentage,
    learningActive: state.ratings.length > 0
  };
}).sort((a, b) => b.score - a.score);
```

---

### Task 3: Add Match Percentage to Spot Cards
**File:** `index.html`
**Line:** ~2716 (spot card rendering)

Add after distance display:
```javascript
<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
  <span style="font-size: 13px; color: #666;">${spot.distance} mi away</span>
  <span style="color: #ddd;">·</span>
  <span style="background: ${getMatchColor(spot.matchPercentage)};
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;">
    ${spot.matchPercentage}% match
  </span>
</div>
```

Helper function:
```javascript
function getMatchColor(percentage) {
  if (percentage >= 90) return '#22c55e'; // Green
  if (percentage >= 70) return '#eab308'; // Yellow
  if (percentage >= 50) return '#f97316'; // Orange
  return '#94a3b8'; // Gray
}
```

---

### Task 4: Add Real-Time Spot Count to Sliders
**File:** `index.html`
**Line:** ~2656 (slider rendering)

Add below each slider:
```javascript
<div style="font-size: 11px; color: #666; margin-top: 4px; text-align: center;">
  📊 ${countSpotsByType('cityscape')} cityscape ·
  ${countSpotsByType('landscape')} landscape
</div>
```

Helper function:
```javascript
function countSpotsByType(type) {
  return state.spots.filter(spot => {
    const dominant = Object.keys(spot.shotTypes).reduce((a, b) =>
      spot.shotTypes[a] > spot.shotTypes[b] ? a : b
    );
    return dominant === type;
  }).length;
}
```

---

### Task 5: Update Preference Slider Event Listeners
**File:** `index.html`
**Line:** ~3480 (event listeners)

**Before:**
```javascript
slider.addEventListener('input', (e) => {
  state.preferences[pref] = parseInt(e.target.value);
  saveToStorage('preferences', state.preferences);
});
```

**After:**
```javascript
slider.addEventListener('input', (e) => {
  state.preferences[pref] = parseInt(e.target.value);
  saveToStorage('preferences', state.preferences);

  // Re-rank spots with new preferences
  if (state.spots.length > 0) {
    render(); // This will re-sort spots
  }
});
```

---

## 🎯 SUCCESS METRICS

### V9.0 Preference System Success Criteria

- ✅ Spot ranking changes immediately when user adjusts sliders
- ✅ User with Nature=95 sees nature spots first (even if farther)
- ✅ Match percentage displayed on each spot card
- ✅ Slider labels show real-time spot counts
- ✅ Learning algorithm refines ranking after 5+ rated flights
- ✅ User can reset preferences to defaults
- ✅ Preference data persists in localStorage

---

## 📝 SUMMARY

### What Already Exists ✅
- Preference sliders UI
- Shot type data on all spots
- Learning algorithm based on ratings
- localStorage persistence

### What Needs to Be Added for V9.0 🔨
1. **Preference-based spot scoring** (before ratings kick in)
2. **Match percentage calculation and display**
3. **Real-time re-ranking when sliders change**
4. **Spot type counts on slider labels**
5. **Match badge on spot cards** (green/yellow/orange/gray)
6. **Better visual feedback on preference impact**

### Estimated Implementation Time
- **2-3 hours** for core scoring algorithm
- **1-2 hours** for UI enhancements
- **1 hour** for testing and refinement

**Total: 4-6 hours or one focused session**

---

## 🚀 NEXT STEPS

1. **Review this addendum** with user
2. **Decide if preferences should be in V9.0 Phase 1** or separate phase
3. **Implement scoring algorithm** using provided code
4. **Test with real searches** (NYC, SF, Chicago with different preferences)
5. **Iterate on weights** (40% distance + 60% preference vs other ratios)

---

**Ready to implement when you are!** This can be done as:
- **Option A:** Part of V9.0 Phase 1 (spot discovery + preferences)
- **Option B:** Separate "V9.5" mini-release (add to existing spots)
- **Option C:** V10.0 enhancement (after real photos/weather/airspace)

Let me know which approach you prefer! 🎯
