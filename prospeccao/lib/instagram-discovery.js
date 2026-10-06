import {resolveCity,searchOverture} from '../app/api/leads/search/route.js';
import {instagramUsername,ensureInstagramSchema} from './instagram-contacts.js';
import {getPool,normalizeProspectorKey} from './affiliate-claims.js';

export function profilesFromPlaces(places,city){
 const profiles=new Map();
 const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const requested=city.split(',')[0];
 for(const place of places){
  const address=(place.addresses||[]).find(x=>String(x.country||'').toUpperCase()==='BR')||(place.addresses||[])[0];
  if(address?.locality&&normalized(address.locality)!==normalized(requested))continue;
  for(const value of [...(place.socials||[]),...(place.websites||[])]){
   // Only an explicit Instagram profile URL is evidence of this business's account.
   const link=typeof value==='string'?value:value?.url;
   if(!/^https?:\/\//i.test(link||''))continue;
   try{
    const url=new URL(link);if(!['instagram.com','www.instagram.com'].includes(url.hostname.toLowerCase()))continue;
    const username=instagramUsername(link);
    if(!profiles.has(username))profiles.set(username,{username,name:String(place.name||'Barbearia').slice(0,120),city,source:'Overture Maps',sourceUrl:`https://www.instagram.com/${username}/`});
   }catch{/* Publications and malformed URLs aren't profiles. */}
  }
 }
 return [...profiles.values()];
}

export async function discoverInstagramContacts(input){
 const city=String(input.city||'').trim().slice(0,90),name=String(input.name||'').trim().slice(0,80);
 if(city.length<2){const error=Error('Digite uma cidade e UF para buscar.');error.status=400;throw error;}
 if(name.length===1){const error=Error('Digite pelo menos 2 letras do nome.');error.status=400;throw error;}
 const owner=normalizeProspectorKey(input.prospectorKey);
 const offset=Math.max(0,Math.min(100000,Math.trunc(Number(input.offset)||0)));
 const resolved=await resolveCity(city),displayName=`${resolved.city}, ${resolved.uf}`;
 // Reuse the existing source and its unchanged pagination, without WhatsApp claims/phone filters.
 const raw=await searchOverture(resolved.bbox,offset,name),page=raw.slice(0,40);
 const found=profilesFromPlaces(page,displayName);
 await ensureInstagramSchema();
 const saved=found.length?await getPool().query('SELECT username,status,queued_at FROM affiliate_instagram_contacts WHERE prospector_key=$1 AND username=ANY($2::text[])',[owner,found.map(x=>x.username)]):{rows:[]};
 const known=new Map(saved.rows.map(x=>[x.username,x]));
 const items=found.filter(x=>!known.has(x.username)||known.get(x.username).status==='ready').map(x=>({...x,status:'ready',contactedAt:null,queued:Boolean(known.get(x.username)?.queued_at)}));
 return {items,displayName,offset,nextOffset:offset+page.length,hasMore:raw.length>40,scanned:page.length,withoutProfile:page.filter(x=>!profilesFromPlaces([x],displayName).length).length,source:'Overture Maps',attribution:'Dados de lugares: Overture Maps Foundation e fontes contribuidoras.',tip:'Aparecem apenas perfis vinculados às barbearias na base pública. A conta pode ter mudado; confira o perfil antes de abordar. Não é uma busca completa dentro do Instagram.'};
}
