import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, search, replacement, label) {
  const index = text.indexOf(search);
  if (index < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (text.indexOf(search, index + search.length) >= 0) throw new Error(`Trecho duplicado: ${label}`);
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}

// 1) Camada de cálculo: ranking simples por período, sem criar CRM/ID/VIP.
const libPath = "lib/business-insights.ts";
let lib = readFileSync(libPath, "utf8");
lib = replaceOnce(lib,
`export type FinanceMonthInsight = {`,
`export type ClientFrequencyInsight = {
  key: string;
  name: string;
  visitCount: number;
  lastVisit: string;
  daysAway: number;
  cadenceDays: number | null;
  lastService: string;
  lastBarber: string;
};

export type FinanceMonthInsight = {`,
"tipo de frequência");
lib = replaceOnce(lib,
`export type BusinessInsights = {
  generatedAt: string;
  dormant: {`,
`export type BusinessInsights = {
  generatedAt: string;
  clientRadar: {
    periods: Record<"30" | "90" | "180" | "365", ClientFrequencyInsight[]>;
  };
  dormant: {`,
"contrato do radar");
lib = replaceOnce(lib,
`export function buildDormantClients(input: {`,
`export function buildClientFrequency(input: {
  attendances: BusinessInsightAttendance[];
  today: string;
  days: number;
}) {
  const windowDays = Math.max(1, Math.round(input.days));
  const groups = new Map<string, BusinessInsightAttendance[]>();
  for (const attendance of input.attendances) {
    if (!usefulClientName(attendance.clientName)) continue;
    if (daysBetween(attendance.occurredAt, input.today) > windowDays) continue;
    const key = normalizeClientKey(attendance.clientName);
    const rows = groups.get(key) ?? [];
    rows.push(attendance);
    groups.set(key, rows);
  }

  const result: ClientFrequencyInsight[] = [];
  for (const [key, rows] of groups) {
    const sorted = rows.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const uniqueDates = [...new Set(sorted.map((row) => row.occurredAt))].sort();
    const last = sorted[sorted.length - 1];
    const gaps = uniqueDates
      .slice(1)
      .map((value, index) => daysBetween(uniqueDates[index], value))
      .filter((value) => value > 0 && value <= 120)
      .slice(-6);
    result.push({
      key,
      name: last.clientName.trim(),
      visitCount: uniqueDates.length,
      lastVisit: last.occurredAt,
      daysAway: daysBetween(last.occurredAt, input.today),
      cadenceDays: median(gaps),
      lastService: last.serviceName,
      lastBarber: last.barberName,
    });
  }

  return result.sort((a, b) => b.visitCount - a.visitCount || b.lastVisit.localeCompare(a.lastVisit));
}

export function buildDormantClients(input: {`,
"função de frequência");
writeFileSync(libPath, lib);

// 2) Banco: entrega os quatro períodos prontos para o Painel.
const dbPath = "db/business-insights.ts";
let db = readFileSync(dbPath, "utf8");
db = replaceOnce(db,
`  buildDormantClients,
  buildFinanceMonths,`,
`  buildClientFrequency,
  buildDormantClients,
  buildFinanceMonths,`,
"import do radar");
db = replaceOnce(db,
`  const dormantClients = buildDormantClients({`,
`  const clientRadar = {
    "30": buildClientFrequency({ attendances, today, days: 30 }),
    "90": buildClientFrequency({ attendances, today, days: 90 }),
    "180": buildClientFrequency({ attendances, today, days: 180 }),
    "365": buildClientFrequency({ attendances, today, days: 365 }),
  };
  const dormantClients = buildDormantClients({`,
"cálculo dos períodos");
db = replaceOnce(db,
`  return {
    generatedAt: today,
    dormant: {`,
`  return {
    generatedAt: today,
    clientRadar: { periods: clientRadar },
    dormant: {`,
"retorno do radar");
writeFileSync(dbPath, db);

// 3) Painel: versão simples e visual combinada com o usuário.
const uiPath = "app/ui/business-insights.tsx";
let ui = readFileSync(uiPath, "utf8");
const componentStart = ui.indexOf("export function ClientPulse() {");
const componentEnd = ui.indexOf("\nfunction RevenueChart", componentStart);
if (componentStart < 0 || componentEnd < 0) throw new Error("ClientPulse não encontrado");
const newComponent = `export function ClientPulse() {
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"30" | "90" | "180" | "365">("90");
  const [mode, setMode] = useState<"most" | "least">("most");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchInsights()
        .then((next) => {
          if (!active) return;
          setData(next);
          setError("");
        })
        .catch((reason) => {
          if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar esta análise.");
        });
    };
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("cortou-anotou:refresh-data", load);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("cortou-anotou:refresh-data", load);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (error) return <section className={styles.clientPanel}><p className={styles.error}>{error}</p></section>;
  if (!data) return <section className={styles.clientPanel}><p className={styles.loading}>Montando o radar dos seus clientes...</p></section>;

  const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const search = normalize(query);
  const periodClients = data.clientRadar.periods[period] ?? [];
  const matching = search
    ? periodClients.filter((client) => normalize(client.name).includes(search))
    : periodClients.filter((client) => client.visitCount >= 2);
  const ordered = matching.slice().sort((left, right) => mode === "most"
    ? right.visitCount - left.visitCount || right.lastVisit.localeCompare(left.lastVisit)
    : left.visitCount - right.visitCount || right.daysAway - left.daysAway);
  const visible = ordered.slice(0, expanded ? 12 : 6);
  const maxVisits = Math.max(1, ...ordered.map((client) => client.visitCount));
  const periodLabels = { "30": "30 dias", "90": "3 meses", "180": "6 meses", "365": "12 meses" } as const;

  return <section className={styles.clientPanel}>
    <header className={styles.clientHeader}>
      <div><span className={styles.eyebrow}>RADAR DE CLIENTES</span><h2>Seus clientes</h2><p>Veja quem mais aparece e quem vem com menos frequência.</p></div>
    </header>

    <div className={styles.radarControls}>
      <label className={styles.clientSearch}>
        <span>Pesquisar cliente</span>
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setExpanded(false); }} placeholder="Digite o nome do cliente" />
      </label>
      <div className={styles.periodSwitch} role="group" aria-label="Período do radar">
        {(["30", "90", "180", "365"] as const).map((value) => <button type="button" className={period === value ? styles.active : ""} onClick={() => { setPeriod(value); setExpanded(false); }} key={value}>{periodLabels[value]}</button>)}
      </div>
      <div className={styles.radarTabs} role="group" aria-label="Ordem dos clientes">
        <button type="button" className={mode === "most" ? styles.active : ""} onClick={() => { setMode("most"); setExpanded(false); }}>Mais frequentes</button>
        <button type="button" className={mode === "least" ? styles.active : ""} onClick={() => { setMode("least"); setExpanded(false); }}>Menos frequentes</button>
      </div>
    </div>

    <div className={styles.radarSummary}>
      <span>{search ? `${ordered.length} resultado${ordered.length === 1 ? "" : "s"}` : `${ordered.length} clientes recorrentes`}</span>
      <strong>{periodLabels[period]}</strong>
    </div>

    <div className={styles.clientList}>
      {visible.map((client, index) => <article className={styles.clientRow} key={client.key}>
        <span className={styles.rank}>{index + 1}</span>
        <span className={styles.avatar}>{initials(client.name)}</span>
        <div className={styles.clientMain}>
          <div className={styles.clientNameLine}><strong>{client.name}</strong><span className={styles.visitBadge}>{client.visitCount} {client.visitCount === 1 ? "visita" : "visitas"}</span></div>
          <small>Última visita {humanDate(client.lastVisit)} · {client.lastService} · {client.lastBarber}</small>
          <div className={styles.frequencyTrack} aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round(client.visitCount / maxVisits * 100))}%` }} /></div>
          <em>{client.cadenceDays ? `Retorno médio: ${client.cadenceDays} dias` : client.visitCount > 1 ? "Ainda calculando o ritmo de retorno" : "Uma visita registrada neste período"}</em>
        </div>
      </article>)}
      {!visible.length && <p className={styles.empty}>{search ? "Nenhum cliente encontrado neste período." : "Ainda não há clientes com pelo menos duas visitas neste período."}</p>}
    </div>

    <footer className={styles.clientFooter}>
      <p>O ranking considera clientes com 2 ou mais visitas. A busca também encontra quem veio uma única vez.</p>
      {ordered.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos" : `Ver mais (${ordered.length})`}</button>}
    </footer>
  </section>;
}
`;
ui = ui.slice(0, componentStart) + newComponent + ui.slice(componentEnd);
writeFileSync(uiPath, ui);

// 4) Visual: barras, busca, períodos e abas; mantém Financeiro intacto.
const cssPath = "app/ui/business-insights.module.css";
let css = readFileSync(cssPath, "utf8");
css += `

