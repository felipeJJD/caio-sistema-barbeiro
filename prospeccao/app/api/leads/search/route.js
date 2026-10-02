import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { filterAvailableLeads } from "../../../../lib/affiliate-claims.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const USER_AGENT = "CortouAnotouProspeccao/1.5 (https://cortouanotou.com.br)";
const PAGE_SIZE = 40;
const VALID_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);
const VALID_DDDS = new Set([
  "11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99",
]);
const UF_BY_STATE = new Map(Object.entries({
  acre:"AC", alagoas:"AL", amapa:"AP", amazonas:"AM", bahia:"BA", ceara:"CE", "distrito federal":"DF",
  "espirito santo":"ES", goias:"GO", maranhao:"MA", "mato grosso":"MT", "mato grosso do sul":"MS",
  "minas gerais":"MG", para:"PA", paraiba:"PB", parana:"PR", pernambuco:"PE", piaui:"PI", "rio de janeiro":"RJ",
  "rio grande do norte":"RN", "rio grande do sul":"RS", rondonia:"RO", roraima:"RR", "santa catarina":"SC",
  "sao paulo":"SP", sergipe:"SE", tocantins:"TO",
}));

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseBrazilPhone(value) {
  let digits = text(value).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0055") && (digits.length === 14 || digits.length === 15)) digits = digits.slice(4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);

  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) return null;

  const subscriber = digits.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return null;

  const mobile = digits.length === 11 && digits[2] === "9";
  const landline = digits.length === 10 && /^[2-5]/.test(digits[2]);
  if (!mobile && !landline) return null;

  const display = mobile
    ? `(${ddd}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : `(${ddd}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

  return {
    national: digits,
    e164: `55${digits}`,
    display,
    kind: mobile ? "mobile" : "landline",
    whatsappCandidate: mobile,
  };
}

function bestPhone(values) {
  const contacts = (Array.isArray(values) ? values : [])
    .map(parseBrazilPhone)
    .filter(Boolean);
  return contacts.find((item) => item.kind === "mobile") || contacts[0] || null;
}

function firstString(values) {
  if (!Array.isArray(values)) return "";
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const candidate = text(value.url || value.value || value.handle || value.name);
      if (candidate) return candidate;
    }
  }
  return "";
}

function placeAddress(place, fallbackCity, fallbackUf) {
  const addresses = Array.isArray(place?.addresses) ? place.addresses : [];
  const preferred = addresses.find((item) => String(item?.country || "").toUpperCase() === "BR") || addresses[0] || {};
  const locality = text(preferred.locality) || fallbackCity;
  const region = text(preferred.region).replace(/^BR-/i, "") || fallbackUf;
  return [text(preferred.freeform), locality, region, text(preferred.postcode)].filter(Boolean).join(" · ") || `${fallbackCity}, ${fallbackUf}`;
}

export function mapOverturePlace(place, fallbackCity = "", fallbackUf = "") {
  const contact = bestPhone(place?.phones);
  const confidence = Number(place?.confidence);
  const name = text(place?.name) || "Barbearia sem nome";
  return {
    id: text(place?.id) || `place-${normalize(name)}-${place?.lat || ""}-${place?.lon || ""}`,
    name,
    phone: contact?.display || "",
    phoneE164: contact?.e164 || "",
    phoneKind: contact?.kind || "",
    whatsappCandidate: Boolean(contact?.whatsappCandidate),
    address: placeAddress(place, fallbackCity, fallbackUf),
    website: firstString(place?.websites),
    social: firstString(place?.socials),
    sourceUrl: "",
    source: "Overture Maps",
    potential: Number.isFinite(confidence) && confidence >= 0.75 ? "alto" : contact?.whatsappCandidate ? "bom" : "possível",
    confidence: Number.isFinite(confidence) ? confidence : null,
    category: text(place?.category) || "barber",
    lat: Number.isFinite(Number(place?.lat)) ? Number(place.lat) : null,
    lon: Number.isFinite(Number(place?.lon)) ? Number(place.lon) : null,
  };
}

async function fetchJson(url, timeoutMs = 12_000) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
      "accept-language": "pt-BR,pt;q=0.9",
      "user-agent": USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`A localização respondeu ${response.status}.`);
  return response.json();
}

function stateCodeFromPlace(place) {
  const iso = text(place?.extratags?.["ISO3166-2"] || place?.address?.["ISO3166-2-lvl4"]);
  const match = iso.match(/BR-([A-Z]{2})/i);
  if (match && VALID_UFS.has(match[1].toUpperCase())) return match[1].toUpperCase();
  return UF_BY_STATE.get(normalize(place?.address?.state)) || "";
}

function placeKind(place) {
  return text(place?.addresstype || place?.type).toLowerCase();
}

function bboxFrom(place) {
  const raw = Array.isArray(place?.boundingbox) ? place.boundingbox.map(Number) : [];
  if (raw.length !== 4 || !raw.every(Number.isFinite)) return null;
  const [south, north, west, east] = raw;
  if (!(west < east && south < north)) return null;
  return { west, south, east, north };
}

export function chooseCityPlace(places, requestedUf = "") {
  const cityKinds = new Set(["city", "town", "municipality", "village", "borough", "administrative"]);
  const candidates = (Array.isArray(places) ? places : []).filter((place) => cityKinds.has(placeKind(place)) && bboxFrom(place));
  if (requestedUf) {
    const exactUf = candidates.find((place) => stateCodeFromPlace(place) === requestedUf);
    if (exactUf) return exactUf;
  }
  return candidates.find((place) => ["city", "town", "municipality"].includes(placeKind(place))) || candidates[0] || null;
}

