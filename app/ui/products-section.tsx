"use client";

import { FormEvent, useRef, useState } from "react";
import type { DashboardData } from "../../db/dashboard";
import { appDate, appMonth, appMonthPeriod, appMonthStart, shiftAppMonth } from "../../lib/app-date";
import { AppIcon } from "./app-icon";

type Post = (body: Record<string, string | number | boolean>, success: string) => Promise<boolean>;

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
const displayDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const inRange = (value: string, start: string, end: string) => (!start || value >= start) && (!end || value <= end);

export function ProductsSection({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const today = appDate();
  const [start, setStart] = useState(appMonthStart(today));
  const [end, setEnd] = useState(today);
  const [selectedProductId, setSelectedProductId] = useState(data.products.find((item) => item.active && item.stockQuantity > 0)?.id ?? 0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  const editorFormRef = useRef<HTMLFormElement>(null);
  const editing = data.products.find((item) => item.id === editingId);
  const sellable = data.products.filter((item) => item.active);
  const effectiveProductId = sellable.some((item) => item.id === selectedProductId)
    ? selectedProductId
    : sellable.find((item) => item.stockQuantity > 0)?.id ?? sellable[0]?.id ?? 0;
  const selectedProduct = data.products.find((item) => item.id === effectiveProductId);
  const sales = data.productSales.filter((item) => inRange(item.occurredAt, start, end));
  const revenueCents = sales.reduce((sum, item) => sum + item.revenueCents, 0);
  const profitCents = sales.reduce((sum, item) => sum + item.profitCents, 0);
  const commissionCents = sales.reduce((sum, item) => sum + item.commissionCents, 0);
  const units = sales.reduce((sum, item) => sum + item.quantity, 0);
  const lowStock = data.products.filter((item) => item.active && item.stockQuantity <= item.lowStockThreshold).length;
  const available = data.products.filter((item) => item.active && item.stockQuantity > 0).length;
  const selectedMonth = /^\d{4}-\d{2}/.test(start) ? start.slice(0, 7) : appMonth(today);

  function selectSalesMonth(month: string) {
    const period = appMonthPeriod(month, today);
    setStart(period.start);
    setEnd(period.end);
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post({
      action: "product-sale",
      occurredAt: String(form.get("occurredAt")),
      clientName: String(form.get("clientName")),
      sellerTeamMemberId: Number(form.get("sellerTeamMemberId") ?? data.viewer.teamMemberId),
      productId: Number(form.get("productId")),
      paymentMethodId: Number(form.get("paymentMethodId")),
      quantity: Number(form.get("quantity")),
    }, "Venda registrada no Histórico e estoque atualizado.");
    if (ok) {
      formElement.reset();
      setSelectedProductId(0);
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await post({
      action: "save-product",
      id: editingId ?? 0,
      name: String(form.get("name")),
      category: String(form.get("category")),
      costCents: Math.round(Number(form.get("cost")) * 100),
      priceCents: Math.round(Number(form.get("price")) * 100),
      commissionRateBps: Math.round(Number(form.get("commission")) * 100),
      stockQuantity: Number(form.get("stockQuantity")),
      lowStockThreshold: Number(form.get("lowStockThreshold")),
      active: form.get("active") === "on",
    }, editing ? "Produto atualizado." : "Produto cadastrado.");
    if (ok) setEditingId(null);
  }

  async function removeSale(id: number) {
    if (!window.confirm("Excluir esta venda? A quantidade voltará automaticamente para o estoque.")) return;
    await post({ action: "delete-product-sale", id }, "Venda excluída e estoque devolvido.");
  }

  async function removeProduct(id: number, name: string) {
    if (!window.confirm(`Excluir o produto ${name}? Ele sairá das listas, mas as vendas antigas continuarão no histórico.`)) return;
    const ok = await post({ action: "delete-product", id }, "Produto excluído. As vendas antigas foram preservadas.");
    if (ok && editingId === id) setEditingId(null);
  }

  function openEditor(id: number | null) {
    setEditingId(id);
    window.setTimeout(() => {
      if (id === null) editorFormRef.current?.reset();
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editorRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  return <>
    <section className="product-stat-grid">
      <article><span><AppIcon name="trend" /></span><small>{data.viewer.isOwner ? "VENDAS NO PERÍODO" : "MINHAS VENDAS"}</small><strong>{money(revenueCents)}</strong><p>{sales.length} {sales.length === 1 ? "lançamento" : "lançamentos"}</p></article>
      {data.viewer.isOwner && <article><span><AppIcon name="money" /></span><small>LUCRO DOS PRODUTOS</small><strong>{money(profitCents)}</strong><p>Depois de custo, taxas e comissões</p></article>}
      {!data.viewer.isOwner && <article><span><AppIcon name="money" /></span><small>MINHA COMISSÃO</small><strong>{money(commissionCents)}</strong><p>Das vendas no período</p></article>}
      <article><span><AppIcon name="box" /></span><small>UNIDADES VENDIDAS</small><strong>{units}</strong><p>Nas datas escolhidas</p></article>
      <article className={lowStock ? "attention" : ""}><span><AppIcon name="box" /></span><small>{data.viewer.isOwner ? "ESTOQUE BAIXO" : "PRODUTOS DISPONÍVEIS"}</small><strong>{data.viewer.isOwner ? lowStock : available}</strong><p>{data.viewer.isOwner ? "Itens para conferir" : "Com saldo para venda"}</p></article>
    </section>

    <section className="products-main-grid">
      <div className="panel product-inventory">
        <div className="product-section-head"><div><h2>Produtos em estoque</h2><p>{data.products.length} {data.products.length === 1 ? "produto cadastrado" : "produtos cadastrados"}</p></div>{data.viewer.isOwner && <button type="button" onClick={() => openEditor(null)}>+ Novo produto</button>}</div>
        <div className="product-list">
          {data.products.map((product) => {
            const isLow = product.active && product.stockQuantity <= product.lowStockThreshold;
            return <article className={!product.active ? "inactive" : isLow ? "low" : ""} key={product.id}>
              <div className="product-mark">{product.name.slice(0, 1).toUpperCase()}</div>
              <div className="product-copy"><strong>{product.name}</strong><small>{product.category} · {money(product.priceCents)}</small><p>{data.viewer.isOwner ? `Custo ${money(product.costCents)} · margem ${money(product.priceCents - product.costCents)} · ` : ""}Comissão {(product.commissionRateBps / 100).toFixed(2).replace(".00", "").replace(".", ",")}%</p></div>
              <div className="product-stock"><strong>{product.stockQuantity}</strong><small>{!product.active ? "INATIVO" : isLow ? "ESTOQUE BAIXO" : "EM ESTOQUE"}</small></div>
              {data.viewer.isOwner && <div className="product-item-actions"><button className="product-edit" type="button" onClick={() => openEditor(product.id)} aria-label={`Editar ${product.name}`}>Editar</button><button className="product-delete" type="button" onClick={() => void removeProduct(product.id, product.name)} aria-label={`Excluir ${product.name}`}><AppIcon name="trash" /></button></div>}
            </article>;
          })}
          {!data.products.length && <div className="product-empty"><span><AppIcon name="box" /></span><strong>Nenhum produto cadastrado</strong><p>{data.viewer.isOwner ? "Cadastre o primeiro produto no formulário abaixo." : "O proprietário ainda não cadastrou produtos para venda."}</p></div>}
        </div>
      </div>

      <div className="panel product-sale-card">
        <div className="product-section-head"><div><h2>Registrar venda</h2><p>O estoque diminui automaticamente</p></div><span className="sale-badge">RÁPIDO</span></div>
        <form className="app-form" onSubmit={submitSale} key={`sale-${data.productSales.length}`}>
          <label className="field"><span>Data</span><input name="occurredAt" type="date" defaultValue={today} required /></label>
          <label className="field"><span>Cliente</span><input name="clientName" placeholder="Nome de quem comprou" required /></label>
          {data.viewer.isOwner ? <label className="field"><span>Quem realizou a venda</span><select name="sellerTeamMemberId" defaultValue={data.viewer.teamMemberId}>{data.team.filter((member) => member.active).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label> : <input name="sellerTeamMemberId" type="hidden" value={data.viewer.teamMemberId} />}
          <label className="field"><span>Produto</span><select name="productId" value={effectiveProductId} onChange={(event) => setSelectedProductId(Number(event.target.value))} required>{sellable.map((product) => <option value={product.id} key={product.id} disabled={product.stockQuantity < 1}>{product.name} · {product.stockQuantity} em estoque</option>)}</select></label>
          <div className="product-form-row"><label className="field"><span>Quantidade</span><input name="quantity" type="number" min="1" max={selectedProduct?.stockQuantity || 1} defaultValue="1" required /></label><label className="field"><span>Pagamento</span><select name="paymentMethodId" defaultValue={data.paymentMethods[0]?.id}>{data.paymentMethods.map((payment) => <option value={payment.id} key={payment.id}>{payment.name}</option>)}</select></label></div>
          <div className="sale-total"><span><small>VALOR POR UNIDADE</small><strong>{selectedProduct ? money(selectedProduct.priceCents) : money(0)}</strong></span><p>{selectedProduct ? `${selectedProduct.stockQuantity} ${selectedProduct.stockQuantity === 1 ? "unidade" : "unidades"} · comissão ${(selectedProduct.commissionRateBps / 100).toFixed(2).replace(".00", "").replace(".", ",")}% (${money(Math.round(selectedProduct.priceCents * selectedProduct.commissionRateBps / 10000))} por unidade)` : "Cadastre um produto para começar"}</p></div>
          <button className="primary-button" disabled={pending || !selectedProduct || selectedProduct.stockQuantity < 1}>{pending ? "Salvando..." : "Confirmar venda"}</button>
        </form>
      </div>
    </section>

    {data.viewer.isOwner && <section className={`panel product-editor editor-scroll-target${editing ? " is-editing" : ""}`} ref={editorRef} tabIndex={-1}>
      <div className="product-section-head"><div><h2>{editing ? "Editar produto" : "Cadastrar produto"}</h2><p>Você controla preço, custo e quantidade sem depender de suporte.</p></div>{editing && <button type="button" onClick={() => setEditingId(null)}>Cancelar edição</button>}</div>
      <form className="app-form product-editor-form" onSubmit={submitProduct} key={editing?.id ?? "new-product"} ref={editorFormRef}>
        <label className="field"><span>Nome do produto</span><input name="name" placeholder="Ex.: Pomada modeladora" defaultValue={editing?.name ?? ""} required /></label>
        <label className="field"><span>Categoria</span><input name="category" placeholder="Ex.: Cabelo, roupa ou acessório" defaultValue={editing?.category ?? ""} /></label>
        <label className="field"><span>Custo (R$)</span><input name="cost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={(editing?.costCents ?? 0) / 100} required /></label>
        <label className="field"><span>Preço de venda (R$)</span><input name="price" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={(editing?.priceCents ?? 0) / 100} required /></label>
        <label className="field"><span>Comissão do barbeiro (%)</span><input name="commission" type="number" min="0" max="100" step="0.01" inputMode="decimal" defaultValue={(editing?.commissionRateBps ?? 0) / 100} required /></label>
        <label className="field"><span>Estoque atual</span><input name="stockQuantity" type="number" min="0" step="1" inputMode="numeric" defaultValue={editing?.stockQuantity ?? 0} required /></label>
        <label className="field"><span>Avisar estoque baixo em</span><input name="lowStockThreshold" type="number" min="0" step="1" inputMode="numeric" defaultValue={editing?.lowStockThreshold ?? 2} required /></label>
        <label className="check"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Produto ativo para venda</label>
        <button className="primary-button" disabled={pending}>{pending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar produto"}</button>
      </form>
    </section>}

    <section className="panel product-history">
      <div className="product-history-head"><div><h2>Histórico de vendas</h2><p>{data.viewer.isOwner ? "Todas as vendas da equipe" : "Somente as vendas registradas por você"}</p></div><div className="product-date-fields"><label><span>DE</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label><span>ATÉ</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label><div className="product-month-shortcuts"><button type="button" onClick={() => selectSalesMonth(shiftAppMonth(selectedMonth, -1))}>‹ Anterior</button><button type="button" onClick={() => selectSalesMonth(appMonth(today))}>Mês atual</button><button type="button" disabled={selectedMonth >= appMonth(today)} onClick={() => selectSalesMonth(shiftAppMonth(selectedMonth, 1))}>Próximo ›</button></div></div></div>
      <div className="product-sales-list">
        {sales.map((sale) => <article key={sale.id}>
          <div className="sale-icon"><AppIcon name="box" /></div><div><strong>{sale.productName} · {sale.clientName}</strong><small>{displayDate(sale.occurredAt)} · {sale.sellerName} · {sale.paymentName} · comissão {money(sale.commissionCents)}{sale.dailyRecordId ? " · junto ao atendimento" : ""}</small></div><span>{sale.quantity} un.</span><b>{money(sale.revenueCents)}</b>{data.viewer.isOwner && <button type="button" onClick={() => removeSale(sale.id)} aria-label={`Excluir venda de ${sale.productName}`}><AppIcon name="trash" /></button>}
        </article>)}
        {!sales.length && <div className="product-empty"><span><AppIcon name="clock" /></span><strong>Nenhuma venda no período</strong><p>As vendas registradas aparecerão aqui.</p></div>}
      </div>
    </section>
  </>;
}
