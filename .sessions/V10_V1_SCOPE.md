# DroneScout V10.0 V1 - Implementation Scope
**Build Date:** 2025-11-02

## ✅ In Scope (V10.0 V1)

### 1. User Profile System
- Part 107 certification + expiry
- Active waivers (over-people Cat 1-4, night ops, BVLOS)
- Drone specifications (weight, parachute, Remote ID)
- Preferences (max drive time → radius, experience level)
- Storage: localStorage + cloud sync to Cloudflare

### 2. Search Controls
- Radius control slider: 5/10/15/25 mi
- Replace fixed 25mi radius
- Calculate drive time estimate

### 3. Accessibility Intelligence
- OSM access/ownership tags (public/private land)
- Land access scoring (15 pts)
- Filter out known restricted areas

### 4. Population Density Intelligence
- Census API integration
- Population per square mile by location
- Waiver-aware scoring (Cat 1 unlocks urban flights)

### 5. Obstacle Detection
- OSM power lines, towers, barriers
- 500ft radius analysis around spots
- Obstacle risk scoring (10 pts)

### 6. Intelligent Scoring Algorithm
- Legal: Local regulations + population density (25 pts) *
- Accessibility: Land access + proximity (25 pts)
- Safety: Obstacles + emergency landing + cell coverage (20 pts)
- Photo Quality: Preference match + weather (30 pts)
- Total: 100 points

*Note: Airspace compliance (15 pts) will be placeholder 15/15 until Aloft API

### 7. Aloft Test API Integration (Placeholder)
- Add test API key to Cloudflare Worker
- Create airspace query functions
- Display placeholder "Checking airspace..." until API ready
- Architecture for V10.1 full integration

### 8. UI/UX Enhancements
- Profile tab in settings
- Viability badges on spot cards (✅⚠️🚫)
- Detailed viability breakdown in spot detail
- Color-coded status indicators
- Actionable recommendations

---

## 🔄 Deferred to V10.1 (After Aloft API Approval)

### FAA/Aloft Full Integration
- Live airspace classification (Class B/C/D/E/G)
- LAANC grid data and approval likelihood
- TFR checking (Temporary Flight Restrictions)
- Controlled airspace ceiling altitudes
- Full 15-point airspace compliance scoring

---

## 📋 Implementation Order

1. **Profile System** (foundation for everything)
2. **Radius Control** (quick user win)
3. **Census API** (population density)
4. **OSM Enhancement** (access tags + obstacles)
5. **Scoring Algorithm** (intelligence engine)
6. **Aloft Placeholder** (architecture for V10.1)
7. **UI Enhancements** (display the intelligence)
8. **Testing** (NYC, rural, with/without waivers)

---

## 🎯 Success Criteria

- User can set up profile with waivers/drones
- User can control search radius (5-25 mi)
- Spots show land access status (public/private/permit)
- Spots filtered by population density + user waivers
- Obstacle warnings displayed
- Scoring reflects realistic flyability (not just aesthetics)
- UI clearly shows why spots are recommended

---

**Estimated Time:** 2-3 sessions
**Target:** Functional V10.0 V1 ready for Aloft API when approved
