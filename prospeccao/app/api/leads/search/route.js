const USER_AGENT = "CortouAnotouProspeccao/1.1 (https://cortouanotou.com.br)";
const BARBER_CNAE = "9602501";
const VALID_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
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

function formatPhone(value) {
  let digits = text(value).replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return text(value);
}

function bestPhone(company) {
  return formatPhone(company?.ddd_telefone_1 || company?.ddd_telefone_2 || "");
}

function companyName(company) {
  return text(company?.nome_fantasia) || text(company?.razao_social) || "Empresa sem nome fantasia";
}

function companyAddress(company, fallbackCity) {
  const street = [text(company?.descricao_tipo_de_logradouro), text(company?.logradouro)].filter(Boolean).join(" ");
  const line = [street, text(company?.numero)].filter(Boolean).join(", ");
  return [line, text(company?.bairro), text(company?.municipio) || fallbackCity, text(company?.uf)].filter(Boolean).join(" · ");
}

function potentialFor(company) {
  const haystack = normalize(`${company?.nome_fantasia || ""} ${company?.razao_social || ""}`);
  if (/barbearia|barber|barbershop|barber shop/.test(haystack)) return "alto";
  return bestPhone(company) ? "bom" : "possível";
}

async function fetchJson(url, timeoutMs = 14_000) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
      "accept-language": "pt-BR,pt;q=0.9",
      "user-agent": USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`A fonte respondeu ${response.status}.`);
  return response.json();
}

function explicitCityAndUf(query) {
  const match = text(query).match(/^(.+?)[,\-\/]\s*([A-Za-z]{2})$/);
  if (!match) return null;
  const uf = match[2].toUpperCase();
  if (!VALID_UFS.has(uf)) return null;
  return { city: text(match[1]), uf };
}

function stateCodeFromPlace(place) {
  const iso = text(place?.extratags?.["ISO3166-2"] || place?.address?.["ISO3166-2-lvl4"]);
  const match = iso.match(/BR-([A-Z]{2})/i);
  if (match && VALID_UFS.has(match[1].toUpperCase())) return match[1].toUpperCase();
  const state = normalize(place?.address?.state);
  return UF_BY_STATE.get(state) || "";
}

function placeKind(place) {
  return text(place?.addresstype || place?.type).toLowerCase();
}

function chooseCityPlace(places) {
  const cityKinds = new Set(["city", "town", "municipality", "village", "borough"]);
  return places.find((place) => cityKinds.has(placeKind(place))) || null;
}

async function resolveQuery(query) {
  const explicit = explicitCityAndUf(query);
  if (explicit) return explicit;

  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "6");
  geocodeUrl.searchParams.set("countrycodes", "br");
  geocodeUrl.searchParams.set("addressdetails", "1");
  geocodeUrl.searchParams.set("extratags", "1");
  geocodeUrl.searchParams.set("q", `${query}, Brasil`);

  const places = await fetchJson(geocodeUrl, 10_000);
  const list = Array.isArray(places) ? places : [];
  const cityPlace = chooseCityPlace(list);
  if (cityPlace) {
    const city = text(cityPlace?.address?.city || cityPlace?.address?.town || cityPlace?.address?.municipality || cityPlace?.name || query);
    const uf = stateCodeFromPlace(cityPlace);
    if (city && uf) return { city, uf };
  }

  const statePlace = list.find((place) => ["state", "region"].includes(placeKind(place)));
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

async function ibgeMunicipality(city, uf) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;
  const municipalities = await fetchJson(url, 10_000);
  const list = Array.isArray(municipalities) ? municipalities : [];
  const wanted = normalize(city);
  const exact = list.find((item) => normalize(item?.nome) === wanted);
  if (exact?.id) return exact;

  const close = list.filter((item) => normalize(item?.nome).includes(wanted) || wanted.includes(normalize(item?.nome)));
  if (close.length === 1 && close[0]?.id) return close[0];

  const error = new Error(`Não encontrei ${city} em ${uf}. Confira o nome da cidade e tente novamente.`);
  error.status = 404;
  throw error;
}

async function searchCompanies(municipalityCode, uf) {
  const base = new URL("https://minhareceita.org/");
  base.searchParams.set("municipio", String(municipalityCode));
  base.searchParams.set("uf", uf);
  base.searchParams.set("cnae", BARBER_CNAE);
  base.searchParams.set("limit", "160");

  const first = await fetchJson(base, 18_000);
  const companies = Array.isArray(first?.data) ? [...first.data] : [];

  if (first?.cursor && companies.length < 160) {
    const secondUrl = new URL(base);
    secondUrl.searchParams.set("cursor", String(first.cursor));
    try {
      const second = await fetchJson(secondUrl, 18_000);
      if (Array.isArray(second?.data)) companies.push(...second.data);
    } catch {
      // A primeira página já é útil; não falha a busca inteira por causa da paginação.
    }
  }

  return companies;
}

function toLead(company, fallbackCity) {
  const cnpj = text(company?.cnpj).replace(/\D/g, "");
  return {
    id: cnpj ? `cnpj-${cnpj}` : `company-${Math.random().toString(36).slice(2)}`,
    name: companyName(company),
    phone: bestPhone(company),
    address: companyAddress(company, fallbackCity),
    website: "",
    sourceUrl: cnpj ? `https://minhareceita.org/${cnpj}` : "",
    source: "CNPJ público",
    potential: potentialFor(company),
    cnpj,
    status: text(company?.descricao_situacao_cadastral),
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const query = text(url.searchParams.get("city") || url.searchParams.get("search")).slice(0, 90);
  if (query.length < 2) return Response.json({ error: "Digite uma cidade para pesquisar." }, { status: 400 });

  try {
    const resolved = await resolveQuery(query);
    const municipality = await ibgeMunicipality(resolved.city, resolved.uf);
    const companies = await searchCompanies(municipality.id, resolved.uf);

    const unique = new Map();
    for (const company of companies) {
      if (normalize(company?.descricao_situacao_cadastral) !== "ativa") continue;
      const lead = toLead(company, municipality.nome || resolved.city);
      const key = lead.cnpj || `${normalize(lead.name)}|${lead.phone.replace(/\D/g, "")}`;
      if (!unique.has(key)) unique.set(key, lead);
    }

    const order = { alto: 0, bom: 1, possível: 2 };
    const leads = [...unique.values()]
      .sort((a, b) => {
        if (Boolean(a.phone) !== Boolean(b.phone)) return a.phone ? -1 : 1;
        if (a.potential !== b.potential) return order[a.potential] - order[b.potential];
        return a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 100);

    return Response.json({
      query,
      displayName: `${municipality.nome}, ${resolved.uf}`,
      regionKind: "city",
      scope: "cadastros empresariais da cidade",
      leads,
      source: "CNPJ público / Minha Receita",
      attribution: "Dados cadastrais públicos da Receita Federal, consultados via Minha Receita.",
      tip: "O CNAE 9602501 inclui barbearias e também alguns cabeleireiros/manicures; use o nome e telefone para escolher quem faz sentido abordar.",
    });
  } catch (error) {
    const status = Number(error?.status) || 503;
    let message = error instanceof Error ? error.message : "Não foi possível pesquisar agora.";
    if (/fetch failed|aborted|timeout|timed out|fonte respondeu/i.test(message)) {
      message = "A fonte pública de empresas não respondeu agora. Tente novamente em alguns segundos.";
    }
    return Response.json({ error: message }, { status });
  }
}
