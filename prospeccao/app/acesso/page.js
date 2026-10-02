"use client";

import { useState } from "react";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível liberar o acesso.");
      window.location.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível liberar o acesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0d1714", color: "#f6f0df", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <section style={{ width: "100%", maxWidth: 430, border: "1px solid rgba(212,178,95,.28)", borderRadius: 24, padding: 28, background: "#13211d", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: "#e4c06a", color: "#10201a", fontWeight: 900 }}>C|A</div>
          <div><strong style={{ display: "block", fontSize: 18 }}>C.A. Prospecção</strong><span style={{ opacity: .62, fontSize: 13 }}>Área privada</span></div>
        </div>

        <h1 style={{ fontSize: 30, lineHeight: 1.05, margin: "0 0 10px" }}>Acesso protegido</h1>
        <p style={{ margin: "0 0 24px", opacity: .72, lineHeight: 1.5 }}>Digite o código para abrir sua busca e o funil de prospecção.</p>

        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Código de acesso</label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoComplete="current-password"
            autoCapitalize="characters"
            spellCheck="false"
            placeholder="CA-XXXX-XXXX-XXXX"
            style={{ boxSizing: "border-box", width: "100%", minHeight: 54, borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", background: "#0d1714", color: "#fff", padding: "0 16px", fontSize: 17, letterSpacing: ".04em", outline: "none" }}
          />
          {error && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(190,55,55,.16)", color: "#ffd5d5", fontSize: 14 }}>{error}</div>}
          <button disabled={loading || !code.trim()} style={{ width: "100%", minHeight: 54, marginTop: 16, border: 0, borderRadius: 14, background: "#e4c06a", color: "#10201a", fontSize: 16, fontWeight: 900, opacity: loading || !code.trim() ? .55 : 1 }}>
            {loading ? "Liberando acesso..." : "Entrar"}
          </button>
        </form>
        <p style={{ margin: "18px 0 0", opacity: .48, fontSize: 12, lineHeight: 1.4 }}>Depois de entrar, este aparelho permanece autorizado por até 30 dias.</p>
      </section>
    </main>
  );
}
