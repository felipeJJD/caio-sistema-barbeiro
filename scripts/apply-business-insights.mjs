import { readFileSync, writeFileSync } from "node:fs";

const path = "app/ui/dashboard-app.tsx";
let text = readFileSync(path, "utf8");

const importLine = 'import { WhatsappAutomation } from "./whatsapp-automation";\n';
const insightsImport = 'import { ClientPulse, FinanceInsights } from "./business-insights";\n';
if (!text.includes(insightsImport)) {
  if (!text.includes(importLine)) throw new Error("Import base não encontrado");
  text = text.replace(importLine, importLine + insightsImport);
}

const overviewStart = '    <OwnerPayoutEditor data={data} post={post} pending={pending} />\n      <section className="dashboard-grid">';
const overviewEnd = '\n  </>;\n}\n\nfunction trialPlanDetails';
const overviewIndex = text.indexOf(overviewStart);
const overviewEndIndex = text.indexOf(overviewEnd, overviewIndex);
if (overviewIndex < 0 || overviewEndIndex < 0) throw new Error("Trecho do Painel não encontrado");
const overview = `    <OwnerPayoutEditor data={data} post={post} pending={pending} />
    <ClientPulse />
    <section className="dashboard-grid">
      <div className="panel ranking-panel" style={{ gridColumn: "1 / -1" }}>
        <SectionTitle title="Equipe no período" copy="Atendimentos, vendas e comissões" />
        <div className="ranking-list">
          {teamRanking.map((item, index) => <div className="ranking" key={item.name}><span>{index + 1}</span><div className="avatar">{initials(item.name)}</div><div><strong>{item.name}</strong><small>{item.count} atendimentos · {item.sales} vendas</small></div><b>{money(item.commissionCents)}</b></div>)}
          {!teamRanking.length && <Empty text="Nenhum atendimento ou venda no período." />}
        </div>
      </div>
    </section>`;
text = text.slice(0, overviewIndex) + overview + text.slice(overviewEndIndex);

const financeStart = text.indexOf("function Finance({ data: baseData, post, pending }");
const returnStart = text.indexOf("  return <>", financeStart);
const financeEnd = text.indexOf("\n}\n\nfunction Goals", returnStart);
if (financeStart < 0 || returnStart < 0 || financeEnd < 0) throw new Error("Trecho do Financeiro não encontrado");
const financeReturn = `  return <>
    <FinanceInsights />
    <DateFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />
    <section className="form-layout">
      <div className={\`panel form-card compact editor-scroll-target\${editing ? " is-editing" : ""}\`} ref={editorRef} tabIndex={-1}>
        <SectionTitle title={editing ? "Editar despesa" : "Nova despesa"} copy={editing ? "Altere e salve o lançamento." : "Registre uma saída da empresa sem misturar com as contas pessoais."} />
        <form className="app-form" onSubmit={submit} key={editing?.id ?? "new-expense"}>
          <Field label="Data"><input name="occurredAt" type="date" defaultValue={editing?.occurredAt ?? today} required /></Field>
          <Field label="Tipo"><select name="type" defaultValue={editing?.type ?? "Variável"}><option>Variável</option><option>Fixa</option></select></Field>
          <Field label="Descrição"><input name="description" placeholder="Ex.: aluguel, material, energia" defaultValue={editing?.description ?? ""} required /></Field>
          <Field label="Valor (R$)"><input name="value" type="number" min="0.01" step="0.01" defaultValue={editing ? editing.valueCents / 100 : undefined} required /></Field>
          <label className="check"><input name="paid" type="checkbox" defaultChecked={editing?.paid ?? true} /> Já foi pago</label>
          <button className="primary-button" disabled={pending}>{editing ? "Salvar alterações" : "Salvar despesa"}</button>
          {editing && <button type="button" className="cancel-button" onClick={() => setEditingId(null)}>Cancelar edição</button>}
        </form>
      </div>
      <div className="panel">
        <SectionTitle title="Despesas do período" copy={\`\${expenses.length} \${expenses.length === 1 ? "lançamento" : "lançamentos"} · \${money(expenseCents)}\`} />
        <div className="expense-list">
          {expenses.map((item) => <div className="expense" key={item.id}><span className={item.type === "Fixa" ? "expense-icon fixed" : "expense-icon"}><AppIcon name="trend" /></span><div><strong>{item.description}</strong><small>{date(item.occurredAt)} · {item.type}</small></div><b>{money(item.valueCents)}</b><span className={item.paid ? "paid" : "unpaid"}>{item.paid ? "Pago" : "Pendente"}</span><div className="icon-actions"><button title="Editar despesa" aria-label="Editar despesa" onClick={() => setEditingId(item.id)}><AppIcon name="edit" /></button><button className="danger" title="Excluir despesa" aria-label="Excluir despesa" onClick={() => remove(item.id)}><AppIcon name="trash" /></button></div></div>)}
          {!expenses.length && <Empty text="Nenhuma despesa neste período." />}
        </div>
      </div>
    </section>
    <section className="stat-grid finance-stats"><Stat label="Receita avulsa" value={money(serviceRevenueCents)} note="Serviços + gorjetas" tone="gold" icon={<AppIcon name="trend" />} /><Stat label="Mensalidades recebidas" value={money(membershipRevenueCents)} note="Histórico financeiro do período" tone="blue" icon={<AppIcon name="members" />} /><Stat label="Venda de produtos" value={money(productRevenueCents)} note={\`\${money(productCostCents)} em custo dos produtos\`} tone="cyan" icon={<AppIcon name="box" />} /><Stat label="Taxas e comissões" value={money(automaticCosts)} note="Custos automáticos" tone="purple" icon="%" /><Stat label="Total de despesas" value={money(expenseCents)} note={\`\${expenses.length} \${expenses.length === 1 ? "lançamento" : "lançamentos"} no período\`} tone="rose" icon={<AppIcon name="trend" className="icon-down" />} /><Stat className="finance-profit" label="Lucro líquido" value={money(netProfitCents)} note="Valor que realmente sobrou no período" tone="green" icon={<AppIcon name="money" />} /></section>
    <section className={\`panel finance-goals-panel\${goalsOpen ? " open" : ""}\`}>
      <button type="button" className="finance-goals-toggle" onClick={() => setGoalsOpen((value) => !value)} aria-expanded={goalsOpen}>
        <span className="finance-goals-icon" aria-hidden="true">◎</span>
        <span className="finance-goals-copy"><small>METAS DE {appMonthLabel(today).toUpperCase()}</small><strong>Acompanhar e editar metas</strong><span>{money(baseData.stats.revenueCents)} de {money(baseData.goal.revenueCents)} no faturamento</span><span className="finance-goals-progress"><i style={{ width: \`\${currentGoalProgress}%\` }} /></span></span>
        <span className="finance-goals-percent">{currentGoalProgress}%</span>
        <b>{goalsOpen ? "Fechar" : "Ver e editar"}<i aria-hidden="true">{goalsOpen ? "↑" : "↓"}</i></b>
      </button>
      {goalsOpen && <div className="finance-goals-content"><Goals data={baseData} /><GoalSettings data={baseData} post={post} pending={pending} /></div>}
    </section>
  </>;`;
text = text.slice(0, returnStart) + financeReturn + text.slice(financeEnd);
writeFileSync(path, text);
