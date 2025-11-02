/**
 * DroneScout - Cloudflare Worker Proxy for Skydio Cloud API + External APIs
 * Handles authentication and CORS for browser-based app
 */

const SKYDIO_API_BASE = 'https://api.skydio.com';
const GOOGLE_STREETVIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview';
const GOOGLE_PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const OPENWEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';
const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Debug endpoint to check token status
      if (path === '/debug' && request.method === 'GET') {
        return jsonResponse({
          tokenExists: !!env.SKYDIO_API_TOKEN,
          tokenLength: env.SKYDIO_API_TOKEN ? env.SKYDIO_API_TOKEN.length : 0,
          tokenPrefix: env.SKYDIO_API_TOKEN ? env.SKYDIO_API_TOKEN.substring(0, 8) + '...' : 'N/A',
          apiBase: SKYDIO_API_BASE,
          googleApiExists: !!env.GOOGLE_MAPS_API_KEY,
          openweatherApiExists: !!env.OPENWEATHER_API_KEY
        });
      }

      // Route requests - Skydio API
      if (path === '/sync-flights' && request.method === 'POST') {
        return await handleSyncFlights(env.SKYDIO_API_TOKEN);
      }

      const flightDetailMatch = path.match(/^\/flight\/([^\/]+)\/details$/);
      if (flightDetailMatch && request.method === 'GET') {
        return await handleFlightDetails(flightDetailMatch[1], env.SKYDIO_API_TOKEN);
      }

      const flightMediaMatch = path.match(/^\/flight\/([^\/]+)\/media$/);
      if (flightMediaMatch && request.method === 'GET') {
        return await handleFlightMedia(flightMediaMatch[1], env.SKYDIO_API_TOKEN);
      }

      // Route requests - Google Street View API
      if (path === '/api/streetview/metadata' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handleStreetViewMetadata(lat, lon, env.GOOGLE_MAPS_API_KEY);
      }

      if (path === '/api/streetview/image' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        const size = url.searchParams.get('size') || '600x400';
        const heading = url.searchParams.get('heading') || '';
        const fov = url.searchParams.get('fov') || '90';
        const pitch = url.searchParams.get('pitch') || '0';

        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handleStreetViewImage(lat, lon, size, heading, fov, pitch, env.GOOGLE_MAPS_API_KEY);
      }

      // Route requests - OpenWeather API
      if (path === '/api/weather/current' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        const units = url.searchParams.get('units') || 'imperial'; // imperial or metric

        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handleCurrentWeather(lat, lon, units, env.OPENWEATHER_API_KEY);
      }

      // V10.1: Foursquare Places Discovery (PRIMARY METHOD - Per Claude Chat Recommendation)
      // Comprehensive location discovery across ALL types: urban, suburban, rural, nature
      if (path === '/api/foursquare/discover' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        const radius = url.searchParams.get('radius') || '10000'; // meters

        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handleFoursquareDiscover(lat, lon, radius, env.FOURSQUARE_API_KEY);
      }

      // Route requests - Google Places API (FALLBACK ONLY)
      // V10.0: Comprehensive POI search for drone spots
      if (path === '/api/places/nearbysearch' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        const radius = url.searchParams.get('radius') || '15000'; // Default 15km (9.3 miles)

        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handleComprehensivePlacesSearch(lat, lon, radius, env.GOOGLE_MAPS_API_KEY);
      }

      // Legacy single place lookup (kept for backward compatibility)
      if (path === '/api/places/lookup' && request.method === 'GET') {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        const name = url.searchParams.get('name');
        const radius = url.searchParams.get('radius') || '100'; // meters

        if (!lat || !lon) {
          return jsonResponse({ error: 'Missing lat or lon parameter' }, 400);
        }
        return await handlePlacesNearbySearch(lat, lon, name, radius, env.GOOGLE_MAPS_API_KEY);
      }

      if (path === '/api/places/details' && request.method === 'GET') {
        const placeId = url.searchParams.get('place_id');

        if (!placeId) {
          return jsonResponse({ error: 'Missing place_id parameter' }, 400);
        }
        return await handlePlaceDetails(placeId, env.GOOGLE_MAPS_API_KEY);
      }

      // V10.0: Google Places Photo proxy (returns direct image URL)
      if (path === '/api/places/photo' && request.method === 'GET') {
        const photoReference = url.searchParams.get('photo_reference');
        const maxWidth = url.searchParams.get('maxwidth') || '800';

        if (!photoReference) {
          return jsonResponse({ error: 'Missing photo_reference parameter' }, 400);
        }

        // Return the Google Places photo URL
        const photoUrl = `${GOOGLE_PLACES_BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${env.GOOGLE_MAPS_API_KEY}`;

        return jsonResponse({
          success: true,
          photoUrl: photoUrl
        });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', {
        message: error.message,
        stack: error.stack,
        path: path,
        method: request.method
      });
      return jsonResponse({
        error: error.message,
        details: 'Check worker logs for more information',
        timestamp: new Date().toISOString()
      }, 500);
    }
  },
};

/**
 * POST /sync-flights
 * Fetches all completed flights (handles pagination automatically)
 * Returns: Array of flights with basic details for History list
 * Uses Skydio Cloud API v1 (External API)
 */
