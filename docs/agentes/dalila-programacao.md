# Dalila — programação e publicação (IA) · @eu.davioficial

A Dalila é a social media da empresa do projeto Davi Queiroz (setor
Audiovisual). Ela recebe o que o Davi aprovou (por enquanto, os carrosséis
do Roy) e programa e publica no Instagram. Em 14/10/2026 o Davi pediu um chat
próprio para ela ("vou começar a trabalhar com ela agora"), no mesmo padrão do
Roy (`docs/agentes/roy-carrossel.md`) e do Danilo (`docs/agentes/danilo-editor.md`).
Este arquivo é a fonte das instruções dela: editar aqui muda o comportamento.

> **Desde 14/10/2026 a Dalila é IA** (`membros.eh_ia = true`, id a0492db7-8a2d-49fb-97a1-628cc7cf106e,
> função "Social media (IA · programação e publicação)"), decisão do Davi. Ela é IA **autônoma**,
> como o Jarvis (`IAS_AUTONOMAS` em `src/lib/empresa/visaoGeral.ts`): a fila dela não vira
> "levar para a IA" no "Precisa de você", porque ela publica sozinha na nuvem.

## Como o trabalho chega até ela (Fase 2, no ar desde 14/10/2026)

1. O Roy cria o carrossel. O Davi revisa no Infopro (Conteúdo → Visão geral → "Precisa de você") e aprova.
2. Na aprovação (pelo app ou pelo `roy.aprovar`), o gatilho `carrossel_aprovado_tarefas` cria:
   - a tarefa da Dalila, se quem aprovou não criou: `Programar carrossel: NNN · tema (N páginas)`, tipo `programacao`, situação `fila`;
   - a tarefa do **Davi** `Escolher data do carrossel: NNN · tema`, tipo `agendar`, prioridade alta, ligada em `carrosseis.tarefa_data_id`.
   - Pedido do Davi (14/10): "me pergunte no Infopro como atividade minha, assim eu seleciono a data".
3. O Davi clica na tarefa em "Precisa de você". Abre `ProgramarCarrossel.tsx`, com as páginas, a legenda, o dia e a hora.
   - Sugestão: o primeiro dia livre às 10h (`src/lib/empresa/programacao.ts`).
   - "Programar" chama a RPC `programar_carrossel`: o carrossel fica `programado`, a tarefa dele é concluída e a da Dalila vai para `andamento`, com o prazo no dia.
   - **Escolher a data é o ok do Davi para aquele post.** Sem data, nada é publicado.
   - `desprogramar_carrossel` desfaz a programação (ainda sem botão na tela).
4. Na nuvem, o `pg_cron` (job `dalila-publicar`, a cada minuto) chama a edge function `dalila-publicar` com a chave do Vault (`dalila_publicar`).
   - A função pega um carrossel por vez, com uma trava de 3 min (`dalila_proximo_carrossel`).
   - Primeiro converte as páginas PNG em JPEG, porque a Meta só aceita JPEG: `carrosseis/<cliente>/<carrossel>/publicar/v<versao>/NN.jpg`, gravadas em `paginas_jpg`.
   - Na hora marcada, segue o processo da Meta (abaixo) e grava `ig_media_id`, `permalink` e `publicado_em`. O status fica `publicado` e a tarefa da Dalila é concluída, com o permalink em `observacao`.
5. **Se não der para publicar**, o carrossel volta para `aprovado`, sem data, com `mensagem = "Não publicou: motivo"`.
   - Isso acontece com falta de permissão, token de outro perfil, páginas que não batem ou 3 tentativas sem sucesso.
   - A tarefa do Davi reabre como `Escolher nova data do carrossel: …`, com o motivo. Ele escolhe outra data e o ciclo recomeça.

Status do carrossel: `aprovado → programado → publicando → publicado` (a migração `20261014100000_dalila_publicacao` acrescentou `publicando`).
Falha de publicação **não** usa `erro`, que é o vermelho do Roy no mapa.

## Regras da programação (do manual do Roy, itens 1, 6, 7 e 9)

- **Ritmo (Davi, 16/10/2026):** 1 carrossel por dia às **10h** e 1 reel por dia às **18h** (Brasília). Cada tipo conta à parte: o reel não toma o dia do carrossel. Segundo reel no mesmo dia: **12h** (por enquanto o Davi quer 1 reel por dia). Lógica em `src/lib/empresa/programacao.ts` (`HORA_REEL`, `horaDoReel`) e `ocupaDia(tipo)`.
- **Antes de publicar, conferir:**
  - todas as imagens estão no Drive e no Storage;
  - a quantidade de páginas enviada à Meta é igual à revisada;
  - a ordem está certa;
  - nenhuma página repetida;
  - a legenda é a do carrossel.
