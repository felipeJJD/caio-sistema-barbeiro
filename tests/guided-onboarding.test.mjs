import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { tourFocus, tourCopyPosition, tourPresentation, compactTourTarget, tourStartAllowed } from '../lib/guided-tour-layout.ts';
import { sectionTour, configTour, moreTour } from '../lib/guided-tour-steps.ts';
const owner = { owner: true, teamSettings: true };
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('início atrasado respeita menu aberto/fechando e a tela atual', () => {
  assert.equal(tourStartAllowed('Mais', 'Painel', '', 'open'), true);
  assert.equal(tourStartAllowed('Mais', 'Painel', '', 'closing'), false);
  assert.equal(tourStartAllowed('Mais', 'Painel', '', null), false);
  for (const drawer of ['open', 'closing']) assert.equal(tourStartAllowed('Painel', 'Painel', '', drawer), false);
  assert.equal(tourStartAllowed('Painel', 'Painel', '', null), true);
  assert.equal(tourStartAllowed('Painel', 'Produtos', '', null), false);
  assert.equal(tourStartAllowed('Configurações:Serviços', 'Configurações', 'Pagamentos', null), false);
  assert.equal(tourStartAllowed('Configurações:Serviços', 'Configurações', 'Serviços', null), true);
  assert.equal(tourStartAllowed('Configurações:Serviços', 'Painel', 'Serviços', null), false);
});