async function handleSyncFlights(apiToken) {
  const allFlights = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    // Organization API tokens use v0 endpoint with direct token auth (no Bearer prefix)
    const apiUrl = `${SKYDIO_API_BASE}/api/v0/flights?status=completed&page=${page}&page_size=50`;
    console.log('Fetching flights (v0):', {
      url: apiUrl,
      page: page,
      tokenLength: apiToken ? apiToken.length : 0,
      tokenPrefix: apiToken ? apiToken.substring(0, 8) + '...' : 'N/A'
    });

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': apiToken, // Organization API tokens: no "Bearer" prefix
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Skydio API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        page: page
      });
      throw new Error(`Skydio API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();

    // v0 API response structure: { data: { flights: [...] }, meta: {...}, status_code: 200 }
    if (!data.data || !data.data.flights) {
      console.error('Unexpected API response structure:', { dataKeys: Object.keys(data) });
      throw new Error('Invalid API response: missing data.flights');
    }

    const flightsArray = data.data.flights;

    // Transform to simplified format for History tab
    // Match frontend schema: created_at, duration_seconds, name
    const flights = flightsArray.map(flight => ({
      id: flight.flight_id,
      name: `${flight.vehicle_serial || 'Drone'} Flight`, // Use vehicle serial as name
      created_at: flight.takeoff,
      duration_seconds: flight.landing && flight.takeoff
        ? Math.floor((new Date(flight.landing) - new Date(flight.takeoff)) / 1000)
        : 0,
      location: {
        lat: flight.takeoff_latitude,
        lon: flight.takeoff_longitude,
      },
      media_urls: [], // Will be populated by separate media fetch
      // Additional metadata for future use
      metadata: {
        vehicle_serial: flight.vehicle_serial,
        battery_serial: flight.battery_serial,
        user_email: flight.user_email,
        landing: flight.landing,
        has_telemetry: flight.has_telemetry,
        attachments: flight.attachments,
        sensor_package: flight.sensor_package,
      },
      synced: true, // Flag to distinguish from manual entries
    }));

    allFlights.push(...flights);

    // v0 API doesn't return has_more; stop after getting results or if empty
    // For now, fetch just the first page (50 flights)
    // TODO: Implement proper pagination when we understand v0 pagination structure
    hasMore = false;

    console.log(`Fetched ${flights.length} flights from page ${page}`);
  }

  return jsonResponse({
    success: true,
    count: allFlights.length,
    flights: allFlights,
    syncedAt: new Date().toISOString(),
  });
}

/**
 * GET /flight/:id/details
 * Fetches full flight details + telemetry track
 * Returns: Combined flight details and GPS track for map display
 * Uses Skydio Cloud API v0 (Organization API tokens)
 */
async function handleFlightDetails(flightId, apiToken) {
  // NOTE: ALL v0 endpoints use direct token (no Bearer prefix)
  const headers = {
    'Authorization': apiToken,
    'Accept': 'application/json',
  };

  // v0 API: /api/v0/flight/{id} (singular!) and /api/v0/flight/{id}/telemetry
  const [flightResponse, telemetryResponse] = await Promise.all([
    fetch(`${SKYDIO_API_BASE}/api/v0/flight/${flightId}`, { headers }),
    fetch(`${SKYDIO_API_BASE}/api/v0/flight/${flightId}/telemetry`, { headers }),
  ]);

  if (!flightResponse.ok) {
    const errorBody = await flightResponse.text();
    console.error('Flight details error:', {
      flightId,
      status: flightResponse.status,
      body: errorBody
    });
    throw new Error(`Failed to fetch flight: ${flightResponse.status} - ${errorBody}`);
  }
  // Telemetry might 404 if never uploaded or deleted (KNOWN-676)
  let telemetryData = null;
  if (!telemetryResponse.ok) {
    if (telemetryResponse.status === 404) {
      console.warn('Telemetry not available for flight:', flightId);
      // Continue without telemetry
    } else {
      const errorBody = await telemetryResponse.text();
      console.error('Telemetry error:', {
        flightId,
        status: telemetryResponse.status,
        body: errorBody
      });
      throw new Error(`Failed to fetch telemetry: ${telemetryResponse.status} - ${errorBody}`);
    }
  } else {
    telemetryData = await telemetryResponse.json();
  }

  const flightData = await flightResponse.json();

  // v0 response: { data: { flight: {...}, flight_telemetry: {...} }, meta: {...}, status_code: 200 }
  const flight = flightData.data?.flight || flightData.data;

  // COMPREHENSIVE TELEMETRY FIELD INSPECTION
  let telemetryFieldReport = null;
  if (telemetryData?.data?.flight_telemetry) {
    const telem = telemetryData.data.flight_telemetry;
    const fields = Object.keys(telem);

    console.log('=== TELEMETRY FIELD INSPECTION ===');
    console.log('Available fields:', fields);

    // Analyze each field
    const fieldAnalysis = {};
    fields.forEach(fieldName => {
      const field = telem[fieldName];
      if (field && typeof field === 'object') {
        const dataArray = field.data || [];
        const timestamps = field.timestamps || [];

        // Filter out null/undefined values for stats
        const validValues = dataArray.filter(v => v != null && v !== undefined);
        const nonZeroValues = validValues.filter(v => v !== 0);

        fieldAnalysis[fieldName] = {
          hasData: dataArray.length > 0,
          totalPoints: dataArray.length,
          validPoints: validValues.length,
          nonZeroPoints: nonZeroValues.length,
          nullPoints: dataArray.length - validValues.length,
          zeroPoints: validValues.length - nonZeroValues.length,
          sampleValues: validValues.slice(0, 5), // First 5 valid values
          min: validValues.length > 0 ? Math.min(...validValues) : null,
          max: validValues.length > 0 ? Math.max(...validValues) : null,
          avg: validValues.length > 0 ? validValues.reduce((a, b) => a + b, 0) / validValues.length : null,
          hasTimestamps: timestamps.length > 0,
        };

        console.log(`${fieldName}:`, {
          points: dataArray.length,
          valid: validValues.length,
          nonZero: nonZeroValues.length,
          range: validValues.length > 0 ? `${Math.min(...validValues)} to ${Math.max(...validValues)}` : 'N/A',
          sample: validValues.slice(0, 3),
        });
      } else {
        fieldAnalysis[fieldName] = {
          hasData: false,
          type: typeof field,
          value: field,
        };
        console.log(`${fieldName}:`, typeof field, field);
      }
    });

    telemetryFieldReport = {
      fields: fields,
      fieldCount: fields.length,
      analysis: fieldAnalysis,
    };

    console.log('=== END TELEMETRY INSPECTION ===');
  }

  // Parse telemetry - structure is data.flight_telemetry with GPS/altitude/timestamps
  let telemetryTrack = null;
  let telemetryStats = null;
  if (telemetryData?.data?.flight_telemetry) {
    const telem = telemetryData.data.flight_telemetry;

    // GPS data is array of [lat, lon] pairs with corresponding timestamps
    if (telem.gps?.data && telem.gps?.timestamps) {
      // Build telemetry track with ALL available fields dynamically
      const allFields = Object.keys(telem).filter(key => key !== 'gps');

      telemetryTrack = telem.gps.timestamps.map((timestamp, idx) => {
        const point = {
          timestamp,
          lat: telem.gps.data[idx][0], // [lat, lon] array
          lon: telem.gps.data[idx][1],
        };

        // Add all other telemetry fields dynamically
        allFields.forEach(fieldName => {
          if (telem[fieldName]?.data) {
            // Skip index 0 for altitude field (as user noted it's missing/invalid)
            if (fieldName === 'altitude' && idx === 0) {
              point[fieldName] = null;
            } else {
              point[fieldName] = telem[fieldName].data[idx];
            }
          }
        });

        return point;
      });

      // Calculate stats for ALL numeric fields dynamically
      telemetryStats = {};

      allFields.forEach(fieldName => {
        if (telem[fieldName]?.data) {
          // Special handling for velocity - might be array [vx, vy] or [vx, vy, vz]
          if (fieldName === 'velocity' && Array.isArray(telem[fieldName].data[0])) {
            console.log('Velocity is array format, calculating magnitude');
            const velocityMagnitudes = telemetryTrack.map(p => {
              const vel = p[fieldName];
              if (Array.isArray(vel)) {
                // Calculate magnitude: sqrt(vx² + vy² + vz²)
                return Math.sqrt(vel.reduce((sum, v) => sum + v * v, 0));
              }
              return vel;
            }).filter(v => v != null && !isNaN(v));

            if (velocityMagnitudes.length > 0) {
              const nonZeroVels = velocityMagnitudes.filter(v => v !== 0);
              telemetryStats[fieldName] = {
                min: Math.min(...velocityMagnitudes),
                max: Math.max(...velocityMagnitudes),
                avg: velocityMagnitudes.reduce((a, b) => a + b, 0) / velocityMagnitudes.length,
                start: velocityMagnitudes[0],
                end: velocityMagnitudes[velocityMagnitudes.length - 1],
                change: velocityMagnitudes[0] - velocityMagnitudes[velocityMagnitudes.length - 1],
                count: velocityMagnitudes.length,
                hasNonZero: nonZeroVels.length > 0,
              };
            }
          } else {
            // Regular scalar field
            const values = telemetryTrack
              .map(p => p[fieldName])
              .filter(v => v != null && !isNaN(v));

            if (values.length > 0) {
              const nonZeroValues = values.filter(v => v !== 0);

              telemetryStats[fieldName] = {
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                start: values[0],
                end: values[values.length - 1],
                change: values[0] - values[values.length - 1],
                count: values.length,
                hasNonZero: nonZeroValues.length > 0,
              };
            }
          }
        }
      });

      // Calculate distance metrics from GPS track
      // Use Haversine formula to calculate distance between GPS points
      function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const toRad = (deg) => (deg * Math.PI) / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in meters
      }

      // Get launch point (first GPS coordinate)
      const launchPoint = telemetryTrack[0];

      let totalDistance = 0;
      let maxDistanceFromLaunch = 0;
      let longestSegment = 0;

      for (let i = 1; i < telemetryTrack.length; i++) {
        const prev = telemetryTrack[i - 1];
        const curr = telemetryTrack[i];

        if (prev.lat && prev.lon && curr.lat && curr.lon) {
          // Total distance traveled
          const segmentDist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
          totalDistance += segmentDist;

          // Longest single segment
          if (segmentDist > longestSegment) {
            longestSegment = segmentDist;
          }

          // Max distance from launch point
          if (launchPoint.lat && launchPoint.lon) {
            const distFromLaunch = haversineDistance(
              launchPoint.lat, launchPoint.lon,
              curr.lat, curr.lon
            );
            if (distFromLaunch > maxDistanceFromLaunch) {
              maxDistanceFromLaunch = distFromLaunch;
            }
          }
        }
      }

      // Add distance metrics as custom stats
      telemetryStats._distance_traveled = {
        total: totalDistance,
        miles: totalDistance * 0.000621371,
        kilometers: totalDistance / 1000,
      };

      telemetryStats._max_distance_from_launch = {
        total: maxDistanceFromLaunch,
        miles: maxDistanceFromLaunch * 0.000621371,
        kilometers: maxDistanceFromLaunch / 1000,
        feet: maxDistanceFromLaunch * 3.28084,
      };

      telemetryStats._longest_segment = {
        total: longestSegment,
        miles: longestSegment * 0.000621371,
        kilometers: longestSegment / 1000,
        feet: longestSegment * 3.28084,
      };
    }
  }

  return jsonResponse({
    success: true,
    flight: {
      flightId: flight.flight_id || flightId,
      vehicleSerial: flight.vehicle_serial,
      batterySerial: flight.battery_serial,
      userEmail: flight.user_email,
      takeoff: flight.takeoff,
      landing: flight.landing,
      hasTelemetry: flight.has_telemetry,
      takeoffLatitude: flight.takeoff_latitude,
      takeoffLongitude: flight.takeoff_longitude,
      attachments: flight.attachments,
      sensorPackage: flight.sensor_package,
    },
    telemetry: telemetryTrack ? {
      track: telemetryTrack,
      pointCount: telemetryTrack.length,
      stats: telemetryStats,
      fieldReport: telemetryFieldReport, // Include comprehensive field analysis
    } : null,
  });
}

/**
 * GET /flight/:id/media
 * Fetches all media (photos/videos/logs) for a flight
 * Returns: Array of flight data files with download URLs
 * Uses Skydio Cloud API v0 (Organization API tokens)
 */
async function handleFlightMedia(flightId, apiToken) {
  // v0 API: /api/v0/flight_data_files?flight_id={id}
  // NOTE: All v0 endpoints use direct token (no Bearer)
  const response = await fetch(
    `${SKYDIO_API_BASE}/api/v0/flight_data_files?flight_id=${flightId}`,
    {
      headers: {
        'Authorization': apiToken,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Media fetch error:', {
      flightId,
      status: response.status,
      body: errorBody
    });
    throw new Error(`Failed to fetch media: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();

  // v0 response: { data: { flight_data_files: [...] }, meta: {...}, status_code: 200 }
  const files = data.data?.flight_data_files || data.data || [];

  // Format flight data files for app
  const media = files.map(file => ({
    fileId: file.file_id || file.id,
    fileName: file.file_name,
    fileType: file.file_type, // e.g., 'VIDEO', 'PHOTO', 'LOG'
    sizeBytes: file.size_bytes,
    createdAt: file.created_at,
    // Download URL format: /api/v0/flight_data_files/{file_id}
    downloadUrl: `${SKYDIO_API_BASE}/api/v0/flight_data_files/${file.file_id || file.id}`,
    metadata: file.metadata || {},
  }));

  return jsonResponse({
    success: true,
    count: media.length,
    media: media,
  });
}

