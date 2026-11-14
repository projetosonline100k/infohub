import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/conteudo/mapaInteligencia.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('cérebro vira mapa: seção = pilar, linha do texto = folha; vazias não viram folha', () => {
  const mapa = m.cerebroParaMapa({ nome: 'Insta_insights', secoes: [{ titulo: 'Tom', texto: 'direto\n\n  sem enrolação  ' }, { titulo: 'Público', texto: '' }] });
  assert.equal(mapa.titulo, 'Insta_insights');
  assert.deepEqual(mapa.pilares.map((p) => [p.titulo, p.itens]), [['Tom', ['direto', 'sem enrolação']], ['Público', []]]);
});
test('mapa editado volta para seções: texto = linhas; pilar vazio some; ida e volta não perde as linhas', () => {
  const cer = { nome: 'X', secoes: [{ titulo: 'Tom', texto: 'direto\nsem enrolação' }, { titulo: 'Público', texto: 'mães' }] };
  const ida = m.mapaParaSecoes(m.cerebroParaMapa(cer));
  assert.deepEqual(ida, cer.secoes);
  const editado = m.cerebroParaMapa(cer); editado.pilares.push({ titulo: '', descricao: '', itens: [''] }); editado.pilares[1].itens.push('pais');
  assert.deepEqual(m.mapaParaSecoes(editado), [{ titulo: 'Tom', texto: 'direto\nsem enrolação' }, { titulo: 'Público', texto: 'mães\npais' }]);
});
