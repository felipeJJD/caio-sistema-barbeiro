"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { showAppToast } from "./app-toast";

type GalleryImage = {
  id: number;
  kind: "cover" | "barber" | "shop" | "work";
  teamMemberId: number | null;
  barberName: string | null;
  url: string;
  altText: string;
  position: number;
  active: boolean;
};

type TeamMember = { id: number; name: string; active: boolean };

const labels = {
  cover: { title: "Foto de capa", help: "A primeira imagem da página pública", limit: 1 },
  barber: { title: "Foto do profissional", help: "Aparece na escolha do barbeiro", limit: 1 },
  shop: { title: "Espaço da barbearia", help: "Fachada, cadeiras e ambiente", limit: 6 },
  work: { title: "Trabalhos realizados", help: "Portfólio de cortes por profissional", limit: 8 },
} as const;

async function compressedImage(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Escolha uma foto com até 10 MB.");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar esta foto.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
  if (!blob) throw new Error("Não foi possível reduzir esta foto.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
}

export function PublicGallerySettings({ team }: { team: TeamMember[] }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [kind, setKind] = useState<GalleryImage["kind"]>("cover");
  const [teamMemberId, setTeamMemberId] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const activeTeam = useMemo(() => team.filter((member) => member.active), [team]);
  const needsBarber = kind === "barber" || kind === "work";

  useEffect(() => {
    fetch("/api/public-gallery", { cache: "no-store" })
      .then(async (response) => response.json() as Promise<{ images?: GalleryImage[]; error?: string }>)
      .then((body) => body.images ? setImages(body.images) : setFeedback(body.error ?? "Não foi possível carregar as fotos."))
      .catch(() => setFeedback("Não foi possível carregar as fotos."));
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : "");
    setFeedback("");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file) { setFeedback("Escolha uma foto."); return; }
    if (needsBarber && !teamMemberId) { setFeedback("Escolha o profissional desta foto."); return; }
    if (!consent) { setFeedback("Confirme a autorização para publicar."); return; }
    setBusy(true); setFeedback("Preparando a foto...");
    try {
      const prepared = await compressedImage(file);
      const form = new FormData();
      form.set("file", prepared);
      form.set("kind", kind);
      form.set("teamMemberId", String(needsBarber ? teamMemberId : 0));
      form.set("consent", "true");
      form.set("altText", kind === "cover" ? "Capa da barbearia" : kind === "shop" ? "Espaço da barbearia" : `Trabalho de ${activeTeam.find((member) => member.id === teamMemberId)?.name ?? "barbeiro"}`);
      const response = await fetch("/api/public-gallery", { method: "POST", body: form });
      const body = await response.json() as { images?: GalleryImage[]; error?: string };
      if (!response.ok || !body.images) throw new Error(body.error ?? "Não foi possível publicar a foto.");
      setImages(body.images); setFile(null); setConsent(false); setFeedback(""); showAppToast("Foto publicada no link público.");
      if (preview) URL.revokeObjectURL(preview); setPreview("");
      const input = formElement.elements.namedItem("photo") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível publicar a foto.");
    } finally { setBusy(false); }
  }

  async function change(id: number, input: { active?: boolean; direction?: "up" | "down" }) {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/public-gallery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...input }) });
      const body = await response.json() as { images?: GalleryImage[]; error?: string };
      if (!response.ok || !body.images) throw new Error(body.error ?? "Não foi possível alterar a foto.");
      setImages(body.images);
      showAppToast(input.direction ? "Ordem das fotos atualizada." : input.active ? "Foto exibida no link público." : "Foto ocultada do link público.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível alterar a foto."); }
    finally { setBusy(false); }
  }

  async function remove(image: GalleryImage) {
    if (!window.confirm("Excluir esta foto do link público?")) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/public-gallery?id=${image.id}`, { method: "DELETE" });
      const body = await response.json() as { images?: GalleryImage[]; error?: string };
      if (!response.ok || !body.images) throw new Error(body.error ?? "Não foi possível excluir a foto.");
      setImages(body.images); setFeedback(""); showAppToast("Foto excluída.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível excluir a foto."); }
    finally { setBusy(false); }
  }

  return <section className="panel public-gallery-admin">
    <div className="public-gallery-admin-heading"><div><span>VITRINE DA BARBEARIA</span><h2>Fotos do link público</h2><p>Mostre sua equipe, o espaço e os melhores trabalhos sem deixar o agendamento pesado.</p></div><b>{images.filter((image) => image.active).length} publicadas</b></div>
    <div className="public-gallery-admin-grid">
      <form className="public-gallery-upload" onSubmit={upload}>
        <label><span>TIPO DE FOTO</span><select value={kind} onChange={(event) => { setKind(event.target.value as GalleryImage["kind"]); setTeamMemberId(0); }}><option value="cover">Foto de capa</option><option value="barber">Foto do profissional</option><option value="shop">Espaço da barbearia</option><option value="work">Trabalho realizado</option></select></label>
        {needsBarber && <label><span>PROFISSIONAL</span><select value={teamMemberId} onChange={(event) => setTeamMemberId(Number(event.target.value))} required><option value="0">Escolha o barbeiro</option>{activeTeam.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>}
        <label className={`public-gallery-drop${preview ? " has-preview" : ""}`} style={preview ? { backgroundImage: `linear-gradient(#161a1670,#161a1670),url(${preview})` } : undefined}><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /><span>{preview ? "Trocar foto" : "+ Escolher foto"}</span><small>{labels[kind].help} · limite {labels[kind].limit}</small></label>
        <label className="public-gallery-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Declaro que tenho autorização para publicar esta imagem.</span></label>
        <button className="primary-button" disabled={busy || !file || !consent}>{busy ? "Salvando..." : "Publicar foto"}</button>
        {feedback && <p className="public-gallery-feedback" role="status">{feedback}</p>}
      </form>
      <div className="public-gallery-list">
        {images.map((image) => { const peers = images.filter((item) => item.kind === image.kind && item.teamMemberId === image.teamMemberId); const peerIndex = peers.findIndex((item) => item.id === image.id); return <article className={image.active ? "" : "hidden"} key={image.id}><img src={image.url} alt={image.altText || labels[image.kind].title} /><div><strong>{labels[image.kind].title}</strong><small>{image.barberName ?? (image.kind === "shop" ? "Barbearia" : "Página pública")}{!image.active ? " · Oculta" : ""}</small></div><span className="public-gallery-order"><button type="button" disabled={busy || peerIndex === 0} onClick={() => void change(image.id, { direction: "up" })} aria-label="Mover foto para cima">↑</button><button type="button" disabled={busy || peerIndex === peers.length - 1} onClick={() => void change(image.id, { direction: "down" })} aria-label="Mover foto para baixo">↓</button></span><button type="button" disabled={busy} onClick={() => void change(image.id, { active: !image.active })}>{image.active ? "Ocultar" : "Mostrar"}</button><button className="delete" type="button" disabled={busy} onClick={() => void remove(image)}>Excluir</button></article>; })}
        {!images.length && <div className="public-gallery-empty"><span>▧</span><strong>Sua vitrine começa aqui</strong><small>Adicione primeiro uma foto de capa.</small></div>}
      </div>
    </div>
  </section>;
}
