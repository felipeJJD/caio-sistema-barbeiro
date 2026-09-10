import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwnBarber, requireOwner } from "./access";
import { getDb } from "./index";
import { paymentMethods, productSales, shopProducts, team } from "./schema";
import { validClientName } from "../lib/client-name";

export type ShopProduct = {
  id: number;
  name: string;
  category: string;
  costCents: number;
  priceCents: number;
  commissionRateBps: number;
  stockQuantity: number;
  lowStockThreshold: number;
  active: boolean;
};

export type ProductSale = {
  id: number;
  occurredAt: string;
  clientName: string;
  dailyRecordId: number | null;
  productId: number;
  productName: string;
  sellerTeamMemberId: number;
  sellerName: string;
  paymentMethodId: number;
  paymentName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  commissionRateBps: number;
  commissionCents: number;
  feeCents: number;
  revenueCents: number;
  profitCents: number;
};

export type ProductSaleItemInput = { productId: number; quantity: number };
export type EditableProductSaleItemInput = ProductSaleItemInput & { saleId?: number };
export type ProductSaleBundleInput = {
  occurredAt: string;
  clientName: string;
  sellerTeamMemberId: number;
  paymentMethodId: number;
  items: ProductSaleItemInput[];
  dailyRecordId?: number;
};

function integerInRange(value: number, minimum: number, maximum: number, message: string) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) throw new Error(message);
  return normalized;
}

function moneyCents(value: number, allowZero: boolean, label: string) {
  const normalized = Math.round(Number(value));
  const minimum = allowZero ? 0 : 1;
  if (!Number.isFinite(normalized) || normalized < minimum || normalized > 100000000) throw new Error(`Informe ${label} válido.`);
  return normalized;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe a data da venda.");
  return value;
}

function normalizeItems(items: ProductSaleItemInput[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("Adicione pelo menos um produto à venda.");
  const aggregated = new Map<number, number>();
  for (const item of items) {
    const productId = integerInRange(item.productId, 1, 1000000000, "Escolha um produto válido.");
    const quantity = integerInRange(item.quantity, 1, 999, "Informe uma quantidade válida.");
    aggregated.set(productId, (aggregated.get(productId) ?? 0) + quantity);
  }
  return [...aggregated.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export async function getProductsData(access: AccessContext, period?: { start: string; end: string }): Promise<{ products: ShopProduct[]; sales: ProductSale[] }> {
  const db = await getDb();
  const rawProducts = await db.select().from(shopProducts).where(
    access.isOwner
      ? and(eq(shopProducts.organizationId, access.organizationId), isNull(shopProducts.deletedAt))
      : and(eq(shopProducts.organizationId, access.organizationId), eq(shopProducts.active, true), isNull(shopProducts.deletedAt)),
  ).orderBy(desc(shopProducts.active), shopProducts.name);

  const ownershipCondition = access.isOwner
    ? eq(productSales.organizationId, access.organizationId)
    : and(eq(productSales.organizationId, access.organizationId), eq(productSales.sellerTeamMemberId, access.teamMemberId));
  const saleCondition = period
    ? and(ownershipCondition, gte(productSales.occurredAt, period.start), lte(productSales.occurredAt, period.end))
    : ownershipCondition;
  const rawSales = await db.select({
    id: productSales.id,
    occurredAt: productSales.occurredAt,
    clientName: productSales.clientName,
    dailyRecordId: productSales.dailyRecordId,
    productId: productSales.productId,
    productName: shopProducts.name,
    sellerTeamMemberId: productSales.sellerTeamMemberId,
    sellerName: team.name,
    paymentMethodId: productSales.paymentMethodId,
    paymentName: paymentMethods.name,
    quantity: productSales.quantity,
    unitPriceCents: productSales.unitPriceCents,
    unitCostCents: productSales.unitCostCents,
    commissionRateBps: productSales.commissionRateBps,
    commissionCents: productSales.commissionCents,
    feeCents: productSales.feeCents,
  }).from(productSales)
    .innerJoin(shopProducts, eq(productSales.productId, shopProducts.id))
    .innerJoin(team, eq(productSales.sellerTeamMemberId, team.id))
    .innerJoin(paymentMethods, eq(productSales.paymentMethodId, paymentMethods.id))
    .where(saleCondition)
    .orderBy(desc(productSales.occurredAt), desc(productSales.id));

  return {
    products: rawProducts.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      costCents: access.isOwner ? product.costCents : 0,
      priceCents: product.priceCents,
      commissionRateBps: product.commissionRateBps,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      active: product.active,
    })),
    sales: rawSales.map((sale) => {
      const revenueCents = sale.unitPriceCents * sale.quantity;
      const costCents = access.isOwner ? sale.unitCostCents * sale.quantity : 0;
      const feeCents = access.isOwner ? sale.feeCents : 0;
      return {
        ...sale,
        unitCostCents: access.isOwner ? sale.unitCostCents : 0,
        feeCents,
        revenueCents,
        profitCents: access.isOwner ? revenueCents - costCents - feeCents - sale.commissionCents : 0,
      };
    }),
  };
}

