"use client";

import { useEffect, useRef, useState } from 'react';
import { formatHelpVoiceTime, useHelpVoiceRecorder, type HelpVoicePayload } from './help-voice';
import styles from './affiliate-prospecting-audio.module.css';

export type ApproachMode='text'|'text_audio'|'audio_wait';
type VoiceProfile={script:string;audioId:string;durationSeconds:number;mimeType:string;recordedAt:string};

type Props={
  mode:ApproachMode;
  embedded?:boolean;
  onChange:(value:{mode?:ApproachMode;audioId?:string;intro?:string})=>void;
};

export function AffiliateProspectingAudio({mode,embedded=false,onChange}:Props) {
  const [open,setOpen]=useState(false);
  const [profile,setProfile]=useState<VoiceProfile|null>(null);
  const [script,setScript]=useState('');
  const [screen,setScreen]=useState(false);
  const [draft,setDraft]=useState<HelpVoicePayload|null>(null);
  const [draftUrl,setDraftUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [scroll,setScroll]=useState(false);
  const [speed,setSpeed]=useState(2);
  const scriptRef=useRef<HTMLDivElement>(null);
  const recorder=useHelpVoiceRecorder({onSend:(audio)=>{setDraft(audio);setDraftUrl(URL.createObjectURL(audio.blob));setScreen(false);setScroll(false);setOpen(true);},onError:(message)=>{setError(message);setScreen(false);}});

  useEffect(()=>{
    let active=true;
    void fetch('/api/affiliate/prospecting/audio',{cache:'no-store'}).then(async r=>{
      const value=await r.json() as {profile?:VoiceProfile;error?:string};
      if(!r.ok)throw Error(value.error||'Não foi possível carregar seu áudio.');
      if(active && value.profile){setProfile(value.profile);setScript(value.profile.script);onChange({audioId:value.profile.audioId});}
    }).catch(cause=>active&&setError(cause instanceof Error?cause.message:'Não foi possível carregar seu áudio.'));
    return()=>{active=false;};
    // onChange only mirrors the initial server profile into the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>()=>{if(draftUrl)URL.revokeObjectURL(draftUrl);},[draftUrl]);
  useEffect(()=>{
    if(!notice)return;
    const timer=window.setTimeout(()=>setNotice(''),3200);
    return()=>window.clearTimeout(timer);
  },[notice]);
  useEffect(()=>{
    if(!screen||!scroll)return;
    let frame=0,last=0;
    const step=(time:number)=>{if(last&&scriptRef.current)scriptRef.current.scrollTop+=Math.min(50,time-last)*speed/35;last=time;frame=requestAnimationFrame(step);};
    frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);
  },[screen,scroll,speed]);

  async function saveScript(){setBusy(true);setError('');setNotice('');try{
    const response=await fetch('/api/affiliate/prospecting/audio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({script})});
    const data=await response.json() as {profile?:VoiceProfile;error?:string};
    if(!response.ok||!data.profile)throw Error(data.error||'Não foi possível salvar o roteiro.');
    setProfile(data.profile);setNotice('Roteiro salvo.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar o roteiro.');}finally{setBusy(false);}}
  async function saveDraft(){if(!draft)return;setBusy(true);setError('');setNotice('');try{
    const response=await fetch('/api/affiliate/prospecting/audio',{method:'POST',headers:{'content-type':draft.mimeType,'x-audio-duration':String(draft.durationSeconds)},body:draft.blob});
    const payload=await response.json() as {profile?:VoiceProfile;error?:string};
    if(!response.ok||!payload.profile)throw Error(payload.error||'Não foi possível salvar a gravação.');
    setProfile(payload.profile);onChange({audioId:payload.profile.audioId});setDraft(null);setDraftUrl('');setNotice('Áudio salvo e pronto para usar.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar a gravação.');}finally{setBusy(false);}}
  async function removeAudio(){if(!window.confirm('Excluir seu áudio salvo? Lotes já em andamento podem continuar usando a gravação.'))return;
    setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/affiliate/prospecting/audio',{method:'DELETE'});
      const data=await response.json() as {profile?:VoiceProfile;error?:string};
      if(!response.ok||!data.profile)throw Error(data.error||'Não foi possível excluir o áudio.');
      setProfile(data.profile);onChange({audioId:''});setNotice('Áudio removido.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível excluir o áudio.');}finally{setBusy(false);}}
  function startRecording(){setError('');setNotice('');setDraft(null);setDraftUrl('');setScreen(true);setScroll(false);void recorder.start();}
  function cancelRecording(){recorder.discard();setScreen(false);setScroll(false);}

  const details=<>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {notice&&<p className={styles.success} role="status">{notice}</p>}
    <fieldset className={styles.modes}><legend>Como abordar</legend>
      {([['text','Mensagem'],['audio_wait','Somente áudio']] as const).map(([value,label])=><label key={value}><input type="radio" name="prospecting-approach" checked={mode===value} onChange={()=>{onChange(value==='audio_wait'?{mode:value,intro:''}:{mode:value});if(value!=='text')setOpen(true);}}/>{label}</label>)}
    </fieldset>
    {mode!=='text'&&<div className={styles.audioSummary}><div><strong>{profile?.audioId?'Áudio pronto':'Grave sua apresentação'}</strong><span>{profile?.audioId?`${formatHelpVoiceTime(profile.durationSeconds)} salvo para este afiliado`:'Você grava uma vez e reaproveita nas abordagens.'}</span></div><button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Fechar':'Configurar áudio'}</button></div>}
    {open&&mode!=='text'&&<div className={styles.content}>
      <label className={styles.label}>Roteiro para gravar <small>Este texto é só seu apoio e não é enviado.</small><textarea value={script} onChange={event=>setScript(event.target.value)} rows={5} maxLength={3000} placeholder="Fala, meu amigo! Também sou barbeiro e criei o Cortou Anotou..." /></label>
      <div className={styles.actions}><button type="button" onClick={()=>void saveScript()} disabled={busy}>{busy?'Salvando...':'Salvar roteiro'}</button><button type="button" onClick={startRecording} disabled={busy||recorder.requesting}>{recorder.requesting?'Pedindo microfone...':profile?.audioId?'Gravar novamente':'Gravar meu áudio'}</button></div>
      {draft&&<div className={styles.draft}><strong>Ouça antes de salvar</strong><audio src={draftUrl} controls preload="metadata" /><div className={styles.actions}><button type="button" onClick={()=>void saveDraft()} disabled={busy}>{busy?'Salvando...':'Salvar este áudio'}</button><button type="button" onClick={startRecording} disabled={busy}>Gravar novamente</button><button type="button" onClick={()=>{setDraft(null);setDraftUrl('');}} disabled={busy}>Descartar</button></div></div>}
      {profile?.audioId&&!draft&&<div className={styles.draft}><strong>Áudio salvo · {formatHelpVoiceTime(profile.durationSeconds)}</strong><audio key={profile.audioId} src="/api/affiliate/prospecting/audio?play=1" controls preload="none" /><div className={styles.actions}><button type="button" onClick={startRecording} disabled={busy}>Gravar novamente</button><button type="button" onClick={()=>void removeAudio()} disabled={busy}>Excluir</button></div></div>}
      <p className={styles.hint}>O sistema envia somente este áudio. Se a barbearia responder, você decide se manda o link do Cortou Anotou.</p>
    </div>}
  </>;

  return <>
    {embedded ? <div className={styles.embedded} aria-label="Áudio de apresentação">{details}</div> : <section className={styles.card} aria-label="Áudio de apresentação"><button type="button" className={styles.heading} onClick={()=>setOpen(value=>!value)} aria-expanded={open}><span><strong>Áudio de apresentação</strong><small>{profile?.audioId?`Áudio salvo · ${formatHelpVoiceTime(profile.durationSeconds)}`:'Grave sua voz uma vez para abordar de forma pessoal'}</small></span><span aria-hidden="true">{open?'−':'+'}</span></button>{details}</section>}
    {screen&&<div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Teleprompter para gravar áudio"><div className={styles.toolbar}><strong>{recorder.requesting?'Abrindo microfone...':recorder.paused?'Pausado':'Gravando'} · {formatHelpVoiceTime(recorder.seconds)}</strong><button type="button" onClick={cancelRecording}>Cancelar</button></div>
      <div className={styles.prompter} ref={scriptRef}>{script.trim()||'Seu roteiro aparece aqui. Você pode falar naturalmente e gravar sua apresentação.'}</div>
      <div className={styles.controls}><div><button type="button" onClick={()=>{if(scriptRef.current)scriptRef.current.scrollTop-=120;}}>Voltar</button><button type="button" onClick={()=>setScroll(value=>!value)}>{scroll?'Parar rolagem':'Rolar roteiro'}</button><button type="button" onClick={()=>{if(scriptRef.current)scriptRef.current.scrollTop+=120;}}>Avançar</button></div>
        <label>Velocidade <input type="range" min="1" max="5" value={speed} onChange={event=>setSpeed(Number(event.target.value))}/></label><div><button type="button" onClick={recorder.togglePause} disabled={!recorder.recording}>{recorder.paused?'Continuar gravação':'Pausar gravação'}</button><button type="button" className={styles.finish} onClick={recorder.send} disabled={!recorder.recording}>Finalizar e ouvir</button></div></div>
    </div>}
  </>;
}

export const DEFAULT_VOICE_INTRO='';