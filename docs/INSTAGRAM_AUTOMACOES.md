# Automações do Instagram

"Mandou a palavra-chave, recebe a DM" — sem ManyChat. Três gatilhos, escolhidos
por automação:

- **Comentário** num post/reel (todos ou só os escolhidos): DM como private
  reply e, se configurado, resposta pública sorteando uma das respostas.
- **Direct**: a pessoa manda a palavra por DM.
- **Story**: a pessoa responde um story com a palavra.

A Meta chama a edge function `instagram-automacoes` a cada evento; ela acha a
automação ativa daquele gatilho e responde.

- Tabelas: `instagram_conexoes` (conta + token, sem acesso pelo app),
  `instagram_automacoes`, `instagram_automacao_disparos` (histórico; o
  `evento_id` único evita DM duplicada quando a Meta reenvia o webhook).
- Tela: **Automações** no menu (`/automacoes`, só para o admin) — criar,
  editar, pausar, apagar, escolher posts por miniatura, testar uma frase e ver
  o histórico. A lista de posts vem de `POST /instagram-automacoes/posts`
  (com o JWT do usuário; o token do Instagram nunca vai ao navegador).
- Resultados (aba da tela): funil gatilho → DM enviada → clicou → respondeu,
  DMs por dia por gatilho e tabela por automação (últimos 90 dias).
  - Cliques: com `rastrear_links` (padrão), cada link da DM vira
    `…/instagram-automacoes/l/<disparo>/<n>`, que conta e redireciona com 302.
    A prévia que a Meta gera (facebookexternalhit etc.) não conta.
  - Respostas: mensagem da pessoa até 7 dias depois de receber a DM marca
    `respondeu_em` no disparo mais recente dela.
- Gerência pelo chat: `scripts/instagram-automacoes.py` (o Claude usa quando você fala
  "cria a palavra X"). `python3 scripts/instagram-automacoes.py -h`.
- O token (60 dias) é renovado sozinho pela função quando faltam < 20 dias.

## Métricas de crescimento

A edge function `instagram-metricas` (migração `20261015230000`) usa a mesma
conexão para gravar, por conta e por dia, seguidores, alcance e
visualizações em `instagram_metricas_diarias`. O pg_cron chama todo dia às
03:10 (dia anterior); o botão de atualizar do painel grava o dia de hoje.
O painel fica em Projetos Milionários → projeto → Conteúdo → Cronograma
(coluna da direita) e mostra o ganho de 7 e 30 dias. Substituiu a Windsor.

- Alcance e visualizações precisam de `instagram_business_manage_insights`
  (já no link de conexão): contas conectadas antes de 15/10/2026 precisam
  reconectar uma vez. Sem ela, só seguidores entram.
- Deploy: `npx supabase@latest functions deploy instagram-metricas --no-verify-jwt --project-ref ucjyobemrxqfcoopkcgb`
  e também `instagram-automacoes` (para o link pedir a permissão nova).

## 1. App na Meta (uma vez)

1. https://developers.facebook.com/apps → **Criar app** → caso de uso
   **Gerenciar mensagens e conteúdo no Instagram** (tipo Business).
2. Em **Instagram → Configuração da API com login do Instagram**:
   - **Gerar tokens de acesso** → adicione a sua conta profissional do
     Instagram e gere o token (guarde para o passo 3).
   - **Configurar webhooks**:
     - URL de callback: `https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/instagram-automacoes`
     - Token de verificação: o mesmo `META_VERIFY_TOKEN` do passo 2.
     - Assine os campos **comments** e **messages**.
   - Anote o **Chave secreta do app do Instagram** (é o `META_APP_SECRET`).
3. Permissões usadas: `instagram_business_basic`,
   `instagram_business_manage_comments`, `instagram_business_manage_messages`.
   Para a sua própria conta (que tem papel no app) o acesso padrão basta, sem
   revisão do app — o app só precisa estar no modo **Ao vivo** para receber
   webhooks de comentários de outras pessoas.
4. No Instagram (app do celular): **Configurações → Mensagens e respostas →
   Ferramentas conectadas → Permitir acesso às mensagens** ligado.

## 2. Supabase

```sh
npx supabase@latest login
npx supabase@latest secrets set --project-ref ucjyobemrxqfcoopkcgb \
  META_APP_SECRET="chave-secreta-do-app-do-instagram" \
  META_VERIFY_TOKEN="uma-frase-aleatoria-qualquer"
npx supabase@latest functions deploy instagram-automacoes --no-verify-jwt --project-ref ucjyobemrxqfcoopkcgb
```

