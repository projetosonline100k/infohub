import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/visaoGeral.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { contarIndicadores, precisaDeVoce, tarefasEmExecucao, estadoDosMembros, videosProgramados, ordenarFila } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const HOJE = '2026-10-12';
const video = (id, status, data_postagem = null) => ({ id, titulo: id, status, data_postagem, plataforma: 'vertical' });
const tarefa = (id, responsavel_id, extra = {}) => ({
  id, titulo: id, responsavel_id, setor_id: 's-av', situacao: 'fila', tipo: null, data_vencimento: null, concluida: false, progresso: null, ...extra,
});
const membros = [
  { id: 'm-davi', nome: 'Davi', funcao: null, setor_id: 's-dir', conta_id: 'eu', eh_ia: false },
  { id: 'm-danilo', nome: 'Danilo', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: false },
  { id: 'm-roy', nome: 'Roy', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: false },
];
const setores = [{ id: 's-av', nome: 'Audiovisual', descricao: null, cor: null, icone: null }];

test('indicadores contam cada etapa; agendado = não postado com data ou pronto', () => {
  const n = contarIndicadores([
    video('a', 'ideia'), video('b', 'ideia'), video('c', 'roteiro'), video('d', 'gravacao'),
    video('e', 'edicao'), video('f', 'pronto'), video('g', 'roteiro', '2026-10-20'), video('h', 'postado', '2026-10-01'),
  ]);
  assert.deepEqual(n, { ideias: 2, roteiros: 1, paraGravar: 1, editando: 1, agendados: 2, postados: 1 });
});

test('precisa de você: gravar, aprovar e só as minhas tarefas abertas', () => {
  const itens = precisaDeVoce('eu', [video('a', 'gravacao'), video('b', 'gravacao')], membros, [
    tarefa('minha', 'm-davi', { data_vencimento: '2026-10-10' }),
    tarefa('do-danilo', 'm-danilo'),
    tarefa('aprovar', 'm-danilo', { situacao: 'aguardando_aprovacao' }),
    tarefa('feita', 'm-davi', { concluida: true }),
  ], HOJE);
  assert.deepEqual(itens.map((i) => i.tipo), ['gravar', 'aprovar', 'tarefa']);
  assert.equal(itens[0].quantidade, 2);
  assert.equal(itens[2].tarefa.id, 'minha');
  assert.equal(itens[2].atrasada, true);
});

test('tarefas sendo executadas: da equipe, fazendo agora primeiro; sem as minhas nem as que esperam aprovação', () => {
  const comIa = [...membros, { id: 'm-ital', nome: 'Ítalo', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: true },
    { id: 'm-gpt', nome: 'Editor GPT', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: true }];
  const linhas = tarefasEmExecucao('eu', comIa, [
    tarefa('fila-danilo', 'm-danilo'), tarefa('agora-pouco', 'm-roy', { situacao: 'andamento', progresso: 10 }),
    tarefa('agora-muito', 'm-ital', { situacao: 'andamento', progresso: 80 }), tarefa('fila-italo', 'm-ital'),
    tarefa('minha', 'm-davi', { situacao: 'andamento' }), tarefa('aprovar', 'm-roy', { situacao: 'aguardando_aprovacao' }),
    tarefa('feita', 'm-roy', { concluida: true }), tarefa('levar-gpt', 'm-gpt'),
  ]);
  assert.deepEqual(linhas.map((l) => l.tarefa.id), ['agora-muito', 'agora-pouco', 'fila-danilo', 'fila-italo']);
  assert.equal(linhas[0].agora, true);
});

test('estado do membro: tarefa atual é a em andamento, conta atrasos', () => {
  const [, danilo] = estadoDosMembros(membros, [
    tarefa('fila', 'm-danilo', { data_vencimento: '2026-10-01' }),
    tarefa('agora', 'm-danilo', { situacao: 'andamento' }),
  ], HOJE);
  assert.equal(danilo.atual.id, 'agora');
  assert.equal(danilo.abertas, 2);
  assert.equal(danilo.atrasadas, 1);
  assert.equal(danilo.ocupado, true);
});

