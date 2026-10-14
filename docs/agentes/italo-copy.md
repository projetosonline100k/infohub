# Ítalo — copywriter · projeto Davi Queiroz

O Ítalo é o copywriter da empresa do projeto Davi Queiroz, no setor Marketing. Em 14/10/2026
o Davi pediu para "implementar o Ítalo agora", com um chat próprio, no mesmo padrão do
Roy (`docs/agentes/roy-carrossel.md`), do Danilo (`docs/agentes/danilo-editor.md`) e da
Dalila (`docs/agentes/dalila-programacao.md`). Este arquivo é a fonte das instruções dele:
editar aqui muda o comportamento.

> **Desde 14/10/2026 o Ítalo é IA** (`membros.eh_ia = true`, função "Copywriter (IA)"), decisão do Davi.
> Ele é IA **operária**: só trabalha quando o **Davi ou o Pedro** levam uma atividade até ele.
> Por isso ele **não** entra em `IAS_AUTONOMAS`: a fila dele aparece como "levar para a IA" no "Precisa de você".
> Migração `20261014110000_italo_ia`, teste `supabase/tests/italo_ia.sql`, script `scripts/apply-italo-ia-migration.py` (`--testar` desfaz tudo).

## O que já existe (14/10/2026)

- Cadastro em `membros`:
  - id `fd0bb07d-7c87-49ca-ac02-627f06f65406`, nome "Ítalo", função "Copywriter", setor Marketing;
  - **pessoa** (`eh_ia = false`), sem conta de login;
  - responsabilidades: copy de vendas, copy de página de vendas, copy de quiz, copy de VSL, headlines e mensagens de campanha.
- Em 14/10 não havia nenhuma tarefa aberta dele em `atividades`.
- No mesmo setor estão o Gabriel (páginas de vendas) e o Pedro (gestão de projetos e métricas), os dois pessoas.
- Skills de escrita disponíveis no Claude que podem servir de base:
  - `copywriter-lareira-style`, que só vale quando pedida pelo nome;
  - `roteiros-virais`, `gerador-roteiro-por-headline`, `intensificador`, `cta-meio-roteiro`, `narrativa-fio-condutor`, `base-de-conteudo-notavel`.

## Projetos (14/10/2026)

- O Davi ainda não tem trabalho de copy para o projeto dele.
- O Ítalo vai começar pelo projeto **Matheus Souto** (Filosofia, produto ativo **Cinesofia**). A equipe inteira foi copiada para lá.
- Lá ele também é IA operária: o id é outro, e o cadastro é procurado por `cliente_id` + nome.
- O que falta para esse projeto ficar igual ao do Davi está em `docs/agentes/empresa-matheus-souto.md`.

## Primeiro trabalho (pedido do Davi, 14/10/2026)

"Mapear tudo que funciona hoje de quiz, entender tudo de copy". Bases pedidas:
- o livro **$100M Offers** (Oferta de 100 milhões), do Alex Hormozi;
- **Palavras que vendem**.

Os dois livros têm direitos autorais. O Davi sobe as cópias dele, e o Ítalo não baixa os livros da internet.

Esse conhecimento é **geral**: vale em todo projeto. A voz e o produto são de cada projeto. Ideia do Davi: cadastrar a inteligência de cada funcionário ao clicar nele (PDF, vídeos), explicado na seção abaixo.

## Inteligência por funcionário (no ar desde 14/10/2026, aprovada pelo Davi)

Vale para **todo** funcionário, não só para o Ítalo. No Infopro, abra Conteúdo → Visão geral, clique no funcionário e role até o quadro **"Inteligência de <nome>"**.

**Como o Davi alimenta:**
- Botões **PDF, vídeo ou áudio**, **Colar texto** e **Link**.
- Antes de subir, ele escolhe o alcance:
  - **Geral do funcionário:** vai para todo projeto do mesmo dono, por exemplo livros e métodos;
  - **Só deste projeto:** voz, produto e histórico do especialista.
