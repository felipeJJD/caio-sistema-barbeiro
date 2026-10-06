"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {lockAffiliateScroll} from '../../lib/affiliate-scroll-lock';
import styles from './affiliate-instagram-manual.module.css';
type Contact={username:string;name:string;city:string;status:'ready'|'contacted'|'blocked';contactedAt:string|null;queued?:boolean};
type Props={name:string;signupUrl:string;links:Array<{id:number;label:string;url:string}>;campaignId:number|null;onChooseCampaign:(id:number|null)=>void};
type SearchPage={items:Contact[];displayName:string;nextOffset:number;hasMore:boolean;scanned:number;withoutProfile:number;tip:string};
export function AffiliateInstagramManual({name,signupUrl,links,campaignId,onChooseCampaign}:Props){
 const [view,setView]=useState<'search'|'queue'|'history'|'all'>('search');
 const [items,setItems]=useState<Contact[]>([]),[selected,setSelected]=useState<Contact|null>(null);
 const [city,setCity]=useState(''),[businessName,setBusinessName]=useState(''),[search,setSearch]=useState<SearchPage|null>(null),[searching,setSearching]=useState(false);
 const [checked,setChecked]=useState<string[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[offset,setOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [manualName,setManualName]=useState(''),[manualUsername,setManualUsername]=useState('');
 const [template,setTemplate]=useState(`Oi tudo bem sou o ${name.split(/\s+/)[0]}\nVi a {barbearia} e queria te apresentar o Cortou Anotou um app pra facilitar a agenda e a gestão da barbearia\nSe quiser conhecer aqui tá o link {link}`);
 const baseText=template.replaceAll('{barbearia}',selected?.name||'sua barbearia').replaceAll('{link}',signupUrl);
 const text=signupUrl&&!baseText.includes(signupUrl)?`${baseText.trim()}\n${signupUrl}`:baseText;
 const textRef=useRef<HTMLTextAreaElement>(null),actionRef=useRef(false),searchRef=useRef(false),searchVersion=useRef(0),version=useRef(0);
 const dialogRef=useRef<HTMLDialogElement>(null);
 const detailsOpen=Boolean(selected);
 useEffect(()=>{if(!detailsOpen)return;if(!dialogRef.current?.open)dialogRef.current?.showModal();return lockAffiliateScroll();},[detailsOpen]);
 const searchQuery=useRef({city:'',name:''});
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
 useEffect(()=>{const requests=searchVersion;return()=>{++requests.current;};},[]);
 async function find(nextOffset=0){
  if(searchRef.current)return;
  const requestQuery=nextOffset?searchQuery.current:{city:city.trim(),name:businessName.trim()};
  if(requestQuery.city.length<2){setError('Digite a cidade e UF, por exemplo: Colombo, PR.');return;}
  searchQuery.current=requestQuery;searchRef.current=true;setSearching(true);setError('');setNotice('');
  const current=++searchVersion.current;if(!nextOffset){setSearch(null);setChecked([]);}
  try{
   const params=new URLSearchParams({discover:'1',city:requestQuery.city,name:requestQuery.name,offset:String(nextOffset)});
   const response=await fetch(`/api/affiliate/prospecting/instagram?${params}`,{cache:'no-store'}),payload=await response.json();
   if(!response.ok)throw Error(response.status>=500?'A pesquisa demorou ou está indisponível. Tente novamente.':payload.error||'Não foi possível buscar.');
   if(current!==searchVersion.current)return;
   setSearch(previous=>({...payload,items:nextOffset?[...new Map([...(previous?.items||[]),...(payload.items||[])].map(item=>[item.username,item])).values()]:payload.items||[],scanned:(nextOffset?previous?.scanned||0:0)+(payload.scanned||0),withoutProfile:(nextOffset?previous?.withoutProfile||0:0)+(payload.withoutProfile||0)}));
  }catch(cause){if(current===searchVersion.current)setError(cause instanceof Error?cause.message:'Não foi possível buscar.');}
  finally{searchRef.current=false;if(current===searchVersion.current)setSearching(false);}
 }
 async function mutate(action:string,contacts:Contact[]=[]){
  if(actionRef.current||searchRef.current)return;
  if(!['save_instagram','instagram_enqueue'].includes(action)&&!selected)return;
  if(action==='instagram_contacted'&&!window.confirm(`Você já enviou o direct para @${selected?.username} pelo Instagram?`))return;
  if(action==='instagram_block'&&!window.confirm('Marcar este perfil para não contatar mais?'))return;
  actionRef.current=true;setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/affiliate/prospecting/instagram',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,username:action==='save_instagram'?manualUsername:selected?.username,name:manualName,city,items:contacts})}),payload=await response.json();
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
  <p className={styles.helper}>A fila organiza os contatos. O primeiro direct é enviado por você no Instagram: a integração oficial não permite iniciar uma conversa automaticamente com um perfil que nunca escreveu para sua conta.</p>
  {view==='search'&&<div className={styles.card}><h2>Encontrar barbearias</h2><p>Escolha a cidade. Os perfis encontrados aparecem abaixo, sem precisar cadastrar um por um.</p>
   <form onSubmit={event=>{event.preventDefault();void find();}}>
    <label>Cidade e UF<input required disabled={searching||busy} value={city} maxLength={90} placeholder="Colombo, PR" onChange={event=>setCity(event.target.value)} /></label>
    <label>Nome da barbearia <small>(opcional)</small><input disabled={searching||busy} value={businessName} maxLength={80} onChange={event=>setBusinessName(event.target.value)} /></label>
    <button disabled={searching||busy}>{searching?'Buscando perfis...':'Buscar barbearias'}</button>
   </form>
   {search&&<><h3>{search.items.length} perfis encontrados · {search.displayName}</h3><p className={styles.helper}>{search.scanned} cadastros consultados. {search.withoutProfile} sem perfil utilizável para essa cidade na base. {search.tip}</p>
    <div className={styles.list}>{search.items.map(item=><label className={styles.result} key={item.username}><input type="checkbox" checked={checked.includes(item.username)} disabled={busy||Boolean(item.queued)||(!checked.includes(item.username)&&checked.length>=40)} onChange={event=>setChecked(previous=>event.target.checked?[...previous,item.username]:previous.filter(value=>value!==item.username))} /><span><strong>{item.name}</strong><small>@{item.username} · {item.city}{item.queued?' · Na fila':''}</small><a href={`https://www.instagram.com/${item.username}/`} target="_blank" rel="noopener noreferrer">Conferir perfil</a></span></label>)}</div>
    {!search.items.length&&<p>Nenhum perfil com link cadastrado foi encontrado nesta página. {search.hasMore?'Consulte mais barbearias abaixo.':'A base pode não ter perfis nesta cidade.'}</p>}
    <div className={styles.actions}><button type="button" disabled={busy||!chosen.length} onClick={()=>void mutate('instagram_enqueue',chosen)}>Colocar {chosen.length||''} na fila</button>{search.hasMore&&<button type="button" className={styles.secondary} disabled={searching||busy} onClick={()=>void find(search.nextOffset)}>{searching?'Buscando mais...':'Buscar mais barbearias'}</button>}</div>
    <p className={styles.helper}>Selecione até 40 perfis por vez. Fonte: Overture Maps Foundation e fontes contribuidoras.</p>
   </>}
  </div>}
  {view!=='search'&&<div className={styles.card}><h2>{view==='queue'?'Fila de abordagens':view==='history'?'Contatados e bloqueados':'Seus perfis salvos'}</h2>
   {view==='queue'&&<p>Toque na barbearia para preparar a mensagem. Depois de enviar no Instagram, confirme o envio para retirá-la da fila.</p>}
   <label>Buscar nesta lista<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nome, @ ou cidade" /></label>
   <div className={styles.list}>{items.map(item=><button type="button" key={item.username} className={styles.row} disabled={busy} onClick={()=>{setSelected(item);setNotice('');setError('');}}><strong>{item.name}</strong><span>@{item.username}{item.city?` · ${item.city}`:''}</span><small>{item.status==='blocked'?'Não contatar':item.status==='contacted'?'Direct registrado':item.queued?'Aguardando sua abordagem':'Sem envio registrado'}</small></button>)}</div>
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
