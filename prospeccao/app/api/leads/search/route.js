const USER_AGENT = "CortouAnotouProspeccao/1.0 (https://cortouanotou.com.br)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

function text(value) {
  return String(value ?? "").trim();
}

function cleanPhone(value) {
  return text(value).replace(/^tel:/i, "").trim();
}

function addressFrom(tags, fallbackCity) {
  const street = text(tags["addr:street"]);
  const number = text(tags["addr:housenumber"]);
  const district = text(tags["addr:suburb"] || tags["addr:neighbourhood"] || tags["addr:district"]);
  const city = text(tags["addr:city"] || tags["addr:municipality"] || fallbackCity);
  const first = [street, number].filter(Boolean).join(", ");
  return [first, district, city].filter(Boolean).join(" · ") || fallbackCity;
}

function phoneFrom(tags) {
  return cleanPhone(tags["contact:whatsapp"] || tags.whatsapp || tags["contact:phone"] || tags.phone || tags["phone:mobile"]);
}

function websiteFrom(tags) {
  return text(tags["contact:website"] || tags.website || tags["contact:instagram"] || tags.instagram || tags["contact:facebook"] || tags.facebook);
}

function barberStrength(tags) {
  const haystack = `${text(tags.name)} ${text(tags.description)} ${text(tags.brand)} ${text(tags.operator)}`.toLowerCase();
  if (/barbearia|barber|barbershop|barber shop|barbear[ií]a/.test(haystack)) return 3;
  if (text(tags.hairdresser).toLowerCase() === "barber") return 3;
  if (text(tags.barber).toLowerCase() === "yes") return 3;
  if (text(tags.male).toLowerCase() === "yes") return 2;
  if (text(tags.shop).toLowerCase() === "hairdresser") return 1;
  return 0;
}

function publicSourceUrl(item) {
  if (!item?.type || !item?.id) return "";
  return `https://www.openstreetmap.org/${item.type}/${item.id}`;
}

function placeKind(place) {
  const kind = text(place?.addresstype || place?.type).toLowerCase();
  if (["state", "region"].includes(kind)) return "state";
  if (["country"].includes(kind)) return "country";
  if (["city", "town", "village", "municipality", "administrative", "borough", "district"].includes(kind)) return "city";
  return kind || "place";
}

function placeScore(place) {
  const kind = placeKind(place);
  let score = 0;
  if (kind === "city") score += 50;
  if (["city", "town", "municipality"].includes(text(place?.addresstype).toLowerCase())) score += 25;
  if (text(place?.address?.country_code).toLowerCase() === "br") score += 20;
  const rank = Number(place?.place_rank);
  if (Number.isFinite(rank)) score += Math.max(0, 30 - Math.abs(16 - rank));
  return score;
}

function choosePlace(places) {
  const sorted = [...places].sort((a, b) => placeScore(b) - placeScore(a));
  const city = sorted.find((place) => placeKind(place) === "city");
  return city || sorted[0] || null;
}

function stateCodeFrom(place) {
  const iso = text(place?.extratags?.["ISO3166-2"] || place?.extratags?.iso3166_2 || place?.address?.["ISO3166-2-lvl4"]);
  const match = iso.match(/BR-([A-Z]{2})/i);
  return match ? match[1].toUpperCase() : "";
}

function searchScope(place) {
  const osmType = text(place?.osm_type).toLowerCase();
  const osmId = Number(place?.osm_id);
  if (osmType === "relation" && Number.isFinite(osmId) && osmId > 0) {
    return { selector: `(area:${3_600_000_000 + osmId})`, mode: "limite da cidade" };
  }

  const bounds = Array.isArray(place?.boundingbox) ? place.boundingbox.map(Number) : [];
  if (bounds.length === 4 && bounds.every(Number.isFinite)) {
    const [south, north, west, east] = bounds;
    return { selector: `(${south},${west},${north},${east})`, mode: "área da cidade" };
  }

  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { selector: `(around:18000,${lat},${lon})`, mode: "cidade e proximidades" };
  }

  return null;
}

function buildQuery(selector) {
  return `[out:json][timeout:28];\n(\n  nwr[\"name\"~\"barbearia|barber|barbershop|barber shop\",i]${selector};\n  nwr[\"shop\"=\"hairdresser\"]${selector};\n  nwr[\"craft\"=\"barber\"]${selector};\n);\nout tags center 180;`;
}