test('mobile: destaque acompanha apenas o elemento e texto nunca cobre foco ou rodapé', () => {
  for (const width of [320, 375, 390, 430]) for (const height of [568, 667, 844, 932]) for (const top of [100, 190, 300, 420]) {
    const view = { width, height, top: 0, bottom: height };
    const focus = tourFocus(rect(18, top, width - 36, 64), view);
    if (!focus) continue;
    assert.ok(focus.width <= width - 12);
    const copy = tourCopyPosition(focus, view, 140, height - 90);
    if (!copy) continue;
    const text = rect(copy.left, copy.top, copy.width, 140);
    assert.equal(overlaps(text, focus), false);
    assert.ok(text.bottom <= height - 106);
    assert.ok(text.top >= 16);
  }
});
test('alvos ausentes e áreas gigantes nunca viram um retângulo de fallback', () => {
  const view = { width: 390, height: 844, top: 44, bottom: 888 };
  assert.equal(tourFocus(rect(-500, -300, 100, 30), view), null);
  assert.equal(compactTourTarget(rect(0, 0, 350, 700), view), false);
  assert.equal(compactTourTarget(rect(20, 300, 300, 70), view), true);
  const focus = tourFocus(rect(20, 60, 300, 70), view);
  assert.equal(focus.top, 56);
  assert.equal(tourCopyPosition(focus, view, 140, 80), null);
});
test('Painel, Mais e Configurações não miram em blocos inteiros nem no cabeçalho da ajuda', () => {
  for (const step of [...sectionTour('Painel', owner), ...sectionTour('Configurações', owner), ...moreTour()]) {
    assert.doesNotMatch(step.selector, /^\.topbar$|\.stat-grid$|\.dashboard-grid$|\.config-tabs$|\.mobile-menu-group|ca-onboarding-checklist$/);
  }
  assert.equal(moreTour()[0].selector, ".mobile-drawer [data-tour='menu-help']");
  assert.ok(sectionTour('Configurações', owner).length <= 3);
});
test('mini-tours ensinam nome/preço/duração, dia/abertura/fechamento e opções do link separadamente', () => {
  assert.equal(configTour('Serviços', owner).length, 4);
  assert.deepEqual(configTour('Agenda', owner).map(s => s.selector), ["[data-tour='hours-enabled']", "[data-tour='hours-opening']", "[data-tour='hours-closing']"]);
  assert.equal(configTour('Agendamento público', owner).length, 4);
  assert.deepEqual(configTour('Pagamentos', owner).map(s => s.selector), ["[data-tour='card-payment-example']", "[data-tour='card-payment-fee']"]);
  assert.equal(configTour('Equipe', { owner: true, teamSettings: false }).length, 0);
});
test('tour não clica em salvar, vender, excluir, publicar ou conectar', () => {
  const steps = ['Painel', 'Produtos', 'Financeiro', 'Configurações'].flatMap(s => sectionTour(s, owner)).concat(['Serviços', 'Agenda', 'Agendamento público', 'Pagamentos', 'Equipe'].flatMap(s => configTour(s, owner)), moreTour());
  for (const step of steps) assert.doesNotMatch(step.clickSelector ?? step.clickButton?.label ?? '', /primary-button|delete|submit|Salvar|Copiar|Confirmar|Conectar/i);
});
test('configuração inicia no checklist, mantém links legados e a taxa não escolhe Dinheiro', () => {
  const source = readFileSync(new URL('../app/ui/dashboard-app.tsx', import.meta.url), 'utf8');
  assert.match(source, /\["Primeiros passos", "Planos", "Mensalistas", "Serviços"/);
  assert.match(source, /initialTab === "Clientes" \? "Mensalistas"/);
  assert.match(source, /cardMethod = data\.paymentMethods\.find\(\(method\) => \/cr\[eé\]dito\|d\[eé\]bito\|cart\[aã\]o/);
  assert.match(source, /data-tour=\{item && item\.id === cardMethod\?\.id \? "card-payment-fee" : undefined\}/);
});
test('Agenda, Registrar e Histórico mantêm os passos aprovados', () => {
  const expected = { Agenda: ['Como sua agenda está funcionando', 'Seus horários', 'Criar ou ajustar um horário'], Registrar: ['Escolha o tipo de registro', 'Preencha só o necessário', 'Confira antes de salvar', 'Salvar atendimento'], Histórico: ['Resumo do período', 'Exportar quando precisar', 'Tudo que já aconteceu'] };
  for (const [section, titles] of Object.entries(expected)) assert.deepEqual(sectionTour(section, owner).map(s => s.title), titles);
});

test('formulários longos aprovados deixam espaço real para explicação e controles', () => {
  const view = {width:390,height:844,top:0,bottom:844};
  const {focus,copy} = tourPresentation(rect(16,-50,358,1000),view,160,770);
  assert.ok(focus && copy);
  assert.equal(overlaps(focus, rect(copy.left,copy.top,copy.width,160)),false);
  assert.ok(copy.top+160 <= 754);
});


test('sem produtos, proprietário aprende cadastro por campo sem criar ou vender automaticamente', () => {
  const steps = sectionTour('Produtos', { ...owner, productCount: 0 });
  assert.deepEqual(steps.map(s => s.selector), ['product-create', 'product-name', 'product-price', 'product-stock', 'product-save'].map(name => `[data-tour='${name}']`));
  for (const step of steps) {
    assert.equal(step.clickSelector, undefined);
    assert.equal(step.clickButton, undefined);
    assert.doesNotMatch(step.selector, /product-sale|product-list/);
  }
});
test('sem produtos, funcionário recebe orientação sem campos exclusivos do proprietário', () => {
  const steps = sectionTour('Produtos', { owner: false, teamSettings: false, productCount: 0 });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].selector, "[data-tour='product-empty']");
});
test('com produtos, mantém exatamente o tour aprovado de estoque e venda', () => {
  for (const productCount of [1, 5]) assert.deepEqual(sectionTour('Produtos', { ...owner, productCount }), sectionTour('Produtos', owner));
});


test('Mensalistas e Equipe apontam para elementos reais da tela inicial, inclusive sem cadastros', () => {
  const source = readFileSync(new URL('../app/ui/dashboard-app.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const targets = new Map();
  const visit = node => {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const attr = opening.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'data-tour' && a.initializer && ts.isStringLiteral(a.initializer));
      if (attr) targets.set(attr.initializer.text, { tag: opening.tagName.getText(ast), node });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const [section, name, tag] of [['Mensalistas', 'membership-revenue', 'article'], ['Equipe', 'team-users-tab', 'button']]) {
    const steps = sectionTour(section, owner);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].selector, `[data-tour='${name}']`);
    assert.equal(targets.get(name)?.tag, tag);
    assert.equal(steps[0].clickSelector, undefined);
    assert.equal(steps[0].clickButton, undefined);
  }
  assert.match(targets.get('membership-revenue').node.getText(ast), /monthTotals.revenueCents/);
  assert.match(targets.get('team-users-tab').node.getText(ast), />Usuários e convites<\/button>/);
});
