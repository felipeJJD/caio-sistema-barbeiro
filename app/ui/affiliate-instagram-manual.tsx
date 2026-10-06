"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {lockAffiliateScroll} from '../../lib/affiliate-scroll-lock';
import styles from './affiliate-instagram-manual.module.css';
import {AffiliateInstagramSender} from './affiliate-instagram-sender';
type Contact={username:string;name:string;city:string;status:'ready'|'contacted'|'blocked';contactedAt:string|null;queued?:boolean};
type Props={name:string;signupUrl:string;links:Array<{id:number;label:string;url:string}>;campaignId:number|null;onChooseCampaign:(id:number|null)=>void};
const STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
  ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"],
  ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;
type City={id:number|string;name:string};
type SearchPage={items:Contact[];displayName:string;nextOffset:number;hasMore:boolean;scanned:number;withoutProfile:number;tip:string};
export function AffiliateInstagramManual({name,signupUrl,links,campaignId,onChooseCampaign}:Props){
 const [view,setView]=useState<'search'|'queue'|'history'|'all'>('search');
 const [queueChecked,setQueueChecked]=useState<string[]>([]);
 const [items,setItems]=useState<Contact[]>([]),[selected,setSelected]=useState<Contact|null>(null);
 const [uf,setUf]=useState('PR'),[city,setCity]=useState('Colombo'),[cities,setCities]=useState<City[]>([]),[citiesLoading,setCitiesLoading]=useState(true),[citiesError,setCitiesError]=useState(''),[citiesRetry,setCitiesRetry]=useState(0);
 const [businessName,setBusinessName]=useState(''),[search,setSearch]=useState<SearchPage|null>(null),[searching,setSearching]=useState(false),[searchingMore,setSearchingMore]=useState(false);
 const [checked,setChecked]=useState<string[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[offset,setOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [manualName,setManualName]=useState(''),[manualUsername,setManualUsername]=useState('');
 const [template,setTemplate]=useState(`Oi tudo bem sou o ${name.split(/\s+/)[0]}\nVi a {barbearia} e queria te apresentar o Cortou Anotou um app pra facilitar a agenda e a gestão da barbearia\nSe quiser conhecer aqui tá o link {link}`);
 const baseText=template.replaceAll('{barbearia}',selected?.name||'sua barbearia').replaceAll('{link}',signupUrl);
 const text=signupUrl&&!baseText.includes(signupUrl)?`${baseText.trim()}\n${signupUrl}`:baseText;
 const textRef=useRef<HTMLTextAreaElement>(null),actionRef=useRef(false),searchRef=useRef(false),searchVersion=useRef(0),version=useRef(0);
 const dialogRef=useRef<HTMLDialogElement>(null),searchController=useRef<AbortController|null>(null);
 const detailsOpen=Boolean(selected);
 useEffect(()=>{if(!detailsOpen)return;if(!dialogRef.current?.open)dialogRef.current?.showModal();return lockAffiliateScroll();},[detailsOpen]);
 const searchQuery=useRef({city:'',uf:'',name:''});
 useEffect(()=>{
  let active=true;const controller=new window.AbortController();const timer=window.setTimeout(()=>controller.abort(),15000);
  fetch(`/api/affiliate/prospecting/cities?uf=${encodeURIComponent(uf)}`,{cache:'no-store',signal:controller.signal})
   .then(async response=>{const payload=await response.json();if(!response.ok)throw Error(payload.error||'Não consegui carregar as cidades.');return Array.isArray(payload.cities)?payload.cities:[];})
   .then((available:City[])=>{if(!active)return;setCities(available);setCity(current=>available.some(item=>item.name===current)?current:'');})
   .catch(()=>{if(active)setCitiesError('Não consegui carregar as cidades. Toque em Recarregar cidades.');})
   .finally(()=>{window.clearTimeout(timer);if(active)setCitiesLoading(false);});
  return()=>{active=false;controller.abort();window.clearTimeout(timer);};
 },[uf,citiesRetry]);
 const load=useCallback(async(nextOffset=0)=>{
  const current=++version.current;setLoading(true);
  try{
   const params=new URLSearchParams({view:view==='search'?'queue':view,query:query.trim(),offset:String(nextOffset)});
   const response=await fetch(`/api/affiliate/prospecting/instagram?${params}`,{cache:'no-store'}),payload=await response.json();
   if(!response.ok)throw Error(payload.error||'Não foi possível carregar os contatos.');
   if(current!==version.current)return;
   setItems(previous=>nextOffset?[...new Map([...previous,...(payload.items||[])].map(item=>[item.username,item])).values()]:payload.items||[]);
   setHasMore(Boolean(payload.hasMore));setOffset(Number(payload.nextOffset)||0);
  }catch(cause){if(current===version.current)setError(cause instanceof Error?cause.message:'Falha ao carregar.');}
  finally{if(current===version.current)setLoading(false);}
 },[view,query]);
 useEffect(()=>{const requests=version;const timer=window.setTimeout(()=>void load(),query?300:0);return()=>{window.clearTimeout(timer);++requests.current;};},[load,query]);
 useEffect(()=>{const requests=searchVersion,controllers=searchController;return()=>{++requests.current;controllers.current?.abort();};},[]);
 async function find(nextOffset=0){
  if(searchRef.current)return;
  const requestQuery=nextOffset?searchQuery.current:{city:city.trim(),uf,name:businessName.trim()};
  if(!requestQuery.city||citiesLoading){setError('Selecione o estado e a cidade.');return;}
  searchQuery.current=requestQuery;searchRef.current=true;setSearching(true);setSearchingMore(Boolean(nextOffset));setError('');setNotice('');
  const controller=new window.AbortController();searchController.current=controller;const timer=window.setTimeout(()=>controller.abort(),85000);
  const current=++searchVersion.current;if(!nextOffset){setSearch(null);setChecked([]);}
  try{
   const params=new URLSearchParams({discover:'1',city:requestQuery.city,uf:requestQuery.uf,name:requestQuery.name,offset:String(nextOffset)});
   const response=await fetch(`/api/affiliate/prospecting/instagram?${params}`,{cache:'no-store',signal:controller.signal}),payload=await response.json();
   if(!response.ok)throw Error(response.status>=500?'A pesquisa demorou ou está indisponível. Tente novamente.':payload.error||'Não foi possível buscar.');
   if(current!==searchVersion.current)return;
   setSearch(previous=>({...payload,items:nextOffset?[...new Map([...(previous?.items||[]),...(payload.items||[])].map(item=>[item.username,item])).values()]:payload.items||[],scanned:(nextOffset?previous?.scanned||0:0)+(payload.scanned||0),withoutProfile:(nextOffset?previous?.withoutProfile||0:0)+(payload.withoutProfile||0)}));
  }catch(cause){if(current===searchVersion.current)setError(cause instanceof Error?cause.message:'Não foi possível buscar.');}
  finally{window.clearTimeout(timer);searchRef.current=false;if(current===searchVersion.current){setSearching(false);setSearchingMore(false);}}
 }
 async function mutate(action:string,contacts:Contact[]=[]){
  if(actionRef.current||searchRef.current)return;
  if(!['save_instagram','instagram_enqueue'].includes(action)&&!selected)return;
  if(action==='instagram_contacted'&&!window.confirm(`Você já enviou o direct para @${selected?.username} pelo Instagram?`))return;
  if(action==='instagram_block'&&!window.confirm('Marcar este perfil para não contatar mais?'))return;
  actionRef.current=true;setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/affiliate/prospecting/instagram',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,username:action==='save_instagram'?manualUsername:selected?.username,name:manualName,city:city?`${city}, ${uf}`:'',items:contacts})}),payload=await response.json();
   if(!response.ok)throw Error(payload.error||'Não foi possível salvar.');
   if(action==='instagram_enqueue'){
    const added=new Set((payload.items||[]).map((item:Contact)=>item.username));
    setSearch(previous=>previous?{...previous,items:previous.items.map(item=>added.has(item.username)?{...item,queued:true}:item)}:previous);
    setChecked([]);setNotice(`${payload.queued||0} perfil(is) na fila de abordagens.${payload.skipped?' Perfis já contatados ou bloqueados foram ignorados.':''}`);
   }else{
    setSelected(payload.item);setNotice(action==='save_instagram'?'Perfil salvo.':action==='instagram_contacted'?'Envio registrado por você.':action==='instagram_unqueue'?'Perfil retirado da fila.':'Perfil marcado para não contatar.');
    if(action==='save_instagram'){setManualName('');setManualUsername('');}
    if(action==='instagram_contacted'||action==='instagram_block')setSearch(previous=>previous?{...previous,items:previous.items.filter(item=>item.username!==payload.item.username)}:previous);
    if(action==='instagram_unqueue')setSearch(previous=>previous?{...previous,items:previous.items.map(item=>item.username===payload.item.username?{...item,queued:false}:item)}:previous);
   }
   void load();
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar.');}
  finally{actionRef.current=false;setBusy(false);}
 }
 function legacyCopy(){
  const field=textRef.current;if(!field)return false;
  field.focus();field.select();field.setSelectionRange(0,text.length);
  try{return document.execCommand('copy');}catch{return false;}
 }
 async function copy(){
  setNotice('');setError('');
  if(selected?.status==='blocked'){setError('Este perfil está marcado para não contatar.');return;}
  if(!signupUrl){setError('Ative um link em Gerar links ou escolha uma campanha.');return;}
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else if(!legacyCopy())throw Error();
   setNotice('Mensagem copiada. Abra o perfil, toque em Mensagem e cole no Instagram.');
  }catch{
   if(legacyCopy())setNotice('Mensagem copiada. Abra o perfil e cole no Instagram.');
   else setError('A mensagem está selecionada. Toque nela e escolha Copiar no menu do celular.');
  }
 }
 const candidates=(search?.items||[]).filter(item=>!item.queued);
 const chosen=candidates.filter(item=>checked.includes(item.username)).slice(0,40);
 function changeView(next:typeof view){setView(next);setQuery('');setNotice('');setError('');}
 return <section className={styles.shell} aria-label="Prospecção pelo Instagram">
  <div className={styles.tabs} role="group" aria-label="Etapas do Instagram">{([['search','Buscar barbearias'],['queue','Fila de abordagens'],['history','Histórico'],['all','Perfis salvos']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={view===key} disabled={busy} onClick={()=>changeView(key)}>{label}</button>)}</div>
  <p className={styles.helper}>Busque barbearias, coloque na fila e conecte seu Instagram para enviar sua abordagem.</p>
  <AffiliateInstagramSender name={name} signupUrl={signupUrl} links={links} campaignId={campaignId} onChooseCampaign={onChooseCampaign} selectedUsernames={view==='queue'?items.filter(item=>item.status==='ready'&&item.queued&&queueChecked.includes(item.username)).map(item=>item.username).slice(0,40):[]} showQueue={view==='queue'} onChanged={()=>void load()} />
  {view==='search'&&<div className={styles.card}><h2>Encontrar barbearias</h2><p>Selecione o estado e a cidade para encontrar perfis de barbearias.</p>
   <form onSubmit={event=>{event.preventDefault();void find();}}>
    <label>Estado<select disabled={searching||busy} value={uf} onChange={event=>{setCitiesLoading(true);setCitiesError('');setCities([]);setCity('');setUf(event.target.value);setSearch(null);setChecked([]);}}>{STATES.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
    <label>Cidade<select required disabled={citiesLoading||searching||busy} value={city} onChange={event=>{setCity(event.target.value);setSearch(null);setChecked([]);}}><option value="">{citiesLoading?'Carregando cidades...':'Selecione a cidade'}</option>{cities.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
    {citiesError&&<p role="alert">{citiesError}<button type="button" className={styles.secondary} onClick={()=>{setCitiesLoading(true);setCitiesError('');setCitiesRetry(previous=>previous+1);}}>Recarregar cidades</button></p>}
    <label>Nome da barbearia <small>(opcional)</small><input disabled={searching||busy} value={businessName} maxLength={80} onChange={event=>setBusinessName(event.target.value)} /></label>
    <button disabled={searching||busy||citiesLoading||!city}>{searching&&!searchingMore?'Buscando perfis...':'Buscar barbearias'}</button>
   </form>
   {search&&<><h3>{search.items.length} perfis encontrados · {search.displayName}</h3><p className={styles.helper}>{search.tip}</p>
    <div className={styles.list}>{search.items.map(item=><label className={styles.result} key={item.username}><input type="checkbox" checked={checked.includes(item.username)} disabled={busy||Boolean(item.queued)||(!checked.includes(item.username)&&checked.length>=40)} onChange={event=>setChecked(previous=>event.target.checked?[...previous,item.username]:previous.filter(value=>value!==item.username))} /><span><strong>{item.name}</strong><small>@{item.username} · {item.city}{item.queued?' · Na fila':''}</small><a href={`https://www.instagram.com/${item.username}/`} target="_blank" rel="noopener noreferrer">Conferir perfil</a></span></label>)}</div>
    {!search.items.length&&<p>Nenhum novo perfil foi encontrado nesta pesquisa. {search.hasMore?'Consulte mais barbearias abaixo.':'Tente outra cidade ou remova o filtro de nome.'}</p>}
    <div className={styles.actions}><button type="button" disabled={busy||!chosen.length} onClick={()=>void mutate('instagram_enqueue',chosen)}>Colocar {chosen.length||''} na fila</button>{search.hasMore&&<button type="button" className={styles.secondary} disabled={searching||busy} onClick={()=>void find(search.nextOffset)}>{searching?'Buscando mais...':'Buscar mais barbearias'}</button>}</div>
    <p className={styles.helper}>Selecione até 40 perfis por vez. Perfis públicos. Dados de lugares: Overture Maps Foundation e fontes contribuidoras.</p>
   </>}
  </div>}
  {view!=='search'&&<div className={styles.card}><h2>{view==='queue'?'Fila de abordagens':view==='history'?'Contatados e bloqueados':'Seus perfis salvos'}</h2>
   {view==='queue'&&<><p>Selecione até 40 barbearias para enviar pelo Instagram conectado. Toque no nome para abrir a ficha.</p><button type="button" className={styles.secondary} disabled={loading||busy||!items.length} onClick={()=>setQueueChecked(previous=>previous.length?[]:items.filter(item=>item.status==='ready'&&item.queued).slice(0,40).map(item=>item.username))}>{queueChecked.length?'Limpar seleção':'Selecionar as primeiras 40'}</button></>}
   <label>Buscar nesta lista<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nome, @ ou cidade" /></label>
   <div className={styles.list}>{items.map(item=><div key={item.username} className={styles.queueRow}>{view==='queue'&&<input aria-label={`Selecionar ${item.name}`} type="checkbox" checked={queueChecked.includes(item.username)} disabled={busy||(!queueChecked.includes(item.username)&&queueChecked.length>=40)} onChange={event=>setQueueChecked(previous=>event.target.checked?[...previous,item.username]:previous.filter(value=>value!==item.username))} />}<button type="button" className={styles.row} disabled={busy} onClick={()=>{setSelected(item);setNotice('');setError('');}}><strong>{item.name}</strong><span>@{item.username}{item.city?` · ${item.city}`:''}</span><small>{item.status==='blocked'?'Não contatar':item.status==='contacted'?'Direct registrado':item.queued?'Aguardando sua abordagem':'Sem envio registrado'}</small></button></div>)}</div>
   {loading&&<p role="status">Carregando...</p>}{!loading&&!items.length&&<p>{view==='queue'?'Sua fila está vazia. Busque barbearias por cidade e selecione os perfis.':'Nenhum perfil encontrado.'}</p>}{hasMore&&<button type="button" disabled={loading} onClick={()=>void load(offset)}>Ver mais perfis</button>}
  </div>}
  {selected&&<dialog ref={dialogRef} className={styles.dialog} aria-label={`Detalhes de ${selected.name}`} onCancel={event=>{if(busy)event.preventDefault();else setSelected(null);}} onClick={event=>{if(event.target===event.currentTarget&&!busy)setSelected(null);}}><div className={styles.dialogHeader}><strong>{selected.name}</strong><button type="button" disabled={busy} onClick={()=>setSelected(null)} aria-label="Fechar ficha">×</button></div><div className={`${styles.card} ${styles.dialogBody}`}><h2>{selected.name}</h2><p>@{selected.username} · {selected.status==='blocked'?'Não contatar':selected.status==='contacted'?'Direct registrado por você':'Ainda sem envio registrado'}</p>
   {links.length>0&&<label>Link da campanha<select value={campaignId??''} onChange={event=>onChooseCampaign(event.target.value?Number(event.target.value):null)}><option value="">Link padrão</option>{links.map(link=><option key={link.id} value={link.id}>{link.label}</option>)}</select></label>}
   <label>Mensagem com seu link<textarea ref={textRef} rows={6} maxLength={2000} value={text} onChange={event=>setTemplate(event.target.value.replaceAll(signupUrl||'\u0000','{link}').replaceAll(selected.name,'{barbearia}'))} /></label>
   <p className={styles.helper}>Edite aqui antes de copiar. O nome e o link serão adaptados para os próximos perfis.</p>
   {!signupUrl&&<p role="alert">Ative um link em Gerar links para preparar a mensagem.</p>}
   <div className={styles.actions}><button type="button" disabled={selected.status==='blocked'} onClick={()=>void copy()}>Copiar mensagem com meu link</button><a href={`https://www.instagram.com/${selected.username}/`} target="_blank" rel="noopener noreferrer">Abrir perfil no Instagram</a>
    {selected.status==='ready'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void mutate('instagram_contacted')}>Já enviei o direct</button>}
    {selected.queued&&selected.status==='ready'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void mutate('instagram_unqueue')}>Retirar da fila</button>}
    {selected.status!=='blocked'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void mutate('instagram_block')}>Não contatar mais</button>}
    <button type="button" className={styles.secondary} disabled={busy} onClick={()=>setSelected(null)}>Fechar ficha</button>
   </div><p className={styles.helper}>Copiar e abrir o perfil não registram envio. Confirme somente depois de mandar o direct.</p>
   {(error||notice)&&<p className={error?styles.error:styles.notice} role={error?'alert':'status'}>{error||notice}</p>}
  </div></dialog>}
  {!selected&&(error||notice)&&<p className={error?styles.error:styles.notice} role={error?'alert':'status'}>{error||notice}</p>}
  {view==='all'&&<details className={styles.card}><summary>Adicionar um perfil conhecido</summary><form onSubmit={event=>{event.preventDefault();void mutate('save_instagram');}}>
   <label>Nome da barbearia<input disabled={busy} required value={manualName} maxLength={120} onChange={event=>setManualName(event.target.value)} /></label>
   <label>@ ou link do perfil<input disabled={busy} required value={manualUsername} autoCapitalize="none" autoCorrect="off" maxLength={400} onChange={event=>setManualUsername(event.target.value)} /></label>
   <button disabled={busy}>Salvar perfil</button>
  </form></details>}
 </section>;
}
