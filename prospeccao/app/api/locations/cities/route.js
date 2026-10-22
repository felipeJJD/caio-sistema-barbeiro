import municipios from "../../../../data/municipios-ibge.json" with { type: "json" };

const VALID_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

function text(value) {
  return String(value ?? "").trim();
}

// A lista vem de um snapshot oficial do IBGE (data/municipios-ibge.json, gerado por
// scripts/update-municipios.mjs): o Railway não alcança servicodados.ibge.gov.br.
function listCities(uf) {
  const rows = municipios?.ufs?.[uf];
  if (!Array.isArray(rows) || !rows.length) throw new Error(`Snapshot sem municípios para ${uf}.`);
  return rows.map(([id, name]) => ({ id, name }));
}

export async function GET(request) {
  const url = new URL(request.url);
  const uf = text(url.searchParams.get("uf")).toUpperCase();

  if (!VALID_UFS.has(uf)) {
    return Response.json({ error: "Selecione um estado válido." }, { status: 400 });
  }

  try {
    return Response.json(
      { uf, cities: listCities(uf) },
      { headers: { "cache-control": "public, max-age=21600, stale-while-revalidate=86400" } },
    );
  } catch {
    return Response.json(
      { error: "Não consegui carregar as cidades agora. Tente novamente em alguns segundos." },
      { status: 503 },
    );
  }
}
