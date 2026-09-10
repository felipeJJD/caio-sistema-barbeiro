import { getSessionAccess } from "../../../db/auth";
import { assertGalleryUploadAllowed, deleteGalleryImage, isPublicGalleryKind, listPublicGalleryImages, nextGalleryPosition, updateGalleryImage } from "../../../db/public-gallery";
import { getDb } from "../../../db/index";
import { publicGalleryImages } from "../../../db/schema";

export const dynamic = "force-dynamic";

type R2BucketLike = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

async function bucket() {
  const { env } = await import("@/runtime/env");
  const storage = (env as unknown as { BUCKET?: R2BucketLike }).BUCKET;
  if (!storage) throw new Error("O armazenamento de fotos ainda não está disponível.");
  return storage;
}

function sniffImage(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function GET() {
  const access = await getSessionAccess();
  if (!access?.isOwner) return Response.json({ error: "Acesso não autorizado." }, { status: 401 });
  return Response.json({ images: await listPublicGalleryImages(access.organizationId, true) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access?.isOwner) return Response.json({ error: "Somente o proprietário pode publicar fotos." }, { status: 403 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 5 * 1024 * 1024) return Response.json({ error: "A foto enviada é muito grande." }, { status: 413 });
    const form = await request.formData();
    const kindValue = String(form.get("kind") ?? "");
    const teamMemberId = Number(form.get("teamMemberId") ?? 0) || null;
    if (!isPublicGalleryKind(kindValue)) throw new Error("Escolha uma categoria válida.");
    if (form.get("consent") !== "true") throw new Error("Confirme que você tem autorização para publicar a imagem.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Escolha uma foto.");
    if (file.size <= 0 || file.size > 4 * 1024 * 1024) throw new Error("A foto deve ter no máximo 4 MB.");
    const buffer = await file.arrayBuffer();
    const contentType = sniffImage(new Uint8Array(buffer));
    if (!contentType) throw new Error("Use uma imagem JPG, PNG ou WebP.");
    await assertGalleryUploadAllowed(access, kindValue, teamMemberId);
    const objectKey = `public-gallery/${access.organizationId}/${crypto.randomUUID()}`;
    const position = await nextGalleryPosition(access.organizationId, kindValue, teamMemberId);
    const storage = await bucket();
    await storage.put(objectKey, buffer, { httpMetadata: { contentType } });
    try {
      const db = await getDb();
      await db.insert(publicGalleryImages).values({
        organizationId: access.organizationId,
        kind: kindValue,
        teamMemberId,
        objectKey,
        contentType,
        altText: String(form.get("altText") ?? "").trim().slice(0, 120),
        position,
        active: true,
      });
    } catch (error) {
      await storage.delete(objectKey);
      throw error;
    }
    return Response.json({ ok: true, images: await listPublicGalleryImages(access.organizationId, true) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível publicar a foto." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access?.isOwner) return Response.json({ error: "Acesso não autorizado." }, { status: 403 });
    const data = await request.json() as { id?: number; active?: boolean; direction?: "up" | "down" };
    await updateGalleryImage(access, { id: Number(data.id), active: typeof data.active === "boolean" ? data.active : undefined, direction: data.direction });
    return Response.json({ ok: true, images: await listPublicGalleryImages(access.organizationId, true) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a foto." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access?.isOwner) return Response.json({ error: "Acesso não autorizado." }, { status: 403 });
    const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
    const record = await deleteGalleryImage(access, id);
    await (await bucket()).delete(record.objectKey);
    return Response.json({ ok: true, images: await listPublicGalleryImages(access.organizationId, true) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a foto." }, { status: 400 });
  }
}
