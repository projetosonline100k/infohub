# Escritório de funcionários IA — guia para construir do zero

> Este guia descreve um sistema que já funciona em produção (o "Infopro Hub"). Ele foi escrito para
> **outro Claude** construir uma versão própria, do zero, adaptada ao dono dele. Não copie nomes,
> clientes nem regras de negócio daqui: copie a **ideia** e a **arquitetura**, e pergunte ao dono o
> que muda no caso dele.

---

## 1. A ideia em uma frase

Um app onde o dono tem uma **equipe de funcionários de IA** (cada um com nome, função, manual e
memória própria), que **conversam com ele antes de começar**, **trabalham sozinhos em segundo plano**
no computador dele, **mostram ao vivo o que estão fazendo** e **entregam para ele revisar e aprovar**.
O dono só faz duas coisas: **pedir** e **aprovar/ajustar**.

## 2. Como é para o dono (a experiência)

1. **Escritório visual**: uma tela com o "mapa" do escritório — salas (setores), mesas, e um
   bonequinho por funcionário. Cada boneco tem um balão com o que está fazendo agora ("Escrevendo 7
   roteiros…", "1 cliente esperando resposta") e uma bolinha de status:
   verde = trabalhando · amarelo = esperando o dono · vermelho = problema · cinza = parado.
2. **Equipe (estilo Messenger)**: uma gaveta lateral com todos os funcionários. Clicou em um, abre a
   conversa com ele.
3. **Pedir uma tarefa (briefing)**: o dono escreve o pedido na conversa. O funcionário **não começa
   na hora**: primeiro responde dizendo o que entendeu, pergunta só o que falta (no máximo 3
   perguntas) e diz com honestidade o que consegue e o que não consegue. Quando está claro, ele
   **propõe** a tarefa (título, entregas, prazo, o que precisa do dono). O dono clica em
   **"Confirmar"** → vira tarefa na fila dele.
4. **Execução sozinha**: um serviço no computador (o "ouvinte") pega a tarefa da fila, põe em
   andamento e roda o Claude no papel daquele funcionário. A barra de progresso e a linha do tempo
   ("O que já foi feito", passo a passo) aparecem **ao vivo** no card da tarefa.
5. **Entrega**: o funcionário entrega (um documento, um vídeo, um carrossel…) e a tarefa vai para
   **"Esperando sua aprovação"**. Aparece em **"Precisa de você"** no painel.
6. **Revisão com chat**: o dono abre a entrega e tem a conversa com o funcionário do lado. Pode
   elogiar ("ele guarda para manter nas próximas"), pedir ajuste ou mandar refazer. O funcionário
   ajusta e a entrega atualiza na tela. Etiquetas mostram o estado: **"Fulano pensando…"** (o dono
   mandou, sem resposta) e **"Mensagem nova"** (ele respondeu e o dono não leu).
7. **Aprovar**: aprovou → concluída. O que o dono corrigiu vira **aprendizado** do funcionário
   (memória que ele lê antes da próxima tarefa).
8. **Coordenador (opcional)**: um funcionário especial que coordena a operação, cobra o dono
   quando ele trava, e conversa com ele por um atalho de teclado.

## 3. Arquitetura (as peças)

```
┌──────────── App (web + desktop) ─────────────┐        ┌──────── Banco (Postgres/Supabase) ────────┐
│ Escritório · Equipe · Fila de cada funcionário│ ◄────► │ membros, setores, atividades, briefings,  │
│ Precisa de você · Revisão com chat · Esteira  │realtime│ briefing_mensagens, inteligencia_membros, │
└───────────────────────────────────────────────┘        │ documentos, historico_tarefas, ...        │
                                                         └──────────────▲────────────────────────────┘
                                                                        │ (lê/escreve com usuário admin)
                     ┌──────────────── Computador do dono ──────────────┴──────────────┐
                     │  OUVINTE (serviço permanente, ex.: LaunchAgent no Mac)          │
                     │  laços a cada N segundos:                                       │
                     │   • briefing  → responde conversas novas (Claude no papel)      │
                     │   • execução  → pega tarefa da fila e executa (Claude -p)       │
                     │   • esteira   → anda as peças etapa a etapa                     │
                     │   • vigia     → tarefa travada? recomeça ou avisa               │
                     │  + scripts que o Claude usa: contexto, progresso, entregar, ... │
                     └─────────────────────────────────────────────────────────────────┘
```

- **App**: qualquer stack. Aqui: React + Vite + TypeScript + Tailwind + shadcn/ui, com uma versão
  desktop em Tauri. O app só **lê e escreve no banco**; quem "pensa" é o ouvinte.
- **Banco**: Postgres com RLS (Supabase aqui). Realtime para a tela atualizar sozinha.
- **Ouvinte**: um processo Python que roda sempre (LaunchAgent/systemd). Ele chama o **Claude Code em
  modo não interativo** (`claude -p "<prompt>" --output-format stream-json --verbose --allowedTools ...`)
  dentro da pasta do projeto, para o Claude ter o código, os scripts e a memória.
- **Scripts de apoio** (o "contrato" entre o Claude e o sistema): o Claude não escreve no banco
  direto; ele chama comandos curtos e seguros, por exemplo:
  ```
  python3 scripts/empresa/briefing.py contexto <briefing_id>     # quem é, manual, conversa até aqui
  python3 scripts/empresa/briefing.py responder <briefing_id> <<'FIM' … FIM
  python3 scripts/empresa/briefing.py propor <briefing_id> <<'FIM' {json da proposta} FIM
  python3 scripts/empresa/execucao.py contexto <atividade_id>    # o combinado, prazo, manual, inteligência
  python3 scripts/empresa/execucao.py progresso <id> <0-100> "<o que faz agora>" [minutos que faltam]
  python3 scripts/empresa/execucao.py entregar <id> "<título>" "<resumo>" <<'FIM' <html> FIM
  python3 scripts/empresa/execucao.py erro <id> "<motivo>"
  ```
  Isso mantém o Claude dentro de trilhos: só consegue fazer o que os scripts permitem.

## 4. Modelo de dados (o essencial)

Veja `schema-inicial.sql` para o SQL de partida. Resumo:

| Tabela | Para quê | Campos-chave |
|---|---|---|
| `setores` | salas do escritório | `nome`, `cor`, `ordem`, `esteira jsonb` (etapas, opcional) |
| `membros` | funcionários (IA ou pessoa) | `nome`, `funcao`, `eh_ia`, `ativo`, `manual` (texto), `visual jsonb` (aparência do boneco), `setor_id` |
| `briefings` | conversa de pedido/revisão | `membro_id`, `status` (`conversando` → `confirmado`; `revisando` na revisão), `proposta jsonb`, `atividade_id` |
| `briefing_mensagens` | mensagens da conversa | `briefing_id`, `papel` (`dono`/`funcionario`), `texto`, `status` (`enviada`/`lida`) |
| `atividades` | tarefas | `titulo`, `descricao` (o combinado), `responsavel_id`, `situacao` (`fila`/`andamento`/`aguardando_aprovacao`/`concluida`), `progresso`, `observacao` (frase do momento), `passos jsonb` (linha do tempo), `data_vencimento` |
| `inteligencia_membros` | memória/conhecimento de cada funcionário | `agente`, `tipo` (`texto`/`pdf`/`aprendizado`/`skill`), `escopo` (`geral`/`projeto`), `conteudo` |
| `documentos` | entregas em texto | `titulo`, `conteudo` (HTML), `atividade_id` |
| `historico_tarefas` | quem passou para quem, mudanças de situação | trigger em `atividades` |
| `servicos_sinal` | "último sinal de vida" de cada serviço | para a tela mostrar "parado desde HH:MM" |

## 5. Os fluxos em detalhe

### 5.1 Briefing (antes da tarefa existir)
- App insere `briefing_mensagens(papel='dono', status='enviada')`.
- Ouvinte (laço `briefing`, a cada ~5 s): marca as novas como `lida` (a tela mostra "pensando…"),
  roda o Claude com um prompt curto: *"Você é <funcionário>. Rode `briefing.py contexto <id>`, leia
  seu manual, ENTENDA a tarefa (não faça), responda curto, pergunte só o que falta, diga o que não
  consegue. Quando estiver claro, `briefing.py propor`."*
- App mostra a proposta com o botão **Confirmar** → cria a `atividade` (`situacao='fila'`).

### 5.2 Execução
- Laço `execucao`: pega a próxima tarefa de qualquer funcionário IA livre
  (`UPDATE … SET situacao='andamento' … FOR UPDATE SKIP LOCKED`), no máximo N ao mesmo tempo.
- Roda o Claude com o prompt de execução: contexto → ler manual e inteligência → avisar progresso a
  cada etapa → fazer de verdade → **entregar** (vira `aguardando_aprovacao`).
- **Passos ao vivo**: rode o Claude com `--output-format stream-json --verbose` e leia a saída linha a
  linha. Para cada `tool_use` (comando com a `description` que o próprio Claude escreve, arquivo
  criado, pesquisa) e cada frase curta de texto, grave um passo em `atividades.passos` (em lotes, a
  cada ~8 s). Peça no prompt: *"escreva a descrição de cada comando em português simples"*.
- Se o Claude terminar sem entregar → `erro` (a tarefa volta para a fila com o motivo).

### 5.3 Revisão com chat e aprendizados
- Na entrega, o app abre um `briefing` com `status='revisando'` ligado à atividade. O dono conversa;
  o ouvinte responde no papel do funcionário, que pode **reescrever a entrega** (o documento muda na
  tela, com as mudanças destacadas).
- Elogio/correção do dono → o funcionário grava em `inteligencia_membros(tipo='aprendizado')`.
- **Aprovar** → `concluida`.

### 5.4 Esteira (linha de produção, opcional mas poderosa)
Um setor pode ter uma **esteira**: etapas em sequência, cada uma com um funcionário. Exemplo usado
aqui para conteúdo: **Headlines → Roteiro → Revisão**.
- Cada etapa tem: **critérios numerados** (o funcionário confere um por um e registra a conferência),
  **formatos de referência** (exemplos do que o dono gosta), **skills** (métodos longos em texto).
- **Cérebro**: um cadastro "para quem é" o conteúdo (informações importantes, apresentação,
  narrativa…). O funcionário usa isso em vez de inventar.
- A peça anda sozinha de etapa em etapa; o dono revisa **só no fim**, com o revisor.

### 5.5 "Precisa de você" e coordenação
- Um painel junta tudo que espera o dono: entregas para aprovar, revisões, cobranças, erros.
- Um **vigia** procura tarefas travadas (andamento sem sinal há muito tempo) e recomeça ou avisa.
- Um **coordenador** (aqui chamado Atlas) conversa com o dono por atalho e pode cobrar quando ele
  trava (opcional).

## 6. Prompts: o que funcionou

- **Papel + manual + contexto por script**, nunca o contexto colado inteiro no prompt.
- **Regras explícitas no fim**: "não publique nada", "não mande mensagem para ninguém", "não escreva
  no banco fora dos scripts", "responda em português simples".
- **Entender antes de fazer** (briefing) evita 80% do retrabalho.
- **Honestidade obrigatória**: "se algo combinado não deu para fazer, diga em 'Limites desta versão'";
  "nunca invente dado, depoimento ou número".
- **Progresso realista**: "informe quanto do trabalho TODO já está feito e quantos minutos faltam".
- **Um chat por funcionário complexo**: funcionários com fluxo próprio (ex.: editor de vídeo,
  carrosséis) ganham um serviço e um manual próprios (`docs/agentes/<nome>.md`).

## 7. Erros que já cometemos (não repita)

1. **Conexões do banco esgotam.** Serviços que ficam abertos o tempo todo lotam o pooler em modo
   *session* (15 vagas no Supabase). Use o **transaction pooler** (porta 6543) para conexões
   longas e feche as curtas. Sintoma: `max clients reached` e mensagens perdidas.
2. **Thread que morre em silêncio.** Todo laço em segundo plano precisa de `try/except` que **tenta
   de novo**; um erro de rede não pode matar a thread para sempre.
3. **Realtime chamando função velha.** No React, o handler do realtime registrado uma vez guarda a
   versão antiga da função (com estado vazio) → a tela "some e volta". Use uma `ref` para a versão
   atual.
4. **Recarregar mostrando "Carregando…"** a cada evento faz a tela piscar. Só na primeira carga.
5. **Laço de navegação**: efeito que mexe na URL e roda a cada render vira laço infinito → tela
   branca. Atenda cada pedido uma vez (ref) e tenha um *error boundary* que mostre o erro.
6. **Coluna de conclusão errada**: se o quadro tem colunas por dia da semana, não marque um dia como
   "coluna de conclusão" — o card some ao ser arrastado. Tenha uma coluna "Finalizado".
7. **Busca de texto "parecida"** que junta o começo de um bloco com o fim de outro: procure primeiro
   o exato; o "parecido" só com as palavras na mesma ordem.
8. **Limites escondidos**: guardar só as últimas N coisas (ex.: 10 revisões) perde dados sem aviso.
9. **Reiniciar o ouvinte no meio de um trabalho** mata o Claude que está rodando: reinicie só quando
   não houver `claude -p` em andamento.
10. **Nunca deixe o Claude digitar senhas/chaves**; credenciais ficam em arquivos locais fora do git.

## 8. Ordem de construção sugerida

1. **Fase 1 — Base**: banco (`schema-inicial.sql`), cadastro de setores e membros, tela da Equipe e
   fila de tarefas de cada membro (manual, sem IA).
2. **Fase 2 — Briefing**: conversa com o funcionário + ouvinte respondendo + "Confirmar" vira tarefa.
3. **Fase 3 — Execução**: laço de execução, progresso, entrega em documento, "Esperando aprovação".
4. **Fase 4 — Ao vivo**: passos (stream-json), "Precisa de você", etiquetas de conversa.
5. **Fase 5 — Revisão com chat + aprendizados.**
6. **Fase 6 — Escritório visual** (mapa com bonecos e balões).
7. **Fase 7 — Esteira** (etapas, critérios, formatos, skills, cérebro) e coordenador.

Cada fase deve funcionar sozinha antes da próxima. Teste com dados reais pequenos.

## 9. O que perguntar ao dono antes de começar

- Qual é o negócio dele e **quais funcionários** ele quer (nome, função, o que entregam)?
- Onde roda: só web, ou também app de desktop? Qual banco ele já usa?
- O computador fica ligado? (o ouvinte precisa de uma máquina sempre ligada, ou um servidor)
- Quais entregas são texto (documento) e quais são outra coisa (vídeo, imagem, planilha)?
- O que **nunca** pode ser feito sem ele (publicar, mandar mensagem, gastar dinheiro…)?