Deploy antes de salvar o webhook na Meta: ela faz um GET de verificação na hora.

## 3. Conectar a conta

```sh
python3 scripts/instagram-automacoes.py conectar   # cola o token do passo 1 (não aparece)
python3 scripts/instagram-automacoes.py status
```

## Limites da Meta

- Uma DM por comentário, e só até 7 dias depois do comentário.
- A DM vai para a caixa de "solicitações" se a pessoa não segue você; ela vê
  normalmente, mas responder abre a conversa.
- Comentários e mensagens do próprio perfil são ignorados (inclusive a
  resposta pública e as DMs que a automação manda), então não entra em loop.
- Direct e story: a resposta sai dentro da janela de 24h aberta pela própria
  mensagem da pessoa. Cada mensagem com a palavra dispara de novo.
- Se você usa outra ferramenta que também responde DMs (ManyChat etc.), as
  duas vão responder.

## Fluxos de mensagem (13/11/2026)

Aba **Fluxos** da tela `/automacoes`: editor visual (React Flow, estilo ManyChat) de uma conversa em etapas. Vale para todas as contas conectadas.

- **Blocos:** mensagem (texto + botões de *resposta* **ou** de *link*; a Meta não mistura), esperar (1 min a 24 h), condição (a pessoa respondeu? / a resposta contém a palavra), fim. Cada saída tem o seu ponto de ligação (um por botão de resposta, "outra resposta", sim/não, "depois").
- **Regras da Meta que moldam o fluxo:** a 1ª mensagem de um comentário é uma resposta privada; as seguintes só saem **depois que a pessoa responde** (toque num botão ou texto) e valem por **24 h**. Por isso a primeira mensagem deve ter botões de resposta. Link: botão `web_url` (até 3, título até 20 caracteres, texto até 640). Respostas rápidas: até 13.
- **Dados:** `instagram_fluxos` (grafo em jsonb: `{nos, ligacoes}`) e `instagram_fluxo_execucoes` (a caminhada de cada pessoa; só o robô escreve). Sem `ON DELETE CASCADE` da conexão (13/11 uma conexão apagada levou as automações junto).
- **Motor:** `supabase/functions/instagram-automacoes/fluxos.ts` (banco + Meta) sobre a lógica pura `supabase/functions/_shared/fluxo.ts` (validação, próximo passo, condição; testada em `tests/fluxoInstagram.test.mjs` e `tests/fluxoMotor.test.mjs`). O fluxo vence a automação simples quando a mesma palavra bate nos dois. O pg_cron `instagram-fluxos-tick` chama `/tick` a cada minuto para retomar as esperas.
- **Idempotência:** `(fluxo_id, evento_id)` único (a Meta reenvia webhooks) e uma execução ativa por pessoa e fluxo.
- **Falta (próximas versões):** escolher posts específicos no fluxo, condição "clicou no link", variáveis ({nome}), números por bloco mais ricos.

## Many Hub (14/11/2026)

A tela `/automacoes` agora se chama **Many Hub** (rota igual). Abas: Resultados, Automações (fluxos + automações simples), **Pessoas**, Histórico.
- **Pessoas:** funil do fluxo escolhido (quantas pessoas chegaram em cada mensagem e por qual botão seguiram) + lista de quem está esperando, avançou, concluiu, parou ou deu erro, e a **conversa** de cada pessoa em estilo chat (`ManyHubPessoas.tsx`, lógica pura em `src/lib/automacoes/manyhub.ts`).
- **Conversas:** a edge `instagram-automacoes` guarda cada DM que chega e cada DM que sai (`instagram_mensagens`, quem escreve é só o robô) e o @ de quem escreve (`instagram_contatos`, buscado na Meta uma vez). Ecos (DM que o Davi manda pelo app do Instagram) também entram. **Antes de 14/11 não há histórico guardado.**
- **Responder pelo Many Hub:** `POST /instagram-automacoes/enviar` (JWT; mesma permissão da tela). Só dentro de **24 h da última mensagem da pessoa** (regra da Meta; comentário não abre a janela). Ao responder, as execuções de fluxo ativas dessa pessoa terminam ("Você assumiu a conversa").
- **Palavra-chave "Contém o trecho"** (`correspondencia = 'trecho'`): basta o pedaço aparecer (insta → instalivros, instalivors).
