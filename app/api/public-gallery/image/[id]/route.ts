import { galleryImageRecord } from "../../../../../db/public-gallery";

export const dynamic = "force-dynamic";

type R2ObjectLike = { body: ReadableStream; httpEtag?: string };
type R2BucketLike = { get(key: string): Promise<R2ObjectLike | null> };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await galleryImageRecord(Number(id));
  if (!record) return new Response("Foto não encontrada.", { status: 404 });
  const { env } = await import("@/runtime/env");
  const storage = (env as unknown as { BUCKET?: R2BucketLike }).BUCKET;
  if (!storage) return new Response("Foto indisponível.", { status: 503 });
  const object = await storage.get(record.objectKey);
  if (!object) return new Response("Foto não encontrada.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": record.contentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}