- **Processo da Meta**, em `graph.instagram.com/v25.0`, conta `ig_user_id` 17841439728505829:
  1. validar o perfil;
  2. conferir se já existe publicação;
  3. criar cada imagem com `is_carousel_item=true`;
  4. criar o CAROUSEL com os filhos na ordem;
  5. esperar `status_code=FINISHED`;
  6. conferir duplicata de novo;
  7. `media_publish`;
  8. recuperar o post real: permalink, horário e quantidade de páginas.
- **Resposta ambígua ou falha:** consultar a Meta antes de tentar de novo. Nunca publicar em dobro.
- **Token:** fica em `instagram_conexoes` (username `eu.davioficial`). Nunca imprimir nem copiar.
- **Escopo de publicação:** `instagram_business_content_publish` entrou em `ESCOPOS` (`supabase/functions/instagram-automacoes/index.ts`) e a função foi publicada em 14/10.
  - **Na prática, o token antigo (de 13/10) já conseguiu publicar** o 011 em 14/10: a conta do Davi tem papel no app, e o acesso padrão bastou.
  - Se um dia vier "falta a permissão de publicar", é só reconectar em Automações.
- **Publicar no Instagram é uma ação pública.** O ok do Davi é escolher a data de cada post. A Dalila nunca programa sozinha.
- **Implementação:**
  - `supabase/functions/dalila-publicar/index.ts`: deploy com `npx supabase@latest functions deploy dalila-publicar --no-verify-jwt --project-ref ucjyobemrxqfcoopkcgb`;
  - migração `20261014100000_dalila_publicacao`, teste `supabase/tests/dalila_publicacao.sql`, script `scripts/apply-dalila-publicacao-migration.py` (`--testar` desfaz tudo).
- **Duplicata:** a função procura, entre os 25 posts mais recentes, um CAROUSEL_ALBUM com a mesma legenda e data depois da criação do carrossel. Ela faz isso antes de criar o container e de novo antes do `media_publish`.
  - O container fica guardado (`ig_container_id`, válido por 23h) e é reaproveitado.
  - A tentativa é contada **antes** do `media_publish`.
  - Resposta ambígua: a próxima chamada, 1 minuto depois, consulta a Meta primeiro.
- **Como acompanhar:** `python3 scripts/consulta.py "select numero, status, programado_para, mensagem, permalink from carrosseis order by numero"`.
  - Respostas da função: `net._http_response`.
  - Execuções do cron: `cron.job_run_details`.

## Decisões e estado (14/10/2026)

- **011 · 3 documentários para o fim de semana:** **PUBLICADO em 14/10/2026 às 14:30:38**, horário escolhido pelo Davi: https://www.instagram.com/p/Dee7JJCm_n0/
  - Foi o primeiro post da Dalila na nuvem, publicado na 1ª tentativa.
  - Conferido na Meta: um único post com essa legenda, 7 páginas, todas IMAGE, na mesma ordem das páginas revisadas (comparação de imagem página a página).
  - A página 01 tem uma faixa clara de cerca de 78 px no rodapé, já no PNG do Roy. Avisado ao Davi.
- **008 · Acordar sem uma fila de alarmes (09/10):** **descartado** pelo Davi. O `referencia.txt` do Drive foi marcado como DESCARTADO, então a fonte 17891845614436257 não volta.
- **Dalila virou IA.**
- **Fase 2 (nuvem) no ar:** edge function `dalila-publicar` + `pg_cron` + `pg_net`, sem o n8n.
  - Testado: o cron chama a cada minuto (200, "nada"), e a chave errada recebe 401.
  - Primeira publicação real: o 011, em 14/10 às 14:30, sem precisar reconectar o Instagram.
- **Para o Roy:** com a Dalila IA, `acharProgramador` (`src/lib/empresa/carrossel.ts`) e `roy.aprovar` (`NOT eh_ia`) não acham mais a Dalila.
  - Não tem problema: o gatilho do banco cria a tarefa dela.
  - Vale tirar o `!eh_ia` / `NOT eh_ia` numa sessão do Roy.

