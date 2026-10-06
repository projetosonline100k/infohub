import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/planilhaReferencias.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { linhasDaPlanilha, lerCsv, lerVisualizacoes, lerData, chaveDoLink } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('lê o CSV da planilha atual (aspas, vírgulas e quebras dentro da transcrição)', () => {
  const csv = 'Link,Headline falada,Transcrição,Visualizações,Criador,Data de publicação\n'
    + 'https://www.instagram.com/reel/AAA/,"Gancho, com vírgula","linha 1\nlinha ""2""",84135,Kyle (@coachkyle),24/08/2026\n'
    + 'https://www.instagram.com/reel/BBB/%3Fstkn=xyz,Outro,,1057225,,\n';
  const { linhas, faltando } = linhasDaPlanilha(lerCsv(csv));
  assert.deepEqual(faltando, []);
  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas[0], {
    link: 'https://www.instagram.com/reel/AAA/', headline: 'Gancho, com vírgula', transcricao: 'linha 1\nlinha "2"',
    visualizacoes: 84135, criador: 'Kyle (@coachkyle)', dataPublicacao: '2026-08-24',
  });
  assert.equal(linhas[1].criador, null);
  assert.equal(linhas[1].dataPublicacao, null);
});

test('aceita colunas com outros nomes e em outra ordem', () => {
  const { linhas } = linhasDaPlanilha([['Views', 'URL', 'Título', 'Autor'], ['1,2 mil', 'https://x.com/v/1', 'Oi', 'Ana']]);
  assert.deepEqual(linhas[0], { link: 'https://x.com/v/1', headline: 'Oi', transcricao: null, visualizacoes: 1200, criador: 'Ana', dataPublicacao: null });
});

test('avisa quando falta coluna obrigatória (link/headline)', () => {
  assert.deepEqual(linhasDaPlanilha([['Criador', 'Views'], ['a', '1']]).faltando, ['link', 'headline']);
});

test('não repete o mesmo vídeo com link diferente dentro da planilha', () => {
  const { linhas } = linhasDaPlanilha([['Link', 'Headline'], ['https://www.instagram.com/reel/X/', 'a'], ['https://instagram.com/reel/X?utm=1', 'b']]);
  assert.equal(linhas.length, 1);
});

test('visualizações em vários formatos', () => {
  assert.equal(lerVisualizacoes('1.057.225'), 1057225);
  assert.equal(lerVisualizacoes('3,4M'), 3400000);
  assert.equal(lerVisualizacoes('12k'), 12000);
  assert.equal(lerVisualizacoes(''), null);
  assert.equal(lerVisualizacoes(84135), 84135);
});

test('datas brasileiras e ISO', () => {
  assert.equal(lerData('24/08/2026'), '2026-08-24');
  assert.equal(lerData('2026-08-24T10:00:00'), '2026-08-24');
  assert.equal(lerData(new Date('2026-08-24T12:00:00Z')), '2026-08-24');
});

test('chave do link ignora parâmetros e barra final', () => {
  assert.equal(chaveDoLink('https://www.instagram.com/reel/DdxfOmXsSsb/%3Fstkn=abc'), chaveDoLink('https://instagram.com/reel/DdxfOmXsSsb'));
});

test('link do Google Sheets vira endereço de exportação CSV da aba certa', async () => {
  const src = readFileSync(new URL('../src/lib/conteudo/planilhaGoogle.ts', import.meta.url), 'utf8');
  const parte = src.slice(src.indexOf('export function urlCsvDaPlanilha'), src.indexOf('// Puxa a planilha'));
  const { outputText: js } = ts.transpileModule(parte, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
  const { urlCsvDaPlanilha } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  assert.equal(
    urlCsvDaPlanilha('https://docs.google.com/spreadsheets/d/10rbkrHcqTqTwMTC0lBZEYgNHLRpLLoFwWz6UpZo2zZw/edit?gid=788793414#gid=788793414'),
    'https://docs.google.com/spreadsheets/d/10rbkrHcqTqTwMTC0lBZEYgNHLRpLLoFwWz6UpZo2zZw/export?format=csv&gid=788793414',
  );
  assert.equal(urlCsvDaPlanilha('https://exemplo.com/planilha'), null);
});
