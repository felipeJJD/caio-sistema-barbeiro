"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './affiliate-instagram-manual.module.css';
type Contact={username:string;name:string;city:string;status:'ready'|'contacted'|'blocked';contactedAt:string|null};
type Props={name:string;signupUrl:string;links:Array<{id:number;label:string;url:string}>;campaignId:number|null;onChooseCampaign:(id:number|null)=>void};
export function AffiliateInstagramManual({name,signupUrl,links,campaignId,onChooseCampaign}:Props){
 const [items,setItems]=useState<Contact[]>([]),[selected,setSelected]=useState<Contact|null>(null);
 const [business,setBusiness]=useState(''),[username,setUsername]=useState(''),[city,setCity]=useState('');
 const [query,setQuery]=useState(''),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[offset,setOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [template,setTemplate]=useState(`Oi tudo bem sou o ${name.split(/\s+/)[0]}\nVi a {barbearia} e queria te apresentar o Cortou Anotou um app pra facilitar a agenda e a gestão da barbearia\nSe quiser conhecer aqui tá o link {link}`);
 const text=template.replaceAll('{barbearia}',selected?.name||'sua barbearia').replaceAll('{link}',signupUrl);
 const textRef=useRef<HTMLTextAreaElement>(null),actionRef=useRef(false);
 const version=useRef(0);
 const load=useCallback(async(nextOffset=0)=>{
  const current=++version.current;setLoading(true);setError('');
  try{const response=await fetch(`/api/affiliate/prospecting/instagram?query=${encodeURIComponent(query.trim())}&offset=${nextOffset}`,{cache:'no-store'});const payload=await response.json();if(!response.ok)throw Error(payload.error||'Não foi possível carregar os contatos.');
   if(current!==version.current)return;setItems(previous=>nextOffset?[...new Map([...previous,...(payload.items||[])].map(item=>[item.username,item])).values()]:payload.items||[]);setHasMore(Boolean(payload.hasMore));setOffset(Number(payload.nextOffset)||0);
  }catch(cause){if(current===version.current)setError(cause instanceof Error?cause.message:'Falha ao carregar.');}
  finally{if(current===version.current)setLoading(false);}
 },[query]);
 useEffect(()=>{const requests=version;const timer=window.setTimeout(()=>void load(),query?300:0);return()=>{window.clearTimeout(timer);++requests.current;};},[load,query]);
 async function mutate(action:string){
  if(actionRef.current)return;
  if(action!=='save_instagram'&&!selected)return;
  if(action==='instagram_contacted'&&!window.confirm(`Você já enviou o direct para @${selected?.username} pelo Instagram?`))return;
  if(action==='instagram_block'&&!window.confirm('Marcar este perfil para não contatar mais?'))return;
  actionRef.current=true;setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/affiliate/prospecting/instagram',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,username:action==='save_instagram'?username:selected?.username,name:business,city})});const payload=await response.json();if(!response.ok)throw Error(payload.error||'Não foi possível salvar.');
   setSelected(payload.item);setUsername(payload.item.username);setBusiness(payload.item.name);setCity(payload.item.city);setNotice(action==='save_instagram'?'Perfil salvo.':action==='instagram_contacted'?'Envio registrado por você.':'Perfil marcado para não contatar.');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar.');}finally{actionRef.current=false;setBusy(false);}
 }
 async function copy(){
  setNotice('');setError('');if(!selected||selected.status==='blocked'||!signupUrl)return;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const field=textRef.current;if(!field)throw Error();field.focus();field.select();field.setSelectionRange(0,text.length);if(!document.execCommand('copy'))throw Error();}setNotice('Mensagem copiada. Abra o perfil, toque em Mensagem e cole no Instagram.');}
  catch{ textRef.current?.focus();textRef.current?.select();setError('Não foi possível copiar automaticamente. Selecione a mensagem abaixo e use Copiar.'); }
 }
 function choose(item:Contact){setSelected(item);setBusiness(item.name);setUsername(item.username);setCity(item.city);setNotice('');setError('');}
 return <section className={styles.shell} aria-label="Prospecção manual pelo Instagram">
  <div className={styles.card}><h2>Preparar um direct</h2><p>Use seu Instagram principal. Copie a mensagem e envie pelo próprio Instagram.</p>
   <form onSubmit={event=>{event.preventDefault();void mutate('save_instagram');}}>
    <label>Nome da barbearia<input disabled={busy} required value={business} maxLength={120} onChange={event=>setBusiness(event.target.value)} /></label>
    <label>@ ou link do perfil<input disabled={busy} required value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={400} placeholder="@barbearia ou https://instagram.com/perfil/" onChange={event=>setUsername(event.target.value)} /></label>
    <label>Cidade <small>(opcional)</small><input disabled={busy} value={city} maxLength={180} onChange={event=>setCity(event.target.value)} /></label>
    <button disabled={busy}>{busy?'Salvando...':'Salvar perfil'}</button>
    {selected&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setSelected(null);setBusiness('');setUsername('');setCity('');setNotice('');}}>Novo perfil</button>}
   </form>
  </div>
  {selected&&<div className={styles.card}><h2>{selected.name}</h2><p>@{selected.username} · {selected.status==='blocked'?'Não contatar':selected.status==='contacted'?'Direct registrado por você':'Ainda sem envio registrado'}</p>
   {links.length>0&&<label>Link da campanha<select value={campaignId??''} onChange={event=>onChooseCampaign(event.target.value?Number(event.target.value):null)}><option value="">Link padrão</option>{links.map(link=><option key={link.id} value={link.id}>{link.label}</option>)}</select></label>}
   <label>Seu texto<textarea rows={6} maxLength={1200} value={template} onChange={event=>setTemplate(event.target.value)} /></label><p className={styles.helper}>Personalize antes de enviar. {'{barbearia}'} e {'{link}'} são substituídos na mensagem abaixo.</p>
   <label>Mensagem pronta<textarea ref={textRef} readOnly rows={6} value={text} /></label>
   {!signupUrl&&<p>Ative um link em Gerar links para preparar a mensagem.</p>}
   <div className={styles.actions}><button type="button" disabled={busy||!signupUrl||selected.status==='blocked'||!text.trim()} onClick={()=>void copy()}>Copiar mensagem com meu link</button><a href={`https://www.instagram.com/${selected.username}/`} target="_blank" rel="noopener noreferrer">Abrir perfil no Instagram</a>
   {selected.status==='ready'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void mutate('instagram_contacted')}>Já enviei o direct</button>}
   {selected.status!=='blocked'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void mutate('instagram_block')}>Não contatar mais</button>}</div>
   <p className={styles.helper}>Abrir o perfil e copiar o texto não enviam mensagens. O registro de envio depende da sua confirmação.</p>
  </div>}
  {(error||notice)&&<p className={error?styles.error:styles.notice} role={error?'alert':'status'}>{error||notice}</p>}
  <div className={styles.card}><h2>Seus perfis salvos</h2><label>Buscar perfil<input disabled={busy} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nome, @ ou cidade" /></label>
   <div className={styles.list}>{items.map(item=><button type="button" key={item.username} className={styles.row} disabled={busy} onClick={()=>choose(item)}><strong>{item.name}</strong><span>@{item.username}{item.city?` · ${item.city}`:''}</span><small>{item.status==='blocked'?'Não contatar':item.status==='contacted'?'Direct registrado':'Preparar abordagem'}</small></button>)}</div>
   {loading&&<p role="status">Carregando...</p>}{!loading&&!items.length&&<p>Nenhum perfil encontrado. Você pode cadastrar um perfil acima.</p>}{hasMore&&<button type="button" disabled={loading} onClick={()=>void load(offset)}>Ver mais perfis</button>}
  </div>
  <p className={styles.helper}>Respeite quem não quiser receber contato. Não repita abordagens nem envie em massa. O envio manual também pode sofrer restrições do Instagram.</p>
 </section>;
}
