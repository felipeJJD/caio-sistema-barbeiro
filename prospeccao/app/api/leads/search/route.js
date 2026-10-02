const USER_AGENT = "CortouAnotouProspeccao/0.1";

function text(value) {
  return String(value ?? "").trim();
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
  return text(tags["contact:whatsapp"] || tags.whatsapp || tags["contact:phone"] || tags.phone);
}

function websiteFrom(tags) {
  return text(tags["contact:website"] || tags.website || tags["contact:instagram"] || tags.instagram);
}

function isStrongBarber(tags) {
  const haystack = `${text(tags.name)} ${text(tags.description)} ${text(tags.brand)}`.toLowerCase();
  return /barbearia|barber|barbershop|barber shop/.test(haystack) || text(tags.hairdresser).toLowerCase() === "barber";
}

function publicSourceUrl(item) {
  if (!item?.type || !item?.id) return "";
  return `https://www.openstreetmap.org/${item.type}/${item.id}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const city = text(url.searchParams.get("city")).slice(0, 90);
  if (city.length < 2) return Response.json({ error: "Digite uma cidade para pesquisar." }, { status: 400 });

  try {
    const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
    geocodeUrl.searchParams.set("format", "jsonv2");
    geocodeUrl.searchParams.set("limit", "1");
    geocodeUrl.searchParams.set("countrycodes", "br");
    geocodeUrl.searchParams.set("q", city);

    const geoResponse = await fetch(geocodeUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "application/json",
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent": USER_AGENT,
      },
    });
    if (!geoResponse.ok) throw new Error("Não foi possível localizar a cidade agora.");
    const geo = await geoResponse.json();
    const place = Array.isArray(geo) ? geo[0] : null;
    if (!place?.boundingbox || place.boundingbox.length !== 4) {
      return Response.json({ error: "Não encontrei essa cidade. Tente escrever cidade e estado, por exemplo: Colombo, PR." }, { status: 404 });
    }

    const [south, north, west, east] = place.boundingbox.map(Number);
    if (![south, north, west, east].every(Number.isFinite)) throw new Error("A localização retornou dados inválidos.");

    const bbox = `${south},${west},${north},${east}`;
    const query = `[out:json][timeout:25];\n(\n  nwr[\"name\"~\"barbearia|barber|barbershop|barber shop\",i](${bbox});\n  nwr[\"shop\"=\"hairdresser\"][\"hairdresser\"=\"barber\"](${bbox});\n  nwr[\"shop\"=\"hairdresser\"][\"male\"=\"yes\"](${bbox});\n);\nout tags center 120;`;

    const overpassResponse = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!overpassResponse.ok) throw new Error("A busca gratuita está ocupada agora. Tente novamente em alguns segundos.");
    const body = await overpassResponse.json();
    const elements = Array.isArray(body?.elements) ? body.elements : [];

    const unique = new Map();
    for (const item of elements) {
      const tags = item?.tags && typeof item.tags === "object" ? item.tags : {};
      const name = text(tags.name);
      if (!name) continue;
      const phone = phoneFrom(tags);
      const lat = Number(item.lat ?? item.center?.lat);
      const lon = Number(item.lon ?? item.center?.lon);
      const key = `${name.toLowerCase()}|${phone.replace(/\D/g, "")}|${Number.isFinite(lat) ? lat.toFixed(4) : ""}|${Number.isFinite(lon) ? lon.toFixed(4) : ""}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        id: `${item.type}-${item.id}`,
        name,
        phone,
        address: addressFrom(tags, city),
        website: websiteFrom(tags),
        sourceUrl: publicSourceUrl(item),
        source: "OpenStreetMap",
        potential: isStrongBarber(tags) ? "alto" : "possível",
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
      });
    }

    const leads = [...unique.values()]
      .sort((a, b) => {
        if (Boolean(a.phone) !== Boolean(b.phone)) return a.phone ? -1 : 1;
        if (a.potential !== b.potential) return a.potential === "alto" ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 50);

    return Response.json({
      city,
      displayName: text(place.display_name) || city,
      leads,
      source: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível pesquisar agora.";
    return Response.json({ error: message }, { status: 503 });
  }
}
