// netlify/functions/geocode.mjs
// -----------------------------------------------------------------------------
// Proxy mot Google Geocoding API.
// Tar imot en adresse, returnerer { lat, lng, formatted_address, place_id }.
// API-nøkkelen leses fra miljøvariabelen GOOGLE_API_KEY og eksponeres ALDRI
// til klienten. Vi avgrenser søket til Frankrike for bedre presisjon.
//
// Bruk fra frontend:
//   fetch(`/api/geocode?address=${encodeURIComponent("10 Rue de Rivoli, Paris")}`)
// -----------------------------------------------------------------------------

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Tillat kall fra samme origin (Netlify-domenet) — appen og funksjonen
  // ligger på samme domene, så vi trenger ikke noen CORS-åpning.
  "Cache-Control": "no-store",
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default async (request) => {
  // Bare GET — geokoding er en idempotent oppslagsoperasjon.
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed. Bruk GET." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error:
        "Mangler GOOGLE_API_KEY på serveren. Sett miljøvariabelen i Netlify (Site settings → Environment variables) og redeploy.",
    });
  }

  const url = new URL(request.url);
  const address = (url.searchParams.get("address") || "").trim();
  if (!address) {
    return jsonResponse(400, { error: "Parameteren 'address' er påkrevd." });
  }

  // Bygg forespørselen til Google
  const googleUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  googleUrl.searchParams.set("address", address);
  // Begrens til Frankrike for å unngå feiltreff (f.eks. gater med samme navn andre steder)
  googleUrl.searchParams.set("components", "country:FR");
  googleUrl.searchParams.set("region", "fr");
  googleUrl.searchParams.set("language", "fr");
  googleUrl.searchParams.set("key", apiKey);

  let data;
  try {
    const resp = await fetch(googleUrl.toString());
    data = await resp.json();
  } catch (err) {
    return jsonResponse(502, {
      error: "Klarte ikke å kontakte Google Geocoding API.",
      detail: String(err?.message || err),
    });
  }

  // Google bruker en egen "status"-streng i body, uavhengig av HTTP-status.
  if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
    return jsonResponse(404, {
      error: "Fant ingen treff på adressen.",
      google_status: data.status,
      google_message: data.error_message || null,
    });
  }

  const top = data.results[0];
  return jsonResponse(200, {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted_address: top.formatted_address,
    place_id: top.place_id,
  });
};
