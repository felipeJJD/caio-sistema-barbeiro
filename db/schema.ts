import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
    accountType: text("account_type").notNull().default("barbershop"),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("active"),
  statusBeforeBlock: text("status_before_block"),
  trialEndsAt: text("trial_ends_at"),
  createdByInviteId: integer("created_by_invite_id"),
  ownerWhatsapp: text("owner_whatsapp").notNull().default(""),
  signupSource: text("signup_source").notNull().default(""),
  termsAcceptedAt: text("terms_accepted_at"),
  useServiceDurationInAgenda: integer("use_service_duration_in_agenda", { mode: "boolean" }).notNull().default(false),
  openingTime: text("opening_time").notNull().default("08:00"),
  closingTime: text("closing_time").notNull().default("19:00"),
  publicBookingEnabled: integer("public_booking_enabled", { mode: "boolean" }).notNull().default(true),
  publicBookingRequiresApproval: integer("public_booking_requires_approval", { mode: "boolean" }).notNull().default(true),
  publicBookingWeekdays: text("public_booking_weekdays").notNull().default("1,2,3,4,5,6"),
  weeklyBookingHours: text("weekly_booking_hours").notNull().default(""),
  bookingPixEnabled: integer("booking_pix_enabled", { mode: "boolean" }).notNull().default(false),
  bookingPixKey: text("booking_pix_key").notNull().default(""),
  bookingCashEnabled: integer("booking_cash_enabled", { mode: "boolean" }).notNull().default(true),
  bookingDebitEnabled: integer("booking_debit_enabled", { mode: "boolean" }).notNull().default(true),
  bookingCreditEnabled: integer("booking_credit_enabled", { mode: "boolean" }).notNull().default(true),
  ownerDocumentHash: text("owner_document_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
}, (table) => [
  uniqueIndex("organizations_slug_unique").on(table.slug),
  uniqueIndex("organizations_owner_document_unique").on(table.ownerDocumentHash),
]);

