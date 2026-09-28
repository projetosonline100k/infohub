import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/atividades/filtroResponsavel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { filtrarPorResponsavel } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tarefas = [
  { id: 1, responsavel_nome: 'Davi' },
  { id: 2, responsavel_nome: 'Ana, Davi Queiroz' },
  { id: 3, responsavel_nome: 'Carlos' },
  { id: 4, responsavel_nome: null, cliente_id: 'cliente', user_id: 'u1' },
  { id: 5, responsavel_nome: null, cliente_id: null, user_id: 'u1' },
];

test('separa minhas, outras e sem responsável, aceitando os nomes da mesma conta', () => {
  const nomes = ['Davi Queiroz', 'Davi'];
  assert.deepEqual(filtrarPorResponsavel(tarefas, 'minhas', nomes, 'u1').map(t => t.id), [1, 2, 5]);
  assert.deepEqual(filtrarPorResponsavel(tarefas, 'outras', nomes, 'u1').map(t => t.id), [3]);
  assert.deepEqual(filtrarPorResponsavel(tarefas, 'sem_responsavel', nomes, 'u1').map(t => t.id), [4, 5]);
  assert.equal(filtrarPorResponsavel(tarefas, 'todas', nomes, 'u1').length, 5);
});