- O alcance pode ser trocado depois, item por item.
- **PDF e texto** viram texto no próprio navegador (`src/lib/empresa/lerPdf.ts`, pdfjs-dist).
  - PDF escaneado, só com imagem, fica em erro: "não achei texto".
- **Vídeo e áudio** sobem para o bucket privado `inteligencia` e entram **na fila do Mac**.
  - O app guarda um link assinado de 7 dias.
  - `python3 scripts/inteligencia/processar.py` baixa, extrai o áudio com o ffmpeg do Danilo, transcreve com o mlx-whisper (pt) e devolve pela RPC `inteligencia_concluir`, com o token do item.
  - Ainda **não** roda sozinho: quem roda é a sessão do Ítalo, ou um serviço no futuro, como o do Roy.
- **Link:** link direto de arquivo ou **YouTube**, que é baixado pelo yt-dlp em `~/.infopro-hub/ytdlp`, com o `SSL_CERT_FILE` do certifi. Link do Drive abre uma página e dá erro; nesse caso, baixe e suba o arquivo.

**Como o agente lê (antes de qualquer trabalho):**
```
python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo
python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo --saida <pasta-no-scratchpad>
```
- Sem `--saida`, só lista. Com `--saida`, grava um `.txt` por item.
- É somente leitura e traz o que é geral do Ítalo mais o que é daquele projeto.
- O funcionário é o mesmo em todos os projetos pelo **nome**: `agente` = nome em minúsculas.

**Banco:**
- Migração `20261014130000_inteligencia_membros`, com as tabelas `inteligencia_membros` e `inteligencia_tokens` (a do token o app não acessa).
- Teste `supabase/tests/inteligencia_membros.sql` e script `scripts/apply-inteligencia-membros-migration.py`.
- Tela: `src/components/empresa/InteligenciaMembro.tsx`, dentro de `FilaPessoa.tsx`. Funções puras em `src/lib/empresa/inteligencia.ts`, com teste em `tests/inteligencia.test.mjs`.
- Limite do bucket: 500 MB por arquivo. Se o plano do Supabase tiver um limite menor, a tela avisa "arquivo grande demais: cole um link".

**Testado em 14/10:**
- leitura de PDF no navegador (2 páginas);
- transcrição local de um áudio em pt;
- RPC chamada pelo Mac;
- testes SQL: dono, token, outro usuário e projeto B sem enxergar o projeto A.
- Ainda **não** foi testado com login na tela real, porque a prévia pede a senha do Davi.

## Tarefa por conversa, o briefing (pedido do Davi, 14/10/2026; vale para todo funcionário)

"A tarefa tem que ser como se eu tivesse conversando com ele... quando ela me confirmar que entendeu e eu entender que ela entendeu mesmo, aí sim a atividade sobe."

**Fluxo:**
1. O Davi clica no funcionário e escreve em **"Nova tarefa: converse com <nome>"**.
2. O ouvinte do Jarvis (`scripts/jarvis-ouvinte.py`, linha de execução `briefing`) chama o Claude no papel do funcionário, com `scripts/empresa/briefing.py`.
3. O funcionário lê o manual (`docs/agentes/<nome>-*.md`) e a inteligência dele. Depois responde:
   - o que entendeu;
   - no máximo 3 perguntas;
   - se consegue fazer e o que precisa do Davi.
4. Quando a tarefa está clara, ele grava a **proposta**: título, entendimento, entregas, se consegue, limites, o que precisa e o prazo.
5. A proposta aparece num cartão verde com o botão **"Confirmar e subir a tarefa"**.
6. Só com essa confirmação nasce a atividade: situação `fila`, com o combinado e a conversa inteira na `descricao`.
- **Para uma pessoa** (`eh_ia = false`), o Claude ajuda a detalhar o pedido que vai ser repassado a ela.
- A "tarefa rápida, sem conversa" continua lá, como reserva.
- A caixa "conversa do ChatGPT" só aparece para quem tem `link_ia`.