async function fetchOverpass(query) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(34_000),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) {
        lastError = new Error(`Fonte respondeu ${response.status}.`);
        continue;
      }
      const body = await response.json();
      if (Array.isArray(body?.elements)) return body.elements;
      lastError = new Error("A fonte retornou uma resposta incompleta.");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("A busca gratuita está ocupada agora. Tente novamente em alguns segundos.");
}

function distanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (value) => value * Math.PI / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request) {
  const url = new URL(request.url);
  const city = text(url.searchParams.get("city")).slice(0, 90);
  if (city.length < 2) return Response.json({ error: "Digite uma cidade para pesquisar." }, { status: 400 });

  try {
    const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
    geocodeUrl.searchParams.set("format", "jsonv2");
    geocodeUrl.searchParams.set("limit", "6");
    geocodeUrl.searchParams.set("countrycodes", "br");
    geocodeUrl.searchParams.set("addressdetails", "1");
    geocodeUrl.searchParams.set("extratags", "1");
    geocodeUrl.searchParams.set("q", /brasil|brazil/i.test(city) ? city : `${city}, Brasil`);

    const geoResponse = await fetch(geocodeUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(14_000),
      headers: {
        accept: "application/json",
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent": USER_AGENT,
      },
    });
    if (!geoResponse.ok) throw new Error("Não foi possível localizar essa cidade agora.");
    const geo = await geoResponse.json();
    const places = Array.isArray(geo) ? geo : [];
    const place = choosePlace(places);
    if (!place) {
      return Response.json({ error: "Não encontrei essa cidade. Tente escrever cidade e estado, por exemplo: Colombo, PR." }, { status: 404 });
    }

    const kind = placeKind(place);
    if (kind === "state" || kind === "country") {
      const label = text(place.display_name) || city;
      const code = stateCodeFrom(place);
      return Response.json({
        error: kind === "state"
          ? `${label.split(",")[0]} é um estado. Digite o nome de uma cidade${code ? `, por exemplo: Curitiba, ${code}` : ""}.`
          : "Digite o nome de uma cidade brasileira, não apenas o país.",
        kind,
        displayName: label,
      }, { status: 422 });
    }

    const scope = searchScope(place);
    if (!scope) throw new Error("A localização retornou dados incompletos.");
    const elements = await fetchOverpass(buildQuery(scope.selector));
    const centerLat = Number(place.lat);
    const centerLon = Number(place.lon);

    const unique = new Map();
    for (const item of elements) {
      const tags = item?.tags && typeof item.tags === "object" ? item.tags : {};
      const name = text(tags.name);
      if (!name) continue;
      const strength = barberStrength(tags);
      if (!strength) continue;
      const phone = phoneFrom(tags);
      const lat = Number(item.lat ?? item.center?.lat);
      const lon = Number(item.lon ?? item.center?.lon);
      const phoneDigits = phone.replace(/\D/g, "");
      const key = phoneDigits.length >= 8
        ? `phone:${phoneDigits}`
        : `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}|${Number.isFinite(lat) ? lat.toFixed(4) : ""}|${Number.isFinite(lon) ? lon.toFixed(4) : ""}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        id: `${item.type}-${item.id}`,
        name,
        phone,
        address: addressFrom(tags, text(place?.address?.city || place?.address?.town || place?.address?.municipality || city)),
        website: websiteFrom(tags),
        sourceUrl: publicSourceUrl(item),
        source: "OpenStreetMap",
        potential: strength >= 3 ? "alto" : strength === 2 ? "bom" : "possível",
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        distanceKm: distanceKm(centerLat, centerLon, lat, lon),
      });
    }

    const leads = [...unique.values()]
      .sort((a, b) => {
        if (Boolean(a.phone) !== Boolean(b.phone)) return a.phone ? -1 : 1;
        const potentialOrder = { alto: 0, bom: 1, possível: 2 };
        if (a.potential !== b.potential) return potentialOrder[a.potential] - potentialOrder[b.potential];
        if (Boolean(a.website) !== Boolean(b.website)) return a.website ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 80);

    return Response.json({
      query: city,
      displayName: text(place.display_name) || city,
      regionKind: kind,
      scope: scope.mode,
      leads,
      source: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
      tip: leads.length < 5 ? "Poucos cadastros públicos encontrados. Tente também cidade e UF para deixar a localização mais precisa." : "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível pesquisar agora.";
    return Response.json({ error: message }, { status: 503 });
  }
}
