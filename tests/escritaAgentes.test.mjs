import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/escritaAgentes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { montarPedido, separarNotas, textoParaHtml, recortarDocumento, ehRevisao, MARCA_NOTAS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const junior = { etapa: 'Roteiro', nome: 'Junior', funcao: 'Copywriter (IA)', manual: 'Escreve roteiros.', criterios: ['Gancho em 3 s', 'CTA no meio'], formatos: [{ nome: 'Lista', texto: 'Headline\n1, 2, 3' }] };

test('pedido do Junior leva cérebro, critérios numerados, formatos, skills, documento e o que o Leo entregou', () => {
  const p = montarPedido({
    escritorio: 'Laboratório De Viral', agente: junior, skills: [{ nome: 'roteiros-virais', conteudo: 'método X' }],
    cerebro: { id: 'c', nome: 'Davi', secoes: [{ titulo: 'Narrativa', texto: 'saí do zero' }, { titulo: 'Vazia', texto: ' ' }] },
    documento: 'Headline 1: a\n[CURSOR]', anterior: { quem: 'Leo', texto: 'Headline 2: b' }, pedido: 'roteiro da 2', proximaHeadline: 2,
  });
  assert.match(p, /Você é Junior, Copywriter \(IA\) do escritório "Laboratório De Viral"/);
  assert.match(p, /CÉREBRO DE DAVI[\s\S]*\[Narrativa\]\nsaí do zero/);
  assert.doesNotMatch(p, /\[Vazia\]/);
  assert.match(p, /1\. Gancho em 3 s\n2\. CTA no meio/);
  assert.match(p, /\[Formato 1: Lista\]/);
  assert.match(p, /<skill nome="roteiros-virais">\nmétodo X/);
  assert.match(p, /O QUE LEO ACABOU DE ENTREGAR \(parta disto\)/);
  assert.match(p, /a próxima do documento é a 2/);
  assert.ok(p.includes(MARCA_NOTAS));
});

test('revisão substitui a etapa anterior; sem funcionário é o Claude', () => {
  assert.ok(ehRevisao('Revisão') && !ehRevisao('Roteiro'));
  const p = montarPedido({ agente: { ...junior, etapa: 'Revisão', nome: 'Elias' }, skills: [], cerebro: null, documento: '', anterior: { quem: 'Junior', texto: 'r' }, pedido: '', proximaHeadline: 1 });
  assert.match(p, /revise isto: a sua versão substitui a dele/);
  assert.match(montarPedido({ agente: null, skills: [], cerebro: null, documento: '', pedido: 'oi', proximaHeadline: 1 }), /^Você é o Claude/);
});

test('notas ficam fora do documento, inclusive com a marca chegando pela metade', () => {
  assert.deepEqual(separarNotas(`linha 1\nlinha 2\n${MARCA_NOTAS}\nusei o formato Lista`), { texto: 'linha 1\nlinha 2', notas: 'usei o formato Lista' });
  assert.deepEqual(separarNotas('linha 1\n===NO'), { texto: 'linha 1', notas: '' });
  assert.equal(separarNotas('sem notas').texto, 'sem notas');
});

test('texto vira parágrafos, listas e negrito (escapando HTML)', () => {
  assert.equal(textoParaHtml('Headline 3: <oi>\n\n- um\n- **dois**\nfim'),
    '<p>Headline 3: &lt;oi&gt;</p><ul><li><p>um</p></li><li><p><strong>dois</strong></p></li></ul><p>fim</p>');
  assert.equal(textoParaHtml(''), '<p></p>');
});

test('documento grande é cortado em volta do cursor', () => {
  const doc = 'a'.repeat(20000) + '[CURSOR]' + 'b'.repeat(20000);
  const r = recortarDocumento(doc, 1000);
  assert.ok(r.includes('[CURSOR]') && r.length < 1100);
});

const { lerNotasRevisao, linhasDoTexto, montarRevisao } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const alinharSimples = (a, b) => b.map((t) => { const i = a.findIndex((x) => x.split(' ')[0] === t.split(' ')[0]); return i < 0 ? null : i; });

test('comentários do Elias por linha (JSON ou texto solto)', () => {
  assert.deepEqual(lerNotasRevisao('[{"linha": 2, "nota": "tirei o clichê"}, {"linha": "x", "nota": "y"}]'), [{ linha: 2, nota: 'tirei o clichê' }]);
  assert.deepEqual(lerNotasRevisao('mudei o gancho'), [{ linha: 1, nota: 'mudei o gancho' }]);
  assert.deepEqual(lerNotasRevisao(''), []);
});

test('linhas como ficam no documento', () => {
  assert.deepEqual(linhasDoTexto('# Título\n\n- **um** item\ntexto'), ['Título', 'um item', 'texto']);
});

test('revisão: linha de origem, linha removida e comentário', () => {
  const r = montarRevisao('r1', 'Elias', 'Gancho velho\nMeio\nSobra\nFim', 'Gancho novo\nMeio\nFim', '[{"linha": 1, "nota": "gancho mais forte"}, {"linha": 9, "nota": "tirei a sobra"}]', alinharSimples);
  assert.deepEqual(r.linhas.map((l) => l.original), ['Gancho velho', 'Meio', 'Fim']);
  assert.equal(r.linhas[0].nota, 'gancho mais forte');
  assert.equal(r.linhas[2].nota, 'tirei a sobra');
  assert.deepEqual(r.removidas, [{ depoisDe: 1, texto: 'Sobra' }]);
});