export async function saveProduct(access: AccessContext, input: { id?: number; name: string; category: string; costCents: number; priceCents: number; commissionRateBps: number; stockQuantity: number; lowStockThreshold: number; active: boolean }) {
  requireOwner(access);
  const name = input.name.trim();
  const category = input.category.trim() || "Geral";
  if (!name || name.length > 120) throw new Error("Informe um nome de produto com até 120 caracteres.");
  if (category.length > 60) throw new Error("Informe uma categoria com até 60 caracteres.");
  const costCents = moneyCents(input.costCents, true, "um custo");
  const priceCents = moneyCents(input.priceCents, false, "um preço de venda");
  const commissionRateBps = integerInRange(input.commissionRateBps, 0, 10000, "Informe uma comissão entre 0% e 100%.");
  const stockQuantity = integerInRange(input.stockQuantity, 0, 1000000, "Informe um estoque válido.");
  const lowStockThreshold = integerInRange(input.lowStockThreshold, 0, 1000000, "Informe um limite de estoque válido.");
  const values = { name, category, costCents, priceCents, commissionRateBps, stockQuantity, lowStockThreshold, active: input.active, updatedAt: new Date().toISOString() };
  const db = await getDb();

  if (input.id) {
    const existing = (await db.select({ id: shopProducts.id }).from(shopProducts).where(and(
      eq(shopProducts.id, input.id),
      eq(shopProducts.organizationId, access.organizationId),
      isNull(shopProducts.deletedAt),
    )).limit(1))[0];
    if (!existing) throw new Error("Produto não encontrado.");
    await db.update(shopProducts).set(values).where(and(eq(shopProducts.id, input.id), eq(shopProducts.organizationId, access.organizationId), isNull(shopProducts.deletedAt)));
    return;
  }

  await db.insert(shopProducts).values({ organizationId: access.organizationId, ...values });
}

export async function deleteProduct(access: AccessContext, id: number) {
  requireOwner(access);
  const db = await getDb();
  const updated = await db.update(shopProducts).set({
    active: false,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(shopProducts.id, id),
    eq(shopProducts.organizationId, access.organizationId),
    isNull(shopProducts.deletedAt),
  )).returning({ id: shopProducts.id });
  if (!updated.length) throw new Error("Produto não encontrado.");
}

