import test from "node:test";
import assert from "node:assert/strict";
import { linkWhatsapp } from "../src/lib/quiz/whatsapp.ts";

test("número com DDD ganha o 55 e a mensagem vai codificada", () => {
  assert.equal(linkWhatsapp("(11) 98765-4321", "Oi! Tenho uma dúvida."), "https://wa.me/5511987654321?text=Oi!%20Tenho%20uma%20d%C3%BAvida.");
  assert.equal(linkWhatsapp("+55 11 98765-4321"), "https://wa.me/5511987654321");
});
test("número vazio ou incompleto não gera link", () => {
  assert.equal(linkWhatsapp(""), "");
  assert.equal(linkWhatsapp(undefined), "");
  assert.equal(linkWhatsapp("98765-4321"), "");
});
