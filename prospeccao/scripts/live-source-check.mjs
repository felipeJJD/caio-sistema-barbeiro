import {profilesFromPlaces,searchInstagramPlaces} from '../lib/instagram-discovery.js';
import {resolveCity} from '../app/api/leads/search/route.js';
import { GET as searchLeads } from "../app/api/leads/search/route.js";
import { GET as listCities } from "../app/api/locations/cities/route.js";

async function checkCities() {
  const response = await listCities(new Request("http://localhost/api/locations/cities?uf=PR"));
  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(`Lista de cidades do Paraná falhou com ${response.status}: ${body?.error || "erro sem mensagem"}`);
  }
  const names = Array.isArray(body?.cities) ? body.cities.map((item) => item?.name) : [];
  if (!names.includes("Colombo") || !names.includes("Curitiba")) {
    throw new Error("A lista do Paraná não contém Colombo e Curitiba.");
  }
  console.log(`Cidades do Paraná OK: ${names.length} municípios carregados.`);
}

async function fetchPage(city, offset = 0) {
  const request = new Request(`http://localhost/api/leads/search?city=${encodeURIComponent(city)}&offset=${offset}`);
  const response = await searchLeads(request);
  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(`Busca real de ${city} falhou com ${response.status}: ${body?.error || "erro sem mensagem"}`);
  }
  return body;
}

function validatePage(body, city, minimumLeads, minimumMobiles) {
  const leads = Array.isArray(body?.leads) ? body.leads : [];
  if (body?.source !== "Overture Maps") {
    throw new Error(`A rota está usando fonte inesperada em ${city}: ${body?.source || "sem fonte"}.`);
  }
  if (leads.length < minimumLeads || leads.length > 40) {
    throw new Error(`Quantidade de barbeiros inesperada em ${city}: ${leads.length}.`);
  }

  const mobiles = leads.filter((lead) => lead?.whatsappCandidate && /^55\d{11}$/.test(String(lead?.phoneE164 || "")));
  if (mobiles.length < minimumMobiles) {
    throw new Error(`A rota retornou apenas ${mobiles.length} celulares brasileiros válidos em ${city}.`);
  }

  const malformed = leads.filter((lead) => lead?.phone && !/^\(\d{2}\) \d{4,5}-\d{4}$/.test(String(lead.phone)));
  if (malformed.length) {
    throw new Error(`A rota deixou passar ${malformed.length} telefone(s) com formato inválido em ${city}.`);
  }

  if (body?.hasMore && !(Number(body?.nextOffset) > Number(body?.offset))) {
    throw new Error(`Paginação inválida em ${city}: offset ${body?.offset}, próximo ${body?.nextOffset}.`);
  }

  const sample = mobiles.slice(0, 3).map((lead) => `${lead.name}: ${lead.phone}`).join(" | ");
  console.log(`Busca real OK: ${body.displayName} -> ${leads.length} carregadas, ${mobiles.length} celulares válidos, mais=${Boolean(body.hasMore)}. Amostra: ${sample}`);
  return leads;
}

async function checkSearch(city, minimumLeads, minimumMobiles, checkNextPage = false) {
  const first = await fetchPage(city, 0);
  const firstLeads = validatePage(first, city, minimumLeads, minimumMobiles);

  if (checkNextPage) {
    if (!first.hasMore) throw new Error(`Esperava mais de uma página de barbearias em ${city}.`);
    const second = await fetchPage(city, first.nextOffset);
    const secondLeads = validatePage(second, city, 1, 1);
    const firstIds = new Set(firstLeads.map((lead) => lead.id));
    const repeated = secondLeads.filter((lead) => firstIds.has(lead.id));
    if (repeated.length) throw new Error(`A segunda página de ${city} repetiu ${repeated.length} cadastro(s) da primeira.`);
    console.log(`Paginação OK em ${city}: segunda página começou no offset ${first.nextOffset}.`);
  }
}

await checkCities();
await checkSearch("Colombo, PR", 3, 3);
await checkSearch("São Paulo, SP", 5, 5, true);

async function checkInstagram(city,minimumProfiles){
 const resolved=await resolveCity(city);
 const places=await searchInstagramPlaces(resolved.bbox,0,'',resolved.city);
 const profiles=profilesFromPlaces(places.slice(0,40),`${resolved.city}, ${resolved.uf}`);
 if(profiles.length<minimumProfiles)throw Error(`Instagram de ${city}: apenas ${profiles.length} perfis. Esperava pelo menos ${minimumProfiles}.`);
 console.log(`Instagram real OK: ${city} -> ${profiles.length} perfis públicos na primeira página; mais=${places.length>40}.`);
}
await checkInstagram('São Paulo, SP',10);
await checkInstagram('Colombo, PR',2);
