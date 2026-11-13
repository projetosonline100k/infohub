import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/plano.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const L = (id, autor, temas, audio = 17, nota = 4.5, titulo = `Livro ${id}`) => ({ id, titulo, autor, capa: 'https://x/y.jpg', nota, audio, temas });

test('tema da opção: acento e "Finanças pessoais" viram a chave certa', () => {
  assert.equal(m.temaDaOpcao('Finanças pessoais'), 'financas');
  assert.equal(m.temaDaOpcao('Autoconfiança'), 'autoconfianca');
  assert.equal(m.temaDaOpcao('Comunicação'), 'comunicacao');
  assert.equal(m.temaDaOpcao('Liderança'), 'lideranca');
  assert.equal(m.temaDaOpcao('Mentalidade'), 'mentalidade');
  assert.equal(m.temaDaOpcao('Qualquer coisa'), null);
});

test('plano: cobre as 3 áreas marcadas, um autor por vez, 5 dias, e o resto fica oculto (30 no total)', () => {
  const livros = [
    L(1, 'Ana', ['foco']), L(2, 'Ana', ['foco'], 15, 4.9), L(3, 'Bia', ['foco'], 18, 4.4), L(4, 'Caio', ['habitos'], 12), L(5, 'Duda', ['financas'], 22), L(6, 'Edu', ['financas'], 16, 4.8),
    L(7, 'Fabi', ['carreira']), L(8, 'Gil', ['mentalidade', 'foco'], 19), L(9, 'Hugo', ['lideranca'], 14),
  ];
  const p = m.montarPlano(livros, { areas: ['foco', 'habitos', 'financas'], curtidos: [], perfil: ['mentalidade'] });
  assert.equal(p.dias.length, 5);
  assert.equal(p.ocultos, 25);
  assert.equal(p.total, 30);
  const temas = new Set(p.dias.flatMap((d) => d.livro.temas));
  assert.ok(temas.has('foco') && temas.has('habitos') && temas.has('financas'));
  const autores = p.dias.map((d) => d.livro.autor);
  assert.equal(new Set(autores).size, autores.length);   // nenhum autor repetido
  assert.deepEqual(p.dias.map((d) => d.dia), [1, 2, 3, 4, 5]);
  // começa leve: o áudio não diminui de um dia para o outro (em faixas de 5 min)
  const faixas = p.dias.map((d) => Math.round(d.livro.audio / 5));
  assert.deepEqual(faixas, [...faixas].sort((a, b) => a - b));
  // o melhor do foco é o da Ana com nota 4.9 (id 2), não o id 1 do mesmo autor
  assert.ok(p.dias.some((d) => d.livro.id === 2) && !p.dias.some((d) => d.livro.id === 1));
  assert.ok(p.dias.every((d) => d.porque.length > 0));
  // o tema mostrado é o da área que ela marcou, mesmo quando o livro tem outro tema primeiro
  assert.equal(p.dias.find((d) => d.livro.id === 8)?.tema ?? 'foco', 'foco');
});

test('plano: sem livros suficientes devolve só o que combina; livro sem áudio ou fora do tema não entra', () => {
  const p = m.montarPlano([L(1, 'A', ['foco']), L(2, 'B', ['carreira'], 0), L(3, 'C', ['lideranca'])], { areas: ['foco'], curtidos: [], perfil: [] });
  assert.deepEqual(p.dias.map((d) => d.livro.id), [1]);
  assert.equal(p.ocultos, 29);
});

test('tema do livro: a área marcada vence o primeiro tema do livro', () => {
  const p = m.montarPlano([L(1, 'A', ['carreira', 'habitos'])], { areas: ['habitos'], curtidos: [], perfil: ['carreira'] });
  assert.equal(p.dias[0].tema, 'habitos');
});

test('pontos: área marcada > livro curtido > perfil; nota desempata', () => {
  const ent = { areas: ['foco'], curtidos: ['financas'], perfil: ['lideranca'] };
  const a = m.pontosDoLivro(L(1, 'A', ['foco'], 17, 4), ent).pontos, b = m.pontosDoLivro(L(2, 'B', ['financas'], 17, 4), ent).pontos, c = m.pontosDoLivro(L(3, 'C', ['lideranca'], 17, 4), ent).pontos;
  assert.ok(a > b && b > c && c > 0);
  assert.ok(m.pontosDoLivro(L(4, 'D', ['foco'], 17, 5), ent).pontos > a);
});

test('título em maiúsculas vira título normal; o resto fica como veio', () => {
  assert.equal(m.tituloBonito('SINÔNIMO DE SUCESSO'), 'Sinônimo de Sucesso');
  assert.equal(m.tituloBonito('O Poder do Hábito'), 'O Poder do Hábito');
  assert.equal(m.rotuloDoDia(1), 'Amanhã');
  assert.equal(m.rotuloDoDia(2), 'Depois de amanhã');
  assert.equal(m.rotuloDoDia(4), 'Dia 4');
});

test('razões do perfil: as respostas que mais pesaram, em ordem, só as que dão ponto ao perfil', () => {
  const qs = [
    { id: 'a', texto: 'Você adia decisões?', opcoes: [{ texto: 'Nada' }, { texto: 'Totalmente', emoji: '😄', perfil: 'adiado', pontos: 3 }] },
    { id: 'b', texto: 'Falta motivação?', opcoes: [{ texto: 'Nada' }, { texto: 'Tem a ver', emoji: '🙂', perfil: 'adiado', pontos: 2 }] },
    { id: 'c', texto: 'Outra', opcoes: [{ texto: 'x', perfil: 'inseguro', pontos: 3 }] },
    { id: 'd', texto: 'Mais uma', opcoes: [{ texto: 'y', perfil: 'adiado', pontos: 1 }] },
    { id: 'e', texto: 'E mais', opcoes: [{ texto: 'z', perfil: 'adiado', pontos: 1 }] },
  ];
  const r = m.razoesDoPerfil(qs, { a: 1, b: 1, c: 0, d: 0, e: 0 }, 'adiado');
  assert.deepEqual(r.map((x) => x.pergunta), ['Você adia decisões?', 'Falta motivação?', 'Mais uma']);
  assert.equal(r[0].resposta, 'Totalmente');
  assert.equal(m.razoesDoPerfil(qs, {}, 'adiado').length, 0);
});