**Banco:**
- Migração `20261014140000_briefings_tarefa`, com as tabelas `briefings` e `briefing_mensagens`.
- O app não escreve como funcionário nem grava a proposta.
- Teste `supabase/tests/briefings_tarefa.sql`, script `scripts/apply-briefings-tarefa-migration.py`.

**Tela:**
- `src/components/empresa/BriefingTarefa.tsx` e `src/lib/empresa/briefing.ts`, com teste em `tests/briefing.test.mjs`.

**Para ficar no ar:**
- O ouvinte permanente (LaunchAgent) roda o código de `/Users/davi/Infopro-hub`. O briefing só funciona sozinho depois do merge e de reiniciar o ouvinte.
- Enquanto isso, em 14/10 rodou um ouvinte de teste a partir deste worktree.

**Ainda falta:** depois da confirmação, o funcionário **começar a fazer** sozinho. Para o Ítalo, isso é a Fase 1 (criar → o Davi revisa → aprova).

## Estado e decisões

**14/10/2026:**
- **Publicado:** commit `a518255` em `main`.
  - O Vercel atualizou, com a aba Inteligência e a conversa no ar.
  - O ouvinte do Jarvis foi reiniciado com a linha de execução `briefing`.
- **Primeira tarefa do Ítalo** (briefing confirmado pelo Davi): pesquisa de mercado do público de desenvolvimento pessoal para o Matheus, com prazo hoje às 17:30.
  - **Entregue a v1** no documento "Pesquisa de mercado: dores, desejos e crenças (v1)" (projeto Matheus, pasta "Desafio 7 dias", ligado à atividade).
  - Base: os ~30 comentários mais curtidos de 12 vídeos do Seja Uma Pessoa Melhor, coletados com o yt-dlp.
  - Conteúdo: dores, desejos, crenças, itens conhecidos, dificuldades, 10 ganchos de headline, 10 perguntas de quiz e a lista dos vídeos.
  - A tarefa foi para `aguardando_aprovacao`.
  - Ficou de fora: Instagram (sem login) e canais mais recentes, que entram na v2.
- **Inteligência do Ítalo:** os 2 vídeos do YouTube sobre quiz ("Quiz, metodo" e "10 Hacks Para Aumentar a Conversão do Seu Quiz") foram transcritos, com ~27 mil e ~29 mil caracteres.
  - Ainda faltam os livros ($100M Offers e Palavras que vendem).

## A combinar com o Davi (primeira conversa)

1. ~~O Ítalo passa a ser IA?~~ **Decidido em 14/10: sim, IA operária (o Davi ou o Pedro levam a atividade).**
   Texto original da pergunta: o Ítalo passa a ser IA (`eh_ia = true`)?
   - Se sim, muda por migração com teste, como foi feito com a Dalila em `20261014100000_dalila_publicacao`.
   - Também é preciso decidir se ele é IA "operária" (o Davi leva o trabalho até ele) ou "autônoma" (`IAS_AUTONOMAS` em `src/lib/empresa/visaoGeral.ts`).
2. Qual é o primeiro trabalho dele? Opções: página de vendas, VSL, quiz, headlines, campanha, legendas. Para qual produto (`produtos_cliente`)?
3. De onde vem a voz do Davi: textos de referência, copys antigas (Drive?), transcrições de reels (`videos_referencia.transcricao`), o `nucleo_influencia` do cliente.
4. Como a copy chega até o Davi para revisar: um documento (`documentos`) ou uma tela em "Precisa de você", como a revisão de carrossel do Roy. E quem recebe depois que ele aprovar (Gabriel monta a página? Dalila publica?).
5. Onde guardar as entregas (Drive, `documentos`) e o histórico, para não repetir copy.

## Regras gerais (CLAUDE.md e chats anteriores)

- Falar com o Davi em português simples, com perguntas em texto (sem popups).
- Dados: `python3 scripts/consulta.py` (só leitura).
  - Escrita no banco só via migração em `supabase/migrations`, com teste em `supabase/tests` e script `scripts/apply-*.py`.
- Nada é publicado nem enviado em nome do Davi sem o ok dele.
- Ao concluir algo, atualizar este arquivo (estado e decisões).
