# Mensagem para colar no Claude (Claude Code)

Coloque os arquivos `GUIA-ESCRITORIO-IA.md` e `schema-inicial.sql` dentro da pasta do projeto
(por exemplo em `docs/escritorio/`) e mande esta mensagem para o Claude:

---

Quero construir no meu projeto um **escritório de funcionários de IA**, inspirado num sistema que um
amigo já usa. Leia com atenção `docs/escritorio/GUIA-ESCRITORIO-IA.md` (a ideia, a arquitetura, os
fluxos, os erros que já aconteceram) e `docs/escritorio/schema-inicial.sql` (banco de partida).

Importante:
- É **inspiração**, não cópia: adapte ao meu negócio e ao que eu já tenho no projeto.
- Antes de escrever código, **me faça as perguntas da seção 9 do guia** (que funcionários eu quero,
  onde roda, o que nunca pode ser feito sem mim etc.) e me mostre um plano curto por fases.
- Construa **uma fase por vez** (seção 8), testando cada uma antes da próxima. Comece pela Fase 1.
- Siga as regras de segurança: nada de publicar, mandar mensagem ou gastar dinheiro sem eu pedir;
  credenciais só em arquivos locais fora do git; nunca peça para eu colar senha no chat.
- Fale comigo em português simples.

---

Dica: depois que a Fase 1 estiver pronta, peça para o Claude salvar na memória do projeto um resumo
de como o escritório funciona, para os próximos chats já saberem.
