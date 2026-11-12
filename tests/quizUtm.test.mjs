import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const carregar = async (arq) => {
  const { outputText } = ts.transpileModule(readFileSync(new URL(arq, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const u = await carregar('../src/lib/quiz/utm.ts');
const p = await carregar('../src/lib/quiz/painel.ts');
const vu = await carregar('../src/lib/quiz/vendasUtm.ts');

test('normalizar e slug', () => {
  assert.equal(u.normalizarUtm('Bio do Instagram!'), 'bio-do-instagram');
  assert.equal(u.normalizarUtm(' Anúncio  Black '), 'anuncio-black');
  assert.equal(u.slugValido('Quiz do Leitor'), 'quiz-do-leitor');
  assert.equal(u.slugValido('ab'), null);
  assert.equal(u.slugValido('Diagnóstico 2026!'), 'diagnostico-2026');
});
test('utm da url e propagação para o botão da oferta', () => {
  assert.deepEqual(u.utmDaUrl('?utm_source=ig&utm_campaign=bio&fbclid=x'), { utm_source: 'ig', utm_campaign: 'bio' });
  assert.equal(u.comUtm('https://pay.eduzz.com/x?a=1', { utm_source: 'ig' }), 'https://pay.eduzz.com/x?a=1&utm_source=ig');
  assert.equal(u.comUtm('https://pay.eduzz.com/x?utm_source=meu', { utm_source: 'ig' }), 'https://pay.eduzz.com/x?utm_source=meu');   // não troca o que já tem
  assert.equal(u.comUtm('mailto:a@b.co', { utm_source: 'ig' }), 'mailto:a@b.co');
  const e = { oferta: { cta_url: 'https://x.co/p' }, perfis: [{ cta_url: 'https://x.co/a' }, { cta_url: '' }] };
  const n = u.propagarUtm(e, { utm_source: 'ig', utm_medium: 'bio' });
  assert.equal(n.oferta.cta_url, 'https://x.co/p?utm_source=ig&utm_medium=bio');
  assert.equal(n.perfis[1].cta_url, '');
  assert.equal(e.oferta.cta_url, 'https://x.co/p');   // o original não muda
  assert.equal(u.propagarUtm(e, {}), e);
});
test('link rastreado', () => {
  assert.equal(u.linkRastreado('https://s.app/quiz/abc', { utm_source: 'instagram', utm_medium: 'bio', utm_campaign: null }), 'https://s.app/quiz/abc?utm_source=instagram&utm_medium=bio');
});
test('origens, estatística por link e vendas', () => {
  const ev = (s, tipo, utm) => ({ sessao: s, tipo, passo: -1, criado_em: '2026-11-10T10:00:00Z', utm });
  const bio = { utm_source: 'instagram', utm_medium: 'bio' }, story = { utm_source: 'instagram', utm_medium: 'story' };
  const eventos = [ev('a', 'visita', bio), ev('b', 'visita', bio), ev('c', 'visita', story), ev('d', 'visita', null), ev('a', 'fim', undefined)];
  const linhas = p.origens(eventos, [{ utm: bio }, { utm: bio }, { utm: null }]);
  assert.equal(linhas.find((o) => o.medium === 'bio').visitas, 2);
  assert.equal(linhas.find((o) => o.medium === 'bio').terminaram, 1);
  assert.equal(linhas.find((o) => o.source === '').visitas, 1);   // direto
  // link só com source soma bio + story; com medium só o bio
  assert.deepEqual(p.estatisticaDoLink({ utm_source: 'instagram' }, linhas), { visitas: 3, leads: 2, terminaram: 1, conversao: 67 });
  assert.equal(p.estatisticaDoLink({ utm_source: 'instagram', utm_medium: 'story' }, linhas).visitas, 1);
  const vendas = [{ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: null, utm_content: null, valor: 47 }, { utm_source: 'google', utm_medium: null, utm_campaign: null, utm_content: null, valor: 10 }];
  assert.deepEqual(p.vendasDoLink({ utm_source: 'instagram', utm_medium: 'bio' }, vendas), { n: 1, total: 47 });
});

test('código do link curto', () => {
  assert.equal(u.codigoCurto('Bio do Instagram!'), 'bio-do-instagram');
  assert.equal(u.codigoCurto('Reels · ManyChat'), 'reels-manychat');
  assert.equal(u.codigoCurto('ab'), null);
  assert.equal(u.codigoCurto('---'), null);
  assert.equal(u.codigoCurto('x'.repeat(60)).length, 40);
  assert.equal(u.enderecoCurto('https://infopro-hub.vercel.app/', 'reels'), 'https://infopro-hub.vercel.app/r/reels');
});

test('vendas por UTM: faturamento, pagamento, dia da semana, reembolso e tabela por origem', () => {
  const AGORA = Date.parse('2026-11-12T12:00:00Z');
  const v = (id, data, valor, metodo, source, campaign, tipo = 'venda') => ({ transacao_id: id, tipo, data, valor, metodo_pagamento: metodo, utm_source: source ?? null, utm_medium: source ? 'reels' : null, utm_campaign: campaign ?? null });
  const vendas = [
    v('1', '2026-11-10', 47, 'pix', 'instagram', 'manychat'), v('2', '2026-11-10', 47, 'creditCard', 'instagram', 'manychat'), v('3', '2026-11-09', 97, null, null, null),
    v('4', '2026-11-08', 50, 'boleto', 'google', 'busca'), v('4', '2026-11-09', 50, 'boleto', 'google', 'busca', 'reembolso'),
    v('5', '2026-09-01', 99, 'pix', 'instagram', 'manychat'),   // fora do período
    v('6', '2026-11-11', 20, 'pendente-x', null, null, 'pendente'),   // não é venda
  ];
  const r = vu.resumoVendas(vendas, 14, AGORA);
  assert.equal(r.nVendas, 3); assert.equal(r.faturamento, 191); assert.equal(Math.round(r.ticket * 100) / 100, 63.67);
  assert.deepEqual(r.reembolsos, { n: 1, valor: 50 });
  assert.deepEqual(r.porPagamento.map((x) => [x.rotulo, x.n]).sort(), [['Cartão', 1], ['Não informado', 1], ['Pix', 1]]);
  assert.equal(r.porDiaSemana.length, 7);
  assert.equal(r.porDiaSemana.reduce((s, d) => s + d.n, 0), 3);
  assert.equal(vu.rotuloPagamento('creditCard'), 'Cartão'); assert.equal(vu.rotuloPagamento('PIX'), 'Pix'); assert.equal(vu.rotuloPagamento('xyz'), 'Outros');
  assert.equal(vu.resumoVendas(vendas, 0, AGORA).nVendas, 4);
  const origens = [{ source: 'instagram', medium: 'reels', campaign: 'manychat', visitas: 20, leads: 10, checkout: 4 }, { source: 'google', medium: 'reels', campaign: 'busca', visitas: 5, leads: 1, checkout: 0 }];
  const t = vu.tabelaPorOrigem(origens, r.liquidas, new Map([['instagram|reels|manychat', 94]]));
  const ig = t.find((x) => x.source === 'instagram');
  assert.equal(ig.vendas, 2); assert.equal(ig.faturamento, 94); assert.equal(ig.lucro, 0); assert.equal(ig.roas, 1); assert.equal(ig.conversao, 10);
  const direto = t.find((x) => x.source === '');
  assert.equal(direto.vendas, 1); assert.equal(direto.roas, null);   // sem investimento: sem ROAS
});
