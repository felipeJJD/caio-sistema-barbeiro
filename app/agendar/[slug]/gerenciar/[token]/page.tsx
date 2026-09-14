import { notFound } from "next/navigation";
import { appDate } from "@/lib/app-date";
import { getPublicBookingManagement } from "@/db/public-booking";
import { PublicBookingManageApp } from "@/app/ui/public-booking-manage-app";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const booking = await getPublicBookingManagement(slug, token);
  if (!booking) notFound();
  return <PublicBookingManageApp initialBooking={booking} token={token} today={appDate()} />;
}