/* Radar de clientes */
.radarControls {
  display: grid;
  gap: 12px;
  padding: 0 22px 16px;
}

.clientSearch span {
  display: block;
  margin-bottom: 5px;
  color: #777d74;
  font-size: 10px;
  font-weight: 750;
  text-transform: uppercase;
}

.clientSearch input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(35, 42, 35, .14);
  border-radius: 13px;
  outline: none;
  background: #fff;
  color: #262d26;
  font-size: 13px;
}

.clientSearch input:focus {
  border-color: rgba(139, 100, 23, .52);
  box-shadow: 0 0 0 3px rgba(214, 162, 49, .12);
}

.periodSwitch,
.radarTabs {
  display: grid;
  gap: 5px;
  padding: 4px;
  border-radius: 14px;
  background: #ece9df;
}

.periodSwitch {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.radarTabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.periodSwitch button,
.radarTabs button {
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #6f756d;
  font-size: 11px;
  font-weight: 750;
}

.periodSwitch button.active,
.radarTabs button.active {
  background: #202820;
  color: #f0c664;
  box-shadow: 0 4px 12px rgba(20, 27, 20, .14);
}

.radarSummary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 22px 12px;
  color: #767d74;
  font-size: 11px;
}

.radarSummary strong {
  color: #8b6417;
  font-size: 11px;
}