export const platformSecrets = sqliteTable("platform_secrets", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  initializationVector: text("initialization_vector").notNull(),
  updatedByTeamMemberId: integer("updated_by_team_member_id").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const platformBillingSettings = sqliteTable("platform_billing_settings", {
  id: integer("id").primaryKey().default(1),
  pixPriceCents: integer("pix_price_cents").notNull().default(999),
    barberPixPriceCents: integer("barber_pix_price_cents").notNull().default(999),
  pixPeriodDays: integer("pix_period_days").notNull().default(30),
  quarterlyDiscountBps: integer("quarterly_discount_bps").notNull().default(1000),
  semiannualDiscountBps: integer("semiannual_discount_bps").notNull().default(1500),
  annualDiscountBps: integer("annual_discount_bps").notNull().default(2000),
  updatedByTeamMemberId: integer("updated_by_team_member_id"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const subscriptionPayments = sqliteTable("subscription_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  provider: text("provider").notNull().default("mercado_pago"),
  providerPaymentId: text("provider_payment_id"),
  externalReference: text("external_reference").notNull(),
  kind: text("kind").notNull().default("pix_30_days"),
  amountCents: integer("amount_cents").notNull().default(499),
  periodDays: integer("period_days").notNull().default(30),
  currency: text("currency").notNull().default("BRL"),
  status: text("status").notNull().default("pending"),
  statusDetail: text("status_detail").notNull().default(""),
  qrCode: text("qr_code"),
  qrCodeBase64: text("qr_code_base64"),
  ticketUrl: text("ticket_url"),
  expiresAt: text("expires_at"),
  paidAt: text("paid_at"),
  accessUntil: text("access_until"),
  appliedAt: text("applied_at"),
  splitAffiliateId: integer("split_affiliate_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("subscription_payments_provider_payment_unique").on(table.providerPaymentId),
  uniqueIndex("subscription_payments_external_reference_unique").on(table.externalReference),
  index("subscription_payments_organization_created_idx").on(table.organizationId, table.createdAt),
]);

export const affiliates = sqliteTable("affiliates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  payoutProvider: text("payout_provider").notNull().default("mercado_pago"),
  providerRecipientId: text("provider_recipient_id"),
  payoutStatus: text("payout_status").notNull().default("pending_setup"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const affiliateAccounts = sqliteTable("affiliate_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  affiliateId: integer("affiliate_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("affiliate_accounts_affiliate_unique").on(table.affiliateId),
  uniqueIndex("affiliate_accounts_email_unique").on(table.email),
]);

export const affiliateSessions = sqliteTable("affiliate_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: integer("account_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("affiliate_sessions_account_idx").on(table.accountId)]);

export const affiliateInvites = sqliteTable("affiliate_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  affiliateId: integer("affiliate_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("affiliate_invites_token_hash_unique").on(table.tokenHash),
  index("affiliate_invites_affiliate_idx").on(table.affiliateId, table.createdAt),
]);

export const affiliateMercadoPagoConnections = sqliteTable("affiliate_mercado_pago_connections", {
  affiliateId: integer("affiliate_id").primaryKey(),
  providerUserId: text("provider_user_id").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  accessTokenIv: text("access_token_iv").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  refreshTokenIv: text("refresh_token_iv").notNull(),
  scope: text("scope").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const affiliateMercadoPagoStates = sqliteTable("affiliate_mercado_pago_states", {
  tokenHash: text("token_hash").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("affiliate_mp_states_affiliate_idx").on(table.affiliateId)]);

export const affiliateLinks = sqliteTable("affiliate_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  affiliateId: integer("affiliate_id").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull().default(""),
  commissionBps: integer("commission_bps").notNull(),
  commissionMonths: integer("commission_months").notNull().default(12),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  createdByAffiliateAccountId: integer("created_by_affiliate_account_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("affiliate_links_code_unique").on(table.code),
  index("affiliate_links_affiliate_idx").on(table.affiliateId),
]);

export const organizationReferrals = sqliteTable("organization_referrals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  affiliateLinkId: integer("affiliate_link_id").notNull(),
  attributedAt: text("attributed_at").notNull(),
  commissionEndsAt: text("commission_ends_at").notNull(),
}, (table) => [
  uniqueIndex("organization_referrals_organization_unique").on(table.organizationId),
  index("organization_referrals_link_idx").on(table.affiliateLinkId),
]);

export const affiliateCommissions = sqliteTable("affiliate_commissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  affiliateId: integer("affiliate_id").notNull(),
  affiliateLinkId: integer("affiliate_link_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  subscriptionPaymentId: integer("subscription_payment_id").notNull(),
  rateBps: integer("rate_bps").notNull(),
  grossAmountCents: integer("gross_amount_cents").notNull(),
  commissionAmountCents: integer("commission_amount_cents").notNull(),
  status: text("status").notNull().default("pending_payout_setup"),
  providerTransferId: text("provider_transfer_id"),
  availableAt: text("available_at").notNull(),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("affiliate_commissions_payment_unique").on(table.subscriptionPaymentId),
  index("affiliate_commissions_affiliate_status_idx").on(table.affiliateId, table.status),
]);

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  plan: text("plan").notNull(),
  planKind: text("plan_kind").notNull(),
  balance: integer("balance").notNull(),
  maxBalance: integer("max_balance").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull(),
  monthlyValueCents: integer("monthly_value_cents").notNull(),
  planId: integer("plan_id").notNull().default(0),
  paymentMethodId: integer("payment_method_id").notNull().default(0),
  paidMonth: text("paid_month").notNull().default("2026-08"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});

export const membershipPayments = sqliteTable("membership_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull(),
  planName: text("plan_name").notNull(),
  planKind: text("plan_kind").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  paymentName: text("payment_name").notNull(),
  paidMonth: text("paid_month").notNull(),
  occurredAt: text("occurred_at").notNull(),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("membership_payments_org_client_month_unique").on(table.organizationId, table.clientId, table.paidMonth),
  index("membership_payments_organization_month_idx").on(table.organizationId, table.paidMonth),
]);

export const team = sqliteTable("team", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  name: text("name").notNull(),
  role: text("role").notNull(),
  loginEmail: text("login_email"),
  accessRole: text("access_role").notNull().default("barber"),
  platformAdmin: integer("platform_admin", { mode: "boolean" }).notNull().default(false),
  commissionCents: integer("commission_cents").notNull(),
  commissionRateBps: integer("commission_rate_bps").notNull().default(0),
  paymentDay: integer("payment_day").notNull().default(10),
  weeklyBookingHours: text("weekly_booking_hours").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("team_login_email_unique").on(table.loginEmail)]);

export const assistantProfiles = sqliteTable("assistant_profiles", {
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  interactionCount: integer("interaction_count").notNull().default(0),
  detailScore: integer("detail_score").notNull().default(55),
  warmthScore: integer("warmth_score").notNull().default(75),
  humorScore: integer("humor_score").notNull().default(25),
  emojiScore: integer("emoji_score").notNull().default(10),
  initiativeScore: integer("initiative_score").notNull().default(70),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("assistant_profiles_org_member_unique").on(table.organizationId, table.teamMemberId),
  index("assistant_profiles_member_idx").on(table.teamMemberId),
]);


export const teamPayments = sqliteTable("team_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  teamMemberName: text("team_member_name").notNull(),
  occurredAt: text("occurred_at").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull().default(""),
  valueCents: integer("value_cents").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("team_payments_organization_date_idx").on(table.organizationId, table.occurredAt),
  index("team_payments_member_date_idx").on(table.teamMemberId, table.occurredAt),
]);

