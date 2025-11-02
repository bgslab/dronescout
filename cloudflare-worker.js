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
      telemetryTrack = telem.gps.timestamps.map((timestamp, idx) => ({
        timestamp,
        lat: telem.gps.data[idx][0], // [lat, lon] array
        lon: telem.gps.data[idx][1],
        altitude: telem.altitude?.data?.[idx] || 0,
        batteryPct: telem.battery_percentage?.data?.[idx],
        heightAboveTakeoff: telem.height_above_takeoff?.data?.[idx],
        // Include ALL available telemetry fields
        speed: telem.speed?.data?.[idx],
        windSpeed: telem.wind_speed?.data?.[idx],
        windDirection: telem.wind_direction?.data?.[idx],
        heading: telem.heading?.data?.[idx],
        gimbalPitch: telem.gimbal_pitch?.data?.[idx],
        gimbalYaw: telem.gimbal_yaw?.data?.[idx],
      }));

      // Calculate summary stats from telemetry
      const speeds = telemetryTrack.map(p => p.speed).filter(s => s != null);
      const altitudes = telemetryTrack.map(p => p.altitude).filter(a => a != null);
      const heights = telemetryTrack.map(p => p.heightAboveTakeoff).filter(h => h != null);
      const windSpeeds = telemetryTrack.map(p => p.windSpeed).filter(w => w != null);
      const batteries = telemetryTrack.map(p => p.batteryPct).filter(b => b != null);

      telemetryStats = {
        maxSpeed: speeds.length > 0 ? Math.max(...speeds) : null,
        avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null,
        maxAltitude: altitudes.length > 0 ? Math.max(...altitudes) : null,
        avgAltitude: altitudes.length > 0 ? altitudes.reduce((a, b) => a + b, 0) / altitudes.length : null,
        maxHeight: heights.length > 0 ? Math.max(...heights) : null,
        avgHeight: heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : null,
        maxWindSpeed: windSpeeds.length > 0 ? Math.max(...windSpeeds) : null,
        avgWindSpeed: windSpeeds.length > 0 ? windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length : null,
        startBattery: batteries.length > 0 ? batteries[0] : null,
        endBattery: batteries.length > 0 ? batteries[batteries.length - 1] : null,
        batteryUsed: batteries.length > 0 ? batteries[0] - batteries[batteries.length - 1] : null,
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
