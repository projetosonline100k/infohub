import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/atividades/semana.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { diaDaColuna, diaDaTarefa, situacaoDaTarefa, diasDeAtraso, inicioDaSemana, chaveDia } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const hoje = new Date(2026, 9, 24, 15, 0); // sábado, 24/10/2026
const base = { concluida: false, status: "backlog", data_vencimento: null };

test("coluna com nome de dia", () => {
  assert.equal(diaDaColuna("Terça feira"), 2);
  assert.equal(diaDaColuna("quinta-feira"), 4);
  assert.equal(diaDaColuna("SÁBADO"), 6);
  assert.equal(diaDaColuna("DOMINGO"), 0);
  assert.equal(diaDaColuna("Backlog"), null);
});

test("semana começa na segunda", () => {
  assert.equal(chaveDia(inicioDaSemana(hoje)), "2026-10-19");
  assert.equal(chaveDia(inicioDaSemana(new Date(2026, 9, 25))), "2026-10-19"); // domingo
});

test("dia da tarefa: entrega, coluna do dia, concluída", () => {
  assert.equal(diaDaTarefa({ ...base, data_vencimento: "2026-10-21" }, undefined, hoje), "2026-10-21");
  assert.equal(diaDaTarefa(base, { nome: "Terça feira", status_key: "em_progresso", eh_conclusao: false }, hoje), "2026-10-20");
  assert.equal(diaDaTarefa(base, { nome: "Domingo", status_key: "domingo", eh_conclusao: false }, hoje), "2026-10-25");
  assert.equal(diaDaTarefa(base, { nome: "Backlog", status_key: "backlog", eh_conclusao: false }, hoje), null);
  assert.equal(diaDaTarefa({ ...base, concluida: true, concluida_em: "2026-10-22T18:00:00" }, undefined, hoje), "2026-10-22");
});

test("situação", () => {
  const dia = { nome: "Terça feira", status_key: "em_progresso", eh_conclusao: false };
  assert.equal(situacaoDaTarefa(base, dia, hoje), "afazer"); // coluna de dia não é "em andamento"
  assert.equal(situacaoDaTarefa({ ...base, status: "em_progresso" }, { nome: "Em Execução", status_key: "em_progresso", eh_conclusao: false }, hoje), "andamento");
  assert.equal(situacaoDaTarefa({ ...base, data_vencimento: "2026-10-22" }, dia, hoje), "atrasada");
  assert.equal(situacaoDaTarefa({ ...base, data_vencimento: "2026-10-24" }, dia, hoje), "afazer");
  assert.equal(situacaoDaTarefa({ ...base, status: "revisao" }, { nome: "Revisão", status_key: "revisao", eh_conclusao: false }, hoje), "revisao");
  assert.equal(situacaoDaTarefa({ ...base, status: "revisao" }, { nome: "quarta feira", status_key: "revisao", eh_conclusao: false }, hoje), "afazer");
  assert.equal(situacaoDaTarefa({ ...base, timer_iniciado_em: "2026-10-24T10:00:00Z" }, dia, hoje), "andamento");
  assert.equal(situacaoDaTarefa({ ...base, concluida: true }, dia, hoje), "concluida");
});

test("dias de atraso", () => {
  assert.equal(diasDeAtraso({ ...base, data_vencimento: "2026-10-22" }, hoje), 2);
  assert.equal(diasDeAtraso({ ...base, data_vencimento: "2026-10-25" }, hoje), 0);
});
