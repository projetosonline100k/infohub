import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/vendas-webhook/interpretar.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { interpretarWebhook, diaBrasilia } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = new Date('2026-10-16T02:30:00Z'); // 15/10 23:30 em Brasília

test('dia em Brasília', () => {
  assert.equal(diaBrasilia(agora), '2026-10-15');
});

test('Kiwify: compra aprovada entra no dia da aprovação, em reais', () => {
  const e = interpretarWebhook({
    order_id: 'k1', webhook_event_type: 'order_approved', order_status: 'paid',
    approved_date: '2026-10-14 10:20', Product: { product_name: 'Cinesofia' },
    Commissions: { charge_amount: 19700 },
  }, agora);
  assert.deepEqual(e, {
    plataforma: 'kiwify', transacao_id: 'k1', tipo: 'venda', valor: 197,
    data: '2026-10-14', produto_plataforma: 'Cinesofia',
  });
});

test('Kiwify: reembolso e chargeback viram reembolso; boleto gerado é ignorado', () => {
  const r = interpretarWebhook({ order: { order_id: 'k1', webhook_event_type: 'order_refunded', Commissions: { charge_amount: '9700' } } }, agora);
  assert.equal(r.tipo, 'reembolso');
  assert.equal(r.valor, 97);
  assert.equal(r.data, '2026-10-15');
  assert.equal(interpretarWebhook({ order_id: 'k2', webhook_event_type: 'chargeback', Commissions: {} }, agora).tipo, 'reembolso');
  assert.equal(interpretarWebhook({ order_id: 'k3', webhook_event_type: 'billet_created', order_status: 'waiting_payment' }, agora), null);
});

test('Hotmart: aprovada usa approved_date; reembolso cai no dia de hoje; protesto ignora', () => {
  const v = interpretarWebhook({
    event: 'PURCHASE_APPROVED',
    data: { product: { name: 'Core' }, purchase: { transaction: 'HP1', approved_date: Date.parse('2026-10-13T12:00:00Z'), price: { value: 497 } } },
  }, agora);
  assert.deepEqual(v, {
    plataforma: 'hotmart', transacao_id: 'HP1', tipo: 'venda', valor: 497,
    data: '2026-10-13', produto_plataforma: 'Core',
  });
  const r = interpretarWebhook({ event: 'PURCHASE_REFUNDED', data: { purchase: { transaction: 'HP1', price: { value: 497 } } } }, agora);
  assert.equal(r.tipo, 'reembolso');
  assert.equal(r.data, '2026-10-15');
  assert.equal(interpretarWebhook({ event: 'PURCHASE_PROTEST', data: { purchase: { transaction: 'HP1' } } }, agora), null);
});

test('corpo vazio ou estranho não vira evento', () => {
  assert.equal(interpretarWebhook(null, agora), null);
  assert.equal(interpretarWebhook({}, agora), null);
});