## Regra: nunca no perfil errado (pedido do Davi, 15/10/2026)

- **Uma regra só**, a função `dalila_conexao_do_projeto(cliente)` (migração `20261015234500_dalila_instagram_regra_unica`):
  - vale o Instagram do **próprio projeto**;
  - a conexão geral da conta (sem projeto, o @eu.davioficial) vale **só para o projeto Davi Queiroz**;
  - projeto sem Instagram próprio devolve NULL e não cai em perfil nenhum.
- Quem usa a regra:
  - o gatilho `carrossel_confere_instagram` (chat geral, `20261015210000`), que barra a programação;
  - a edge `dalila-publicar` (`conexaoDo`), que não publica, segurança em dobro;
  - a tela, pela RPC `instagram_do_projeto`, que mostra o @ certo ou o aviso "Este projeto não tem Instagram conectado" e trava o botão, em `ProgramarCarrossel` e `ProgramarLote`.
- Em 15/10, só o Davi Queiroz (@eu.davioficial) e o Yuri têm Instagram. Matheus Souto, Instalivros, Maria Souto e CORE não têm.
- Teste: `supabase/tests/dalila_instagram_regra_unica.sql`. Script: `scripts/apply-dalila-instagram-regra-unica-migration.py`. Deploy da edge feito em 15/10.

## Reels (pedido do Davi, 16/10/2026: "vídeo é a mesma coisa do carrossel")

"Editou, finalizou, passa para a Dalila programar e postar." Vale para todos os projetos, sempre no Instagram do próprio projeto (regra única).

1. **Edição aprovada** (`edicoes_video.status = 'aprovado'`, pelo servidor do Danilo): o gatilho `edicao_aprovada_reel` cria a linha em `reels` (status `preparando`) e a tarefa da Dalila "Programar reel: <título>".
   - Não foi preciso mexer no código do Danilo.
   - O título vem da edição, sem "Piloto —" e sem "(IMG_…)". O do card só é usado quando o da edição é genérico ("Bruto IMG_…").
2. **O Mac prepara** (`scripts/dalila/preparar_reels.py`, serviço LaunchAgent `com.infoprohub.dalila`, log em `~/.infopro-hub/dalila/servico.log`):
   - comprime o final do Drive para HEVC (VideoToolbox), 1080×1920, 30 fps, AAC 128k, `+faststart`, com até 46 MB. O plano gratuito do Supabase aceita **no máximo 50 MB por arquivo** e esse limite não sobe. No piloto: 281 MB viraram 41 MB em cerca de 80 s, sem diferença visível;
   - sobe no bucket público `reels` com o `token_envio` do reel (a policy só aceita enquanto `preparando`);
   - sugere a legenda com o Claude em segundo plano, a partir do texto final do vídeo (legendas `head`/`leg` do `projeto.json` do Danilo, sem as retomadas; a `transcricao.json` do bruto fica de reserva) e de legendas reais do perfil;
   - marca `pronto`, e o gatilho cria a tarefa do Davi "Escolher data do reel: …" (tipo `agendar_reel`, prioridade alta);
   - até 5 tentativas; depois, status `erro` com o motivo em `mensagem`.
3. **O Davi** clica na tarefa em "Precisa de você". Abre `ProgramarReel.tsx`, com o vídeo, a legenda editável (até 2.200 caracteres), o calendário, o dia e a hora.
   - **Escolher a data e confirmar a legenda é o ok dele.**
   - A sugestão é o primeiro dia sem reel às 18h (desde 16/10 carrossel e reel contam separados, `ocupaDia("reel")`); escolher um dia que já tem reel muda a hora para 12h.
   - RPCs: `programar_reel`, `desprogramar_reel`, `cancelar_reel`.
4. **A nuvem publica:** a mesma edge `dalila-publicar`, a cada minuto, trata um carrossel e um reel (`dalila_proximo_reel`, trava de 4 min).
   - Passos: valida o perfil, confere duplicata (REELS com a mesma legenda), cria o container `media_type=REELS` com `video_url` e `share_to_feed=true`, espera FINISHED (vídeo pode levar alguns minutos; a próxima chamada continua), confere duplicata de novo, conta a tentativa, faz `media_publish` e grava o permalink.
   - Depois de publicar, **a cópia comprimida sai do Storage** (cota de 1 GB do plano gratuito). O original fica no Drive.
   - Falha: o reel volta para `pronto` e a tarefa do Davi reabre como "Escolher nova data do reel", com o motivo.
