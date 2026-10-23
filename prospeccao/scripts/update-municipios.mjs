// Atualiza o snapshot oficial de municípios usado pela lista de cidades.
//
// O Railway não consegue acessar servicodados.ibge.gov.br (timeout de conexão),
// então a rota /api/locations/cities lê data/municipios-ibge.json em vez de
// consultar o IBGE em tempo de execução. Rode este script de uma máquina com
// acesso ao IBGE quando surgirem municípios novos e commite o arquivo gerado:
//
//   node scripts/update-municipios.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FONTE = "IBGE API v1 localidades/municipios";
const URL_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
const ARQUIVO = fileURLToPath(new URL("../data/municipios-ibge.json", import.meta.url));
const MINIMO_MUNICIPIOS = 5570;
const TOTAL_UFS = 27;

// A UF vem por regiao-imediata (presente em todos os municípios) ou, em
// versões antigas da API, por microrregiao (pode ser null em municípios novos).
function siglaDaUf(municipio) {
  return (
    municipio?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ||
    municipio?.microrregiao?.mesorregiao?.UF?.sigla ||
    ""
  );
}

const resposta = await fetch(URL_IBGE, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(60_000),
});
if (!resposta.ok) throw new Error(`IBGE respondeu ${resposta.status}.`);
const municipios = await resposta.json();
if (!Array.isArray(municipios)) throw new Error("IBGE devolveu um formato inesperado.");

const porUf = {};
for (const municipio of municipios) {
  const uf = siglaDaUf(municipio);
  const id = Number(municipio?.id);
  const nome = String(municipio?.nome ?? "").trim();
  if (!uf || !id || !nome) throw new Error(`Município sem UF, id ou nome: ${JSON.stringify(municipio)}`);
  (porUf[uf] ??= []).push([id, nome]);
}

const ufs = Object.keys(porUf).sort();
for (const uf of ufs) porUf[uf].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

const total = municipios.length;
if (ufs.length !== TOTAL_UFS || total < MINIMO_MUNICIPIOS) {
  throw new Error(`Snapshot suspeito: ${ufs.length} UFs e ${total} municípios.`);
}
if (new Set(municipios.map((item) => item.id)).size !== total) throw new Error("Há ids de município repetidos.");

// Uma UF por linha para o diff do git continuar legível.
const linhas = ufs.map((uf) => `    ${JSON.stringify(uf)}: ${JSON.stringify(porUf[uf])}`);
const conteudo = [
  "{",
  `  "fonte": ${JSON.stringify(FONTE)},`,
  `  "geradoEm": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`,
  '  "ufs": {',
  linhas.join(",\n"),
  "  }",
  "}",
  "",
].join("\n");

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(ARQUIVO, conteudo);
console.log(`Snapshot gravado em ${ARQUIVO}: ${total} municípios em ${ufs.length} UFs.`);