function explicitQuery(query) {
  const match = text(query).match(/^(.+?)[,\-\/]\s*([A-Za-z]{2})$/);
  if (!match) return { city: text(query), uf: "" };
  const uf = match[2].toUpperCase();
  return VALID_UFS.has(uf) ? { city: text(match[1]), uf } : { city: text(query), uf: "" };
}

async function resolveCity(query) {
  const requested = explicitQuery(query);
  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "8");
  geocodeUrl.searchParams.set("countrycodes", "br");
  geocodeUrl.searchParams.set("addressdetails", "1");
  geocodeUrl.searchParams.set("extratags", "1");
  geocodeUrl.searchParams.set("q", `${requested.city}${requested.uf ? `, ${requested.uf}` : ""}, Brasil`);

  const raw = await fetchJson(geocodeUrl, 10_000);
  const places = Array.isArray(raw) ? raw : [];
  const cityPlace = chooseCityPlace(places, requested.uf);
  if (cityPlace) {
    const city = text(cityPlace?.address?.city || cityPlace?.address?.town || cityPlace?.address?.municipality || cityPlace?.address?.village || requested.city);
    const uf = stateCodeFromPlace(cityPlace) || requested.uf;
    const bbox = bboxFrom(cityPlace);
    if (city && uf && bbox) return { city, uf, bbox };
  }

  const statePlace = places.find((place) => ["state", "region"].includes(placeKind(place)));
  if (statePlace) {
    const uf = stateCodeFromPlace(statePlace);
    const label = text(statePlace?.display_name).split(",")[0] || query;
    const example = uf === "PR" ? "Curitiba, PR" : uf === "SP" ? "São Paulo, SP" : `uma cidade, ${uf || "UF"}`;
    const error = new Error(`${label} é um estado. Digite uma cidade, por exemplo: ${example}.`);
    error.status = 422;
    throw error;
  }

  const error = new Error("Não encontrei essa cidade. Tente cidade e UF, por exemplo: Curitiba, PR.");
  error.status = 404;
  throw error;
}

async function searchOverture(bbox, offset = 0) {
  const args = [
    "scripts/overture-search.py",
    String(bbox.west),
    String(bbox.south),
    String(bbox.east),
    String(bbox.north),
    String(PAGE_SIZE + 1),
    String(offset),
  ];
  const { stdout } = await execFileAsync("python3", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 70_000,
    maxBuffer: 12 * 1024 * 1024,
    env: process.env,
  });
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed?.places) ? parsed.places : [];
}

export async function GET(request) {
  const url = new URL(request.url);
  const query = text(url.searchParams.get("city") || url.searchParams.get("search")).slice(0, 90);
  const parsedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.min(parsedOffset, 100000)) : 0;
  if (query.length < 2) return Response.json({ error: "Digite uma cidade para pesquisar." }, { status: 400 });

  try {
    const resolved = await resolveCity(query);
    const rawPlaces = await searchOverture(resolved.bbox, offset);
    const hasMore = rawPlaces.length > PAGE_SIZE;
    const pagePlaces = rawPlaces.slice(0, PAGE_SIZE);
    const unique = new Map();

    for (const place of pagePlaces) {
      const lead = mapOverturePlace(place, resolved.city, resolved.uf);
      const key = lead.phoneE164 ? `phone:${lead.phoneE164}` : `place:${lead.id}`;
      const existing = unique.get(key);
      if (!existing || (lead.confidence ?? 0) > (existing.confidence ?? 0)) unique.set(key, lead);
    }

    const ordered = [...unique.values()]
      .sort((a, b) => {
        if (a.whatsappCandidate !== b.whatsappCandidate) return a.whatsappCandidate ? -1 : 1;
        if (Boolean(a.phone) !== Boolean(b.phone)) return a.phone ? -1 : 1;
        if ((a.confidence ?? 0) !== (b.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
        return a.name.localeCompare(b.name, "pt-BR");
      });
    const filtered = await filterAvailableLeads(ordered);
    const nextOffset = offset + pagePlaces.length;

    return Response.json({
      query,
      displayName: `${resolved.city}, ${resolved.uf}`,
      regionKind: "city",
      scope: "lugares comerciais da cidade",
      leads: filtered.leads,
      hiddenCount: filtered.hiddenCount,
      source: "Overture Maps",
      offset,
      nextOffset,
      hasMore,
      pageSize: PAGE_SIZE,
      attribution: "Dados de lugares: Overture Maps Foundation e fontes contribuidoras.",
      tip: "Barbearias já contatadas ou temporariamente reservadas não voltam a aparecer na busca.",
    });
  } catch (error) {
    const status = Number(error?.status) || 503;
    let message = error instanceof Error ? error.message : "Não foi possível pesquisar agora.";
    if (/timed out|timeout|aborted|fetch failed|SIGTERM|ENOENT|duckdb|httpfs|s3/i.test(message)) {
      message = "A busca de barbearias demorou mais que o normal. Tente novamente em alguns segundos.";
    }
    console.error("[C.A. Prospecção] busca falhou", { query, offset, message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: message }, { status });
  }
}
