import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/quiz/faltas.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { faltasDoQuiz } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('lista só o que tem nota e ainda está vazio, com o lugar', () => {
  const f = faltasDoQuiz({
    intro: { imagem: '', imagem_nota: 'foto do Davi' },
    perguntas: [{ id: 'q1', texto: 'a', opcoes: [], imagem: 'https://x/1.png', imagem_nota: 'capa' }, { id: 'q2', texto: 'b', opcoes: [], imagem_nota: 'livros' }],
    telas: [{ titulo: 'Recado do Davi', audio_nota: 'áudio de 30 s', depoimentos: [{ nome: '', texto: '' }], depoimentos_nota: '2 depoimentos' }],
    perfis: [{ id: 'p', nome: 'Preso no Scroll', imagem_nota: 'ela na cama' }],
  });
  assert.deepEqual(f.map((x) => [x.onde, x.tipo, x.caminho]), [
    ['Abertura', 'imagem', 'intro.imagem'],
    ['Pergunta 2', 'imagem', 'perguntas.1.imagem'],
    ['Tela: Recado do Davi', 'audio', 'telas.0.audio'],
    ['Tela: Recado do Davi', 'depoimentos', 'telas.0.depoimentos'],
    ['Perfil: Preso no Scroll', 'imagem', 'perfis.0.imagem'],
  ]);
});

test('quiz completo não tem faltas', () => {
  assert.deepEqual(faltasDoQuiz({ intro: { imagem: 'u', imagem_nota: 'x' }, perguntas: [] }), []);
  assert.deepEqual(faltasDoQuiz(null), []);
});