/**
 * GET /api/streetview/metadata
 * Checks if Google Street View imagery exists at a location
 * Returns: metadata including status, location, and date
 */
async function handleStreetViewMetadata(lat, lon, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      error: 'Google Maps API key not configured',
      hasStreetView: false
    }, 500);
  }

  const metadataUrl = `${GOOGLE_STREETVIEW_BASE}/metadata?location=${lat},${lon}&key=${apiKey}`;

  try {
    const response = await fetch(metadataUrl);
    const data = await response.json();

    return jsonResponse({
      success: true,
      hasStreetView: data.status === 'OK',
      status: data.status,
      location: data.location,
      date: data.date,
      copyright: data.copyright,
      panoId: data.pano_id,
    });
  } catch (error) {
    console.error('Street View metadata error:', error);
    return jsonResponse({
      error: 'Failed to fetch Street View metadata',
      hasStreetView: false,
      details: error.message
    }, 500);
  }
}

/**
 * GET /api/streetview/image
 * Returns a Google Street View Static API image URL
 * Parameters: lat, lon, size (optional), heading (optional), fov (optional), pitch (optional)
 * Returns: Image URL or error if not available
 */
async function handleStreetViewImage(lat, lon, size, heading, fov, pitch, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      error: 'Google Maps API key not configured',
      imageUrl: null
    }, 500);
  }

  // First check if Street View exists at this location
  const metadataUrl = `${GOOGLE_STREETVIEW_BASE}/metadata?location=${lat},${lon}&key=${apiKey}`;

  try {
    const metadataResponse = await fetch(metadataUrl);
    const metadata = await metadataResponse.json();

    if (metadata.status !== 'OK') {
      return jsonResponse({
        success: false,
        hasStreetView: false,
        status: metadata.status,
        imageUrl: null,
        message: 'No Street View imagery available at this location'
      });
    }

    // Build Street View image URL
    let imageUrl = `${GOOGLE_STREETVIEW_BASE}?size=${size}&location=${lat},${lon}&key=${apiKey}`;

    // Add optional parameters
    if (heading) imageUrl += `&heading=${heading}`;
    if (fov) imageUrl += `&fov=${fov}`;
    if (pitch) imageUrl += `&pitch=${pitch}`;

    return jsonResponse({
      success: true,
      hasStreetView: true,
      imageUrl: imageUrl,
      metadata: {
        location: metadata.location,
        date: metadata.date,
        copyright: metadata.copyright,
        panoId: metadata.pano_id,
      }
    });
  } catch (error) {
    console.error('Street View image error:', error);
    return jsonResponse({
      error: 'Failed to generate Street View image URL',
      imageUrl: null,
      details: error.message
    }, 500);
  }
}

