import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingData } from "../../../db/public-booking";
import { appDate } from "../../../lib/app-date";
import { PublicBookingApp } from "../../ui/public-booking-app";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  if (!data) return { title: "Agendamento online | Cortou Anotou" };
  const title = `Agende seu horário | ${data.organization.name}`;
  const description = `Escolha o serviço, o profissional, o dia e o horário disponível em ${data.organization.name}.`;
  const cover = data.gallery.find((image) => image.kind === "cover");
  const preview = `https://cortouanotou.com.br/api/public-booking/preview/${encodeURIComponent(data.organization.slug)}?v=${cover?.id ?? 0}-3`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url: `https://cortouanotou.com.br/agendar/${encodeURIComponent(data.organization.slug)}`, images: [{ url: preview, width: 1200, height: 630, alt: `Agendamento online da ${data.organization.name}` }] },
    twitter: { card: "summary_large_image", title, description, images: [preview] },
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  if (!data) notFound();
  return <PublicBookingApp data={data} today={appDate()} />;
}
