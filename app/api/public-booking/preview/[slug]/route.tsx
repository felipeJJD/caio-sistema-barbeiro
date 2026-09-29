import { ImageResponse } from "next/og";
import { getPublicBookingData } from "../../../../../db/public-booking";
import { galleryImageRecord } from "../../../../../db/public-gallery";

export const dynamic = "force-dynamic";

type ImageObject = { body: ReadableStream };
type ImageBucket = { get(key: string): Promise<ImageObject | null> };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  if (!data) return new Response("Barbearia não encontrada.", { status: 404 });

  // Only the barbershop's active cover may appear in the share card. Work photos
  // and professional portraits remain in the booking page, never in its preview.
  const cover = data.gallery.find((image) => image.kind === "cover");
  let coverSource: string | null = null;
  if (cover) {
    const record = await galleryImageRecord(cover.id);
    if (record?.organizationId === data.organization.id && record.active && record.kind === "cover") {
      const { env } = await import("@/runtime/env");
      const bucket = (env as unknown as { BUCKET?: ImageBucket }).BUCKET;
      const object = await bucket?.get(record.objectKey);
      if (object && ["image/jpeg", "image/png", "image/webp"].includes(record.contentType)) {
        coverSource = `data:${record.contentType};base64,${Buffer.from(await new Response(object.body).arrayBuffer()).toString("base64")}`;
      }
    }
  }

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#17221b", color: "#f7f6f0", padding: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", border: "2px solid #cda447", borderRadius: 30, padding: 40 }}>
        {coverSource ? <img src={coverSource} alt="" width={190} height={190} style={{ objectFit: "contain", borderRadius: 18 }} /> : <div style={{ display: "flex", fontSize: 80, color: "#cda447", letterSpacing: -8 }}>C|A</div>}
        <div style={{ display: "flex", marginTop: 20, fontSize: 24, color: "#cda447", letterSpacing: 4 }}>AGENDAMENTO ONLINE</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 48, fontWeight: 700, textAlign: "center", lineHeight: 1.1, maxWidth: "100%" }}>{data.organization.name}</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