.clientRow {
  grid-template-columns: 24px 42px minmax(0, 1fr);
}

.rank {
  color: #a4a79f;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.visitBadge {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: 999px;
  background: #f4ead0;
  color: #8c6515;
  font-size: 10px;
  font-weight: 800;
}

.frequencyTrack {
  height: 8px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #ece9df;
}

.frequencyTrack i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d9a437, #8b671d);
}

@media (max-width: 680px) {
  .radarControls,
  .radarSummary {
    padding-left: 16px;
    padding-right: 16px;
  }

  .periodSwitch button,
  .radarTabs button {
    font-size: 10px;
  }

  .clientRow {
    grid-template-columns: 22px 40px minmax(0, 1fr);
    gap: 9px;
  }

  .clientMain small {
    white-space: normal;
    line-height: 1.35;
  }
}
`;
writeFileSync(cssPath, css);

// 5) Testes de regra e contrato visual.
const testPath = "tests/business-insights.test.mjs";
let tests = readFileSync(testPath, "utf8");
tests = replaceOnce(tests,
`import { buildDormantClients, buildFinanceMonths } from "../lib/business-insights.ts";`,
`import { buildClientFrequency, buildDormantClients, buildFinanceMonths } from "../lib/business-insights.ts";`,
"import de teste");
tests += `

test("builds client frequency ranking inside the selected period", () => {
  const clients = buildClientFrequency({
    today: "2026-09-25",
    days: 90,
    attendances: [
      attendance("2026-07-10", "João"),
      attendance("2026-08-10", "João"),
      attendance("2026-09-10", "João"),
      attendance("2026-08-20", "Lucas"),
      attendance("2026-09-20", "Lucas"),
      attendance("2026-05-01", "Fora do período"),
    ],
  });

  assert.equal(clients[0].name, "João");
  assert.equal(clients[0].visitCount, 3);
  assert.equal(clients[0].cadenceDays, 31);
  assert.equal(clients.find((client) => client.name === "Lucas")?.visitCount, 2);
  assert.equal(clients.some((client) => client.name === "Fora do período"), false);
});
`;
writeFileSync(testPath, tests);

writeFileSync("tests/client-radar-contract.test.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst ui = readFileSync("app/ui/business-insights.tsx", "utf8");\n\ntest("client radar stays simple and focused on frequency", () => {\n  assert.match(ui, /RADAR DE CLIENTES/);\n  assert.match(ui, /Pesquisar cliente/);\n  assert.match(ui, /Mais frequentes/);\n  assert.match(ui, /Menos frequentes/);\n  assert.match(ui, /30 dias/);\n  assert.match(ui, /3 meses/);\n  assert.match(ui, /6 meses/);\n  assert.match(ui, /12 meses/);\n  assert.doesNotMatch(ui, /Tornar VIP/);\n  assert.doesNotMatch(ui, /Benefício VIP/);\n});\n`);
