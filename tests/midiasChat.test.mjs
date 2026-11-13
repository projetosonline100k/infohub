import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/empresa/midiasChat.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { midiasDoTexto } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('caminho completo de vídeo e imagem vira mídia, sem pontuação no fim', () => {
  const r = midiasDoTexto('Veja ~/.infopro-hub/exemplos/mestre-chines/video_exemplo.mp4, e também /Users/davi/.infopro-hub/exemplos/a/folha.png.');
  assert.deepEqual(r.midias.map((m) => [m.caminho, m.tipo]), [['~/.infopro-hub/exemplos/mestre-chines/video_exemplo.mp4', 'video'], ['/Users/davi/.infopro-hub/exemplos/a/folha.png', 'imagem']]);
});

test('pasta citada + nomes soltos viram caminhos (o jeito que o Lauro escreveu)', () => {
  const r = midiasDoTexto('Abri a pasta no seu Mac: ~/.infopro-hub/exemplos/mestre-chines. O vídeo é o video_exemplo_mestre_chines.mp4, e tem também a folha_expressoes.png com as 4 expressões.');
  assert.deepEqual(r.midias.map((m) => m.caminho), ['~/.infopro-hub/exemplos/mestre-chines/video_exemplo_mestre_chines.mp4', '~/.infopro-hub/exemplos/mestre-chines/folha_expressoes.png']);
  assert.equal(r.pasta, '~/.infopro-hub/exemplos/mestre-chines');
});

test('a pasta vale para as mensagens seguintes; nome solto sem pasta conhecida é ignorado', () => {
  assert.deepEqual(midiasDoTexto('olha o mestre_sorrindo.png').midias, []);
  assert.deepEqual(midiasDoTexto('olha o mestre_sorrindo.png', '~/.infopro-hub/exemplos/x').midias.map((m) => m.caminho), ['~/.infopro-hub/exemplos/x/mestre_sorrindo.png']);
});

test('não repete a mesma mídia e ignora links da internet e outros tipos de arquivo', () => {
  const r = midiasDoTexto('~/.infopro-hub/e/a.png e de novo ~/.infopro-hub/e/a.png; https://site.com/b.png e ~/.infopro-hub/e/gerar.py');
  assert.deepEqual(r.midias.map((m) => m.caminho), ['~/.infopro-hub/e/a.png']);
});

test('áudio (mp3, wav, m4a…) também aparece, como no caso da voz do roteiro', () => {
  const r = midiasDoTexto('Ouça a amostra em ~/.infopro-hub/exemplos/insta-insights/voz_idoso_amostra.mp3 e o roteiro completo em ~/.infopro-hub/exemplos/insta-insights/voz_idoso.mp3. Também voz.wav.');
  assert.deepEqual(r.midias.map((m) => [m.nome, m.tipo]), [['voz_idoso_amostra.mp3', 'audio'], ['voz_idoso.mp3', 'audio'], ['voz.wav', 'audio']]);
});