export async function registerProductSaleBundle(access: AccessContext, input: ProductSaleBundleInput) {
  const occurredAt = validDate(input.occurredAt);
  const clientName = validClientName(input.clientName);
  const items = normalizeItems(input.items);
  const sellerTeamMemberId = access.isOwner ? integerInRange(input.sellerTeamMemberId, 1, 1000000000, "Escolha quem realizou a venda.") : access.teamMemberId;
  requireOwnBarber(access, sellerTeamMemberId);
  const paymentMethodId = integerInRange(input.paymentMethodId, 1, 1000000000, "Escolha a forma de pagamento.");
  const dailyRecordId = input.dailyRecordId ? integerInRange(input.dailyRecordId, 1, 1000000000, "Atendimento inválido.") : null;
  const db = await getDb();
  const seller = (await db.select({ id: team.id }).from(team).where(and(
    eq(team.id, sellerTeamMemberId),
    eq(team.organizationId, access.organizationId),
    eq(team.active, true),
  )).limit(1))[0];
  const payment = (await db.select().from(paymentMethods).where(and(
    eq(paymentMethods.id, paymentMethodId),
    eq(paymentMethods.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!seller) throw new Error("Escolha um profissional ativo para a venda.");
  if (!payment) throw new Error("Escolha a forma de pagamento.");

  const availableProducts = await db.select().from(shopProducts).where(and(
    eq(shopProducts.organizationId, access.organizationId),
    eq(shopProducts.active, true),
    isNull(shopProducts.deletedAt),
  ));
  const prepared = items.map((item) => {
    const product = availableProducts.find((candidate) => candidate.id === item.productId);
    if (!product) throw new Error("Um dos produtos escolhidos não está mais disponível.");
    if (product.stockQuantity < item.quantity) throw new Error(`Estoque insuficiente de ${product.name}. Há ${product.stockQuantity} unidade(s).`);
    const revenueCents = product.priceCents * item.quantity;
    return { product, quantity: item.quantity, revenueCents };
  });

  const decremented: Array<{ productId: number; quantity: number }> = [];
  const insertedIds: number[] = [];
  try {
    for (const item of prepared) {
      const updated = await db.update(shopProducts).set({
        stockQuantity: sql`${shopProducts.stockQuantity} - ${item.quantity}`,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(shopProducts.id, item.product.id),
        eq(shopProducts.organizationId, access.organizationId),
        eq(shopProducts.active, true),
        isNull(shopProducts.deletedAt),
        gte(shopProducts.stockQuantity, item.quantity),
      )).returning({ id: shopProducts.id });
      if (!updated.length) throw new Error(`Estoque insuficiente de ${item.product.name}.`);
      decremented.push({ productId: item.product.id, quantity: item.quantity });
    }

    for (const item of prepared) {
      const inserted = await db.insert(productSales).values({
        organizationId: access.organizationId,
        productId: item.product.id,
        sellerTeamMemberId,
        paymentMethodId: payment.id,
        dailyRecordId,
        occurredAt,
        clientName,
        quantity: item.quantity,
        unitPriceCents: item.product.priceCents,
        unitCostCents: item.product.costCents,
        commissionRateBps: item.product.commissionRateBps,
        commissionCents: Math.round(item.revenueCents * item.product.commissionRateBps / 10000),
        feeCents: Math.round(item.revenueCents * payment.feeBps / 10000),
      }).returning({ id: productSales.id });
      if (inserted[0]?.id) insertedIds.push(inserted[0].id);
    }
    return insertedIds;
  } catch (error) {
    for (const id of insertedIds) await db.delete(productSales).where(and(eq(productSales.id, id), eq(productSales.organizationId, access.organizationId)));
    for (const item of decremented) await db.update(shopProducts).set({
      stockQuantity: sql`${shopProducts.stockQuantity} + ${item.quantity}`,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(shopProducts.id, item.productId), eq(shopProducts.organizationId, access.organizationId)));
    throw error;
  }
}

export async function registerProductSale(access: AccessContext, input: { occurredAt: string; clientName: string; sellerTeamMemberId: number; productId: number; paymentMethodId: number; quantity: number }) {
  await registerProductSaleBundle(access, {
    occurredAt: input.occurredAt,
    clientName: input.clientName,
    sellerTeamMemberId: input.sellerTeamMemberId,
    paymentMethodId: input.paymentMethodId,
    items: [{ productId: input.productId, quantity: input.quantity }],
  });
}

export async function syncProductSalesForDailyRecord(access: AccessContext, input: { dailyRecordId: number; occurredAt: string; clientName: string; sellerTeamMemberId: number; paymentMethodId: number }) {
  requireOwnBarber(access, input.sellerTeamMemberId);
  const occurredAt = validDate(input.occurredAt);
  const clientName = validClientName(input.clientName);
  const db = await getDb();
  const seller = (await db.select({ id: team.id }).from(team).where(and(eq(team.id, input.sellerTeamMemberId), eq(team.organizationId, access.organizationId), eq(team.active, true))).limit(1))[0];
  const payment = (await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.organizationId, access.organizationId))).limit(1))[0];
  if (!seller || !payment) throw new Error("Não foi possível atualizar os produtos deste atendimento.");
  const linkedSales = await db.select().from(productSales).where(and(eq(productSales.organizationId, access.organizationId), eq(productSales.dailyRecordId, input.dailyRecordId)));
  for (const sale of linkedSales) {
    const revenueCents = sale.unitPriceCents * sale.quantity;
    await db.update(productSales).set({
      occurredAt,
      clientName,
      sellerTeamMemberId: seller.id,
      paymentMethodId: payment.id,
      feeCents: Math.round(revenueCents * payment.feeBps / 10000),
    }).where(and(eq(productSales.id, sale.id), eq(productSales.organizationId, access.organizationId)));
  }
}

