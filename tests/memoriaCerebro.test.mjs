import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const fonte = ts.transpileModule(readFileSync(new URL('../src/lib/conteudo/memoriaCerebro.ts', import.meta.url), 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText.replace(/import type .*\n/g, '');
const m = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);

const cer = { id: 'c', nome: 'Insta_insights', secoes: [{ titulo: 'Tom de voz', texto: 'direto\nsem enrolação' }, { titulo: 'Bio', texto: '' }] };

test('lerMemoria: JSON puro, com cerca e lixo', () => {
  assert.deepEqual(m.lerMemoria('{"guardar":[{"secao":"Tom de voz","linhas":["fala com humor"]}]}'), [{ secao: 'Tom de voz', linhas: ['fala com humor'] }]);
  assert.equal(m.lerMemoria('```json\n{"guardar":[{"secao":"Bio","linhas":["Davi, 28 anos"]}]}\n```').length, 1);
  assert.deepEqual(m.lerMemoria('não tenho nada'), []);
  assert.deepEqual(m.lerMemoria('{"guardar":[{"secao":"","linhas":["x"]},{"secao":"A","linhas":[]}]}'), []);
});

test('aplicarMemoria: reaproveita a seção, não repete linha, cria seção nova', () => {
  const r = m.aplicarMemoria(cer, [
    { secao: 'tom de VOZ', linhas: ['Direto', 'usa humor ácido'] },
    { secao: 'Regras', linhas: ['nunca falar de política'] },
  ]);
  const tom = r.cerebro.secoes.find((s) => s.titulo === 'Tom de voz');
  assert.equal(tom.texto, 'direto\nsem enrolação\nusa humor ácido');   // "Direto" já existia
  assert.equal(r.cerebro.secoes.at(-1).titulo, 'Regras');
  assert.deepEqual(r.resumo.map((x) => [x.secao, x.novas.length, x.criou]), [['Tom de voz', 1, false], ['Regras', 1, true]]);
  assert.equal(cer.secoes[0].texto, 'direto\nsem enrolação');   // o original não é alterado
});

test('aplicarMemoria: nada novo = sem resumo; seção vazia recebe a primeira linha', () => {
  assert.equal(m.aplicarMemoria(cer, [{ secao: 'Tom de voz', linhas: ['direto'] }]).resumo.length, 0);
  const r = m.aplicarMemoria(cer, [{ secao: 'Bio', linhas: ['Davi, 28 anos'] }]);
  assert.equal(r.cerebro.secoes[1].texto, 'Davi, 28 anos');
});

test('vale: mensagem curta só com comando de guardar', () => {
  assert.equal(m.vale('oi'), false);
  assert.equal(m.vale('guarda isso'), true);
  assert.equal(m.vale('esse perfil nunca fala de política e usa humor ácido nos roteiros'), true);
});

test('pedidoDeMemoria traz o nome do perfil, a mensagem e as seções', () => {
  const p = m.pedidoDeMemoria(cer, 'o tom é sempre direto');
  assert.match(p, /Insta_insights/); assert.match(p, /o tom é sempre direto/); assert.match(p, /## Tom de voz/);
});
