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

  // Parse telemetry - structure is data.flight_telemetry with GPS/altitude/timestamps
  let telemetryTrack = null;
  if (telemetryData?.data?.flight_telemetry) {
    const telem = telemetryData.data.flight_telemetry;
    // GPS data is array of [lat, lon] pairs with corresponding timestamps
    if (telem.gps?.data && telem.gps?.timestamps) {
      telemetryTrack = telem.gps.timestamps.map((timestamp, idx) => ({
        timestamp,
        lat: telem.gps.data[idx][0], // [lat, lon] array
        lon: telem.gps.data[idx][1],
        altitude: telem.altitude?.data?.[idx] || 0,
        batteryPct: telem.battery_percentage?.data?.[idx],
        heightAboveTakeoff: telem.height_above_takeoff?.data?.[idx],
      }));
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
