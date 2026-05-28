// netlify/functions/transit.mjs
// -----------------------------------------------------------------------------
// Proxy mot Google Distance Matrix API for reisetider med kollektiv/gange.
//
// Forventer POST med JSON-kropp:
//   {
//     "origin":       { "lat": 48.85, "lng": 2.35 },
//     "destinations": [ { "lat": ..., "lng": ... }, ... ],
//     "mode":         "transit" | "walking" | "driving" | "bicycling"  (valgfritt, default: transit)
//     "departureTime": <unix-sekunder>                                    (valgfritt; default: neste hverdag 08:00 Paris)
//   }
//
// Returnerer:
//   {
//     "departure_timestamp": <unix-sekunder>,
//     "results": [
//        { "destinationIndex": 0, "status": "OK", "duration_text": "22 min",
//          "duration_value": 1320, "distance_text": "5.4 km", "distance_value": 5400 },
//        ...
//     ]
//   }
//
// API-nøkkelen leses fra GOOGLE_API_KEY på serveren — eksponeres aldri til klient.
// -----------------------------------------------------------------------------

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Returnerer Unix-tid (sekunder) for neste hverdag kl. 08:00 lokal Paris-tid.
 * Håndterer sommertid (CET/CEST) ved å spørre runtime'en hva Paris-klokken er
 * når UTC står på 08:00 den aktuelle datoen — differensen gir oss offsettet.
 */
function nextWeekdayAt8AMParis() {
  const nowMs = Date.now();
  for (let i = 0; i <= 8; i++) {
    const candidate = new Date(nowMs + i * 86400000);

    // Hent dato- og ukedagsdeler slik de fremstår i Paris-tid
    const parisDate = candidate.toLocaleString("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }); // f.eks. "2026-05-29"
    const weekday = candidate.toLocaleString("en-US", {
      timeZone: "Europe/Paris",
      weekday: "short",
    });

    if (weekday === "Sat" || weekday === "Sun") continue;

    // Finn Paris' UTC-offset for denne datoen ved å sjekke hva Paris-tiden er
    // når UTC viser 08:00 samme dato.
    const probeUTC = new Date(`${parisDate}T08:00:00Z`);
    const parisHourStr = probeUTC.toLocaleString("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    });
    const offset = parseInt(parisHourStr, 10) - 8; // 1 = CET, 2 = CEST
    const utcHour = String(8 - offset).padStart(2, "0");
    const target = new Date(`${parisDate}T${utcHour}:00:00Z`);

    // Må ligge minst 1 minutt frem i tid (Google avviser fortid)
    if (target.getTime() > nowMs + 60_000) {
      return Math.floor(target.getTime() / 1000);
    }
  }
  // Fallback: 24 timer frem
  return Math.floor((nowMs + 86_400_000) / 1000);
}

function isValidLatLng(p) {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed. Bruk POST." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error:
        "Mangler GOOGLE_API_KEY på serveren. Sett miljøvariabelen i Netlify (Site settings → Environment variables) og redeploy.",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Ugyldig JSON i forespørselen." });
  }

  const { origin, destinations, mode, departureTime } = body || {};

  if (!isValidLatLng(origin)) {
    return jsonResponse(400, { error: "Feltet 'origin' må være {lat, lng}." });
  }
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return jsonResponse(400, { error: "Feltet 'destinations' må være en ikke-tom array av {lat, lng}." });
  }
  if (destinations.length > 25) {
    return jsonResponse(400, {
      error: "Maks 25 destinasjoner per kall (Google Distance Matrix sin grense).",
    });
  }
  if (!destinations.every(isValidLatLng)) {
    return jsonResponse(400, { error: "Alle 'destinations' må være {lat, lng}." });
  }

  const allowedModes = new Set(["transit", "walking", "driving", "bicycling"]);
  const travelMode = allowedModes.has(mode) ? mode : "transit";

  // For transit krever Google et fremtidig departure_time
  const departureTimestamp =
    Number.isFinite(departureTime) && departureTime > Math.floor(Date.now() / 1000)
      ? departureTime
      : nextWeekdayAt8AMParis();

  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");

  const googleUrl = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  googleUrl.searchParams.set("origins", originStr);
  googleUrl.searchParams.set("destinations", destStr);
  googleUrl.searchParams.set("mode", travelMode);
  googleUrl.searchParams.set("departure_time", String(departureTimestamp));
  googleUrl.searchParams.set("language", "fr");
  googleUrl.searchParams.set("units", "metric");
  googleUrl.searchParams.set("key", apiKey);

  let data;
  try {
    const resp = await fetch(googleUrl.toString());
    data = await resp.json();
  } catch (err) {
    return jsonResponse(502, {
      error: "Klarte ikke å kontakte Google Distance Matrix API.",
      detail: String(err?.message || err),
    });
  }

  if (data.status !== "OK") {
    return jsonResponse(502, {
      error: "Distance Matrix svarte med feil.",
      google_status: data.status,
      google_message: data.error_message || null,
    });
  }

  const row = data.rows?.[0];
  if (!row || !Array.isArray(row.elements)) {
    return jsonResponse(502, { error: "Uventet svarformat fra Google." });
  }

  const results = row.elements.map((el, i) => ({
    destinationIndex: i,
    status: el.status,
    duration_text: el.duration?.text ?? null,
    duration_value: el.duration?.value ?? null,
    distance_text: el.distance?.text ?? null,
    distance_value: el.distance?.value ?? null,
  }));

  return jsonResponse(200, {
    mode: travelMode,
    departure_timestamp: departureTimestamp,
    origin_address: data.origin_addresses?.[0] ?? null,
    destination_addresses: data.destination_addresses ?? [],
    results,
  });
};