- Migração `20261016050000_dalila_reels`, teste `supabase/tests/dalila_reels.sql`, script `scripts/apply-dalila-reels-migration.py`.
- **Piloto (16/10):** "4 hábitos diários que vão mudar as suas manhãs" (edição 30d92e0f) está `pronto`, com vídeo e legenda. A legenda termina com "comenta INSTALIVROS" (a automação Instalivros está ativa no @eu.davioficial). Falta o Davi escolher a data.

## Shorts no YouTube (pedido do Davi, 16/10/2026; código pronto, falta aplicar)

"Quero postar no YouTube, no começo vai ser Shorts, depois faremos vídeos longos. Já tenho um canal."
Mesmo esquema do reel; setup e passo a passo em `docs/YOUTUBE.md`.

- **Canal do projeto:** botão "Conectar canal do YouTube" no topo da Visão geral (e em "Escolher data do reel"). Só o dono do projeto conecta. Tabela `youtube_conexoes` (um canal por projeto, tokens criptografados), RPC `youtube_do_projeto`. Projeto sem canal não manda Short: nunca cai no canal de outro.
- **O ok do Davi:** em `ProgramarReel` ele marca "Também como Short no YouTube" (vem marcado quando há canal) e confere o título. Título = a headline do reel (até 100 caracteres, sem < >); descrição = a legenda do Instagram. Mesmo dia e hora do reel. (O Davi ainda não confirmou o título e a descrição: perguntar.)
- **A nuvem publica:** edge `youtube`, rota `/publicar`, job `dalila-youtube` (a cada minuto, mesma chave do Vault). Envio retomável: a sessão fica em `reels.yt_sessao`; antes de mandar de novo, pergunta ao Google até onde chegou. Tentativa contada antes de abrir cada sessão (máx. 3). Estados em `reels.yt_status`: `programado → enviando → publicado` ou `erro` (com `yt_mensagem`).
- **Link na tarefa:** `reel_links_na_tarefa` grava "Instagram: …" e "YouTube: …" na tarefa da Dalila, sem um apagar o outro.
- **Storage:** a cópia comprimida só sai quando o Instagram já saiu e o Short não está pendente.
- **Privado ou público:** a documentação do Google (conferida em 16/10/2026) diz que projeto não verificado não fica mais preso ao privado e que o limite é de 100 envios por dia. O padrão é público. Se o YouTube devolver privado, a tarefa avisa "deixe público no YouTube Studio". Segredo `YOUTUBE_PRIVACIDADE` muda isso.
- Migração `20261016121500_dalila_youtube_shorts`, teste `supabase/tests/dalila_youtube_shorts.sql`, script `scripts/apply-dalila-youtube-shorts-migration.py`, testes JS `tests/youtubeShorts.test.mjs`.
- **Ainda não tem:** botão para tentar o Short de novo depois de um `erro`, e vídeo longo.

## Pendências

- Botão para desmarcar ou remarcar um carrossel já programado (a RPC `desprogramar_carrossel` existe).
- ~~Lista dos carrosséis programados na Visão geral~~ feita; desde 16/10 os reels programados também aparecem em "Programados" (Visão geral) e no Cronograma, com capa (primeiro quadro do vídeo), dia e hora.

## Onde está o código (14/10/2026)

O trabalho do Roy ainda não foi commitado. Ele está no worktree
`/Users/davi/Infopro-hub/.claude/worktrees/agitated-khayyam-369d7a` (branch `claude/agitated-khayyam-369d7a`):
- `scripts/roy/`;
- `src/lib/empresa/carrossel.ts`, `aprovarCarrossel.ts`;
- `src/components/empresa/RevisaoCarrossel.tsx`;
- migrações `20261014060000` a `20261014090000`.

As tabelas e o bucket já estão no banco.

A Fase 2 da Dalila está no worktree `elastic-keller-d7f84a` (branch `claude/elastic-keller-d7f84a`):
- `supabase/functions/dalila-publicar/`;
- a migração `20261014100000`;
- `ProgramarCarrossel.tsx`, `src/lib/empresa/programacao.ts`;
- o ajuste em `visaoGeral.ts` / `VisaoGeralEmpresa.tsx`;
- este manual (a cópia no worktree do Roy ficou antiga).

A prévia da tela roda na porta 8092 (`.claude/launch.json`, `web-dalila`).
