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
