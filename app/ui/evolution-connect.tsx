"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

type WhatsappStatus = {
  connection: {
    status: string;
    provider: string;
    displayPhoneNumber: string;
  };
};

type EvolutionPayload = {
  evolution?: { ready: boolean; missing: string[] };
  state?: string;
  pairingCode?: string;
  whatsapp?: WhatsappStatus;
  error?: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function formatPhone(value: string) {
  const raw = digits(value);
  const local = raw.startsWith("55") ? raw.slice(2) : raw;
  const ddd = local.slice(0, 2);
  const first = local.slice(2, 7);
  const last = local.slice(7, 11);
  if (!ddd) return "";
  if (local.length <= 2) return `(${ddd}`;
  if (local.length <= 7) return `(${ddd}) ${first}`;
  return `(${ddd}) ${first}-${last}`;
}

export function EvolutionConnect() {
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [state, setState] = useState("loading");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const response = await fetch("/api/whatsapp/evolution", { cache:"no-store" });
      const payload = await response.json() as EvolutionPayload;
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível consultar a conexão.");
      setReady(Boolean(payload.evolution?.ready));
      const nextState = String(payload.state ?? payload.whatsapp?.connection.status ?? "disconnected");
      setState(nextState);
      if (nextState === "open" || nextState === "connected") {
        setPairingCode("");
        setError("");
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
      const currentPhone = payload.whatsapp?.connection.displayPhoneNumber ?? "";
      if (!phone && currentPhone) setPhone(formatPhone(currentPhone));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a conexão.");
      setState("error");
    }
  }

  useEffect(() => {
    const initial = setTimeout(() => void loadStatus(), 0);
    return () => {
      clearTimeout(initial);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // A leitura inicial não deve reiniciar só porque o usuário digitou o telefone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/evolution", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ phone }),
      });
      const payload = await response.json() as EvolutionPayload;
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o código.");
      const code = String(payload.pairingCode ?? "").trim();
      setPairingCode(code);
      setState(String(payload.state ?? "connecting"));
      if (code) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => void loadStatus(), 3000);
      } else {
        await loadStatus();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o código.");
    } finally {
      setLoading(false);
    }
  }

  const connected = state === "open" || state === "connected";
  const codeGroups = pairingCode.replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") ?? pairingCode;

  return <main style={{ minHeight:"100dvh", background:"#f5f3eb", color:"#182019", padding:"24px 18px 48px", fontFamily:"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
    <div style={{ width:"min(100%, 560px)", margin:"0 auto" }}>
      <Link href="/" style={{ display:"inline-flex", alignItems:"center", gap:8, color:"#66511c", textDecoration:"none", fontWeight:800, marginBottom:20 }}>← Cortou, Anotou</Link>

      <section style={{ background:"#182019", color:"#fff", borderRadius:24, padding:"24px 22px", boxShadow:"0 18px 40px rgba(24,32,25,.14)" }}>
        <div style={{ color:"#dfad35", letterSpacing:2, fontSize:12, fontWeight:900, textTransform:"uppercase" }}>Conexão rápida</div>
        <h1 style={{ fontSize:30, lineHeight:1.08, margin:"9px 0 10px" }}>Conecte o WhatsApp da barbearia</h1>
        <p style={{ margin:0, lineHeight:1.5, color:"#d8ddd7", fontSize:16 }}>Use o seu WhatsApp atual como aparelho vinculado. Não precisa esperar a aprovação da integração Cloud da Meta.</p>
      </section>

      {connected ? <section style={{ marginTop:18, background:"#fff", border:"1px solid #d9ddcf", borderRadius:22, padding:22 }}>
        <div style={{ width:48, height:48, borderRadius:16, background:"#e5f5e9", display:"grid", placeItems:"center", fontSize:28, marginBottom:12 }}>✓</div>
        <h2 style={{ margin:"0 0 8px", fontSize:24 }}>WhatsApp conectado</h2>
        <p style={{ margin:0, color:"#657066", lineHeight:1.5 }}>A sessão está ativa no Cortou Anotou. Agora as automações podem usar esta conexão quando o pacote de WhatsApp estiver habilitado.</p>
        <Link href="/" style={{ marginTop:18, display:"block", textAlign:"center", background:"#dba92e", color:"#182019", padding:"15px 18px", borderRadius:14, textDecoration:"none", fontWeight:900 }}>Voltar ao aplicativo</Link>
      </section> : <>
        <form onSubmit={connect} style={{ marginTop:18, background:"#fff", border:"1px solid #deddd5", borderRadius:22, padding:22 }}>
          <label htmlFor="evolution-phone" style={{ display:"block", fontWeight:900, marginBottom:8 }}>Número do WhatsApp</label>
          <input id="evolution-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(41) 99999-9999" style={{ width:"100%", boxSizing:"border-box", minHeight:56, border:"1px solid #cfd1c9", borderRadius:14, padding:"0 15px", fontSize:19, color:"#182019", background:"#fff" }} />
          <button type="submit" disabled={!ready || loading || digits(phone).length < 10} style={{ marginTop:14, width:"100%", minHeight:54, border:0, borderRadius:14, background:(!ready || loading || digits(phone).length < 10) ? "#d7d7d1" : "#dba92e", color:"#182019", fontWeight:900, fontSize:16 }}>
            {loading ? "Gerando código..." : "Gerar código de conexão"}
          </button>
          {!ready && state !== "loading" && <p style={{ margin:"12px 0 0", color:"#9a6113", fontWeight:700 }}>A conexão rápida ainda está sendo ativada no servidor.</p>}
          {error && <p role="alert" style={{ margin:"12px 0 0", color:"#a52c35", fontWeight:700, lineHeight:1.4 }}>{error}</p>}
        </form>

        {pairingCode && <section style={{ marginTop:18, background:"#fff", border:"2px solid #dba92e", borderRadius:22, padding:22 }}>
          <div style={{ fontSize:12, letterSpacing:1.6, textTransform:"uppercase", fontWeight:900, color:"#8c6915" }}>Código para vincular</div>
          <div style={{ fontSize:34, letterSpacing:3, fontWeight:950, margin:"12px 0 20px", fontVariantNumeric:"tabular-nums" }}>{codeGroups}</div>
          <ol style={{ margin:0, paddingLeft:22, lineHeight:1.6, color:"#4d574e" }}>
            <li>Abra o WhatsApp ou WhatsApp Business.</li>
            <li>Entre em <strong>Configurações → Aparelhos conectados</strong>.</li>
            <li>Toque em <strong>Conectar um aparelho</strong> e escolha conectar usando número de telefone.</li>
            <li>Digite o código acima.</li>
          </ol>
          <div style={{ marginTop:18, padding:"12px 14px", borderRadius:12, background:"#f3f0e5", color:"#5f675f", fontSize:14 }}>Pode deixar esta tela aberta. Assim que o WhatsApp confirmar, o Cortou Anotou reconhece a conexão automaticamente.</div>
        </section>}
      </>}

      <p style={{ margin:"18px 4px 0", color:"#72796f", lineHeight:1.5, fontSize:13 }}>Esta opção usa uma sessão de aparelho vinculado. A integração oficial da Meta continua preservada no sistema e poderá ser usada quando estiver disponível.</p>
    </div>
  </main>;
}
