const timeout = (ms) => AbortSignal.timeout(ms);

async function getJson(url, ms = 15000) {
  const response = await fetch(url, {
    signal: timeout(ms),
    headers: { accept: "application/json", "user-agent": "CortouAnotouProspeccao/1.1" },
  });
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return response.json();
}

const municipalities = await getJson("https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios?orderBy=nome");
const saoPaulo = Array.isArray(municipalities) ? municipalities.find((item) => item?.nome === "São Paulo") : null;
if (!saoPaulo?.id) throw new Error("IBGE não retornou o município de São Paulo.");

const url = new URL("https://minhareceita.org/");
url.searchParams.set("municipio", String(saoPaulo.id));
url.searchParams.set("uf", "SP");
url.searchParams.set("cnae", "9602501");
url.searchParams.set("limit", "1");
const result = await getJson(url, 20000);
if (!Array.isArray(result?.data)) throw new Error("Minha Receita retornou formato inesperado.");
if (result.data.length < 1) throw new Error("Minha Receita não retornou empresa do CNAE 9602501 em São Paulo.");

const company = result.data[0];
console.log(`Fontes reais OK: São Paulo/SP -> ${company?.nome_fantasia || company?.razao_social || "empresa encontrada"}`);
