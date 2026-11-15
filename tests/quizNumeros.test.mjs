import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/numeros.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const regua = { numero: { min: 5, max: 60, passo: 5, inicial: 15, unidade: 'min/dia' }, opcoes: [{ ate: 5 }, { ate: 10 }, { ate: 15 }, { ate: 9999 }] };

test('faixa: 5 min é a 1ª (sem_tempo 3 pts), 10 a 2ª, 15 a 3ª, mais que isso a última', () => {
  assert.equal(m.faixaDoNumero(regua, 5), 0);
  assert.equal(m.faixaDoNumero(regua, 10), 1);
  assert.equal(m.faixaDoNumero(regua, 12), 2);
  assert.equal(m.faixaDoNumero(regua, 20), 3);
  assert.equal(m.faixaDoNumero(regua, 60), 3);
  assert.equal(m.faixaDoNumero({ opcoes: [{ ate: 3 }] }, 99), 0);
  assert.equal(m.faixaDoNumero({ opcoes: [] }, 1), -1);
});

test('valores: do mínimo ao máximo no passo, sempre terminando no máximo', () => {
  assert.deepEqual(m.valoresDoNumero({ min: 0, max: 5 }), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(m.valoresDoNumero({ min: 5, max: 22, passo: 5 }), [5, 10, 15, 20, 22]);
  assert.deepEqual(m.limitesDoNumero({ min: 5, max: 60, passo: 0, inicial: 500 }), { min: 5, max: 60, passo: 1, inicial: 60 });
});

test('cálculos: 1 resumo ≈ 10 min', () => {
  assert.equal(m.resumosPorMes(5), 15);
  assert.equal(m.resumosPorMes(20), 60);
  assert.equal(m.resumosPorSemana(10), 7);
  assert.equal(m.livrosEm12Meses(10), 365);
  assert.equal(m.livrosEm12Meses(10, { min: 0, max: 1, min_por_resumo: 20 }), 183);
});

test('texto do número: unidade e "50+" no máximo', () => {
  assert.equal(m.textoDoNumero({ min: 0, max: 50, mais: true, unidade: 'livros' }, 50), '50+ livros');
  assert.equal(m.textoDoNumero({ min: 0, max: 50, mais: true }, 12), '12');
  assert.equal(m.textoDoNumero(undefined, 7), '7');
});

test('preencher: {numero:id} e cálculos a partir da resposta; sem resposta some', () => {
  const ps = [{ id: 'tempo', numero: regua.numero }, { id: 'livros_ano', numero: { min: 0, max: 50, mais: true } }];
  assert.equal(m.preencherNumeros('Lendo {numero:tempo} min dá {livros_12m:tempo} livros, {resumos_mes:tempo}/mês', ps, { tempo: 10 }), 'Lendo 10 min dá 365 livros, 30/mês');
  assert.equal(m.preencherNumeros('Você leu {numero:livros_ano}', ps, { livros_ano: 50 }), 'Você leu 50+');
  assert.equal(m.preencherNumeros('X {numero:tempo} Y', ps, {}), 'X  Y');
  assert.equal(m.preencherCalculos('≈ {resumos_mes} resumos por mês ({n} min)', 20, regua.numero), '≈ 60 resumos por mês (20 min)');
});

test('lista de nomes', () => {
  assert.equal(m.listaEmTexto([]), '');
  assert.equal(m.listaEmTexto(['A']), 'A');
  assert.equal(m.listaEmTexto(['A', 'B', 'C']), 'A, B e C');
});
