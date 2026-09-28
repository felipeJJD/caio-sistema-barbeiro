"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

type WhatsappPayload = {
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
  qrCode?: string;
  whatsapp?: WhatsappPayload;
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

export function EvolutionQrConnect() {
  const [phone, setPhone] = useState("");
  const [qrCode, setQrCode] = useState("");
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
      const currentPhone = payload.whatsapp?.connection.displayPhoneNumber ?? "";
      if (!phone && currentPhone) setPhone(formatPhone(currentPhone));
      if (nextState === "open" || nextState === "connected") {
        setQrCode("");
        setPairingCode("");
        setError("");
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a conexão.");
      setState("error");
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void loadStatus(), 0);
    return () => {
      window.clearTimeout(initial);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // A leitura inicial não deve reiniciar enquanto o usuário digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
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
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível preparar a conexão.");
      setQrCode(String(payload.qrCode ?? ""));
      setPairingCode(String(payload.pairingCode ?? ""));
      setState(String(payload.state ?? "connecting"));
      if (!payload.qrCode && !payload.pairingCode) {
        throw new Error("A conexão começou, mas o WhatsApp ainda não liberou QR nem código. Tente novamente em alguns segundos.");
      }
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => void loadStatus(), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a conexão.");
    } finally {
      setLoading(false);
    }
  }

  const connected = state === "open" || state === "connected";
  const codeGroups = pairingCode.replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") ?? pairingCode;

  return <main style={{ minHeight:"100dvh", background:"#f5f3eb", color:"#182019", padding:"22px 18px 48px", fontFamily:"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
    <div style={{ width:"min(100%, 560px)", margin:"0 auto" }}>
      <Link href="/" style={{ display:"inline-flex", color:"#6d561d", textDecoration:"none", fontWeight:800, marginBottom:18 }}>← Cortou, Anotou</Link>

      <section style={{ background:"#182019", color:"#fff", borderRadius:24, padding:"24px 22px" }}>
        <div style={{ color:"#dfad35", letterSpacing:2, fontSize:12, fontWeight:900 }}>WHATSAPP · QR CODE</div>
        <h1 style={{ margin:"10px 0 8px", fontSize:30, lineHeight:1.1 }}>Conectar por QR Code</h1>
        <p style={{ margin:0, color:"#d9dfd8", lineHeight:1.5 }}>Abra esta tela em outro aparelho e escaneie o QR pelo WhatsApp Business do celular principal.</p>
      </section>

      {connected ? <section style={{ marginTop:18, background:"#fff", border:"1px solid #d8ddcf", borderRadius:22, padding:22 }}>
        <div style={{ width:48, height:48, display:"grid", placeItems:"center", borderRadius:16, background:"#e4f4e8", fontSize:28, marginBottom:12 }}>✓</div>
        <h2 style={{ margin:"0 0 8px", fontSize:24 }}>WhatsApp conectado</h2>
        <p style={{ margin:0, color:"#657066", lineHeight:1.5 }}>A Evolution confirmou a sessão. Pode voltar para a área normal do WhatsApp no Cortou Anotou.</p>
        <Link href="/" style={{ display:"block", marginTop:18, padding:"15px 18px", borderRadius:14, background:"#dba92e", color:"#182019", textAlign:"center", textDecoration:"none", fontWeight:900 }}>Voltar ao aplicativo</Link>
      </section> : <>
        <form onSubmit={generate} style={{ marginTop:18, background:"#fff", border:"1px solid #deddd5", borderRadius:22, padding:22 }}>
          <label htmlFor="qr-phone" style={{ display:"block", fontWeight:900, marginBottom:8 }}>Número do WhatsApp</label>
          <input id="qr-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(41) 99999-9999" style={{ width:"100%", boxSizing:"border-box", minHeight:56, border:"1px solid #cfd1c9", borderRadius:14, padding:"0 15px", fontSize:19 }} />
          <button type="submit" disabled={!ready || loading || digits(phone).length < 10} style={{ marginTop:14, width:"100%", minHeight:54, border:0, borderRadius:14, background:(!ready || loading || digits(phone).length < 10) ? "#d7d7d1" : "#dba92e", color:"#182019", fontWeight:900, fontSize:16 }}>{loading ? "Preparando QR..." : "Gerar QR Code"}</button>
          {error && <p role="alert" style={{ margin:"12px 0 0", color:"#aa3138", fontWeight:750, lineHeight:1.4 }}>{error}</p>}
        </form>

        {qrCode && <section style={{ marginTop:18, background:"#fff", border:"2px solid #dba92e", borderRadius:22, padding:22, textAlign:"center" }}>
          <div style={{ fontSize:12, letterSpacing:1.5, color:"#846514", fontWeight:900 }}>ESCANEIE PELO WHATSAPP BUSINESS</div>
          <img src={qrCode} alt="QR Code para conectar o WhatsApp" style={{ display:"block", width:"min(100%, 330px)", aspectRatio:"1 / 1", objectFit:"contain", margin:"16px auto", borderRadius:12 }} />
          <p style={{ margin:0, color:"#5e685f", lineHeight:1.5 }}>No celular principal: WhatsApp Business → Configurações → Aparelhos conectados → Conectar um aparelho. Escaneie este QR.</p>
          <small style={{ display:"block", marginTop:12, color:"#7b817a" }}>O QR muda com o tempo. Se expirar, gere outro nesta tela.</small>
        </section>}

        {!qrCode && pairingCode && <section style={{ marginTop:18, background:"#fff", border:"2px solid #dba92e", borderRadius:22, padding:22 }}>
          <strong style={{ fontSize:22 }}>Código: {codeGroups}</strong>
          <p style={{ margin:"10px 0 0", color:"#5e685f" }}>Se preferir, tente este código imediatamente em “Conectar usando número de telefone”.</p>
        </section>}
      </>}
    </div>
  </main>;
}
