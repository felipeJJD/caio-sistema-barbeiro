const VALID_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

function text(value) {
  return String(value ?? "").trim();
}

const IBGE_TIMEOUT_MS = 4_000;
const BRASILAPI_TIMEOUT_MS = 8_000;
const LOWERCASE_WORDS = /\s(De|Da|Do|Das|Dos|E)(?=\s)/g;

async function fetchJson(url, label, timeoutMs) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
      "accept-language": "pt-BR,pt;q=0.9",
      "user-agent": "CortouAnotouProspeccao/1.3 (https://cortouanotou.com.br)",
    },
  });

  if (!response.ok) throw new Error(`${label} respondeu ${response.status}.`);
  return response.json();
}

function requireCities(cities, label) {
  if (!cities.length) throw new Error(`${label} não retornou cidades.`);
  return cities;
}

async function fetchFromIbge(uf) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;
  const payload = await fetchJson(url, "IBGE", IBGE_TIMEOUT_MS);
  const municipalities = Array.isArray(payload) ? payload : [];

  return requireCities(
    municipalities
      .filter((item) => item?.id && text(item?.nome))
      .map((item) => ({ id: Number(item.id), name: text(item.nome) })),
    "IBGE",
  );
}

// A BrasilAPI devolve os nomes em MAIÚSCULAS e, quando usa a Wikipédia como origem,
// com o desambiguador do estado no fim (ex.: "COLOMBO (PARANÁ)").
function toCityName(value) {
  return text(value)
    .replace(/\s*\([^)]*\)$/, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => separator + letter.toLocaleUpperCase("pt-BR"))
    .replace(LOWERCASE_WORDS, (word) => word.toLowerCase())
    .replace(/\sD'/g, " d'");
}

async function fetchFromBrasilApi(uf) {
  const url = `https://brasilapi.com.br/api/ibge/municipios/v1/${encodeURIComponent(uf)}?providers=dados-abertos-br,gov,wikipedia`;
  const payload = await fetchJson(url, "BrasilAPI", BRASILAPI_TIMEOUT_MS);
  const municipalities = Array.isArray(payload) ? payload : [];

  return requireCities(
    municipalities
      .map((item) => ({ id: Number(item?.codigo_ibge), name: toCityName(item?.nome) }))
      .filter((city) => city.id && city.name)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    "BrasilAPI",
  );
}

async function fetchCities(uf) {
  try {
    return await fetchFromIbge(uf);
  } catch {
    return fetchFromBrasilApi(uf);
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const uf = text(url.searchParams.get("uf")).toUpperCase();

  if (!VALID_UFS.has(uf)) {
    return Response.json({ error: "Selecione um estado válido." }, { status: 400 });
  }

  try {
    const cities = await fetchCities(uf);

    return Response.json(
      { uf, cities },
      { headers: { "cache-control": "public, max-age=21600, stale-while-revalidate=86400" } },
    );
  } catch {
    return Response.json(
      { error: "Não consegui carregar as cidades agora. Tente novamente em alguns segundos." },
      { status: 503 },
    );
  }
}
