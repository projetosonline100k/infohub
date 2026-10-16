import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/atividades/padroesNovaTarefa.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { prazoPadrao, responsavelMaisComum, rotuloFaltando } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('prazo padrão: +3 dias, ou o próprio dia quando ele foi escolhido', () => {
  const hoje = new Date(2026, 9, 30);
  assert.equal(prazoPadrao('2026-10-30', false, hoje), '2026-11-02');
  assert.equal(prazoPadrao('2026-10-20', true, hoje), '2026-10-20');
});

test('responsável mais comum conta cada nome de tarefas com várias pessoas', () => {
  assert.equal(responsavelMaisComum([
    { responsavel_nome: 'Ana' },
    { responsavel_nome: 'Carlos, Ana' },
    { responsavel_nome: 'Carlos' },
    { responsavel_nome: null },
    { responsavel_nome: 'Ana' },
  ]), 'Ana');
  assert.equal(responsavelMaisComum([{ responsavel_nome: null }, { responsavel_nome: ' ' }]), null);
});

test('rótulo do que falta na tarefa', () => {
  assert.equal(rotuloFaltando(null, null), 'Sem dono e sem prazo');
  assert.equal(rotuloFaltando('', '2026-10-20'), 'Sem dono');
  assert.equal(rotuloFaltando('Ana', null), 'Sem prazo');
  assert.equal(rotuloFaltando('Ana', '2026-10-20'), null);
});
