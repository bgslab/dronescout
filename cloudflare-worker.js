/**
 * DroneScout - Cloudflare Worker Proxy for Skydio Cloud API + External APIs
 * Handles authentication and CORS for browser-based app
 */

const SKYDIO_API_BASE = 'https://api.skydio.com';
const GOOGLE_STREETVIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview';
const GOOGLE_PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const OPENWEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';
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

      // Route requests - Google Places API
      if (path === '/api/places/nearbysearch' && request.method === 'GET') {
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
 * GET /api/places/nearbysearch
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
