import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/agendaAlarmes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { alarmesParaTocar } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const inicio = new Date('2026-10-02T14:00:00');
const evento = (chave, minutosAntes) => ({ chave, titulo: chave, inicio, minutosAntes });
const em = (hhmm) => new Date(`2026-10-02T${hhmm}:00`).getTime();

test('toca quando chega o horário (minutos antes do início)', () => {
  assert.deepEqual(alarmesParaTocar([evento('a', 10)], em('13:49'), new Set()).map((e) => e.chave), []);
  assert.deepEqual(alarmesParaTocar([evento('a', 10)], em('13:50'), new Set()).map((e) => e.chave), ['a']);
});

test('"na hora" toca no início do evento', () => {
  assert.deepEqual(alarmesParaTocar([evento('a', 0)], em('14:00'), new Set()).map((e) => e.chave), ['a']);
});

test('não toca de novo o que já tocou', () => {
  assert.deepEqual(alarmesParaTocar([evento('a', 0)], em('14:01'), new Set(['a'])), []);
});

test('alarme perdido há muito tempo (app fechado) não toca mais', () => {
  assert.deepEqual(alarmesParaTocar([evento('a', 0)], em('14:11'), new Set()), []);
  assert.deepEqual(alarmesParaTocar([evento('a', 0)], em('14:09'), new Set()).map((e) => e.chave), ['a']);
});