test('ordem da fila: andamento, aprovação, fila; prazo mais cedo primeiro', () => {
  const ids = ordenarFila([
    tarefa('f2', 'x', { data_vencimento: '2026-10-20' }), tarefa('f1', 'x', { data_vencimento: '2026-10-13' }),
    tarefa('ap', 'x', { situacao: 'aguardando_aprovacao' }), tarefa('an', 'x', { situacao: 'andamento' }),
  ]).map((t) => t.id);
  assert.deepEqual(ids, ['an', 'ap', 'f1', 'f2']);
});

test('programados: só futuros não postados, em ordem', () => {
  const ids = videosProgramados([
    video('passado', 'pronto', '2026-10-01'), video('b', 'pronto', '2026-10-15'),
    video('a', 'edicao', '2026-10-12'), video('postado', 'postado', '2026-10-13'),
  ], HOJE).map((v) => v.id);
  assert.deepEqual(ids, ['a', 'b']);
});

test('precisa de você: fila de IA operária vira "levar pra IA"; Jarvis não', () => {
  const comIa = [...membros,
    { id: 'm-ia', nome: 'Danilo IA', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: true },
    { id: 'm-jarvis', nome: 'Jarvis', funcao: null, setor_id: 's-dir', conta_id: null, eh_ia: true },
    { id: 'm-dalila', nome: 'Dalila', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: true }];
  const itens = precisaDeVoce('eu', [], comIa, [
    tarefa('editar-1', 'm-ia'), tarefa('editar-2', 'm-ia'),
    tarefa('ja-com-ela', 'm-ia', { situacao: 'andamento' }),
    tarefa('do-jarvis', 'm-jarvis'),
    tarefa('programar', 'm-dalila', { tipo: 'programacao' }), // a Dalila publica sozinha
  ], HOJE);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].tipo, 'levar_ia');
  assert.deepEqual(itens[0].tarefas.map((t) => t.id), ['editar-1', 'editar-2']);
});

test('sinal: vermelho > amarelo > verde > cinza, juntando tarefas e trabalho das IAs', async () => {
  const { sinalDoMembro, trabalhoDasIas, estadoDosMembros: estados } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const ms = [...membros.filter((m) => m.id !== 'm-roy'), { id: 'm-roy', nome: 'Roy', funcao: null, setor_id: 's-av', conta_id: null, eh_ia: true }];
  const sinal = (id, ts, ia) => sinalDoMembro(estados(ms, ts, HOJE).find((e) => e.membro.id === id), ts, ia);
  assert.equal(sinal('m-danilo', []), 'parado');
  assert.equal(sinal('m-danilo', [tarefa('t', 'm-danilo', { situacao: 'andamento' })]), 'trabalhando');
  assert.equal(sinal('m-danilo', [tarefa('t', 'm-danilo', { situacao: 'aguardando_aprovacao' })]), 'esperando');
  assert.equal(sinal('m-danilo', [tarefa('t', 'm-danilo', { situacao: 'andamento', data_vencimento: '2026-10-01' })]), 'problema');
  const ias = trabalhoDasIas(ms, [{ status: 'produzindo', tema: 'Docs' }, { status: 'aprovado', tema: 'x' }], []);
  assert.deepEqual(ias.get('m-roy'), { trabalhando: 1, esperando: 0, problema: 0, atual: 'Criando carrossel: Docs' });
  assert.equal(sinal('m-roy', [], ias.get('m-roy')), 'trabalhando');
  assert.equal(sinal('m-roy', [], trabalhoDasIas(ms, [{ status: 'produzindo', tema: 'a' }, { status: 'revisar', tema: 'b' }], []).get('m-roy')), 'esperando');
  assert.equal(sinal('m-roy', [], trabalhoDasIas(ms, [{ status: 'erro', tema: 'a' }, { status: 'revisar', tema: 'b' }], []).get('m-roy')), 'problema');
  assert.equal(trabalhoDasIas(ms, [], []).has('m-danilo'), false); // Danilo aqui não é IA
  // Post programado (Dalila): data escolhida, esperando a hora → amarelo, não verde.
  assert.equal(sinal('m-danilo', [tarefa('p', 'm-danilo', { situacao: 'andamento', tipo: 'programacao' })]), 'esperando');
  assert.equal(sinal('m-danilo', [tarefa('p', 'm-danilo', { situacao: 'fila', tipo: 'programacao' })]), 'parado');
});
