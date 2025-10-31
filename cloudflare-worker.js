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
 */
async function handleSyncFlights(apiToken) {
  const allFlights = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${SKYDIO_API_BASE}/api/v0/flights?status=completed&page=${page}&page_size=50`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

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
    
    // Transform to simplified format for History tab
    // Match frontend schema: created_at, duration_seconds, name
    const flights = data.data.map(flight => ({
      id: flight.id,
      name: `${flight.aircraft_model || 'Drone'} Flight`, // Generate name from aircraft
      created_at: flight.start_time,
      duration_seconds: flight.duration_sec,
      location: {
        lat: flight.location_summary?.launch_lat,
        lon: flight.location_summary?.launch_lon,
      },
      media_urls: [], // Will be populated by separate media fetch
      // Additional metadata for future use
      metadata: {
        aircraft: flight.aircraft_model,
        endTime: flight.end_time,
        maxAltitude: flight.max_altitude_m,
        maxSpeed: flight.max_speed_mps,
        batteryUsed: flight.avg_battery_pct,
      },
      synced: true, // Flag to distinguish from manual entries
    }));

    allFlights.push(...flights);

    // Check pagination
    hasMore = data.meta?.has_more || false;
    page++;

    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn('Hit pagination safety limit (100 pages)');
      break;
    }
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
 */
async function handleFlightDetails(flightId, apiToken) {
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  // Fetch flight details and telemetry in parallel
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
 */
async function handleFlightMedia(flightId, apiToken) {
  const response = await fetch(
    `${SKYDIO_API_BASE}/api/v0/media?flight_id=${flightId}`,
    {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
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
