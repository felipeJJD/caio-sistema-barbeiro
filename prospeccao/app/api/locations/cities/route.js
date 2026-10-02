const VALID_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

function text(value) {
  return String(value ?? "").trim();
}

async function fetchMunicipalities(uf) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "accept-language": "pt-BR,pt;q=0.9",
      "user-agent": "CortouAnotouProspeccao/1.3 (https://cortouanotou.com.br)",
    },
  });

  if (!response.ok) throw new Error(`IBGE respondeu ${response.status}.`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

export async function GET(request) {
  const url = new URL(request.url);
  const uf = text(url.searchParams.get("uf")).toUpperCase();

  if (!VALID_UFS.has(uf)) {
    return Response.json({ error: "Selecione um estado válido." }, { status: 400 });
  }

  try {
    const municipalities = await fetchMunicipalities(uf);
    const cities = municipalities
      .filter((item) => item?.id && text(item?.nome))
      .map((item) => ({ id: Number(item.id), name: text(item.nome) }));

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