export const teamPaymentClosures = sqliteTable("team_payment_closures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  teamMemberName: text("team_member_name").notNull(),
  periodStartDate: text("period_start_date").notNull(),
  periodEndDate: text("period_end_date").notNull(),
  closedAt: text("closed_at").notNull(),
  paymentDay: integer("payment_day").notNull().default(10),
  earnedCents: integer("earned_cents").notNull().default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  valeCents: integer("vale_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  settlementCents: integer("settlement_cents").notNull().default(0),
  recordCount: integer("record_count").notNull().default(0),
  lastDailyRecordId: integer("last_daily_record_id").notNull().default(0),
  lastProductSaleId: integer("last_product_sale_id").notNull().default(0),
  lastTeamPaymentId: integer("last_team_payment_id").notNull().default(0),
  snapshotJson: text("snapshot_json").notNull(),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  isBaseline: integer("is_baseline", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("team_payment_closures_org_member_closed_idx").on(table.organizationId, table.teamMemberId, table.closedAt),
  index("team_payment_closures_member_closed_idx").on(table.teamMemberId, table.closedAt),
  uniqueIndex("team_payment_closures_cycle_unique").on(table.organizationId, table.teamMemberId, table.lastDailyRecordId, table.lastProductSaleId, table.lastTeamPaymentId),
]);

export const publicGalleryImages = sqliteTable("public_gallery_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  kind: text("kind").notNull(),
  teamMemberId: integer("team_member_id"),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  altText: text("alt_text").notNull().default(""),
  position: integer("position").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("public_gallery_images_object_key_unique").on(table.objectKey),
  index("public_gallery_images_org_kind_position_idx").on(table.organizationId, table.kind, table.position),
  index("public_gallery_images_team_idx").on(table.organizationId, table.teamMemberId),
]);

export const authAccounts = sqliteTable("auth_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  emailVerifiedAt: text("email_verified_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("auth_accounts_email_unique").on(table.email),
  uniqueIndex("auth_accounts_team_member_unique").on(table.teamMemberId),
]);

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: integer("account_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  trialDays: integer("trial_days").notNull().default(14),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("email_verifications_token_hash_unique").on(table.tokenHash),
  index("email_verifications_account_created_idx").on(table.accountId, table.createdAt),
]);

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("password_resets_token_hash_unique").on(table.tokenHash),
  index("password_resets_account_created_idx").on(table.accountId, table.createdAt),
]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
  index("push_subscriptions_recipient_idx").on(table.organizationId, table.teamMemberId),
]);

export const appNotifications = sqliteTable("app_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  recipientTeamMemberId: integer("recipient_team_member_id").notNull(),
  actorTeamMemberId: integer("actor_team_member_id").notNull(),
  kind: text("kind").notNull().default("attendance"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  target: text("target").notNull().default("/?section=Historico"),
  relatedRecordId: integer("related_record_id"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_notifications_record_recipient_unique").on(table.kind, table.relatedRecordId, table.recipientTeamMemberId),
  index("app_notifications_recipient_idx").on(table.organizationId, table.recipientTeamMemberId, table.createdAt),
]);

export const teamInvites = sqliteTable("team_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  teamMemberId: integer("team_member_id"),
  tokenHash: text("token_hash").notNull(),
  invitedName: text("invited_name").notNull().default(""),
  role: text("role").notNull().default("Barbeiro"),
  accessRole: text("access_role").notNull().default("barber"),
  commissionRateBps: integer("commission_rate_bps").notNull().default(5000),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("team_invites_token_hash_unique").on(table.tokenHash)]);

export const barbershopInvites = sqliteTable("barbershop_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull(),
  invitedLabel: text("invited_label").notNull().default("Nova barbearia"),
  trialDays: integer("trial_days").notNull().default(14),
  createdByTeamMemberId: integer("created_by_team_member_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
  organizationId: integer("organization_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("barbershop_invites_token_hash_unique").on(table.tokenHash),
  index("barbershop_invites_created_by_idx").on(table.createdByTeamMemberId, table.createdAt),
]);

export const signupAttempts = sqliteTable("signup_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ipHash: text("ip_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("signup_attempts_ip_created_idx").on(table.ipHash, table.createdAt)]);

