import { eq } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { organizations } from "./schema";

export type BookingPaymentSettings = {
  pixEnabled: boolean;
  pixKey: string;
  cashEnabled: boolean;
  debitEnabled: boolean;
  creditEnabled: boolean;
};

export async function getBookingPaymentSettings(organizationId: number): Promise<BookingPaymentSettings> {
  const db = await getDb();
  const organization = (await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0];
  if (!organization) throw new Error("Barbearia não encontrada.");
  return { pixEnabled: organization.bookingPixEnabled, pixKey: organization.bookingPixKey, cashEnabled: organization.bookingCashEnabled, debitEnabled: organization.bookingDebitEnabled, creditEnabled: organization.bookingCreditEnabled };
}

export async function saveBookingPaymentSettings(access: AccessContext, input: BookingPaymentSettings) {
  requireOwner(access);
  const pixKey = input.pixKey.trim().slice(0, 160);
  if (input.pixEnabled && !pixKey) throw new Error("Informe a chave Pix antes de ativar o pagamento antecipado.");
  if (!input.pixEnabled && !input.cashEnabled && !input.debitEnabled && !input.creditEnabled) throw new Error("Deixe pelo menos uma forma de pagamento ativa.");
  const db = await getDb();
  await db.update(organizations).set({ bookingPixEnabled: input.pixEnabled, bookingPixKey: pixKey, bookingCashEnabled: input.cashEnabled, bookingDebitEnabled: input.debitEnabled, bookingCreditEnabled: input.creditEnabled }).where(eq(organizations.id, access.organizationId));
}
