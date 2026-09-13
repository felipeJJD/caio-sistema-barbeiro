import { changeOwnPassword, getSessionAccess, setPasswordForTeamMember } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";
import { cancelAppointment, completeAppointment, confirmAppointment, createDailyRecord, deleteAppointment, deleteClient, deleteDailyRecord, deleteExpense, deleteMembershipPayment, deletePlan, deleteService, deleteTeamPayment, ensureDemoData, getDashboardData, markAppointmentReminderSent, registerAttendance, renewClient, saveAgendaSettings, saveAppointment, saveClient, saveExpense, saveGoal, savePayment, savePlan, saveService, saveTeamMember, saveTeamPayment, syncFinishedAppointments, updateDailyRecord } from "../../../db/dashboard";
import { deleteProduct, deleteProductSale, registerProductSale, registerProductSaleBundle, saveProduct } from "../../../db/products";
import { appMonth } from "../../../lib/app-date";

function productItems(value: string | number | boolean | undefined) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as Array<{ saleId?: number; productId?: number; quantity?: number }>;
    return Array.isArray(parsed) ? parsed.map((item) => ({ saleId: item.saleId ? Number(item.saleId) : undefined, productId: Number(item.productId), quantity: Number(item.quantity) })) : [];
  } catch {
    throw new Error("Não foi possível ler os produtos do atendimento.");
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou. Peça ao proprietário para renovar o plano." }, { status: 402 });
    await ensureDemoData();

    const data = await request.json() as Record<string, string | number | boolean | undefined>;
    if (data.action === "attendance") {
      if (!data.clientId) return Response.json({ error: "Cliente inválido." }, { status: 400 });
      await registerAttendance(access, Number(data.clientId), Number(data.barberId ?? access.teamMemberId));
    }
    else if (data.action === "renew") {
      if (!data.clientId) return Response.json({ error: "Cliente inválido." }, { status: 400 });
      await renewClient(access, Number(data.clientId));
    }
    else if (data.action === "daily-record") await createDailyRecord(access, { occurredAt: String(data.occurredAt), recordType: String(data.recordType ?? "Avulso"), clientName: String(data.clientName ?? ""), membershipClientId: Number(data.membershipClientId ?? 0), barberId: Number(data.barberId), serviceId: Number(data.serviceId ?? 0), paymentMethodId: Number(data.paymentMethodId), origin: String(data.origin ?? "Retorno"), tipCents: Number(data.tipCents ?? 0), productItems: productItems(data.productItems) });
    else if (data.action === "update-daily-record") await updateDailyRecord(access, { id: Number(data.id), occurredAt: String(data.occurredAt), clientName: String(data.clientName ?? ""), membershipClientId: Number(data.membershipClientId ?? 0), barberId: Number(data.barberId), serviceId: Number(data.serviceId ?? 0), paymentMethodId: Number(data.paymentMethodId), origin: String(data.origin ?? "Retorno"), tipCents: Number(data.tipCents ?? 0), productItems: productItems(data.productItems) });
    else if (data.action === "delete-daily-record") await deleteDailyRecord(access, Number(data.id));
    else if (data.action === "expense") await saveExpense(access, { id: data.id ? Number(data.id) : undefined, occurredAt: String(data.occurredAt), type: String(data.type ?? "Variável"), description: String(data.description ?? ""), valueCents: Number(data.valueCents), paid: Boolean(data.paid) });
    else if (data.action === "delete-expense") await deleteExpense(access, Number(data.id));
    else if (data.action === "team-payment") await saveTeamPayment(access, { id: data.id ? Number(data.id) : undefined, teamMemberId: Number(data.teamMemberId), occurredAt: String(data.occurredAt), kind: String(data.kind ?? "Vale"), reason: String(data.reason ?? ""), valueCents: Number(data.valueCents) });
    else if (data.action === "delete-team-payment") await deleteTeamPayment(access, Number(data.id));
    else if (data.action === "save-product") await saveProduct(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), category: String(data.category ?? "Geral"), costCents: Number(data.costCents), priceCents: Number(data.priceCents), commissionRateBps: Number(data.commissionRateBps), stockQuantity: Number(data.stockQuantity), lowStockThreshold: Number(data.lowStockThreshold), active: Boolean(data.active) });
    else if (data.action === "delete-product") await deleteProduct(access, Number(data.id));
    else if (data.action === "product-sale") await registerProductSale(access, { occurredAt: String(data.occurredAt), clientName: String(data.clientName ?? ""), sellerTeamMemberId: Number(data.sellerTeamMemberId ?? access.teamMemberId), productId: Number(data.productId), paymentMethodId: Number(data.paymentMethodId), quantity: Number(data.quantity) });
    else if (data.action === "product-sale-bundle") await registerProductSaleBundle(access, { occurredAt: String(data.occurredAt), clientName: String(data.clientName ?? ""), sellerTeamMemberId: Number(data.sellerTeamMemberId ?? access.teamMemberId), paymentMethodId: Number(data.paymentMethodId), items: productItems(data.productItems) ?? [] });
    else if (data.action === "delete-product-sale") await deleteProductSale(access, Number(data.id));
    else if (data.action === "appointment") await saveAppointment(access, { id: data.id ? Number(data.id) : undefined, appointmentDate: String(data.appointmentDate), appointmentTime: String(data.appointmentTime), clientName: String(data.clientName ?? ""), phone: String(data.phone ?? ""), serviceId: Number(data.serviceId), barberId: Number(data.barberId), notes: String(data.notes ?? "") });
    else if (data.action === "confirm-appointment") await confirmAppointment(access, Number(data.id));
    else if (data.action === "complete-appointment") await completeAppointment(access, { id: Number(data.id), occurredAt: String(data.occurredAt ?? ""), paymentMethodId: Number(data.paymentMethodId), membershipClientId: Number(data.membershipClientId ?? 0), tipCents: Number(data.tipCents ?? 0) });
    else if (data.action === "mark-appointment-reminder") await markAppointmentReminderSent(access, Number(data.id));
    else if (data.action === "sync-finished-appointments") await syncFinishedAppointments(access);
    else if (data.action === "cancel-appointment") await cancelAppointment(access, Number(data.id));
    else if (data.action === "delete-appointment") await deleteAppointment(access, Number(data.id));
    else if (data.action === "save-client") await saveClient(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), phone: String(data.phone ?? ""), planId: Number(data.planId), paymentMethodId: Number(data.paymentMethodId), status: String(data.status ?? "Ativo"), dueDate: String(data.dueDate), paidMonth: String(data.paidMonth ?? appMonth()) });
    else if (data.action === "delete-client") await deleteClient(access, Number(data.id));
    else if (data.action === "delete-membership-payment") await deleteMembershipPayment(access, Number(data.id));
    else if (data.action === "save-plan") await savePlan(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), planKind: String(data.planKind ?? ""), monthlyValueCents: Number(data.monthlyValueCents), maxUses: Number(data.maxUses), barberPayoutCents: Number(data.barberPayoutCents), active: Boolean(data.active) });
    else if (data.action === "delete-plan") await deletePlan(access, Number(data.id));
    else if (data.action === "save-service") await saveService(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), priceCents: Number(data.priceCents), durationMinutes: Number(data.durationMinutes), active: Boolean(data.active) });
    else if (data.action === "delete-service") await deleteService(access, Number(data.id));
    else if (data.action === "save-agenda-settings") await saveAgendaSettings(access, { useServiceDuration: Boolean(data.useServiceDuration), openingTime: String(data.openingTime ?? "08:00"), closingTime: String(data.closingTime ?? "19:00"), publicBookingEnabled: typeof data.publicBookingEnabled === "boolean" ? data.publicBookingEnabled : undefined, publicBookingRequiresApproval: typeof data.publicBookingRequiresApproval === "boolean" ? data.publicBookingRequiresApproval : undefined, publicBookingWeekdays: typeof data.publicBookingWeekdays === "string" ? String(data.publicBookingWeekdays).split(",").map(Number) : undefined });
    else if (data.action === "save-payment") await savePayment(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), feeBps: Number(data.feeBps) });
    else if (data.action === "save-team") await saveTeamMember(access, { id: data.id ? Number(data.id) : undefined, name: String(data.name ?? ""), role: String(data.role ?? "Barbeiro"), loginEmail: String(data.loginEmail ?? ""), accessRole: String(data.accessRole ?? "barber"), commissionRateBps: Number(data.commissionRateBps), active: Boolean(data.active) });
    else if (data.action === "set-team-password") await setPasswordForTeamMember(access, Number(data.teamMemberId), String(data.password ?? ""));
    else if (data.action === "change-my-password") await changeOwnPassword(access, String(data.password ?? ""));
    else if (data.action === "save-goal") await saveGoal(access, { revenueCents: Number(data.revenueCents), grossProfitCents: Number(data.grossProfitCents), expenseCents: Number(data.expenseCents), netProfitCents: Number(data.netProfitCents), attendanceTarget: Number(data.attendanceTarget) });
    else return Response.json({ error: "Ação inválida." }, { status: 400 });

    const freshData = await getDashboardData(access);
    return Response.json({ ok: true, data: freshData });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a ação." }, { status: 400 });
  }
}
