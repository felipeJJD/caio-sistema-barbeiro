import { HELP_MESSAGE_LIMIT } from "./help-guide";

export type Recognition = {
  lang:string; continuous:boolean; interimResults:boolean;
  start():void; stop():void;
  onresult:((event:{results:ArrayLike<{0?:{transcript?:string}}>})=>void)|null;
  onend:(()=>void)|null;
  onerror:((event:{error?:string})=>void)|null;
};
type Callbacks = {text:(text:string)=>void;listening:(active:boolean)=>void;error:(message:string)=>void};

/** One explicit dictation session. Late callbacks cannot overwrite a sent/edited draft. */
export function createHelpDictation(RecognitionType:new()=>Recognition, callbacks:Callbacks) {
  let active = false;
  let generation = 0;
  let recognition:Recognition|null = null;
  let committed = "";
  let silence:ReturnType<typeof setTimeout>|undefined;
  let duration:ReturnType<typeof setTimeout>|undefined;
  function stop() {
    active = false; generation++;
    clearTimeout(silence); clearTimeout(duration);
    const previous = recognition; recognition = null;
    if (previous) {
      previous.onresult = null; previous.onend = null; previous.onerror = null;
      try { previous.stop(); } catch { /* already ended */ }
    }
    callbacks.listening(false);
  }
  function armSilence() { clearTimeout(silence); silence = setTimeout(stop,25000); }
  function listen(token:number) {
    if (!active || generation !== token) return;
    const current = new RecognitionType(); recognition = current;
    let segment = "";
    const valid = () => active && generation === token && recognition === current;
    current.lang = "pt-BR"; current.continuous = true; current.interimResults = true;
    current.onresult = event => {
      if (!valid()) return;
      segment = Array.from(event.results, result=>result[0]?.transcript || "").join(" ").replace(/\s+/g," ").trim();
      const text = [committed,segment].filter(Boolean).join(" ");
      callbacks.text(text.slice(0,HELP_MESSAGE_LIMIT)); armSilence();
      if (text.length >= HELP_MESSAGE_LIMIT) { stop(); callbacks.error("O texto chegou ao limite. Confira e envie antes de continuar."); }
    };
    current.onend = () => {
      if (!valid()) return;
      committed = [committed,segment].filter(Boolean).join(" ");
      recognition = null;
      active = false;
      generation++;
      clearTimeout(silence); clearTimeout(duration);
      callbacks.listening(false);
    };
    current.onerror = event => {
      if (!valid()) return;
      if (event.error === "no-speech") return;
      stop();
      callbacks.error(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "O navegador não liberou o microfone. Você pode usar o microfone do teclado ou revisar a permissão do site nos ajustes."
        : "A gravação foi interrompida. Seu texto foi mantido; você pode continuar pelo teclado.");
    };
    try { current.start(); } catch { stop(); callbacks.error("Não consegui iniciar o microfone. Tente usar o microfone do teclado."); }
  }
  return {
    // SpeechRecognition must start only from the user's tap. Restarting it after
    // an `end` event makes iOS ask for microphone access again.
    start(text:string) { stop(); active = true; committed = text.trim(); callbacks.listening(true); armSilence(); duration=setTimeout(stop,120000); listen(generation); },
    stop,
  };
}