export async function replaceProductSalesForDailyRecord(access: AccessContext, input: { dailyRecordId: number; occurredAt: string; clientName: string; sellerTeamMemberId: number; paymentMethodId: number; items: EditableProductSaleItemInput[] }) {
  const dailyRecordId = integerInRange(input.dailyRecordId, 1, 1000000000, "Atendimento inválido.");
  const sellerTeamMemberId = access.isOwner ? integerInRange(input.sellerTeamMemberId, 1, 1000000000, "Escolha quem realizou a venda.") : access.teamMemberId;
  requireOwnBarber(access, sellerTeamMemberId);
  const desired = input.items.map((item) => ({
    saleId: item.saleId ? integerInRange(item.saleId, 1, 1000000000, "Venda de produto inválida.") : undefined,
    productId: integerInRange(item.productId, 1, 1000000000, "Escolha um produto válido."),
    quantity: integerInRange(item.quantity, 1, 999, "Informe uma quantidade válida."),
  }));
  const productIds = new Set<number>();
  for (const item of desired) {
    if (productIds.has(item.productId)) throw new Error("Cada produto deve aparecer apenas uma vez no atendimento.");
    productIds.add(item.productId);
  }

  const db = await getDb();
  const existing = await db.select().from(productSales).where(and(
    eq(productSales.organizationId, access.organizationId),
    eq(productSales.dailyRecordId, dailyRecordId),
  ));
  for (const sale of existing) requireOwnBarber(access, sale.sellerTeamMemberId);
  for (const item of desired) {
    if (item.saleId && !existing.some((sale) => sale.id === item.saleId)) throw new Error("Uma das vendas não pertence a este atendimento.");
  }

  const retainedIds = new Set(desired.filter((item) => {
    if (!item.saleId) return false;
    const sale = existing.find((candidate) => candidate.id === item.saleId);
    return sale?.productId === item.productId && sale.quantity === item.quantity;
  }).map((item) => item.saleId as number));
  const removed = existing.filter((sale) => !retainedIds.has(sale.id));
  const additions = desired.filter((item) => !item.saleId || !retainedIds.has(item.saleId));

  for (const sale of removed) {
    await db.delete(productSales).where(and(eq(productSales.id, sale.id), eq(productSales.organizationId, access.organizationId)));
    await db.update(shopProducts).set({
      stockQuantity: sql`${shopProducts.stockQuantity} + ${sale.quantity}`,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(shopProducts.id, sale.productId), eq(shopProducts.organizationId, access.organizationId)));
  }

  try {
    if (additions.length) await registerProductSaleBundle(access, {
      occurredAt: input.occurredAt,
      clientName: input.clientName,
      sellerTeamMemberId,
      paymentMethodId: input.paymentMethodId,
      dailyRecordId,
      items: additions.map(({ productId, quantity }) => ({ productId, quantity })),
    });
  } catch (error) {
    for (const sale of removed) {
      const restoredStock = await db.update(shopProducts).set({
        stockQuantity: sql`${shopProducts.stockQuantity} - ${sale.quantity}`,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(shopProducts.id, sale.productId),
        eq(shopProducts.organizationId, access.organizationId),
        gte(shopProducts.stockQuantity, sale.quantity),
      )).returning({ id: shopProducts.id });
      if (!restoredStock.length) throw new Error("Não foi possível restaurar a venda anterior. Atualize os dados e tente novamente.");
      await db.insert(productSales).values({
        id: sale.id,
        organizationId: sale.organizationId,
        productId: sale.productId,
        sellerTeamMemberId: sale.sellerTeamMemberId,
        paymentMethodId: sale.paymentMethodId,
        dailyRecordId: sale.dailyRecordId,
        occurredAt: sale.occurredAt,
        clientName: sale.clientName,
        quantity: sale.quantity,
        unitPriceCents: sale.unitPriceCents,
        unitCostCents: sale.unitCostCents,
        commissionRateBps: sale.commissionRateBps,
        commissionCents: sale.commissionCents,
        feeCents: sale.feeCents,
        createdAt: sale.createdAt,
      });
    }
    throw error;
  }

  await syncProductSalesForDailyRecord(access, { dailyRecordId, occurredAt: input.occurredAt, clientName: input.clientName, sellerTeamMemberId, paymentMethodId: input.paymentMethodId });
}

export async function deleteProductSalesForDailyRecord(access: AccessContext, dailyRecordId: number) {
  const db = await getDb();
  const linkedSales = await db.select().from(productSales).where(and(
    eq(productSales.organizationId, access.organizationId),
    eq(productSales.dailyRecordId, dailyRecordId),
  ));
  for (const sale of linkedSales) {
    requireOwnBarber(access, sale.sellerTeamMemberId);
    await db.delete(productSales).where(and(eq(productSales.id, sale.id), eq(productSales.organizationId, access.organizationId)));
    await db.update(shopProducts).set({
      stockQuantity: sql`${shopProducts.stockQuantity} + ${sale.quantity}`,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(shopProducts.id, sale.productId), eq(shopProducts.organizationId, access.organizationId)));
  }
}

export async function deleteProductSale(access: AccessContext, id: number) {
  requireOwner(access);
  const db = await getDb();
  const sale = (await db.select().from(productSales).where(and(
    eq(productSales.id, id),
    eq(productSales.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!sale) throw new Error("Venda não encontrada.");
  await db.batch([
    db.delete(productSales).where(and(eq(productSales.id, sale.id), eq(productSales.organizationId, access.organizationId))),
    db.update(shopProducts).set({
      stockQuantity: sql`${shopProducts.stockQuantity} + ${sale.quantity}`,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(shopProducts.id, sale.productId), eq(shopProducts.organizationId, access.organizationId))),
  ]);
}
