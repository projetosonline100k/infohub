import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Só as funções puras (sem imports do app): recorta a partir da sincronização
// (as funções que usam supabase/Tauri só são declaradas, não executadas).
const source = readFileSync(new URL('../src/lib/atividades/alarmeAtividade.ts', import.meta.url), 'utf8');
const puro = source.slice(source.indexOf('interface EstadoLembrete'));
const { outputText } = ts.transpileModule(puro, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { horarioSugerido, deveTocarAtividade, INTERVALO_REPETICAO_MS, projetoDaLista, mesclarData, mesclarTitulo } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = new Date('2026-10-05T14:07:00');

test('sugere o vencimento às 9h quando ainda é futuro', () => {
  assert.equal(horarioSugerido('2026-10-08', agora).getTime(), new Date('2026-10-08T09:00:00').getTime());
});

test('sem vencimento futuro, sugere daqui a 1h arredondado pra 15 min', () => {
  assert.equal(horarioSugerido(null, agora).getTime(), new Date('2026-10-05T15:15:00').getTime());
  assert.equal(horarioSugerido('2026-10-01', agora).getTime(), new Date('2026-10-05T15:15:00').getTime());
});

test('toca no horário e repete a cada 5 min até alguém agir', () => {
  const alarme = new Date('2026-10-05T14:00:00').getTime();
  assert.equal(deveTocarAtividade(alarme, alarme - 1000, undefined), false);
  assert.equal(deveTocarAtividade(alarme, alarme, undefined), true);
  assert.equal(deveTocarAtividade(alarme, alarme + 60_000, alarme), false);
  assert.equal(deveTocarAtividade(alarme, alarme + INTERVALO_REPETICAO_MS, alarme), true);
});

test('alarme reagendado (adiado) toca de novo no novo horário', () => {
  const antigo = new Date('2026-10-05T14:00:00').getTime();
  const novo = antigo + 10 * 60_000;
  assert.equal(deveTocarAtividade(novo, novo, antigo + 60_000), true);
});

const projetos = [{ id: 'core', nome: 'Core' }, { id: 'insta', nome: 'Instalivros' }, { id: 'mat', nome: 'Matheus Souto' }];

test('lista "Infopro" vai pra Pessoal; "Infopro – Projeto" vai pro projeto', () => {
  assert.equal(projetoDaLista('Infopro', projetos), null);
  assert.equal(projetoDaLista('Infopro – Core', projetos), 'core');
  assert.equal(projetoDaLista('Infopro - instalivros', projetos), 'insta');
  assert.equal(projetoDaLista('Infopro: Matheus Souto', projetos), 'mat');
  assert.equal(projetoDaLista('Infopro – Não existe', projetos), null);
});

const t = (hhmm) => new Date(`2026-10-05T${hhmm}:00`).getTime();

test('data mudou no Lembretes → vai pra atividade', () => {
  assert.deepEqual(mesclarData(t('10:00'), t('10:00'), t('11:00')), { destino: 'atividade', data: t('11:00') });
});

test('data mudou no Infopro (ex.: Jarvis/web) → vai pro lembrete', () => {
  assert.deepEqual(mesclarData(t('10:00'), t('12:00'), t('10:00')), { destino: 'lembrete', data: t('12:00') });
});

test('data tirada no Lembretes → alarme desliga no Infopro', () => {
  assert.deepEqual(mesclarData(t('10:00'), t('10:00'), null), { destino: 'atividade', data: null });
});

test('iguais (até o minuto) → nada a fazer', () => {
  assert.equal(mesclarData(t('10:00'), t('10:00') + 20_000, t('10:00')).destino, 'nada');
});

test('nunca combinado: o Infopro manda, a menos que só o lembrete tenha data', () => {
  assert.deepEqual(mesclarData(undefined, t('09:00'), t('10:00')), { destino: 'lembrete', data: t('09:00') });
  assert.deepEqual(mesclarData(undefined, null, t('10:00')), { destino: 'atividade', data: t('10:00') });
});

test('título renomeado nos Lembretes vai pra atividade; renomeado no Infopro vai pro lembrete', () => {
  assert.deepEqual(mesclarTitulo('Gravar', 'Gravar', 'Gravar vídeo'), { destino: 'atividade', valor: 'Gravar vídeo' });
  assert.deepEqual(mesclarTitulo('Gravar', 'Gravar reels', 'Gravar'), { destino: 'lembrete', valor: 'Gravar reels' });
  assert.equal(mesclarTitulo('Gravar', 'Gravar', 'Gravar ').destino, 'nada');
});
