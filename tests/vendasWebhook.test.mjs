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

test('Kiwify: reembolso e chargeback viram reembolso; boleto gerado é pendente (funil)', () => {
  const r = interpretarWebhook({ order: { order_id: 'k1', webhook_event_type: 'order_refunded', Commissions: { charge_amount: '9700' } } }, agora);
  assert.equal(r.tipo, 'reembolso');
  assert.equal(r.valor, 97);
  assert.equal(r.data, '2026-10-15');
  assert.equal(interpretarWebhook({ order_id: 'k2', webhook_event_type: 'chargeback', Commissions: {} }, agora).tipo, 'reembolso');
  assert.equal(interpretarWebhook({ order_id: 'k3', webhook_event_type: 'billet_created', order_status: 'waiting_payment' }, agora).tipo, 'pendente');
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

test('Kiwify: guarda a origem (UTM) e o comprador quando vêm', () => {
  const e = interpretarWebhook({
    order_id: 'k9', webhook_event_type: 'order_approved', approved_date: '2026-10-14 10:20', Commissions: { charge_amount: 4700 },
    Customer: { full_name: 'Ana Souza', email: 'ana@x.com' }, TrackingParameters: { utm_source: 'instagram', utm_campaign: 'bio' },
    payment_method: 'pix',
  }, agora);
  assert.equal(e.utm_source, 'instagram');
  assert.equal(e.utm_campaign, 'bio');
  assert.equal(e.comprador_email, 'ana@x.com');
  assert.equal(e.metodo_pagamento, 'pix');
});

test('Hotmart: carrinho abandonado não é confundido com a Eduzz', () => {
  const e = interpretarWebhook({ event: 'PURCHASE_OUT_OF_SHOPPING_CART', creation_date: 1, data: { buyer: { email: 'b@x.com' }, product: { name: 'Core' } } }, agora);
  assert.equal(e.plataforma, 'hotmart');
  assert.equal(e.tipo, 'abandono');
});

test('Eduzz (MyEduzz, JSON): fatura paga vira venda com origem e comprador', () => {
  const e = interpretarWebhook({
    id: 'evt1', event: 'myeduzz.invoice_paid', sentDate: '2026-11-07T15:00:00Z',
    data: {
      id: 'F123', status: 'paid', paidAt: '2026-11-07T14:59:00-03:00', price: { currency: 'BRL', value: 47.9 },
      buyer: { name: 'João Lima', email: 'joao@x.com' }, items: [{ name: 'Instalivros' }],
      utm: { source: 'instagram', medium: 'stories', campaign: 'lancamento' }, paymentMethod: 'creditCard',
    },
  }, agora);
  assert.equal(e.plataforma, 'eduzz');
  assert.equal(e.transacao_id, 'F123');
  assert.equal(e.tipo, 'venda');
  assert.equal(e.valor, 47.9);
  assert.equal(e.data, '2026-11-07');
  assert.equal(e.produto_plataforma, 'Instalivros');
  assert.equal(e.comprador_email, 'joao@x.com');
  assert.equal(e.metodo_pagamento, 'creditCard');
  assert.deepEqual([e.utm_source, e.utm_medium, e.utm_campaign], ['instagram', 'stories', 'lancamento']);
});

test('Eduzz: aguardando pagamento é pendente; cancelada e reembolso; postback antigo (formulário)', () => {
  assert.equal(interpretarWebhook({ event: 'myeduzz.invoice_waiting_payment', data: { id: 'F2', items: [], price: { value: 47 } } }, agora).tipo, 'pendente');
  assert.equal(interpretarWebhook({ event: 'myeduzz.invoice_canceled', data: { id: 'F3', items: [] } }, agora).tipo, 'cancelada');
  assert.equal(interpretarWebhook({ event: 'myeduzz.invoice_refunded', data: { id: 'F4', items: [] } }, agora).tipo, 'reembolso');
  const antigo = interpretarWebhook({ trans_cod: '999', trans_status: '3', trans_value: '97,00', trans_paiddate: '2026-11-06', cus_email: 'c@x.com', utm_source: 'youtube' }, agora);
  assert.deepEqual([antigo.plataforma, antigo.tipo, antigo.valor, antigo.data, antigo.utm_source], ['eduzz', 'venda', 97, '2026-11-06', 'youtube']);
});
