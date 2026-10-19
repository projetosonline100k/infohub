import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/blocoReferencia.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { proximoNumeroHeadline, montarBlocoReferencia, lerAnalise } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('próximo número de headline segue o maior do documento', () => {
  assert.equal(proximoNumeroHeadline(''), 1);
  assert.equal(proximoNumeroHeadline('<h2>Headline 01: x</h2><p>a</p><h2>Headline <strong>07</strong>: y</h2>'), 8);
});

test('bloco com headline numerada, link e seções recolhidas (escapando HTML)', () => {
  const html = montarBlocoReferencia({ numero: 2, headline: 'Um caçador <joga>', link: 'https://x.com/a?b=1&c=2', transcricao: 'linha 1\nlinha 2', notavel: ['fato'], porque: ['gancho'] });
  assert.match(html, /^<h2>Headline 02: Um caçador &lt;joga&gt;<\/h2>/);
  assert.match(html, /href="https:\/\/x.com\/a\?b=1&amp;c=2"/);
  assert.equal((html.match(/data-collapsed="true"/g) || []).length, 4);
  assert.match(html, /<h3 data-collapsed="true">\+Info<\/h3><p><a href=/);
  assert.match(html, /<h4 data-collapsed="true">Transcrição<\/h4><p>linha 1<\/p><p>linha 2<\/p>/);
  assert.match(html, /<h3>Roteiro finalizado:<\/h3><p><\/p>$/);
});

test('lê a análise do Claude mesmo com texto em volta', () => {
  const r = lerAnalise('Claro!\n```json\n{"headline": "H", "notavel": ["a", " "], "porque": ["b"]}\n```');
  assert.deepEqual(r, { headline: 'H', notavel: ['a'], porque: ['b'] });
  assert.deepEqual(lerAnalise('sem json'), { notavel: [], porque: [] });
});
