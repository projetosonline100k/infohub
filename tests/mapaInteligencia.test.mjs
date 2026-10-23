import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/mapaInteligencia.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { mapaParaTexto, lerMapa, MODELO_ROTEIRO } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('mapa vira texto numerado, com itens e exemplo numa linha só', () => {
  const t = mapaParaTexto(MODELO_ROTEIRO, 'Junior');
  assert.match(t, /^MAPA DA INTELIGÊNCIA DE JUNIOR \(Roteiro claro, simples e com profundidade\) — siga cada pilar:/);
  assert.match(t, /\n1\. Headline: Identificar qual a melhor estrutura para a headline\n {3}- Gatilho forte/);
  assert.match(t, /Exemplo: Ex ruim: Anda de bike na semana \| Ex bom: Andar de bike 2x na semana/);
  assert.match(t, /\n5\. Formato final/);
});

test('mapa vazio ou estranho não entra no pedido', () => {
  assert.equal(mapaParaTexto(null, 'Leo'), null);
  assert.equal(mapaParaTexto({ pilares: [{ titulo: ' ', descricao: '', itens: [] }] }, 'Leo'), null);
  assert.equal(lerMapa([1, 2]), null);
  assert.deepEqual(lerMapa({ pilares: [{ titulo: 'A', itens: ['x', ' ', 3] }] }).pilares[0].itens, ['x', '3']);
});
