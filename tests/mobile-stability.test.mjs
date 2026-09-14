import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, gestureGuard, dashboard] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/app-gesture-guard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8"),
]);

test("mobile form controls stay at 16px to prevent iPhone focus zoom", () => {
  assert.match(css, /body select,[\s\S]*font-size:16px!important/);
  assert.match(css, /select:focus[\s\S]*\.mobile-bottom-navigation/);
});

test("visible viewport and keyboard state are restored on iPhone", () => {
  assert.match(gestureGuard, /data-app-keyboard-open/);
  assert.match(gestureGuard, /--app-keyboard-inset/);
  assert.match(gestureGuard, /resolveMobileViewport/);
  assert.match(gestureGuard, /let layoutViewportHeight = window\.innerHeight/);
  assert.match(gestureGuard, /layoutViewportHeight = Math\.max\(layoutViewportHeight, window\.innerHeight\)/);
  assert.match(gestureGuard, /visualViewport\?\.addEventListener\("resize", refreshVisibleViewport\)/);
  assert.match(gestureGuard, /closest<HTMLElement>\("\.app-shell > \.content"\)/);
  assert.match(gestureGuard, /scrollBy\(\{ top: delta, behavior: "smooth" \}\)/);
  assert.match(gestureGuard, /document\.addEventListener\("change", refreshAfterFieldInteraction\)/);
  assert.match(gestureGuard, /visibilitychange/);
});

test("record actions reject duplicates and recover from slow or offline connections", () => {
  assert.match(dashboard, /actionInFlight\.current/);
  assert.match(dashboard, /!navigator\.onLine/);
  assert.match(dashboard, /controller\.abort\(\), 20_000/);
  assert.match(dashboard, /keepalive: true/);
});

test("all open sections refresh when another device changes the data", () => {
  assert.match(dashboard, /const refreshLiveData = async \(\) =>/);
  assert.match(dashboard, /cortou-anotou:refresh-data/);
  assert.doesNotMatch(dashboard, /section !== "Agenda" \|\| isPending/);
});

test("a saved record confirms success without forcing the screen to move", () => {
  assert.match(dashboard, /showAppToast\(success\)/);
  assert.doesNotMatch(dashboard, /record-action-toast/);
  assert.doesNotMatch(dashboard, /scrollSavedRecordToTop\(\)/);
  assert.doesNotMatch(dashboard, /contentViewport\.current\?\.scrollTo\(/);
  assert.doesNotMatch(dashboard, /window\.scrollTo\(/);
});

test("owner commission lives on the dashboard and Team opens staff payments", () => {
  const overview = dashboard.slice(dashboard.indexOf("function Overview("), dashboard.indexOf("function trialPlanDetails("));
  const teamHub = dashboard.slice(dashboard.indexOf("function TeamHub("), dashboard.indexOf("function TeamPayments("));
  assert.match(overview, /<OwnerPayoutEditor data=\{data\}/);
  assert.match(teamHub, /useState<"Vales e pagamentos" \| "Usuários e convites">\("Vales e pagamentos"\)/);
  assert.doesNotMatch(teamHub, />Resultados<\/button>/);
  assert.match(teamHub, />Vales e pagamentos<\/button>/);
  assert.match(teamHub, />Usuários e convites<\/button>/);
});
