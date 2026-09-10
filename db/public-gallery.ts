import { and, asc, eq, isNull } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { publicGalleryImages, team } from "./schema";

export const PUBLIC_GALLERY_KINDS = ["cover", "barber", "shop", "work"] as const;
export type PublicGalleryKind = typeof PUBLIC_GALLERY_KINDS[number];

export type PublicGalleryImage = {
  id: number;
  kind: PublicGalleryKind;
  teamMemberId: number | null;
  barberName: string | null;
  url: string;
  altText: string;
  position: number;
  active: boolean;
};

export function isPublicGalleryKind(value: string): value is PublicGalleryKind {
  return PUBLIC_GALLERY_KINDS.includes(value as PublicGalleryKind);
}

export async function listPublicGalleryImages(organizationId: number, includeHidden = false): Promise<PublicGalleryImage[]> {
  const db = await getDb();
  const condition = includeHidden
    ? eq(publicGalleryImages.organizationId, organizationId)
    : and(eq(publicGalleryImages.organizationId, organizationId), eq(publicGalleryImages.active, true));
  const rows = await db.select({
    id: publicGalleryImages.id,
    kind: publicGalleryImages.kind,
    teamMemberId: publicGalleryImages.teamMemberId,
    barberName: team.name,
    altText: publicGalleryImages.altText,
    position: publicGalleryImages.position,
    active: publicGalleryImages.active,
  }).from(publicGalleryImages)
    .leftJoin(team, eq(publicGalleryImages.teamMemberId, team.id))
    .where(condition)
    .orderBy(asc(publicGalleryImages.kind), asc(publicGalleryImages.position), asc(publicGalleryImages.id));
  return rows.map((row) => ({
    ...row,
    kind: row.kind as PublicGalleryKind,
    url: `/api/public-gallery/image/${row.id}`,
  }));
}

export async function nextGalleryPosition(organizationId: number, kind: PublicGalleryKind, teamMemberId: number | null) {
  const rows = await listPublicGalleryImages(organizationId, true);
  const matching = rows.filter((item) => item.kind === kind && item.teamMemberId === teamMemberId);
  return matching.reduce((largest, item) => Math.max(largest, item.position), -1) + 1;
}

export async function assertGalleryUploadAllowed(access: AccessContext, kind: PublicGalleryKind, teamMemberId: number | null) {
  requireOwner(access);
  const db = await getDb();
  if ((kind === "barber" || kind === "work") && !teamMemberId) throw new Error("Escolha o profissional desta foto.");
  if ((kind === "cover" || kind === "shop") && teamMemberId) throw new Error("Esta categoria não deve ter profissional.");
  if (teamMemberId) {
    const member = (await db.select({ id: team.id }).from(team).where(and(
      eq(team.id, teamMemberId),
      eq(team.organizationId, access.organizationId),
      eq(team.active, true),
    )).limit(1))[0];
    if (!member) throw new Error("Profissional inválido.");
  }
  const images = await listPublicGalleryImages(access.organizationId, true);
  const count = images.filter((item) => item.kind === kind && item.teamMemberId === teamMemberId).length;
  const limit = kind === "cover" || kind === "barber" ? 1 : kind === "shop" ? 6 : 8;
  if (count >= limit) throw new Error(kind === "cover" ? "A capa já foi cadastrada. Exclua a atual para trocar." : `Limite de ${limit} fotos atingido nesta seleção.`);
}

export async function galleryImageRecord(id: number) {
  const db = await getDb();
  return (await db.select().from(publicGalleryImages).where(eq(publicGalleryImages.id, id)).limit(1))[0] ?? null;
}

export async function deleteGalleryImage(access: AccessContext, id: number) {
  requireOwner(access);
  const record = await galleryImageRecord(id);
  if (!record || record.organizationId !== access.organizationId) throw new Error("Foto não encontrada.");
  const db = await getDb();
  await db.delete(publicGalleryImages).where(and(eq(publicGalleryImages.id, id), eq(publicGalleryImages.organizationId, access.organizationId)));
  return record;
}

export async function updateGalleryImage(access: AccessContext, input: { id: number; active?: boolean; direction?: "up" | "down" }) {
  requireOwner(access);
  const db = await getDb();
  const record = await galleryImageRecord(input.id);
  if (!record || record.organizationId !== access.organizationId) throw new Error("Foto não encontrada.");
  if (typeof input.active === "boolean") {
    await db.update(publicGalleryImages).set({ active: input.active }).where(and(eq(publicGalleryImages.id, record.id), eq(publicGalleryImages.organizationId, access.organizationId)));
  }
  if (input.direction) {
    const sameOwner = record.teamMemberId === null ? isNull(publicGalleryImages.teamMemberId) : eq(publicGalleryImages.teamMemberId, record.teamMemberId);
    const siblings = await db.select().from(publicGalleryImages).where(and(
      eq(publicGalleryImages.organizationId, access.organizationId),
      eq(publicGalleryImages.kind, record.kind),
      sameOwner,
    )).orderBy(asc(publicGalleryImages.position), asc(publicGalleryImages.id));
    const index = siblings.findIndex((item) => item.id === record.id);
    const other = siblings[index + (input.direction === "up" ? -1 : 1)];
    if (other) {
      await db.batch([
        db.update(publicGalleryImages).set({ position: other.position }).where(eq(publicGalleryImages.id, record.id)),
        db.update(publicGalleryImages).set({ position: record.position }).where(eq(publicGalleryImages.id, other.id)),
      ]);
    }
  }
}
