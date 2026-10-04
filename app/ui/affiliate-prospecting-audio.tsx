"use client";

import { useEffect, useRef, useState } from 'react';
import { formatHelpVoiceTime, useHelpVoiceRecorder, type HelpVoicePayload } from './help-voice';
import styles from './affiliate-prospecting-audio.module.css';

export type ApproachMode='text'|'text_audio'|'audio_wait';
type VoiceProfile={script:string;audioId:string;durationSeconds:number;mimeType:string;recordedAt:string};
const INTRO='Fala, pessoal da {barbearia}! Sou barbeiro também e gravei uma mensagem rápida pra vocês.';

export function AffiliateProspectingAudio({mode,onChange}:{mode:ApproachMode;onChange:(value:{mode?:ApproachMode;audioId?:string;intro?:string})=>void}) {
  const [open,setOpen]=useState(false);
  const [profile,setProfile]=useState<VoiceProfile|null>(null);
  const [script,setScript]=useState('');
  const [intro,setIntro]=useState(INTRO);
  const [screen,setScreen]=useState(false);
  const [draft,setDraft]=useState<HelpVoicePayload|null>(null);
  const [draftUrl,setDraftUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
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
    if(!screen||!scroll)return;
    let frame=0,last=0;
    const step=(time:number)=>{if(last&&scriptRef.current)scriptRef.current.scrollTop+=Math.min(50,time-last)*speed/35;last=time;frame=requestAnimationFrame(step);};
    frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame);
  },[screen,scroll,speed]);

  async function saveScript(){setBusy(true);setError('');try{
    const response=await fetch('/api/affiliate/prospecting/audio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({script})});
    const data=await response.json() as {profile?:VoiceProfile;error?:string};
    if(!response.ok||!data.profile)throw Error(data.error||'Não foi possível salvar o roteiro.');
    setProfile(data.profile);
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar o roteiro.');}finally{setBusy(false);}}
  async function saveDraft(){if(!draft)return;setBusy(true);setError('');try{
    const response=await fetch('/api/affiliate/prospecting/audio',{method:'POST',headers:{'content-type':draft.mimeType,'x-audio-duration':String(draft.durationSeconds)},body:draft.blob});
    const payload=await response.json() as {profile?:VoiceProfile;error?:string};
    if(!response.ok||!payload.profile)throw Error(payload.error||'Não foi possível salvar a gravação.');
    setProfile(payload.profile);onChange({audioId:payload.profile.audioId});setDraft(null);setDraftUrl('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar a gravação.');}finally{setBusy(false);}}
  async function removeAudio(){if(!window.confirm('Excluir seu áudio salvo? Lotes já em andamento podem continuar usando a gravação.'))return;
    setBusy(true);setError('');try{const response=await fetch('/api/affiliate/prospecting/audio',{method:'DELETE'});
      const data=await response.json() as {profile?:VoiceProfile;error?:string};
      if(!response.ok||!data.profile)throw Error(data.error||'Não foi possível excluir o áudio.');
      setProfile(data.profile);onChange({audioId:''});
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível excluir o áudio.');}finally{setBusy(false);}}
  function startRecording(){setError('');setDraft(null);setDraftUrl('');setScreen(true);setScroll(false);void recorder.start();}
  function cancelRecording(){recorder.discard();setScreen(false);setScroll(false);}
  return <section className={styles.card} aria-label="Áudio de apresentação">
    <button type="button" className={styles.heading} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>
      <span><strong>Áudio de apresentação</strong><small>{profile?.audioId?`Seu áudio de ${formatHelpVoiceTime(profile.durationSeconds)} está pronto`:'Grave sua voz uma vez para abordar de forma pessoal'}</small></span><span aria-hidden="true">{open?'−':'+'}</span>
    </button>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {open&&<div className={styles.content}>
      <label className={styles.label}>Roteiro para gravar — este texto não é enviado automaticamente<textarea value={script} onChange={event=>setScript(event.target.value)} rows={5} maxLength={3000} placeholder="Fala, meu amigo! Também sou barbeiro e criei o Cortou Anotou..." /></label>
      <div className={styles.actions}><button type="button" onClick={()=>void saveScript()} disabled={busy}>Salvar roteiro</button><button type="button" onClick={startRecording} disabled={busy||recorder.requesting}>{recorder.requesting?'Pedindo microfone...':'Gravar meu áudio'}</button></div>
      {draft&&<div className={styles.draft}><strong>Ouça antes de salvar</strong><audio src={draftUrl} controls preload="metadata" /><div className={styles.actions}><button type="button" onClick={()=>void saveDraft()} disabled={busy}>{busy?'Salvando...':'Salvar este áudio'}</button><button type="button" onClick={startRecording} disabled={busy}>Gravar novamente</button><button type="button" onClick={()=>{setDraft(null);setDraftUrl('');}} disabled={busy}>Descartar</button></div></div>}
      {profile?.audioId&&!draft&&<div className={styles.draft}><strong>Áudio salvo · {formatHelpVoiceTime(profile.durationSeconds)}</strong><audio key={profile.audioId} src="/api/affiliate/prospecting/audio?play=1" controls preload="none" /><div className={styles.actions}><button type="button" onClick={startRecording} disabled={busy}>Gravar novamente</button><button type="button" onClick={()=>void removeAudio()} disabled={busy}>Excluir</button></div></div>}
      <fieldset className={styles.modes}><legend>Forma de abordagem</legend>
        {([['text','Mensagem normal'],['text_audio','Mensagem + áudio'],['audio_wait','Áudio e esperar resposta']] as const).map(([value,label])=><label key={value}><input type="radio" name="prospecting-approach" checked={mode===value} onChange={()=>onChange({mode:value})}/>{label}</label>)}
      </fieldset>
      {mode!=='text'&&<><label className={styles.label}>Mensagem curta antes do áudio<textarea value={intro} onChange={event=>{setIntro(event.target.value);onChange({intro:event.target.value});}} maxLength={1000} rows={3}/></label><p className={styles.hint}>{mode==='audio_wait'?'O link só será compartilhado por você depois que a barbearia responder.':'Seu link correto entra automaticamente nessa mensagem.'}</p></>}
    </div>}
    {screen&&<div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Teleprompter para gravar áudio"><div className={styles.toolbar}><strong>{recorder.requesting?'Abrindo microfone...':recorder.paused?'Pausado':'Gravando'} · {formatHelpVoiceTime(recorder.seconds)}</strong><button type="button" onClick={cancelRecording}>Cancelar</button></div>
      <div className={styles.prompter} ref={scriptRef}>{script.trim()||'Seu roteiro aparece aqui. Você pode falar naturalmente e gravar sua apresentação.'}</div>
      <div className={styles.controls}><div><button type="button" onClick={()=>{if(scriptRef.current)scriptRef.current.scrollTop-=120;}}>Voltar</button><button type="button" onClick={()=>setScroll(value=>!value)}>{scroll?'Parar rolagem':'Rolar roteiro'}</button><button type="button" onClick={()=>{if(scriptRef.current)scriptRef.current.scrollTop+=120;}}>Avançar</button></div>
        <label>Velocidade <input type="range" min="1" max="5" value={speed} onChange={event=>setSpeed(Number(event.target.value))}/></label><div><button type="button" onClick={recorder.togglePause} disabled={!recorder.recording}>{recorder.paused?'Continuar gravação':'Pausar gravação'}</button><button type="button" className={styles.finish} onClick={recorder.send} disabled={!recorder.recording}>Finalizar e ouvir</button></div></div>
    </div>}
  </section>;
}

export const DEFAULT_VOICE_INTRO=INTRO;
