"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './affiliate-instagram-manual.module.css';
type Delivery={username:string;name:string;status:string;error:string;confirmed:boolean};
type State={enabled:boolean;connection:{username:string;status:string;error:string;retryAt?:string|null};batch:{id:string;status:string;reason:string;sender:string;items:Delivery[]}|null};
type Props={name:string;signupUrl:string;campaignId:number|null;links:Array<{id:number;label:string;url:string}>;onChooseCampaign:(id:number|null)=>void;selectedUsernames:string[];onChanged:()=>void;showQueue:boolean};
const labels:Record<string,string>={pending:'Aguardando envio',sending:'Enviando',sent:'Enviada ao Instagram',failed:'Não enviada',uncertain:'Confira no Instagram',skipped:'Ignorada'};
export function AffiliateInstagramSender({name,signupUrl,campaignId,links,onChooseCampaign,selectedUsernames,onChanged,showQueue}:Props){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connecting,setConnecting]=useState(false);
 const [checking,setChecking]=useState(false),[queryError,setQueryError]=useState(''),[notice,setNotice]=useState('');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[needsCode,setNeedsCode]=useState(false);
 const [now,setNow]=useState(0);
 const [template,setTemplate]=useState(`Oi tudo bem sou o ${name.split(/\s+/)[0]}\nVi a {barbearia} e queria te apresentar o Cortou Anotou um app pra facilitar a agenda e a gestão da barbearia\nSe quiser conhecer aqui tá o link {link}`);
 const current=useRef<State|null>(null),pending=useRef(false),alive=useRef(true),changed=useRef(onChanged),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const apply=useCallback((value:State)=>{
  const old=current.current;
  if(old?.batch&&value.batch&&JSON.stringify(old.batch.items)!==JSON.stringify(value.batch.items))changed.current();
  current.current=value;setNow(Date.now());setState(value);setUsername(previous=>previous||value.connection.username||'');
 },[]);
 useEffect(()=>{changed.current=onChanged;},[onChanged]);
 useEffect(()=>{
  alive.current=true;let active=true;const controller=new AbortController();
   async function poll(){
   if(document.visibilityState==='hidden'){if(active)timer.current=setTimeout(()=>void poll(),5000);return;}
   const version=generation.current;
   try{const response=await fetch('/api/affiliate/prospecting/instagram/sending',{cache:'no-store',signal:controller.signal}),value=await response.json();if(!response.ok)throw Error(value.error||'Não consegui consultar o Instagram.');if(active&&!pending.current&&version===generation.current){apply(value);setQueryError('');}
   }catch(cause){if(active)setQueryError(cause instanceof Error?cause.message:'Não consegui consultar o Instagram.');}
   finally{if(active)timer.current=setTimeout(()=>void poll(),5000);}
  }
  void poll();return()=>{active=false;alive.current=false;controller.abort();if(timer.current)clearTimeout(timer.current);};
 },[apply]);
 async function refreshConnection(){
  if(pending.current||checking)return;
  setChecking(true);setError('');setNotice('');const version=generation.current;
  try{
   const response=await fetch('/api/affiliate/prospecting/instagram/sending',{cache:'no-store',signal:AbortSignal.timeout(20000)}),value=await response.json();
   if(!response.ok)throw Error(value.error||'Não consegui conferir a conexão.');
   if(!alive.current||version!==generation.current)return;
   apply(value);setQueryError('');setNotice(value.connection.status==='connected'?'Conexão confirmada. Seu Instagram está pronto.':value.connection.error?'A conexão ainda precisa de atenção. Confira a orientação abaixo.':'Ainda não há uma conexão ativa. Use Conectar meu Instagram.');
  }catch(cause){if(alive.current)setQueryError(cause instanceof Error?cause.message:'Não consegui conferir a conexão.');}
  finally{if(alive.current)setChecking(false);}
 }
 async function action(kind:string){
  if(pending.current)return;
  if(kind==='connect'&&state?.connection.retryAt&&Date.parse(state.connection.retryAt)>Date.now()){setError('Aguarde o prazo indicado antes de tentar conectar novamente. Conferir conexão não inicia outro login.');return;}
  if(kind==='start'&&!window.confirm(`Enviar sua mensagem com o link para ${selectedUsernames.length} barbearia(s), usando @${state?.connection.username}?`))return;
  if(kind==='disconnect'&&!window.confirm('Desconectar seu Instagram e encerrar os envios? Um envio já iniciado pode terminar.'))return;
  if(kind==='stop'&&!window.confirm('Encerrar este envio? As barbearias ainda não contatadas continuam na fila.'))return;
  pending.current=true;++generation.current;setBusy(true);setError('');setNotice('');
  try{
   const body={action:kind,...(kind==='connect'?{username,password,code}:{}),...(kind==='start'?{usernames:selectedUsernames,template,campaignId}:{}),...(['pause','resume','stop'].includes(kind)?{batchId:state?.batch?.id}:{})};
   const response=await fetch('/api/affiliate/prospecting/instagram/sending',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(80000)}),value=await response.json();
   if(!alive.current)return;
   if(!response.ok){if(response.status===428)setNeedsCode(true);if(value.retryAt){setNow(Date.now());setState(previous=>previous?{...previous,connection:{...previous.connection,retryAt:value.retryAt}}:previous);}throw Error(`${value.error||'Não consegui concluir a operação.'}${value.reference?` Referência: ${value.reference}.`:''}`);}
   apply(value);if(kind==='connect'){setPassword('');setCode('');setNeedsCode(false);setConnecting(false);}
   changed.current();
  }catch(cause){if(alive.current)setError(cause instanceof Error&&!['TimeoutError','AbortError'].includes(cause.name)?cause.message:'A conexão caiu. Confira o andamento antes de tentar novamente.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 const connected=state?.connection.status==='connected'&&!queryError,active=state?.batch&&['running','paused'].includes(state.batch.status);
 const retryTime=state?.connection.retryAt?new Date(state.connection.retryAt):null,cooling=Boolean(retryTime&&retryTime.getTime()>now);
 const minutesLeft=cooling&&retryTime?Math.max(1,Math.ceil((retryTime.getTime()-now)/60000)):0;
 const statusLabel=queryError?'Não verificado':!state?'Conferindo':connected?'Conectado':cooling?'Aguardando Instagram':state.connection.status==='restricted'?'Envios restritos':state.connection.status==='reauth'?'Verificação necessária':'Desconectado';
 const preview=template.replaceAll('{barbearia}','nome da barbearia').replaceAll('{link}',signupUrl);
 return <div className={styles.card} aria-label="Conexão e envios do Instagram">
  <div className={styles.connectionHeading}><div className={styles.connectionIdentity}><span className={styles.socialIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg></span><div><span className={styles.eyebrow}>SUA CONTA DE ENVIO</span><h2>Meu Instagram</h2></div></div><strong className={`${styles.connectionBadge} ${connected?styles.connected:''}`}>{statusLabel}</strong></div>
  {!state&&!error&&<p role="status">Consultando conexão...</p>}
  {state&&<p className={styles.accountName}>{state.connection.username?`@${state.connection.username}`:'Conecte a conta que apresenta você às barbearias.'}</p>}
  {state?.connection.error&&!error&&<div className={styles.connectionIssue} role="alert"><strong>A conexão precisa de atenção</strong><p>{state.connection.error}</p><a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Conferir minha conta no Instagram ↗</a></div>}
  {cooling&&retryTime&&<p className={styles.waiting} role="status">Nova tentativa em cerca de {minutesLeft} min, após {retryTime.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} (Brasília). Você pode continuar buscando e salvando perfis.</p>}
  {state&&!state.enabled&&<p role="status">O serviço de envio está indisponível ou iniciando. A busca e sua fila continuam disponíveis.</p>}
  <div className={styles.connectionActions}>
   {!connected&&<button type="button" disabled={busy||checking||!state?.enabled} aria-expanded={connecting} onClick={()=>{if(connecting){setPassword('');setCode('');}setConnecting(value=>!value);}}>{connecting?'Fechar conexão':'Conectar meu Instagram'}</button>}
   <button type="button" className={styles.secondary} disabled={busy||checking} onClick={()=>void refreshConnection()}>{checking?'Conferindo conexão...':'Conferir conexão'}</button>
   {connected&&<button type="button" className={styles.secondary} disabled={busy||checking} onClick={()=>void action('disconnect')}>Desconectar Instagram</button>}
  </div>
  {connecting&&!connected&&<form onSubmit={event=>{event.preventDefault();void action('connect');}}>
   <div className={styles.connectionSteps}><strong>Conecte sua própria conta</strong><p>Informe seu perfil e autorize a conexão. Se o Instagram pedir uma confirmação, conclua no aplicativo e volte para conferir.</p><small>Abrir seu perfil no celular não conecta o C|A automaticamente. A conexão só fica ativa quando o serviço confirma o acesso.</small></div>
   <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Abrir Instagram para verificar</a>
   <label>Seu @ ou link do Instagram<input required value={username} maxLength={400} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="@suabarbearia" disabled={busy} onChange={event=>setUsername(event.target.value)} /></label>
   <label>Senha do Instagram<input required type="password" value={password} maxLength={200} autoComplete="current-password" disabled={busy} onChange={event=>setPassword(event.target.value)} /></label>
   <label>Código de autenticação {needsCode?'':'(se sua conta usa autenticação em duas etapas)'}<input value={code} maxLength={12} inputMode="numeric" autoComplete="one-time-code" required={needsCode} disabled={busy} onChange={event=>setCode(event.target.value.replace(/\s/g,''))} /></label>
   <button disabled={busy||cooling}>{busy?'Conectando...':cooling?'Aguardando nova tentativa':'Autorizar conexão'}</button>
   <p className={styles.helper}>A senha não fica salva no sistema. Esta conexão não oficial pode exigir verificação ou ser restringida pelo Instagram. Não há conexão por código de aparelho como no WhatsApp.</p>
  </form>}
  {showQueue&&<div className={styles.sendPanel}>
   <h3>Enviar para as selecionadas</h3><p>Selecione as barbearias na fila abaixo. Cada uma recebe seu próprio direct com o nome e seu link.</p>
   {links.length>0&&<label>Campanha<select value={campaignId??''} disabled={busy||Boolean(active)} onChange={event=>onChooseCampaign(event.target.value?Number(event.target.value):null)}><option value="">Link padrão</option>{links.map(link=><option key={link.id} value={link.id}>{link.label}</option>)}</select></label>}
   <label>Texto dos envios<textarea rows={6} maxLength={1800} value={template} disabled={busy||Boolean(active)} onChange={event=>setTemplate(event.target.value)} /></label>
   <p className={styles.helper}>Use {'{barbearia}'} para o nome e {'{link}'} para seu link. O link será incluído mesmo se você retirar esse marcador.</p>
   <details><summary>Conferir mensagem com o link</summary><p className={styles.preview}>{preview}{signupUrl&&!preview.includes(signupUrl)?`\n${signupUrl}`:''}</p></details>
   <button type="button" disabled={busy||!connected||!state?.enabled||Boolean(active)||!selectedUsernames.length||!signupUrl||!template.trim()} onClick={()=>void action('start')}>Enviar para {selectedUsernames.length} barbearia(s)</button>
   {!connected&&<p>Conecte seu Instagram acima para habilitar os envios.</p>}
  </div>}
  {state?.batch&&<div className={styles.sendPanel} aria-live="polite"><h3>Andamento dos envios</h3>
   <p>@{state.batch.sender} · {state.batch.status==='running'?'Em andamento':state.batch.status==='paused'?'Pausado':state.batch.status==='completed'?'Concluído':'Encerrado'}</p>
   <p>{state.batch.items.filter(item=>item.status==='sent').length} enviadas de {state.batch.items.length}. O envio continua se você sair desta tela.</p>
   {state.batch.reason&&<p>{state.batch.reason}</p>}
   <div className={styles.actions}>{state.batch.status==='running'&&<button type="button" disabled={busy} onClick={()=>void action('pause')}>Pausar envios</button>}{state.batch.status==='paused'&&<button type="button" disabled={busy||!connected||!state.enabled||state.batch.items.some(item=>item.status==='uncertain')} onClick={()=>void action('resume')}>Continuar envios</button>}{active&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void action('stop')}>Encerrar envio</button>}</div>
   <p className={styles.helper}>Os directs são enviados um por vez. Pausar impede os próximos envios; a mensagem já em andamento pode terminar. Enviada significa aceita pelo Instagram, sem confirmação de leitura.</p>
   <div className={styles.list}>{state.batch.items.map(item=><div key={item.username} className={styles.delivery}><strong>{item.name}</strong><span>@{item.username} · {labels[item.status]||item.status}</span>{item.error&&<small>{item.error}</small>}{['uncertain','failed'].includes(item.status)&&<a href={`https://www.instagram.com/${item.username}/`} target="_blank" rel="noopener noreferrer">Conferir conversa no Instagram</a>}</div>)}</div>
  </div>}
  {(error||queryError)&&<p className={styles.error} role="alert">{error||queryError}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
 </div>;
}
