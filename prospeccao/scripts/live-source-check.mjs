const timeout = (ms) => AbortSignal.timeout(ms);
const VALID_DDDS = new Set([
  "11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99",
]);

async function getJson(url, ms = 15000) {
  const response = await fetch(url, {
    signal: timeout(ms),
    headers: { accept: "application/json", "user-agent": "CortouAnotouProspeccao/1.2" },
  });
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return response.json();
}

function parseBrazilMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055") && digits.length === 15) digits = digits.slice(4);
  if (digits.startsWith("55") && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 12) digits = digits.slice(1);
  if (digits.length !== 11) return null;
  if (!VALID_DDDS.has(digits.slice(0, 2))) return null;
  if (digits[2] !== "9") return null;
  const subscriber = digits.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return null;
  return `55${digits}`;
}

const municipalities = await getJson("https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios?orderBy=nome");
const saoPaulo = Array.isArray(municipalities) ? municipalities.find((item) => item?.nome === "São Paulo") : null;
if (!saoPaulo?.id) throw new Error("IBGE não retornou o município de São Paulo.");

const url = new URL("https://minhareceita.org/");
url.searchParams.set("municipio", String(saoPaulo.id));
url.searchParams.set("uf", "SP");
url.searchParams.set("cnae", "9602501");
url.searchParams.set("limit", "80");
const result = await getJson(url, 20000);
if (!Array.isArray(result?.data)) throw new Error("Minha Receita retornou formato inesperado.");
if (result.data.length < 1) throw new Error("Minha Receita não retornou empresa do CNAE 9602501 em São Paulo.");

const mobiles = new Set();
let invalidPhoneFields = 0;
for (const company of result.data) {
  for (const value of [company?.ddd_telefone_1, company?.ddd_telefone_2]) {
    if (!String(value || "").trim()) continue;
    const parsed = parseBrazilMobile(value);
    if (parsed) mobiles.add(parsed);
    else invalidPhoneFields += 1;
  }
}

if (mobiles.size < 1) throw new Error("A fonte não retornou nenhum celular brasileiro válido na amostra de São Paulo.");
console.log(`Fontes reais OK: São Paulo/SP -> ${result.data.length} empresas consultadas, ${mobiles.size} celulares válidos e ${invalidPhoneFields} campos de telefone descartados.`);