/**
 * GET /api/weather/current
 * Fetches current weather conditions at a location
 * Parameters: lat, lon, units (optional: 'imperial' or 'metric')
 * Returns: Weather data including temp, conditions, wind, visibility
 */
async function handleCurrentWeather(lat, lon, units, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      error: 'OpenWeather API key not configured',
      weather: null
    }, 500);
  }

  const weatherUrl = `${OPENWEATHER_API_BASE}/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;

  try {
    const response = await fetch(weatherUrl);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenWeather API error:', errorData);
      return jsonResponse({
        error: 'Failed to fetch weather data',
        weather: null,
        details: errorData.message || response.statusText
      }, response.status);
    }

    const data = await response.json();

    // Parse and format weather data for drone flying assessment
    const weather = {
      // Basic conditions
      temp: Math.round(data.main.temp),
      tempUnit: units === 'imperial' ? '°F' : '°C',
      feelsLike: Math.round(data.main.feels_like),
      conditions: data.weather[0].main, // e.g., "Clear", "Clouds", "Rain"
      description: data.weather[0].description, // e.g., "clear sky", "scattered clouds"
      icon: data.weather[0].icon,

      // Wind (critical for drone flying)
      windSpeed: Math.round(data.wind.speed * 10) / 10,
      windSpeedUnit: units === 'imperial' ? 'mph' : 'm/s',
      windDeg: data.wind.deg || 0,
      windGust: data.wind.gust ? Math.round(data.wind.gust * 10) / 10 : null,

      // Visibility (critical for VLOS requirements)
      visibility: data.visibility ? Math.round(data.visibility * 0.000621371 * 10) / 10 : null, // meters to miles
      visibilityUnit: 'mi',
      visibilityMeters: data.visibility,

      // Other conditions
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      clouds: data.clouds.all, // cloud coverage percentage

      // Location info
      location: data.name,
      timezone: data.timezone,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,

      // Timestamp
      timestamp: data.dt,
      fetchedAt: new Date().toISOString(),

      // Flying conditions assessment
      flyingConditions: assessFlyingConditions(data, units)
    };

    return jsonResponse({
      success: true,
      weather: weather,
      raw: data // Include raw data for debugging
    });
  } catch (error) {
    console.error('Weather fetch error:', error);
    return jsonResponse({
      error: 'Failed to fetch weather data',
      weather: null,
      details: error.message
    }, 500);
  }
}

/**
 * Assess flying conditions based on weather data
 * Returns: { safe, risk, warnings[] }
 */
function assessFlyingConditions(data, units) {
  const warnings = [];
  let risk = 'low'; // low, medium, high

  // Wind speed assessment (critical)
  const windSpeed = data.wind.speed;
  const windSpeedMph = units === 'imperial' ? windSpeed : windSpeed * 2.237; // m/s to mph

  if (windSpeedMph > 25) {
    warnings.push('High winds - unsafe for most drones');
    risk = 'high';
  } else if (windSpeedMph > 15) {
    warnings.push('Moderate winds - experienced pilots only');
    if (risk !== 'high') risk = 'medium';
  } else if (windSpeedMph > 10) {
    warnings.push('Light winds - fly with caution');
  }

  // Visibility assessment (FAA VLOS requirement: 3 statute miles)
  const visibilityMiles = data.visibility ? data.visibility * 0.000621371 : 10;
  if (visibilityMiles < 3) {
    warnings.push('Low visibility - may not meet VLOS requirements');
    risk = 'high';
  } else if (visibilityMiles < 5) {
    warnings.push('Reduced visibility - maintain close visual contact');
    if (risk !== 'high') risk = 'medium';
  }

  // Precipitation
  if (data.weather[0].main === 'Rain' || data.weather[0].main === 'Snow') {
    warnings.push('Precipitation - do not fly (moisture damage risk)');
    risk = 'high';
  } else if (data.weather[0].main === 'Drizzle') {
    warnings.push('Light precipitation - not recommended');
    if (risk !== 'high') risk = 'medium';
  }

  // Temperature (battery performance)
  const temp = data.main.temp;
  const tempF = units === 'imperial' ? temp : (temp * 9/5) + 32;

  if (tempF < 32) {
    warnings.push('Below freezing - reduced battery life');
    if (risk !== 'high') risk = 'medium';
  } else if (tempF > 95) {
    warnings.push('High temperature - monitor for overheating');
    if (risk !== 'high') risk = 'medium';
  }

  // Cloud coverage (affects lighting)
  if (data.clouds.all > 80) {
    warnings.push('Heavy cloud cover - reduced lighting');
  }

  // Determine if safe to fly
  const safe = risk === 'low' && warnings.length === 0;

  return {
    safe,
    risk, // 'low', 'medium', 'high'
    riskColor: risk === 'low' ? 'green' : risk === 'medium' ? 'yellow' : 'red',
    warnings,
    recommendation: safe
      ? 'Good flying conditions'
      : risk === 'high'
        ? 'Do not fly'
        : 'Fly with caution'
  };
}

/**
 * V10.0: Comprehensive Places Search for Drone Photography
 * Searches ALL types of interesting locations: urban, nature, architecture, water, etc.
 * Returns deduplicated, scored results with photos
 */
async function handleComprehensivePlacesSearch(lat, lon, radius, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: 'Google Maps API key not configured',
      results: []
    }, 500);
  }

  try {
    const location = `${lat},${lon}`;

    // COMPREHENSIVE TYPE LIST - covers everything worth photographing
    const searchTypes = [
      // Nature & Landscapes
      'natural_feature',
      'park',
      'beach',
      'campground',

      // Water Features
      'lake',
      'marina',
      'harbor',

      // Urban & Architecture
      'tourist_attraction',
      'landmark',
      'church',
      'museum',
      'stadium',
      'university',

      // Viewpoints & Overlooks
      'point_of_interest',

      // Recreation
      'amusement_park',
      'zoo',
      'aquarium',

      // Infrastructure (for urban shots)
      'airport',
      'train_station',
      'light_rail_station',
      'bridge'  // Note: May not be directly searchable, but POIs near bridges
    ];

    console.log(`🔍 Comprehensive Google Places search: ${radius}m radius from [${lat}, ${lon}]`);

    // Make parallel requests for all types to maximize coverage
    const searchPromises = searchTypes.map(async (type) => {
      const searchUrl = `${GOOGLE_PLACES_BASE}/nearbysearch/json?location=${location}&radius=${radius}&type=${type}&key=${apiKey}`;

      try {
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.status === 'OK' && data.results) {
          console.log(`  ✅ Type "${type}": ${data.results.length} results`);
          return data.results;
        } else if (data.status === 'ZERO_RESULTS') {
          console.log(`  ⚪ Type "${type}": 0 results`);
          return [];
        } else {
          console.warn(`  ⚠️ Type "${type}": ${data.status}`);
          return [];
        }
      } catch (error) {
        console.error(`  ❌ Type "${type}": ${error.message}`);
        return [];
      }
    });

    // Wait for all searches to complete
    const allResults = await Promise.all(searchPromises);

    // Flatten and deduplicate by place_id
    const seenPlaceIds = new Set();
    const uniquePlaces = [];

    for (const results of allResults) {
      for (const place of results) {
        if (!seenPlaceIds.has(place.place_id)) {
          seenPlaceIds.add(place.place_id);
          uniquePlaces.push(place);
        }
      }
    }

    console.log(`📊 Total unique places found: ${uniquePlaces.length} (from ${allResults.flat().length} raw results)`);

    // Sort by rating and user count (quality filter)
    const sortedPlaces = uniquePlaces
      .filter(place => place.name) // Must have a name
      .sort((a, b) => {
        // Prioritize places with ratings and reviews
        const scoreA = (a.rating || 0) * Math.log10((a.user_ratings_total || 0) + 10);
        const scoreB = (b.rating || 0) * Math.log10((b.user_ratings_total || 0) + 10);
        return scoreB - scoreA;
      })
      .slice(0, 40); // Limit to top 40 best places

    // Format results for DroneScout
    const formattedResults = sortedPlaces.map(place => ({
      place_id: place.place_id,
      name: place.name,
      types: place.types || [],
      vicinity: place.vicinity,
      geometry: {
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        }
      },
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      photos: place.photos ? place.photos.slice(0, 3).map(photo => ({
        photo_reference: photo.photo_reference,
        height: photo.height,
        width: photo.width
      })) : [],
      business_status: place.business_status,
      opening_hours: place.opening_hours
    }));

    return jsonResponse({
      success: true,
      count: formattedResults.length,
      results: formattedResults,
      searchTypes: searchTypes,
      totalRawResults: allResults.flat().length,
      deduplicatedTo: uniquePlaces.length
    });

  } catch (error) {
    console.error('Comprehensive Places Search error:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to search places',
      results: [],
      details: error.message
    }, 500);
  }
}

/**
 * GET /api/places/lookup (legacy)
 * Search for a place near a location by name
 */
async function handlePlacesNearbySearch(lat, lon, name, radius, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: 'Google Maps API key not configured',
      place: null
    }, 500);
  }

  try {
    // Use Nearby Search to find places near the coordinates
    const location = `${lat},${lon}`;
    let searchUrl = `${GOOGLE_PLACES_BASE}/nearbysearch/json?location=${location}&radius=${radius}&key=${apiKey}`;

    // If name is provided, add keyword search
    if (name) {
      searchUrl += `&keyword=${encodeURIComponent(name)}`;
    }

    console.log('Places API Nearby Search:', searchUrl.replace(apiKey, 'API_KEY'));

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      // Return the first result (most relevant)
      const place = data.results[0];
      return jsonResponse({
        success: true,
        place: {
          place_id: place.place_id,
          name: place.name,
          types: place.types,
          vicinity: place.vicinity,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          photos: place.photos ? place.photos.map(photo => ({
            photo_reference: photo.photo_reference,
            height: photo.height,
            width: photo.width
          })) : []
        }
      });
    } else {
      return jsonResponse({
        success: false,
        error: `No places found: ${data.status}`,
        place: null
      });
    }
  } catch (error) {
    console.error('Places Nearby Search error:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to search places',
      place: null,
      details: error.message
    }, 500);
  }
}

/**
 * GET /api/places/details
 * Get detailed information about a place
 */
async function handlePlaceDetails(placeId, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: 'Google Maps API key not configured',
      details: null
    }, 500);
  }

  try {
    const detailsUrl = `${GOOGLE_PLACES_BASE}/details/json?place_id=${placeId}&fields=name,formatted_address,type,rating,user_ratings_total,photos,editorial_summary,reviews&key=${apiKey}`;

    console.log('Places API Details:', detailsUrl.replace(apiKey, 'API_KEY'));

    const response = await fetch(detailsUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      const place = data.result;
      return jsonResponse({
        success: true,
        details: {
          name: place.name,
          address: place.formatted_address,
          types: place.types,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          editorial_summary: place.editorial_summary?.overview || null,
          photos: place.photos ? place.photos.map(photo => ({
            photo_reference: photo.photo_reference,
            height: photo.height,
            width: photo.width,
            attributions: photo.html_attributions
          })) : [],
          reviews: place.reviews ? place.reviews.slice(0, 3).map(review => ({
            author: review.author_name,
            rating: review.rating,
            text: review.text,
            time: review.time
          })) : []
        }
      });
    } else {
      return jsonResponse({
        success: false,
        error: `Place details not found: ${data.status}`,
        details: null
      });
    }
  } catch (error) {
    console.error('Places Details error:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to fetch place details',
      details: null,
      details_error: error.message
    }, 500);
  }
}

/**
 * Helper: Get Google Places photo URL
 * Constructs URL to fetch place photo
 */
function getPlacePhotoUrl(photoReference, maxWidth, apiKey) {
  return `${GOOGLE_PLACES_BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`;
}

/**
 * V10.1: Foursquare Comprehensive Discovery (Per Claude Chat Recommendation)
 * Find ALL types of photo-worthy locations: urban, suburban, rural, nature
 * Score by popularity, photos, tips mentioning views/photography
 */
async function handleFoursquareDiscover(lat, lon, radiusMeters, apiKey) {
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: 'Foursquare API key not configured',
      results: []
    }, 500);
  }

  try {
    console.log(`📍 Foursquare discovery: ${radiusMeters}m radius from [${lat}, ${lon}]`);

    // Foursquare category codes for ALL types of drone-worthy locations
    const CATEGORIES = {
      landmarks: '16000',      // Landmarks & Outdoors
      parks: '16032',          // Parks
      beaches: '16003',        // Beaches
      viewpoints: '16045',     // Scenic Lookouts
      historic: '12080',       // Historic Sites
      monuments: '12009',      // Monuments
      arts: '12000',           // Arts & Entertainment
      architecture: '12007',   // Architectural Buildings
      stadiums: '18021',       // Stadiums
      universities: '14012',   // Universities/Campuses
      bridges: '16007',        // Bridges
      harbors: '16011',        // Harbors/Marinas
      gardens: '16020'         // Gardens
    };

    const allPlaces = [];

    // Search multiple categories in parallel
    const categoryKeys = Object.keys(CATEGORIES).slice(0, 8); // Limit API calls
    const searchPromises = categoryKeys.map(async (key) => {
      const categoryId = CATEGORIES[key];
      const searchUrl = `${FOURSQUARE_API_BASE}/places/search?` +
        `ll=${lat},${lon}&radius=${radiusMeters}&categories=${categoryId}&limit=20&sort=POPULARITY`;

      try {
        const response = await fetch(searchUrl, {
          headers: {
            'Authorization': apiKey,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          console.log(`  ⚠️ Category "${key}": HTTP ${response.status}`);
          return [];
        }

        const data = await response.json();
        if (data.results && data.results.length > 0) {
          console.log(`  ✅ Category "${key}": ${data.results.length} places`);
          return data.results;
        }
        return [];
      } catch (error) {
        console.error(`  ❌ Category "${key}": ${error.message}`);
        return [];
      }
    });

    const categoryResults = await Promise.all(searchPromises);
    categoryResults.forEach(results => allPlaces.push(...results));

    if (allPlaces.length === 0) {
      return jsonResponse({
        success: false,
        error: 'No places found in this area',
        results: []
      });
    }

    // Deduplicate by fsq_id
    const seen = new Set();
    const uniquePlaces = allPlaces.filter(place => {
      if (seen.has(place.fsq_id)) return false;
      seen.add(place.fsq_id);
      return true;
    });

    console.log(`📊 Found ${uniquePlaces.length} unique places (from ${allPlaces.length} total)`);

    // Fetch photos and tips for each place (in parallel, batched)
    const enrichedPlaces = await Promise.all(
      uniquePlaces.slice(0, 20).map(async (place) => {
        try {
          // Fetch photos
          const photosUrl = `${FOURSQUARE_API_BASE}/places/${place.fsq_id}/photos?limit=5`;
          const photosResponse = await fetch(photosUrl, {
            headers: { 'Authorization': apiKey }
          });
          const photosData = photosResponse.ok ? await photosResponse.json() : [];

          // Fetch tips
          const tipsUrl = `${FOURSQUARE_API_BASE}/places/${place.fsq_id}/tips?limit=5&sort=POPULAR`;
          const tipsResponse = await fetch(tipsUrl, {
            headers: { 'Authorization': apiKey }
          });
          const tipsData = tipsResponse.ok ? await tipsResponse.json() : [];

          // Calculate drone score
          const droneScore = calculateFoursquareDroneScore(place, tipsData);

          return {
            ...place,
            photos: photosData,
            tips: tipsData,
            droneScore
          };
        } catch (error) {
          console.error(`Error enriching place ${place.name}:`, error);
          return { ...place, photos: [], tips: [], droneScore: 0 };
        }
      })
    );

    // Sort by drone score
    enrichedPlaces.sort((a, b) => b.droneScore - a.droneScore);

    // Format for DroneScout
    const formattedPlaces = enrichedPlaces.map(place => ({
      fsq_id: place.fsq_id,
      name: place.name,
      lat: place.geocodes?.main?.latitude || place.geocodes?.roof?.latitude,
      lng: place.geocodes?.main?.longitude || place.geocodes?.roof?.longitude,
      categories: place.categories?.map(c => c.name) || [],
      distance: place.distance,
      popularity: place.popularity,
      rating: place.rating,
      photos: (place.photos || []).map(p => ({
        url: `${p.prefix}original${p.suffix}`,
        width: p.width,
        height: p.height
      })),
      tips: (place.tips || []).map(t => t.text),
      droneScore: place.droneScore,
      description: generateFoursquareDescription(place)
    }));

    return jsonResponse({
      success: true,
      count: formattedPlaces.length,
      results: formattedPlaces,
      totalPlacesFound: uniquePlaces.length,
      searchRadius: radiusMeters,
      method: 'foursquare'
    });

  } catch (error) {
    console.error('Foursquare discovery error:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to discover places',
      results: [],
      details: error.message
    }, 500);
  }
}

/**
 * Calculate drone photography score for Foursquare place
 */
function calculateFoursquareDroneScore(place, tipsData) {
  let score = 0;

  // Popularity (0-1 scale)
  if (place.popularity) score += place.popularity * 30;

  // Rating
  if (place.rating) score += (place.rating / 10) * 20;

  // Photo-worthy tips
  const photoKeywords = ['view', 'sunset', 'photo', 'beautiful', 'scenic', 'skyline', 'vista', 'panorama'];
  const photoTips = (tipsData || []).filter(tip =>
    photoKeywords.some(keyword => tip.text?.toLowerCase().includes(keyword))
  );
  score += photoTips.length * 15;

  // Elevated locations
  const name = (place.name || '').toLowerCase();
  if (name.includes('rooftop') || name.includes('tower') || name.includes('overlook')) {
    score += 25;
  }

  // Category bonuses
  const categories = (place.categories || []).map(c => c.name.toLowerCase());
  if (categories.some(c => c.includes('scenic') || c.includes('viewpoint'))) score += 30;
  if (categories.some(c => c.includes('historic') || c.includes('monument'))) score += 20;
  if (categories.some(c => c.includes('beach') || c.includes('park'))) score += 15;

  return Math.round(score);
}

/**
 * Generate description from Foursquare place data
 */
function generateFoursquareDescription(place) {
  const parts = [];

  // Name
  parts.push(place.name);

  // Rating
  if (place.rating) {
    parts.push(`${place.rating}/10`);
  }

  // Categories
  if (place.categories && place.categories.length > 0) {
    const catNames = place.categories.slice(0, 2).map(c => c.name).join(', ');
    parts.push(catNames);
  }

  return parts.join(' • ');
}

/**
 * Cluster photos by location to find hotspots
 */
function clusterPhotosByLocation(photos, threshold = 0.01) {
  const clusters = [];

  photos.forEach(photo => {
    if (!photo.latitude || !photo.longitude) return;

    const photoLat = parseFloat(photo.latitude);
    const photoLng = parseFloat(photo.longitude);

    // Find existing cluster within threshold
    let found = false;
    for (const cluster of clusters) {
      const latDiff = Math.abs(cluster.centerLat - photoLat);
      const lngDiff = Math.abs(cluster.centerLng - photoLng);

      if (latDiff < threshold && lngDiff < threshold) {
        cluster.photos.push(photo);
        cluster.totalViews += parseInt(photo.views || 0);
        cluster.uniquePhotographers = new Set(
          [...cluster.uniquePhotographers, photo.owner]
        ).size;

        // Update center (weighted average)
        cluster.centerLat = cluster.photos.reduce((sum, p) =>
          sum + parseFloat(p.latitude), 0) / cluster.photos.length;
        cluster.centerLng = cluster.photos.reduce((sum, p) =>
          sum + parseFloat(p.longitude), 0) / cluster.photos.length;

        found = true;
        break;
      }
    }

    if (!found) {
      clusters.push({
        centerLat: photoLat,
        centerLng: photoLng,
        photos: [photo],
        totalViews: parseInt(photo.views || 0),
        uniquePhotographers: new Set([photo.owner]).size
      });
    }
  });

  return clusters;
}

/**
 * Determine shot type from tags
 */
function determineShotType(tags) {
  const cityTags = ['city', 'urban', 'downtown', 'skyline', 'cityscape', 'architecture'];
  const natureTags = ['nature', 'landscape', 'forest', 'mountain', 'tree', 'wildlife'];
  const waterTags = ['water', 'lake', 'river', 'ocean', 'beach', 'harbor'];

  const cityCount = tags.filter(t => cityTags.includes(t.toLowerCase())).length;
  const natureCount = tags.filter(t => natureTags.includes(t.toLowerCase())).length;
  const waterCount = tags.filter(t => waterTags.includes(t.toLowerCase())).length;

  if (cityCount > natureCount && cityCount > waterCount) return 'cityscape';
  if (waterCount > natureCount) return 'water';
  return 'landscape';
}

/**
 * Get most common tags
 */
function getMostCommonTags(tags, limit = 10) {
  const tagCounts = {};
  tags.forEach(tag => {
    const normalized = tag.toLowerCase().trim();
    if (normalized && normalized.length > 2) {
      tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
    }
  });

  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * Determine best time to shoot from tags
 */
function determineBestTime(tags) {
  const lowerTags = tags.map(t => t.toLowerCase());

  if (lowerTags.includes('sunset') || lowerTags.includes('dusk')) {
    return 'Golden hour (evening)';
  }
  if (lowerTags.includes('sunrise') || lowerTags.includes('dawn')) {
    return 'Golden hour (morning)';
  }
  if (lowerTags.includes('night') || lowerTags.includes('nightscape')) {
    return 'Night/Blue hour';
  }

  return 'Golden hour';
}

/**
 * Generate descriptive name from location and tags
 */
function generateHotspotName(hotspot, tags) {
  const commonTags = getMostCommonTags(tags, 5);

  // Try to find location-specific tags
  const locationTags = commonTags.filter(tag =>
    !['aerial', 'drone', 'dji', 'landscape', 'photo', 'photography'].includes(tag)
  );

  if (locationTags.length > 0) {
    return locationTags[0].charAt(0).toUpperCase() + locationTags[0].slice(1) + ' Photo Spot';
  }

  // Fallback to coordinate-based name
  const shotType = determineShotType(tags);
  return `${shotType.charAt(0).toUpperCase() + shotType.slice(1)} Hotspot`;
}

/**
 * Helper: Create JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