export const securityAttempts = sqliteTable("security_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("security_attempts_scope_key_created_idx").on(table.scope, table.keyHash, table.createdAt)]);

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  name: text("name").notNull(),
  planKind: text("plan_kind").notNull(),
  monthlyValueCents: integer("monthly_value_cents").notNull(),
  maxUses: integer("max_uses").notNull().default(4),
  barberPayoutCents: integer("barber_payout_cents").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const attendances = sqliteTable("attendances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  clientId: integer("client_id").notNull(),
  barberId: integer("barber_id").notNull(),
  service: text("service").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  deletedAt: text("deleted_at"),
});

export const paymentMethods = sqliteTable("payment_methods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  name: text("name").notNull(),
  feeBps: integer("fee_bps").notNull().default(0),
});

export const shopProducts = sqliteTable("shop_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Geral"),
  costCents: integer("cost_cents").notNull().default(0),
  priceCents: integer("price_cents").notNull(),
  commissionRateBps: integer("commission_rate_bps").notNull().default(0),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(2),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
}, (table) => [
  index("shop_products_organization_name_idx").on(table.organizationId, table.name),
]);

export const productSales = sqliteTable("product_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  productId: integer("product_id").notNull(),
  sellerTeamMemberId: integer("seller_team_member_id").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  dailyRecordId: integer("daily_record_id"),
  occurredAt: text("occurred_at").notNull(),
  clientName: text("client_name").notNull().default("Cliente não informado"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  commissionRateBps: integer("commission_rate_bps").notNull().default(0),
  commissionCents: integer("commission_cents").notNull().default(0),
  feeCents: integer("fee_cents").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("product_sales_organization_date_idx").on(table.organizationId, table.occurredAt),
  index("product_sales_seller_date_idx").on(table.sellerTeamMemberId, table.occurredAt),
  index("product_sales_daily_record_idx").on(table.dailyRecordId),
]);

export const dailyRecords = sqliteTable("daily_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  occurredAt: text("occurred_at").notNull(),
  clientName: text("client_name").notNull(),
  barberId: integer("barber_id").notNull(),
  serviceId: integer("service_id").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  valueCents: integer("value_cents").notNull(),
  commissionRateBps: integer("commission_rate_bps").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  tipCents: integer("tip_cents").notNull().default(0),
  feeCents: integer("fee_cents").notNull().default(0),
  origin: text("origin").notNull().default("Retorno"),
  recordType: text("record_type").notNull().default("Avulso"),
  membershipClientId: integer("membership_client_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("daily_records_organization_date_idx").on(table.organizationId, table.occurredAt),
  index("daily_records_barber_date_idx").on(table.barberId, table.occurredAt),
]);

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  occurredAt: text("occurred_at").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  valueCents: integer("value_cents").notNull(),
  paid: integer("paid", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("expenses_organization_date_idx").on(table.organizationId, table.occurredAt),
]);

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  month: text("month").notNull(),
  revenueCents: integer("revenue_cents").notNull().default(0),
  grossProfitCents: integer("gross_profit_cents").notNull().default(0),
  expenseCents: integer("expense_cents").notNull().default(0),
  netProfitCents: integer("net_profit_cents").notNull().default(0),
  attendanceTarget: integer("attendance_target").notNull().default(0),
});

/** Idempotency marker for records copied from the retired Sites database. */
export const legacyRecordImports = sqliteTable("legacy_record_imports", {
  sourceSystem: text("source_system").notNull(),
  sourceRecordId: integer("source_record_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  dailyRecordId: integer("daily_record_id").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("legacy_record_imports_source_unique").on(table.sourceSystem, table.sourceRecordId),
  uniqueIndex("legacy_record_imports_target_unique").on(table.dailyRecordId),
]);

export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().default(1),
  appointmentDate: text("appointment_date").notNull(),
  appointmentTime: text("appointment_time").notNull(),
  clientName: text("client_name").notNull(),
  phone: text("phone").notNull().default(""),
  serviceId: integer("service_id").notNull(),
  barberId: integer("barber_id").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("Agendado"),
  reminderSentAt: text("reminder_sent_at"),
  paymentChoice: text("payment_choice").notNull().default("Dinheiro"),
  paymentConfirmationToken: text("payment_confirmation_token"),
  managementTokenHash: text("management_token_hash"),
  membershipClientId: integer("membership_client_id"),
}, (table) => [
  index("appointments_organization_date_barber_idx").on(table.organizationId, table.appointmentDate, table.barberId),
]);
