/**
 * DroneScout - Cloudflare Worker Proxy for Skydio Cloud API
 * Handles authentication and CORS for browser-based app
 */

const SKYDIO_API_BASE = 'https://api.skydio.com';
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
          apiBase: SKYDIO_API_BASE
        });
      }

      // Route requests
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
  const headers = {
    'Authorization': apiToken, // Organization API tokens: no "Bearer" prefix
    'Accept': 'application/json',
  };

  // v0 API: Fetch flight details and telemetry in parallel
  const [flightResponse, telemetryResponse] = await Promise.all([
    fetch(`${SKYDIO_API_BASE}/api/v0/flights/${flightId}`, { headers }),
    fetch(`${SKYDIO_API_BASE}/api/v1/telemetry?flight_id=${flightId}`, { headers }),
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
  if (!telemetryResponse.ok) {
    const errorBody = await telemetryResponse.text();
    console.error('Telemetry error:', {
      flightId,
      status: telemetryResponse.status,
      body: errorBody
    });
    throw new Error(`Failed to fetch telemetry: ${telemetryResponse.status} - ${errorBody}`);
  }

  const flightData = await flightResponse.json();
  const telemetryData = await telemetryResponse.json();

  // Combine and format for app
  const flight = flightData.data;
  const telemetry = telemetryData.data;

  return jsonResponse({
    success: true,
    flight: {
      id: flight.id,
      aircraft: flight.aircraft_model,
      firmware: flight.firmware_version,
      startTime: flight.start_time,
      endTime: flight.end_time,
      duration: flight.duration_sec,
      stats: {
        maxAltitude: flight.stats.max_altitude_m,
        maxSpeed: flight.stats.max_speed_mps,
        maxDistance: flight.stats.max_distance_from_home_m,
        takeoffBattery: flight.stats.takeoff_battery_pct,
        landingBattery: flight.stats.landing_battery_pct,
      },
      launchLocation: {
        lat: flight.location_summary.launch_lat,
        lon: flight.location_summary.launch_lon,
      },
      pilot: flight.pilot,
    },
    telemetry: {
      flightId: telemetry.flight_id,
      sampleRate: telemetry.sample_rate_hz,
      track: telemetry.track, // Full GPS track array
      bounds: telemetry.bounds,
      pointCount: telemetry.track?.length || 0,
    },
  });
}

/**
 * GET /flight/:id/media
 * Fetches all media (photos/videos) for a flight
 * Returns: Array of media with download URLs and GPS tags
 * Uses Skydio Cloud API v0 (Organization API tokens)
 */
async function handleFlightMedia(flightId, apiToken) {
  // v0 API: Use query parameter to filter media by flight_id
  const response = await fetch(
    `${SKYDIO_API_BASE}/api/v0/media?flight_id=${flightId}`,
    {
      headers: {
        'Authorization': apiToken, // Organization API tokens: no "Bearer" prefix
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

  // Format media for app
  const media = data.data.map(item => ({
    id: item.id,
    type: item.type, // 'photo' or 'video'
    mimeType: item.mime_type,
    capturedAt: item.captured_at,
    sizeBytes: item.size_bytes,
    duration: item.duration_sec, // Only for videos
    gps: item.gps,
    downloadUrl: item.download_url,
    thumbnailUrl: item.thumbnail_url,
    hasExif: item.exif_available,
  }));

  return jsonResponse({
    success: true,
    count: media.length,
    media: media,
  });
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
